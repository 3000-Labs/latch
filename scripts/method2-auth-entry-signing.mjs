#!/usr/bin/env node

/**
 * Method 2: Auth-Entry Signing
 *
 * Auth-entry signing decouples authorization from transaction submission.
 * The authorizer signs only the specific contract invocation (an "auth entry"),
 * while a separate account acts as the transaction source, paying fees and
 * consuming its own sequence number.
 *
 * Flow:
 *   Step 1 (Client):
 *     1. Build transaction with AssembledTransaction
 *     2. Simulate (Recording Mode) to get auth entries
 *     3. Sign auth entries using signAuthEntries
 *     4. Re-simulate (Enforcing Mode) to validate signatures
 *     5. Export transaction XDR to fee-payer
 *
 *   Step 2 (Fee-payer):
 *     1. Parse client's XDR and extract operation + Soroban data
 *     2. Rebuild with fee-payer's account as source
 *     3. Simulate (Enforcing Mode) for accurate resource estimates
 *     4. Assemble, sign envelope, and submit
 *
 * Key characteristics:
 *   - Sequence number: consumed from the fee-payer account
 *   - Fees: paid by the fee-payer (in XLM)
 *   - Client authorization: explicit via signed auth entries
 *   - Works with both G-accounts and C-accounts
 */

import StellarSdk from "@stellar/stellar-sdk";

const {
  Keypair,
  Networks,
  nativeToScVal,
  Operation,
  Transaction,
  TransactionBuilder,
  Asset,
  xdr,
} = StellarSdk;

const { Server, Api, assembleTransaction } = StellarSdk.rpc;

// AssembledTransaction and basicNodeSigner come from the contract module
let AssembledTransaction, basicNodeSigner;
try {
  const contractModule = await import("@stellar/stellar-sdk/contract");
  AssembledTransaction = contractModule.AssembledTransaction;
  basicNodeSigner = contractModule.basicNodeSigner;
} catch {
  // Fallback: try from the main export
  AssembledTransaction = StellarSdk.contract?.AssembledTransaction || StellarSdk.AssembledTransaction;
  basicNodeSigner = StellarSdk.contract?.basicNodeSigner || StellarSdk.basicNodeSigner;
}

if (!AssembledTransaction || !basicNodeSigner) {
  console.error("❌ Cannot find AssembledTransaction or basicNodeSigner in the SDK.");
  console.error("   Make sure @stellar/stellar-sdk >= 12.x is installed.");
  process.exit(1);
}

const rpcUrl = "https://soroban-testnet.stellar.org";
const networkPassphrase = Networks.TESTNET;
const server = new Server(rpcUrl);

// ─────────────────────────────────────────────────────────────────────────────
// Generate and fund test accounts
// ─────────────────────────────────────────────────────────────────────────────
const senderKeypair = Keypair.random(); // Client: authorizes the transfer
const feePayerKeypair = Keypair.random(); // Fee-payer: submits the transaction
const recipientKeypair = Keypair.random(); // Recipient of the transfer

console.log("\n🔑 Method 2: Auth-Entry Signing\n");
console.log("═".repeat(70));
console.log("  Setup: Generate & fund test accounts");
console.log("═".repeat(70));

console.log(`\n  Sender (client):  ${senderKeypair.publicKey()}`);
console.log(`  Fee-payer:        ${feePayerKeypair.publicKey()}`);
console.log(`  Recipient:        ${recipientKeypair.publicKey()}`);

console.log("\n  Funding via Friendbot...");
const fundResults = await Promise.all([
  fetch(`https://friendbot.stellar.org?addr=${senderKeypair.publicKey()}`),
  fetch(`https://friendbot.stellar.org?addr=${feePayerKeypair.publicKey()}`),
  fetch(`https://friendbot.stellar.org?addr=${recipientKeypair.publicKey()}`),
]);

for (const [i, res] of fundResults.entries()) {
  if (!res.ok) {
    const label = ["Sender", "Fee-payer", "Recipient"][i];
    throw new Error(`Friendbot failed for ${label}: ${res.status}`);
  }
}
console.log("  ✅ All three accounts funded (10 000 XLM each)");

// Get the native XLM Stellar Asset Contract (SAC) ID
const tokenContractId = Asset.native().contractId(networkPassphrase);
console.log(`\n  Native XLM SAC: ${tokenContractId}`);

// Transfer 1 XLM
const amount = 10_000_000n;
console.log(`  Transfer amount: 1 XLM (${amount} stroops)`);

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 1:  CLIENT — Build and sign auth entries
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(70));
console.log("  STEP 1 — CLIENT: Build and sign auth entries");
console.log("═".repeat(70));

