import { NextResponse } from "next/server";
import {
  Contract,
  TransactionBuilder,
  Networks,
  Keypair,
  Account,
  rpc,
} from "@stellar/stellar-sdk";

const TESTNET_CONFIG = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  counterAddress: "CBRCNPTZ7YPP5BCGF42QSUWPYZQW6OJDPNQ4HDEYO7VI5Z6AVWWNEZ2U",
};

export async function GET() {
  try {
    const server = new rpc.Server(TESTNET_CONFIG.rpcUrl);
    const contract = new Contract(TESTNET_CONFIG.counterAddress);

    // Create a dummy account for simulation
    const dummyKeypair = Keypair.random();
    const dummyAccount = new Account(dummyKeypair.publicKey(), "0");

    const tx = new TransactionBuilder(dummyAccount, {
      fee: "100",
      networkPassphrase: TESTNET_CONFIG.networkPassphrase,
    })
      .addOperation(contract.call("get"))
      .setTimeout(30)
      .build();

    const simResult = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    if (!rpc.Api.isSimulationSuccess(simResult)) {
      return NextResponse.json({ value: 0 });
    }

    const returnValue = simResult.result?.retval;
    if (returnValue) {
      return NextResponse.json({ value: returnValue.u32() ?? 0 });
    }

    return NextResponse.json({ value: 0 });
  } catch (error) {
    console.error("Error getting counter value:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get counter" },
      { status: 500 }
    );
  }
}
