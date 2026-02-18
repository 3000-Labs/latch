import { NextRequest, NextResponse } from "next/server";
import {
  TransactionBuilder,
  Networks,
  Address,
  xdr,
  rpc,
  Transaction,
} from "@stellar/stellar-sdk";

const TESTNET_CONFIG = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  verifierAddress: "CCHVR2WS5FRHVEG7BLMBS6BADCBK54ZEGP7CA5X3T6TJFPCQIDHDVZFV",
};

export async function POST(request: NextRequest) {
  try {
    const server = new rpc.Server(TESTNET_CONFIG.rpcUrl);
    const {
      txXdr,
      authEntryXdr,
      simulationResultXdr,
      authSignatureHex,      // Signature for smart account authorization
      envelopeSignatureHex,  // Signature for transaction envelope
      publicKeyHex,
    } = await request.json();

    if (!txXdr || !authEntryXdr || !simulationResultXdr || !authSignatureHex || !envelopeSignatureHex || !publicKeyHex) {
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
    const simResultData = JSON.parse(simulationResultXdr);

    // Build the signature map for smart account auth
    // Format: Map<Signer, Signature> where Signer = External(verifier_address, public_key_bytes)
    const phantomPubkeyBytes = Buffer.from(publicKeyHex, "hex");
    const authSignatureBytes = Buffer.from(authSignatureHex, "hex");

    const signerKey = xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol("External"),
      new Address(TESTNET_CONFIG.verifierAddress).toScVal(),
      xdr.ScVal.scvBytes(phantomPubkeyBytes),
    ]);

    const sigInnerMap = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: signerKey,
        val: xdr.ScVal.scvBytes(authSignatureBytes),
      }),
    ]);

    // Set the signature on the auth entry
    const credentials = authEntry.credentials().address();
    credentials.signature(xdr.ScVal.scvVec([sigInnerMap]));

    // Reconstruct simulation result for assembly
    const simResultForAssembly = {
      transactionData: xdr.SorobanTransactionData.fromXDR(simResultData.transactionData, "base64"),
      minResourceFee: simResultData.minResourceFee,
      cost: simResultData.cost,
      latestLedger: simResultData.latestLedger,
      result: {
        auth: [authEntry.toXDR("base64")],
      },
    } as unknown as rpc.Api.SimulateTransactionSuccessResponse;

    // Assemble the transaction
    const assembledTx = rpc.assembleTransaction(tx, simResultForAssembly).build();

    // Replace auth with our signed version
    const sorobanData = assembledTx.operations[0] as unknown as {
      auth?: xdr.SorobanAuthorizationEntry[];
    };
    if (sorobanData.auth) {
      sorobanData.auth[0] = authEntry;
    }

    // Add the user's envelope signature
    // The signature was created by Phantom signing the transaction hash
    const envelopeSignatureBytes = Buffer.from(envelopeSignatureHex, "hex");

    // Create signature hint from the last 4 bytes of the public key
    const hint = phantomPubkeyBytes.slice(-4);
    const decoratedSignature = new xdr.DecoratedSignature({
      hint: xdr.SignatureHint.fromXDR(hint),
      signature: envelopeSignatureBytes,
    });

    // Add the signature to the transaction
    assembledTx.signatures.push(decoratedSignature);

    // Submit
    const sendResult = await server.sendTransaction(assembledTx);

    if (sendResult.status === "ERROR") {
      throw new Error(
        `Transaction submission failed: ${sendResult.errorResult?.toXDR("base64")}`
      );
    }

    // Poll for result
    const txHash = sendResult.hash;
    let txResult: rpc.Api.GetTransactionResponse;

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

    throw new Error(`Transaction failed: ${txResult!.status}`);
  } catch (error) {
    console.error("Error submitting transaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit transaction" },
      { status: 500 }
    );
  }
}