async function buildSignedAuthEntries() {
  // ── 1a. Build transaction using AssembledTransaction ──────────────────
  console.log("\n  1a. Build with AssembledTransaction (Recording Mode simulation)...");

  const tx = await AssembledTransaction.build({
    contractId: tokenContractId,
    method: "transfer",
    args: [
      nativeToScVal(senderKeypair.publicKey(), { type: "address" }),
      nativeToScVal(recipientKeypair.publicKey(), { type: "address" }),
      nativeToScVal(amount, { type: "i128" }),
    ],
    networkPassphrase,
    rpcUrl,
    publicKey: feePayerKeypair.publicKey(), // Use fee-payer as source so sender gets address auth (not source-account auth)
    parseResultXdr: (result) => result,
  });

  // ── 1b. Check simulation result (Recording Mode) ─────────────────────
  if (Api.isSimulationError(tx.simulation)) {
    throw new Error(`Simulation failed: ${tx.simulation.error}`);
  }
  console.log("      ✅ Recording Mode simulation succeeded");
  console.log(`      Latest ledger: ${tx.simulation.latestLedger}`);

  // ── 1c. Check who needs to sign ──────────────────────────────────────
  const missingSigners = tx.needsNonInvokerSigningBy();
  console.log(`\n  1b. Missing signers: [${missingSigners.join(", ")}]`);

  if (!missingSigners.includes(senderKeypair.publicKey())) {
    throw new Error("Sender not in required signers — something is wrong");
  }

  // ── 1d. Sign auth entries using basicNodeSigner ──────────────────────
  console.log("\n  1c. Signing auth entries with basicNodeSigner...");

  const signer = basicNodeSigner(senderKeypair, networkPassphrase);
  const expirationLedger = tx.simulation.latestLedger + 60; // ~5 minutes

  await tx.signAuthEntries({
    address: senderKeypair.publicKey(),
    signAuthEntry: signer.signAuthEntry,
    expiration: expirationLedger,
  });

  console.log(`      ✅ Auth entries signed`);
  console.log(`      Signature expiration ledger: ${expirationLedger}`);

  // ── 1e. Re-simulate to validate signatures (Enforcing Mode) ─────────
  console.log("\n  1d. Re-simulating (Enforcing Mode) to validate signatures...");

  await tx.simulate();
  if (Api.isSimulationError(tx.simulation)) {
    throw new Error(`Signature validation failed: ${tx.simulation.error}`);
  }
  console.log("      ✅ Enforcing Mode simulation passed");

  // ── 1f. Verify all signatures collected ──────────────────────────────
  const remaining = tx.needsNonInvokerSigningBy();
  if (remaining.length > 0) {
    throw new Error(`Missing signatures from: ${remaining.join(", ")}`);
  }
  console.log("      ✅ All required signatures collected");

  // ── 1g. Return transaction XDR for fee-payer ─────────────────────────
  const txXdr = tx.built.toXDR();
  console.log(`\n  📤 Transaction XDR (${txXdr.length} chars) ready for fee-payer`);
  return txXdr;
}

const transactionXdr = await buildSignedAuthEntries();

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 2:  FEE-PAYER — Rebuild, simulate, sign, and submit
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(70));
console.log("  STEP 2 — FEE-PAYER: Rebuild and submit");
console.log("═".repeat(70));

