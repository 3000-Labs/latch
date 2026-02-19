#!/usr/bin/env node

/**
 * Test script for Ed25519 verifier contract
 *
 * This script:
 * 1. Generates an Ed25519 keypair
 * 2. Creates a test payload (32-byte hash)
 * 3. Constructs prefixed message: "Stellar Smart Account Auth:\n" + hex(payload)
 * 4. Signs the prefixed message
 * 5. Encodes Ed25519SigData struct to XDR
 * 6. Invokes the verifier contract
 * 7. Validates that verification succeeds
 */

import StellarSdk from "@stellar/stellar-sdk";
import crypto from "crypto";
import nacl from "tweetnacl";

const {
  Contract,
  rpc,
  TransactionBuilder,
  Networks,
  xdr,
  Keypair,
  nativeToScVal,
} = StellarSdk;

// Config
const VERIFIER_ADDRESS = "CBNCF7QBTMIAEIZ3H6EN6JU5RDLBTFZZKGSWPAXW6PGPNY3HHIW5HKCH";
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const AUTH_PREFIX = "Stellar Smart Account Auth:\n";

// Bundler keypair (pays for the transaction)
const BUNDLER_SECRET = "SDGWLYMZGV43RKDEQXGD4FKRP3L7S6BC5QQQDS54MJ6RORZSJE64V2PF";

// Helper: Convert bytes to lowercase hex
function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

async function testVerifier() {
  console.log("🧪 Testing Ed25519 Verifier Contract\n");

  const server = new rpc.Server(RPC_URL);
  const bundlerKeypair = Keypair.fromSecret(BUNDLER_SECRET);

  // Step 1: Generate test Ed25519 keypair using tweetnacl
  console.log("1️⃣  Generating test Ed25519 keypair...");
  const seed = crypto.randomBytes(32);
  const testKeypair = nacl.sign.keyPair.fromSeed(seed);

  const publicKeyBytes = testKeypair.publicKey;
  const secretKeyBytes = testKeypair.secretKey;

  console.log(`   Public key (hex): ${bytesToHex(publicKeyBytes)}`);

  // Step 2: Create test payload (32-byte hash simulating Soroban auth payload)
  console.log("\n2️⃣  Creating test payload...");
  const payload = crypto.randomBytes(32);
  console.log(`   Payload (hex): ${bytesToHex(payload)}`);

  // Step 3: Construct prefixed message
  console.log("\n3️⃣  Constructing prefixed message...");
  const payloadHex = bytesToHex(payload);
  const prefixedMessage = AUTH_PREFIX + payloadHex;
  const prefixedMessageBytes = Buffer.from(prefixedMessage, "utf-8");

  console.log(`   Prefix: "${AUTH_PREFIX}"`);
  console.log(`   Payload hex: ${payloadHex}`);
  console.log(`   Full message length: ${prefixedMessageBytes.length} bytes`);

  // Step 4: Sign the prefixed message
  console.log("\n4️⃣  Signing prefixed message...");
  const signature = nacl.sign.detached(prefixedMessageBytes, secretKeyBytes);
  console.log(`   Signature (hex): ${bytesToHex(signature)}`);
  console.log(`   Signature length: ${signature.length} bytes`);

  // Step 5: Encode Ed25519SigData struct to XDR
  console.log("\n5️⃣  Encoding Ed25519SigData to XDR...");

  // Create Ed25519SigData ScMap: { prefixed_message: Bytes, signature: BytesN<64> }
  const sigDataMap = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("prefixed_message"),
      val: xdr.ScVal.scvBytes(prefixedMessageBytes),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signature"),
      val: xdr.ScVal.scvBytes(signature),
    }),
  ]);

  // Encode to XDR bytes and wrap in ScBytes
  const sigDataXdr = sigDataMap.toXDR();
  const sigDataBytes = xdr.ScVal.scvBytes(sigDataXdr);

  console.log(`   XDR size: ${sigDataXdr.length} bytes`);

  // Step 6: Build transaction to invoke verifier
  console.log("\n6️⃣  Building transaction to invoke verifier...");

  const contract = new Contract(VERIFIER_ADDRESS);
  const bundlerAccount = await server.getAccount(bundlerKeypair.publicKey());

  // Build the operation
  const operation = contract.call(
    "verify",
    nativeToScVal(payload, { type: "bytes" }), // signature_payload
    nativeToScVal(Buffer.from(publicKeyBytes), { type: "bytes" }), // key_data
    sigDataBytes // sig_data (already encoded as ScVal)
  );

  let tx = new TransactionBuilder(bundlerAccount, {
    fee: "100000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Step 7: Simulate to get footprint and resources
  console.log("\n7️⃣  Simulating transaction...");
  const simResponse = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationError(simResponse)) {
    console.error("❌ Simulation failed:", simResponse.error);
    return;
  }

  console.log("   ✅ Simulation successful");

  // Assemble transaction with simulation results
  const preparedTx = rpc.assembleTransaction(tx, simResponse).build();
  preparedTx.sign(bundlerKeypair);

  // Step 8: Submit transaction
  console.log("\n8️⃣  Submitting transaction...");
  const sendResult = await server.sendTransaction(preparedTx);

  if (sendResult.status === "ERROR") {
    console.error("❌ Transaction submission failed:");
    console.error("   Error:", sendResult.errorResult?.toXDR("base64"));
    return;
  }

  console.log(`   Transaction hash: ${sendResult.hash}`);
  console.log(`   Explorer: https://stellar.expert/explorer/testnet/tx/${sendResult.hash}`);

  // Step 9: Poll for result
  console.log("\n9️⃣  Waiting for transaction result...");

  let txResult;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    txResult = await server.getTransaction(sendResult.hash);

    if (txResult.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
      break;
    }
    process.stdout.write(".");
  }
  console.log();

  // Step 10: Check result
  console.log("\n🏁 Result:");

  if (txResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    const result = txResult.returnValue;
    const verified = result._value; // boolean

    console.log(`   Return value type: ${result._switch?.name}`);
    console.log(`   Return value: ${verified}`);

    if (verified) {
      console.log("\n   ✅ VERIFICATION SUCCEEDED");
      console.log("   ✅ Verifier contract is working correctly!");
      console.log("   ✅ g2c pattern optimizations are functional");
    } else {
      console.log("\n   ❌ VERIFICATION FAILED");
      console.log("   ❌ Verifier returned false");
    }
  } else {
    console.log(`   ❌ Transaction failed with status: ${txResult.status}`);

    if (txResult.status === rpc.Api.GetTransactionStatus.FAILED) {
      console.log("\n   Diagnostic events:");
      if (txResult.diagnosticEventsXdr) {
        txResult.diagnosticEventsXdr.forEach((event, i) => {
          console.log(`   Event ${i}:`, event);
        });
      }
    }
  }
}

// Run the test
testVerifier().catch(console.error);
