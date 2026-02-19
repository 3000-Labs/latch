import { NextRequest, NextResponse } from "next/server";
import {
  Contract,
  TransactionBuilder,
  Networks,
  Address,
  xdr,
  hash,
  rpc,
} from "@stellar/stellar-sdk";

const TESTNET_CONFIG = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  counterAddress: "CBRCNPTZ7YPP5BCGF42QSUWPYZQW6OJDPNQ4HDEYO7VI5Z6AVWWNEZ2U",
  // Bundler account that pays fees and signs the envelope
  bundlerAddress: "GBL4FMN3MPLPA2IS7T2K5VAGGVT4WJWJ24YXYFAHIFOGGCVEM6WVVAQA",
};

export async function POST(request: NextRequest) {
  try {
    const server = new rpc.Server(TESTNET_CONFIG.rpcUrl);
    const { smartAccountAddress } = await request.json();

    if (!smartAccountAddress || typeof smartAccountAddress !== "string") {
      return NextResponse.json(
        { error: "Missing smartAccountAddress" },
        { status: 400 }
      );
    }

    // Build the transaction using bundler account as source (pays fees, signs envelope)
    const account = await server.getAccount(TESTNET_CONFIG.bundlerAddress);
    const contract = new Contract(TESTNET_CONFIG.counterAddress);

    const tx = new TransactionBuilder(account, {
      fee: "1000000",
      networkPassphrase: TESTNET_CONFIG.networkPassphrase,
    })
      .addOperation(
        contract.call("increment", new Address(smartAccountAddress).toScVal())
      )
      .setTimeout(300)
      .build();

    // Simulate to get auth payload
    const simResult = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    if (!rpc.Api.isSimulationSuccess(simResult)) {
      throw new Error("Simulation did not succeed");
    }

    const authEntries = simResult.result?.auth;
    if (!authEntries || authEntries.length === 0) {
      throw new Error("No auth entries in simulation result");
    }

    // Get the auth entry - it may already be an XDR object or a base64 string
    const authEntry = typeof authEntries[0] === "string"
      ? xdr.SorobanAuthorizationEntry.fromXDR(authEntries[0], "base64")
      : authEntries[0] as xdr.SorobanAuthorizationEntry;
    const credentials = authEntry.credentials().address();
    const nonce = credentials.nonce();

    // Set validity window - 60 ledgers (~5 minutes)
    const latestLedger = simResult.latestLedger;
    const validUntilLedger = latestLedger + 60;
    credentials.signatureExpirationLedger(validUntilLedger);

    // Compute the payload hash
    const networkIdHash = hash(Buffer.from(TESTNET_CONFIG.networkPassphrase));

    const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId: networkIdHash,
        nonce: nonce,
        signatureExpirationLedger: validUntilLedger,
        invocation: authEntry.rootInvocation(),
      })
    );

    const payloadHash = hash(preimage.toXDR());

    // Handle transactionData - may be string, XDR object, or SorobanDataBuilder
    let transactionDataXdr: string | undefined;
    const txData = simResult.transactionData as unknown;

    if (typeof txData === "string") {
      transactionDataXdr = txData;
    } else if (txData && typeof (txData as { toXDR?: unknown }).toXDR === "function") {
      // Direct XDR object
      transactionDataXdr = (txData as { toXDR: (format: string) => string }).toXDR("base64");
    } else if (txData && typeof (txData as { build?: unknown }).build === "function") {
      // SorobanDataBuilder - need to call build() first
      const built = (txData as { build: () => { toXDR: (format: string) => string } }).build();
      transactionDataXdr = built.toXDR("base64");
    }

    return NextResponse.json({
      txXdr: tx.toXDR(),
      authEntryXdr: authEntry.toXDR("base64"),
      simulationResultXdr: JSON.stringify({
        transactionData: transactionDataXdr,
        minResourceFee: simResult.minResourceFee,
        latestLedger: simResult.latestLedger,
      }),
      authPayloadHash: payloadHash.toString("hex"),
      validUntilLedger,
    });
  } catch (error) {
    console.error("Error building transaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build transaction" },
      { status: 500 }
    );
  }
}
