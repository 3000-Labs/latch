import * as crypto from "crypto";
import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

export type FactoryConfig = {
  rpcUrl: string;
  networkPassphrase: string;
  factoryAddress: string;
  bundlerSecret?: string;
};

export function getFactoryConfigFromEnv(): FactoryConfig {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org";
  const networkPassphrase =
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.TESTNET;
  const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
  const bundlerSecret = process.env.BUNDLER_SECRET;
  if (!factoryAddress) {
    throw new Error("NEXT_PUBLIC_FACTORY_ADDRESS not configured.");
  }
  return { rpcUrl, networkPassphrase, factoryAddress, bundlerSecret };
}

/**
 * Deterministic account_salt: sha256(keyDataHex + version).
 * Keyed on keyData (pubkey + credentialId) so each passkey gets a unique address.
 */
export function deriveWebauthnSalt(keyDataHex: string, version = "webauthn-v1"): Buffer {
  const saltHex = crypto.createHash("sha256").update(keyDataHex + version).digest("hex");
  return Buffer.from(saltHex, "hex");
}

/**
 * AccountInitParams for a WebAuthn external signer.
 * XDR encoding of AccountSignerInit::External(ExternalSignerInit):
 *   scvMap({ account_salt: Bytes, signers: Vec[Vec["External", Map{ key_data, signer_kind }]], threshold: Void })
 */
export function buildWebauthnAccountInitParams(keyDataHex: string, salt: Buffer): xdr.ScVal {
  const signerStruct = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("key_data"),
      val: xdr.ScVal.scvBytes(Buffer.from(keyDataHex, "hex")),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signer_kind"),
      val: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("WebAuthn")]),
    }),
  ]);

  const externalSigner = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("External"), signerStruct]);

  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("account_salt"),
      val: xdr.ScVal.scvBytes(salt),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signers"),
      val: xdr.ScVal.scvVec([externalSigner]),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("threshold"),
      val: xdr.ScVal.scvVoid(),
    }),
  ]);
}

export async function predictWebauthnSmartAccountAddress(args: {
  server: rpc.Server;
  networkPassphrase: string;
  factoryAddress: string;
  params: xdr.ScVal;
}): Promise<string> {
  const dummyKp = Keypair.random();
  const dummyAccount = new Account(dummyKp.publicKey(), "0");
  const factory = new Contract(args.factoryAddress);

  const tx = new TransactionBuilder(dummyAccount, {
    fee: "100",
    networkPassphrase: args.networkPassphrase,
  })
    .addOperation(factory.call("get_account_address", args.params))
    .setTimeout(30)
    .build();

  const sim = await args.server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`get_account_address simulation failed: ${sim.error}`);
  }

  return scValToNative(sim.result!.retval);
}

export async function isSorobanContractDeployed(server: rpc.Server, contractAddress: string) {
  const instanceKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractAddress).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );
  const { entries } = await server.getLedgerEntries(instanceKey);
  return entries.length > 0;
}

export async function deployWebauthnSmartAccount(args: {
  server: rpc.Server;
  networkPassphrase: string;
  factoryAddress: string;
  bundlerSecret: string;
  params: xdr.ScVal;
  predictedAddress: string;
}): Promise<{ smartAccountAddress: string; alreadyDeployed: boolean }> {
  const bundlerKeypair = Keypair.fromSecret(args.bundlerSecret);

  const alreadyDeployed = await isSorobanContractDeployed(args.server, args.predictedAddress);
  if (alreadyDeployed) {
    return { smartAccountAddress: args.predictedAddress, alreadyDeployed: true };
  }

  const bundlerAccount = await args.server.getAccount(bundlerKeypair.publicKey());
  const factory = new Contract(args.factoryAddress);

  const createTx = new TransactionBuilder(bundlerAccount, {
    fee: "1500000",
    networkPassphrase: args.networkPassphrase,
  })
    .addOperation(factory.call("create_account", args.params))
    .setTimeout(300)
    .build();

  const sim = await args.server.simulateTransaction(createTx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`create_account simulation failed: ${sim.error}`);
  }

  const assembled = rpc.assembleTransaction(createTx, sim).build();
  assembled.sign(bundlerKeypair);

  const sendResult = await args.server.sendTransaction(assembled);
  if (sendResult.status === "ERROR") {
    throw new Error(`Factory create_account failed: ${sendResult.errorResult?.toXDR("base64")}`);
  }

  let smartAccountAddress: string | undefined;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const txResult = await args.server.getTransaction(sendResult.hash);
    if (txResult.status === rpc.Api.GetTransactionStatus.NOT_FOUND) continue;
    if (txResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      const success = txResult as rpc.Api.GetSuccessfulTransactionResponse;
      if (success.returnValue) {
        smartAccountAddress = scValToNative(success.returnValue);
      }
      break;
    }
    throw new Error(`Factory deployment failed with status: ${txResult.status}`);
  }

  if (!smartAccountAddress) smartAccountAddress = args.predictedAddress;
  if (smartAccountAddress !== args.predictedAddress) {
    throw new Error(
      `Deterministic address mismatch: predicted=${args.predictedAddress} actual=${smartAccountAddress}`
    );
  }

  return { smartAccountAddress, alreadyDeployed: false };
}