async function submitWithSignedAuth(txXdr) {
  // ── 2a. Parse client's transaction ───────────────────────────────────
  console.log("\n  2a. Parsing client's transaction...");

  const clientTx = new Transaction(txXdr, networkPassphrase);
  const txEnvelope = xdr.TransactionEnvelope.fromXDR(txXdr, "base64");
  const sorobanData = txEnvelope.v1()?.tx()?.ext()?.sorobanData();

  if (!sorobanData) {
    throw new Error("Missing Soroban data in transaction");
  }

  const invokeOp = clientTx.operations[0];
  console.log(`      Operations: ${clientTx.operations.length}`);
  console.log(`      Client source: ${clientTx.source}`);

  // ── 2b. Security check ──────────────────────────────────────────────
  //  🚨 SECURITY: Verify the auth entries do not reference the fee-payer's
  //  account. If they did, the fee-payer would be authorizing something on
  //  behalf of its own account, which a malicious client could exploit.
  const feePayerAddress = feePayerKeypair.publicKey();
  if (invokeOp.auth) {
    for (const entry of invokeOp.auth) {
      const creds = entry.credentials();
      if (creds.switch().name === "sorobanCredentialsAddress") {
        const authAddr = StellarSdk.Address.fromScAddress(creds.address().address());
        if (authAddr.toString() === feePayerAddress) {
          throw new Error("SECURITY: Auth entry references fee-payer's account!");
        }
      }
    }
  }
  console.log("      ✅ Security check passed (auth entries don't reference fee-payer)");

  // ── 2c. Rebuild with fee-payer as source ─────────────────────────────
  console.log("\n  2b. Rebuilding with fee-payer as source...");

  const feePayerAccount = await server.getAccount(feePayerKeypair.publicKey());

  const rebuiltTx = new TransactionBuilder(feePayerAccount, {
    fee: clientTx.fee,
    networkPassphrase,
    sorobanData,
  })
    .setTimeout(30)
    .addOperation(
      Operation.invokeHostFunction({
        func: invokeOp.func,
        auth: invokeOp.auth || [],
        source: invokeOp.source,
      }),
    )
    .build();

  console.log(`      Fee-payer source: ${rebuiltTx.source}`);
  console.log("      ✅ Transaction rebuilt");

  // ── 2d. Simulate (Enforcing Mode) to catch errors ───────────────────
  console.log("\n  2c. Simulating (Enforcing Mode)...");

  const simResult = await server.simulateTransaction(rebuiltTx);
  if (Api.isSimulationError(simResult)) {
    throw new Error(`Fee-payer simulation failed: ${simResult.error}`);
  }
  console.log("      ✅ Enforcing Mode simulation passed");
  console.log(`      Min resource fee: ${simResult.minResourceFee}`);

  // ── 2e. Assemble ────────────────────────────────────────────────────
  console.log("\n  2d. Assembling transaction...");

  const assembledTx = assembleTransaction(rebuiltTx, simResult).build();
  console.log(`      Final fee: ${assembledTx.fee} stroops`);

  // ── 2f. Sign envelope and submit ─────────────────────────────────────
  console.log("\n  2e. Signing envelope and submitting...");

  assembledTx.sign(feePayerKeypair);
  console.log(`      Signatures: ${assembledTx.signatures.length}`);

  const response = await server.sendTransaction(assembledTx);
  return response;
}

const response = await submitWithSignedAuth(transactionXdr);

if (response.status === "ERROR") {
  console.error("\n  ❌ Submission failed:", response.errorResult?.toXDR("base64"));
  process.exit(1);
}

console.log(`\n  ✅ Submitted`);
console.log(`  Hash:     ${response.hash}`);
console.log(`  Explorer: https://stellar.expert/explorer/testnet/tx/${response.hash}`);

// ─────────────────────────────────────────────────────────────────────────────
// Wait for confirmation
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("  Waiting for confirmation...");
console.log("═".repeat(70));

let txResult;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  txResult = await server.getTransaction(response.hash);
  if (txResult.status !== Api.GetTransactionStatus.NOT_FOUND) break;
  process.stdout.write(".");
}
console.log();

if (txResult.status === Api.GetTransactionStatus.SUCCESS) {
  console.log("\n  🎉 SUCCESS — Transaction confirmed on testnet!\n");
  console.log("  ┌──────────────────────────────────────────────────────────────────┐");
  console.log("  │  Method 2: Auth-Entry Signing — Summary                          │");
  console.log("  ├──────────────────────────────────────────────────────────────────┤");
  console.log(`  │  Sender (client):   ${senderKeypair.publicKey()}  │`);
  console.log(`  │  Fee-payer:         ${feePayerKeypair.publicKey()}  │`);
  console.log("  ├──────────────────────────────────────────────────────────────────┤");
  console.log("  │  ✔ Sequence number consumed from fee-payer account              │");
  console.log("  │  ✔ Fees paid by fee-payer (not the sender)                      │");
  console.log("  │  ✔ Authorization: explicit via signed auth entries              │");
  console.log("  │  ✔ Works with both G-accounts and C-accounts                   │");
  console.log("  │  ✔ Sender never signed the transaction envelope                │");
  console.log("  └──────────────────────────────────────────────────────────────────┘\n");
} else {
  console.log(`\n  ❌ Transaction failed: ${txResult.status}`);
  if (txResult.resultXdr) {
    const resultCode = txResult.resultXdr.result().switch().name;
    console.log(`  Result code: ${resultCode}`);
    const opResults = txResult.resultXdr.result().results();
    if (opResults?.length > 0) {
      console.log(`  Op result: ${opResults[0].switch().name}`);
    }
  }
  if (txResult.diagnosticEventsXdr) {
    console.log("\n  Diagnostic events:");
    txResult.diagnosticEventsXdr.forEach((e, i) => {
      console.log(`    Event ${i}:`, JSON.stringify(e, null, 2).substring(0, 200));
    });
  }
  process.exit(1);
}
