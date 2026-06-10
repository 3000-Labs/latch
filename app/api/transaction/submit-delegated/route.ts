import { NextRequest, NextResponse } from "next/server";
import {
  TransactionBuilder,
  Networks,
  xdr,
  rpc,
  Transaction,
} from "@stellar/stellar-sdk";
import { applyDelegatedFreighterSignature } from "@/lib/delegated-check-auth-entry";
import {
  rebuildTxWithAuthEntries,
  submitWithBundler,
} from "@/lib/soroban-transaction-submit";

const getConfig = () => ({
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org",
  networkPassphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.TESTNET,
  bundlerSecret: process.env.BUNDLER_SECRET,
});

/**
 * Submits a delegated-signer transaction.
 * Expects:
 *   txXdr                  — assembled tx from build-delegated
 *   smartAccountAuthEntryXdr — base64 SorobanAuthorizationEntry with AuthPayload set
 *   gAddressEntryTemplateXdr — base64 SorobanAuthorizationEntry (unsigned G-address entry)
 *   signedAuthEntryBase64  — raw 64-byte Ed25519 signature from Freighter, base64-encoded
 *   signerAddress          — G-address that signed (from Freighter's signAuthEntry response)
 */
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!config.bundlerSecret) {
    return NextResponse.json({ error: "BUNDLER_SECRET is not set." }, { status: 500 });
  }

  try {
    const server = new rpc.Server(config.rpcUrl);
    const { txXdr, smartAccountAuthEntryXdr, gAddressEntryTemplateXdr, signedAuthEntryBase64, signerAddress } = await request.json();

    if (!txXdr || !smartAccountAuthEntryXdr || !gAddressEntryTemplateXdr || !signedAuthEntryBase64 || !signerAddress) {
      return NextResponse.json(
        { error: "Missing required fields: txXdr, smartAccountAuthEntryXdr, gAddressEntryTemplateXdr, signedAuthEntryBase64, signerAddress" },
        { status: 400 }
      );
    }

    const tx = TransactionBuilder.fromXDR(txXdr, config.networkPassphrase) as Transaction;

    // Parse the smart account auth entry (already has AuthPayload set)
    const smartAccountEntry = xdr.SorobanAuthorizationEntry.fromXDR(smartAccountAuthEntryXdr, "base64");

    const gAddrEntry = applyDelegatedFreighterSignature(
      gAddressEntryTemplateXdr,
      signedAuthEntryBase64,
      signerAddress
    );

    const txWithAuth = rebuildTxWithAuthEntries(tx, config.networkPassphrase, [
      smartAccountEntry,
      gAddrEntry,
    ]);

    const { hash: txHash, status } = await submitWithBundler({
      server,
      networkPassphrase: config.networkPassphrase,
      bundlerSecret: config.bundlerSecret,
      txWithAuth,
    });

    return NextResponse.json({ hash: txHash, status });
  } catch (error) {
    console.error("Error submitting delegated transaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit transaction" },
      { status: 500 }
    );
  }
}
