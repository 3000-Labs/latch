import { NextRequest, NextResponse } from "next/server";
import {
  TransactionBuilder,
  Networks,
  Address,
  xdr,
  rpc,
  Transaction,
  Operation,
  Keypair,
  Account,
} from "@stellar/stellar-sdk";

const getConfig = () => ({
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org",
  networkPassphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.TESTNET,
  verifierAddress: process.env.NEXT_PUBLIC_VERIFIER_ADDRESS,
  bundlerSecret: process.env.BUNDLER_SECRET,
});

export async function POST(request: NextRequest) {
  const TESTNET_CONFIG = getConfig();

  if (!TESTNET_CONFIG.bundlerSecret) {
    return NextResponse.json({ error: "BUNDLER_SECRET is not set in environment variables." }, { status: 500 });
  }
  if (!TESTNET_CONFIG.verifierAddress) {
    return NextResponse.json({ error: "NEXT_PUBLIC_VERIFIER_ADDRESS is not set in environment variables." }, { status: 500 });
  }

  try {
    const server = new rpc.Server(TESTNET_CONFIG.rpcUrl);
    const {
      txXdr,
      authEntryXdr,
      authSignatureHex,  // Phantom signature for smart account authorization
      prefixedMessage,    // The full message that was signed (PREFIX + hex(payload))
      publicKeyHex,
    } = await request.json();

    if (!txXdr || !authEntryXdr || !authSignatureHex || !prefixedMessage || !publicKeyHex) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Reconstruct objects from XDR
    const tx = TransactionBuilder.fromXDR(
      txXdr,
      TESTNET_CONFIG.networkPassphrase
    ) as Transaction;

    const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, "base64");

    // Build the Ed25519SigData as an ScMap.
    // Map keys must be sorted lexicographically (prefixed_message < signature ✓)
    const prefixedMessageBytes = Buffer.from(prefixedMessage, "utf-8");
    const authSignatureBytes = Buffer.from(authSignatureHex, "hex");

    const sigDataMap = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("prefixed_message"),
        val: xdr.ScVal.scvBytes(prefixedMessageBytes),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signature"),
        val: xdr.ScVal.scvBytes(authSignatureBytes),
      }),
    ]);

    // Serialize the ScMap to raw XDR bytes, then wrap in ScBytes.
    // The verifier receives a Bytes Val and calls from_xdr() on it —
    // so it expects the raw XDR of the contracttype as the byte content.
    const sigDataBytes = xdr.ScVal.scvBytes(sigDataMap.toXDR());

    // Build the Signatures tuple struct for the smart account auth.
    // The stellar_accounts crate defines:
    // pub struct Signatures(pub Map<Signer, Bytes>);
    // As a tuple struct, it serializes to XDR as an ScVec of length 1.
    const phantomPubkeyBytes = Buffer.from(publicKeyHex, "hex");

    const signerKey = xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol("External"),
      Address.fromString(TESTNET_CONFIG.verifierAddress).toScVal(),
      xdr.ScVal.scvBytes(phantomPubkeyBytes),
    ]);

    // Build the Signatures structure as an ScMap.
    // The previously successful (though failing at verifier) diagnostic logs show
    // that the contract expects a Map with "context_rule_ids" and "signers".
    const signaturesScVal = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("context_rule_ids"),
        val: xdr.ScVal.scvVec([xdr.ScVal.scvU32(0)]), // Use rule ID 0 (default counter rule)
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signers"),
        val: xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: signerKey,
            val: sigDataBytes,
          }),
        ]),
      }),
    ]);

    // Set the signature on the auth entry
    const credentials = authEntry.credentials().address();
    credentials.signature(signaturesScVal);

    // Build new transaction with signed auth entry
    const origOp = tx.operations[0] as Operation.InvokeHostFunction;
    const sourceAccount = new Account(tx.source, (BigInt(tx.sequence) - BigInt(1)).toString());

    const txWithAuth = new TransactionBuilder(sourceAccount, {
      fee: "100000",
      networkPassphrase: TESTNET_CONFIG.networkPassphrase,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: origOp.func,
          auth: [authEntry],
        })
      )
      .setTimeout(300)
      .build();

    // Enforcing Mode simulation: validates the signature and gets accurate
    // footprint + resource fees. This replaces all manual footprint patching,
    // instruction padding, and fee calculation.
    const enforcingSim = await server.simulateTransaction(txWithAuth);

    if (rpc.Api.isSimulationError(enforcingSim)) {
      throw new Error(`Auth validation failed: ${enforcingSim.error}`);
    }

    // assembleTransaction applies correct footprint + resource fees automatically
    const assembledTx = rpc.assembleTransaction(txWithAuth, enforcingSim).build();

    console.log(`Enforcing Mode: fee=${assembledTx.fee}, minResourceFee=${enforcingSim.minResourceFee}`);

    // Sign the envelope with bundler keypair (server-side)
    const bundlerKeypair = Keypair.fromSecret(TESTNET_CONFIG.bundlerSecret);
    assembledTx.sign(bundlerKeypair);

    // Submit
    const sendResult = await server.sendTransaction(assembledTx);

    if (sendResult.status === "ERROR") {
      throw new Error(
        `Transaction submission failed: ${sendResult.errorResult?.toXDR("base64")}`
      );
    }

    // Poll for result
    const txHash = sendResult.hash;
    console.log(`\n✅ Transaction submitted: ${txHash}`);
    console.log(`   View on explorer: https://stellar.expert/explorer/testnet/tx/${txHash}`);

    let txResult: rpc.Api.GetTransactionResponse | undefined;

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      txResult = await server.getTransaction(txHash);

      if (txResult.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
        break;
      }
    }

    if (txResult!.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return NextResponse.json({
        hash: txHash,
        status: "SUCCESS",
      });
    }

    // Get detailed error information
    let errorDetail: string = txResult!.status;
    if (txResult!.status === rpc.Api.GetTransactionStatus.FAILED) {
      const result = txResult as rpc.Api.GetFailedTransactionResponse;

      // Log diagnostic events to understand what failed
      if ('diagnosticEventsXdr' in result && Array.isArray((result as any).diagnosticEventsXdr)) {
        console.error("\n=== Diagnostic Events ===");
        (result as any).diagnosticEventsXdr.forEach((diagnosticEvent: any, i: number) => {
          try {
            // diagnosticEvent is already a parsed XDR object
            const event = diagnosticEvent._attributes.event;
            const eventType = event._attributes.type?._switch?.name || 'unknown';
            console.error(`\nEvent ${i} (${eventType}):`);

            if (eventType === 'contract') {
              const body = event._attributes.body?._value;
              if (body) {
                const topics = body._attributes?.topics?._value || [];
                const data = body._attributes?.data;
                console.error(`  Topics:`, topics.map((t: any) => {
                  try {
                    const val = t._switch?.name || JSON.stringify(t);
                    return val;
                  } catch {
                    return '[complex]';
                  }
                }));
                console.error(`  Data:`, data);
              }
            }
          } catch (e) {
            console.error(`Event ${i}: Error extracting -`, e);
          }
        });
      }

      // resultXdr is already an XDR object, not a string
      const parsedResult = result.resultXdr as xdr.TransactionResult;
      const resultCode = parsedResult.result().switch().name;
      const opResults = parsedResult.result().results();

      console.error("Transaction result code:", resultCode);

      if (opResults && opResults.length > 0) {
        const opResult = opResults[0];
        const opResultCode = opResult.switch().name;
        console.error("Operation result code:", opResultCode);

        if (opResultCode === "opInner") {
          const innerResult = opResult.value();
          const invokeResult = (innerResult as any).switch().name;
          console.error("Invoke result:", invokeResult);

          // If it's invokeHostFunctionTrapped, get the diagnostic events
          if (invokeResult === "invokeHostFunctionTrapped") {
            errorDetail = `${result.status} - Contract execution failed (trapped)`;
          } else {
            errorDetail = `${result.status} - ${resultCode} - ${opResultCode} - ${invokeResult}`;
          }
        } else {
          errorDetail = `${result.status} - ${resultCode} - ${opResultCode}`;
        }
      } else {
        errorDetail = `${result.status} - ${resultCode}`;
      }
    }

    throw new Error(`Transaction failed: ${errorDetail}`);
  } catch (error) {
    console.error("Error submitting transaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit transaction" },
      { status: 500 }
    );
  }
}
