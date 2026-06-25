import { Keypair, rpc } from "@stellar/stellar-sdk";
import type { Network } from "@/lib/network";
import { resolveNetwork } from "@/lib/network";
import { ApiRequestError } from "@/lib/api-errors";
import type { SignerType } from "@/lib/soroban-transaction-build";
import { simulateAndExtractAuth } from "@/lib/transaction/simulateAndExtractAuth";
import { estimateFees } from "@/lib/transaction/estimateFees";
import {
  buildReviewWarnings,
  parseOperationsForReview,
  type PreparedSignOperation,
} from "@/lib/transaction/parseOperationsForReview";
import {
  extractTargetContractId,
  parseExternalTransaction,
  preValidateSmartAccountBinding,
} from "@/lib/transaction/validateExternalTx";

export type PrepareSignRequest = {
  network: Network;
  smartAccountAddress: string;
  unsignedTxXdr: string;
  signerType?: SignerType;
  signerG?: string;
};

export type PrepareSignResponse = {
  network: Network;
  smartAccountAddress: string;
  txXdr: string;
  authEntryXdr: string;
  authEntriesXdr: string[];
  smartAccountAuthEntryIndex: number;
  contextRuleId: number;
  authDigestHex: string;
  signaturePayloadHex: string;
  validUntilLedger: number;
  simulationResultXdr: string;
  smartAccountAuthEntryXdr?: string;
  gAddressPreimageXdr?: string;
  gAddressEntryTemplateXdr?: string;
  estimatedFeeXlm: string;
  estimatedFeeUsd?: string;
  feeLabel: string;
  operations: PreparedSignOperation[];
  warnings: string[];
};

export async function prepareExternalSign(
  req: PrepareSignRequest
): Promise<PrepareSignResponse> {
  const { networkPassphrase, rpcUrl } = resolveNetwork(req.network);
  const server = new rpc.Server(rpcUrl);

  const tx = parseExternalTransaction(req.unsignedTxXdr, networkPassphrase);
  preValidateSmartAccountBinding(tx, req.smartAccountAddress);

  const targetContractId = extractTargetContractId(tx);
  if (!targetContractId) {
    throw new ApiRequestError(
      "unsupported_tx",
      "Could not determine target contract from transaction operations."
    );
  }

  const auth = await simulateAndExtractAuth({
    server,
    networkPassphrase,
    tx,
    smartAccountAddress: req.smartAccountAddress,
    targetContractId,
    signerType: req.signerType,
    signerG: req.signerG,
  });

  const feeEstimate = estimateFees(
    {
      minResourceFee: auth.minResourceFee,
      latestLedger: auth.latestLedger,
    } as rpc.Api.SimulateTransactionSuccessResponse,
    tx.fee
  );

  const operations = parseOperationsForReview(tx, networkPassphrase);
  const warnings = buildReviewWarnings({
    validUntilLedger: auth.validUntilLedger,
    latestLedger: auth.latestLedger,
    tx,
    networkPassphrase,
  });

  return {
    network: req.network,
    smartAccountAddress: req.smartAccountAddress,
    txXdr: auth.txXdr,
    authEntryXdr: auth.authEntryXdr,
    authEntriesXdr: auth.authEntriesXdr,
    smartAccountAuthEntryIndex: auth.smartAccountAuthEntryIndex,
    contextRuleId: auth.contextRuleId,
    authDigestHex: auth.authDigestHex,
    signaturePayloadHex: auth.signaturePayloadHex,
    validUntilLedger: auth.validUntilLedger,
    simulationResultXdr: auth.simulationResultXdr,
    smartAccountAuthEntryXdr: auth.smartAccountAuthEntryXdr,
    gAddressPreimageXdr: auth.gAddressPreimageXdr,
    gAddressEntryTemplateXdr: auth.gAddressEntryTemplateXdr,
    estimatedFeeXlm: feeEstimate.estimatedFeeXlm,
    feeLabel: feeEstimate.feeLabel,
    operations,
    warnings,
  };
}

export function getBundlerKeypair(): Keypair {
  const secret = process.env.BUNDLER_SECRET;
  if (!secret) {
    throw new ApiRequestError("internal_error", "BUNDLER_SECRET is not set.", 500);
  }
  return Keypair.fromSecret(secret);
}
