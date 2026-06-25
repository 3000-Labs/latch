import {
  Address,
  Contract,
  Keypair,
  Operation,
  rpc,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { getBundlerAccount } from "@/lib/soroban-bundler";
import {
  discoverContextRule,
  hasMatchedCallContractRule,
  type ContextRuleDiscovery,
} from "@/lib/soroban-context-rules";
import { simulateAndExtractAuth } from "@/lib/transaction/simulateAndExtractAuth";

export type SignerType = "passkey" | "phantom" | "freighter";

export type BuildAuthTransactionParams = {
  server: rpc.Server;
  networkPassphrase: string;
  bundlerKeypair: Keypair;
  smartAccountAddress: string;
  /** Used for context-rule discovery (CallContract target). */
  targetContractId: string;
  buildOperation?: (contract: Contract) => Operation;
  /** When set, invokes `contract` at smartAccountAddress with these ops (e.g. add_context_rule). */
  buildOperationsOnSmartAccount?: (
    smartAccount: Contract
  ) => Operation[];
  signerType: SignerType;
  signerG?: string | null;
  requireMatchedContextRule?: boolean;
  /** Ledgers added to latest ledger for address credential expiration (default 60). */
  authEntryLedgerTtl?: number;
};

export type BuildAuthTransactionResult = {
  txXdr: string;
  authEntryXdr: string;
  authEntriesXdr: string[];
  smartAccountAuthEntryIndex: number;
  delegatedNativeAuthEntryIndices: number[];
  delegatedNativeSignBlobPayloadsBase64: string[];
  delegatedGAuthEntrySynthesized: boolean;
  contextRuleId: number;
  contextRuleDiscovery: ContextRuleDiscovery;
  authDigestHex: string;
  signaturePayloadHex: string;
  validUntilLedger: number;
  simulationResultXdr: string;
  /** Freighter delegated path */
  smartAccountAuthEntryXdr?: string;
  gAddressPreimageXdr?: string;
  gAddressEntryTemplateXdr?: string;
};

export async function buildUnsignedSorobanTransaction(
  params: Pick<
    BuildAuthTransactionParams,
    | "server"
    | "networkPassphrase"
    | "bundlerKeypair"
    | "smartAccountAddress"
    | "targetContractId"
    | "buildOperation"
    | "buildOperationsOnSmartAccount"
  >
): Promise<Transaction> {
  const {
    server,
    networkPassphrase,
    bundlerKeypair,
    smartAccountAddress,
    targetContractId,
    buildOperation,
    buildOperationsOnSmartAccount,
  } = params;

  if (!buildOperation && !buildOperationsOnSmartAccount) {
    throw new Error("buildOperation or buildOperationsOnSmartAccount is required");
  }

  const account = await getBundlerAccount(server, bundlerKeypair);

  const txBuilder = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase,
  }).setTimeout(300);

  if (buildOperationsOnSmartAccount) {
    const smartAccount = new Contract(smartAccountAddress);
    for (const op of buildOperationsOnSmartAccount(smartAccount)) {
      txBuilder.addOperation(op as Operation);
    }
  } else if (buildOperation) {
    const contract = new Contract(targetContractId);
    txBuilder.addOperation(buildOperation(contract) as Operation);
  }

  return txBuilder.build();
}

export async function buildAuthTransaction(
  params: BuildAuthTransactionParams
): Promise<BuildAuthTransactionResult> {
  const {
    server,
    networkPassphrase,
    smartAccountAddress,
    targetContractId,
    signerType,
    signerG,
    requireMatchedContextRule = false,
    authEntryLedgerTtl = 60,
  } = params;

  const { contextRuleId, discovery: contextRuleDiscovery } = await discoverContextRule(
    server,
    networkPassphrase,
    smartAccountAddress,
    targetContractId
  );

  if (requireMatchedContextRule && !hasMatchedCallContractRule(contextRuleDiscovery)) {
    const err = new Error(
      `No context rule allows CallContract(${targetContractId}). Run setup-send-rules first.`
    ) as Error & { code?: string };
    err.code = "NO_CONTEXT_RULE";
    throw err;
  }

  const tx = await buildUnsignedSorobanTransaction(params);

  const auth = await simulateAndExtractAuth({
    server,
    networkPassphrase,
    tx,
    smartAccountAddress,
    targetContractId,
    contextRuleId,
    contextRuleDiscovery,
    signerType,
    signerG,
    authEntryLedgerTtl,
  });

  return {
    txXdr: auth.txXdr,
    authEntryXdr: auth.authEntryXdr,
    authEntriesXdr: auth.authEntriesXdr,
    smartAccountAuthEntryIndex: auth.smartAccountAuthEntryIndex,
    delegatedNativeAuthEntryIndices: auth.delegatedNativeAuthEntryIndices,
    delegatedNativeSignBlobPayloadsBase64: auth.delegatedNativeSignBlobPayloadsBase64,
    delegatedGAuthEntrySynthesized: auth.delegatedGAuthEntrySynthesized,
    contextRuleId: auth.contextRuleId,
    contextRuleDiscovery: auth.contextRuleDiscovery,
    authDigestHex: auth.authDigestHex,
    signaturePayloadHex: auth.signaturePayloadHex,
    validUntilLedger: auth.validUntilLedger,
    simulationResultXdr: auth.simulationResultXdr,
    smartAccountAuthEntryXdr: auth.smartAccountAuthEntryXdr,
    gAddressPreimageXdr: auth.gAddressPreimageXdr,
    gAddressEntryTemplateXdr: auth.gAddressEntryTemplateXdr,
  };
}

/** SAC token transfer: transfer(from, to, amount). */
export function buildSacTransferOperation(
  tokenContractId: string,
  fromAddress: string,
  toAddress: string,
  amountI128: bigint
): (contract: Contract) => Operation {
  return (contract: Contract) =>
    contract.call(
      "transfer",
      new Address(fromAddress).toScVal(),
      new Address(toAddress).toScVal(),
      nativeToScVal(amountI128, { type: "i128" })
    ) as Operation;
}
