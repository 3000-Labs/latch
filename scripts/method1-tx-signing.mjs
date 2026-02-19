#!/usr/bin/env node

/**
 * Method 1: Transaction Signing
 *
 * Full transaction signing is the simpler approach where the same account acts
 * as both the transaction source (paying fees and consuming sequence) and the
 * authorizer of the contract invocation.
 *
 * When the transaction source account is the same as the address being authorized,
 * the signature on the transaction itself implicitly authorizes the invocation —
 * no separate auth entry signature is needed ("source account authorization").
 *
 * Key characteristics:
 *   - Sequence number: consumed from the source account
 *   - Fees: paid by the source account
 *   - Authorization: implicit via transaction signature
 *   - Limitation: only works with G-accounts
 */

import StellarSdk from "@stellar/stellar-sdk";

const {
  BASE_FEE,
  Keypair,
  nativeToScVal,
  Networks,
  Operation,
  TransactionBuilder,
  Asset,
} = StellarSdk;

const { Server, Api } = StellarSdk.rpc;

const rpcUrl = "https://soroban-testnet.stellar.org";
const server = new Server(rpcUrl);
const networkPassphrase = Networks.TESTNET;

// ─────────────────────────────────────────────────────────────────────────────
// Generate and fund test accounts
// ─────────────────────────────────────────────────────────────────────────────
const sourceKeypair = Keypair.random();
const recipientKeypair = Keypair.random();

console.log("\n🔑 Method 1: Transaction Signing\n");
console.log("═".repeat(70));
console.log("  Setup: Generate & fund test accounts");
console.log("═".repeat(70));

console.log(`\n  Source:    ${sourceKeypair.publicKey()}`);
console.log(`  Recipient: ${recipientKeypair.publicKey()}`);

console.log("\n  Funding via Friendbot...");
const [srcFund, dstFund] = await Promise.all([
  fetch(`https://friendbot.stellar.org?addr=${sourceKeypair.publicKey()}`),
  fetch(`https://friendbot.stellar.org?addr=${recipientKeypair.publicKey()}`),
]);

if (!srcFund.ok) throw new Error(`Friendbot failed for source: ${srcFund.status}`);
if (!dstFund.ok) throw new Error(`Friendbot failed for recipient: ${dstFund.status}`);
console.log("  ✅ Both accounts funded (10 000 XLM each)");

// Get the native XLM Stellar Asset Contract (SAC) ID
const contractId = Asset.native().contractId(networkPassphrase);
console.log(`\n  Native XLM SAC: ${contractId}`);

// Transfer 1 XLM = 10_000_000 stroops
const amount = 10_000_000n;
console.log(`  Transfer amount: 1 XLM (${amount} stroops)`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Build transaction with invokeContractFunction
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("  Step 1: Build transaction");
console.log("═".repeat(70));

const sourceAccount = await server.getAccount(sourceKeypair.publicKey());

const transaction = new TransactionBuilder(sourceAccount, {
  fee: BASE_FEE,
  networkPassphrase,
})
  .addOperation(
    Operation.invokeContractFunction({
      contract: contractId,
      function: "transfer",
      args: [
        nativeToScVal(sourceKeypair.publicKey(), { type: "address" }),
        nativeToScVal(recipientKeypair.publicKey(), { type: "address" }),
        nativeToScVal(amount, { type: "i128" }),
      ],
    }),
  )
  .setTimeout(30)
  .build();

console.log(`\n  Source:   ${transaction.source}`);
console.log(`  Fee:     ${transaction.fee} stroops`);
console.log(`  Timeout: 30s`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: prepareTransaction (simulate + assemble in one step)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("  Step 2: Prepare transaction (simulate + assemble)");
console.log("═".repeat(70));

const preparedTx = await server.prepareTransaction(transaction);
console.log(`\n  ✅ Transaction prepared`);
console.log(`  Adjusted fee: ${preparedTx.fee} stroops`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Sign the transaction envelope
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("  Step 3: Sign transaction envelope");
console.log("═".repeat(70));

// Since the source account's signature on the transaction envelope implicitly
// authorizes the invocation, no separate auth entry signing is needed.
preparedTx.sign(sourceKeypair);
console.log(`\n  ✅ Signed by source account (implicit authorization)`);
console.log(`  Signatures: ${preparedTx.signatures.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: Submit to network
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("  Step 4: Submit to network");
console.log("═".repeat(70));

const response = await server.sendTransaction(preparedTx);

if (response.status === "ERROR") {
  console.error("\n  ❌ Submission failed:", response.errorResult?.toXDR("base64"));
  process.exit(1);
}

console.log(`\n  ✅ Submitted`);
console.log(`  Hash:     ${response.hash}`);
console.log(`  Explorer: https://stellar.expert/explorer/testnet/tx/${response.hash}`);

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: Wait for confirmation
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
  console.log("  ┌─────────────────────────────────────────────────────┐");
  console.log("  │  Method 1: Transaction Signing — Summary            │");
  console.log("  ├─────────────────────────────────────────────────────┤");
  console.log("  │  ✔ Sequence number consumed from source account    │");
  console.log("  │  ✔ Fees paid by source account                     │");
  console.log("  │  ✔ Authorization implicit via tx signature         │");
  console.log("  │  ✔ Works with G-accounts only                      │");
  console.log("  └─────────────────────────────────────────────────────┘\n");
} else {
  console.log(`\n  ❌ Transaction failed: ${txResult.status}`);
  if (txResult.resultXdr) {
    const resultCode = txResult.resultXdr.result().switch().name;
    console.log(`  Result code: ${resultCode}`);
  }
  process.exit(1);
}
