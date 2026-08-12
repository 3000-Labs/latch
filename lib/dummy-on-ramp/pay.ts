import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { ApiRequestError } from "@/lib/api-errors";
import {
  depositorSeed,
  horizonUrl,
  networkPassphrase,
} from "@/lib/dummy-on-ramp/config";
import { validateMemoId } from "@/lib/dummy-on-ramp/validate";

export type SubmitDepositPaymentInput = {
  poolAddress: string;
  memoId: string;
  amount: string;
};

export type SubmitDepositPaymentResult = {
  txHash: string;
  ledger: number;
};

function horizonServer(): Horizon.Server {
  return new Horizon.Server(horizonUrl());
}

export async function submitDepositPayment(
  input: SubmitDepositPaymentInput
): Promise<SubmitDepositPaymentResult> {
  const seed = depositorSeed();
  if (!seed) {
    throw new ApiRequestError(
      "config_error",
      "DUMMY_ONRAMP_DEPOSITOR_SEED is not configured.",
      503
    );
  }

  let depositor: Keypair;
  try {
    depositor = Keypair.fromSecret(seed);
  } catch {
    throw new ApiRequestError(
      "config_error",
      "DUMMY_ONRAMP_DEPOSITOR_SEED is invalid.",
      503
    );
  }

  // Memo.id expects a decimal uint64 *string* — never Number(); relayer
  // memo_ids routinely exceed Number.MAX_SAFE_INTEGER.
  const memoIdStr = validateMemoId(input.memoId);

  const server = horizonServer();
  const sourceAccount = await server.loadAccount(depositor.publicKey());

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase() || Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: input.poolAddress,
        asset: Asset.native(),
        amount: input.amount,
      })
    )
    .addMemo(Memo.id(memoIdStr))
    .setTimeout(300)
    .build();

  tx.sign(depositor);

  try {
    const result = await server.submitTransaction(tx);
    return {
      txHash: result.hash,
      ledger: result.ledger,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to submit deposit payment.";
    throw new ApiRequestError("payment_failed", message, 502);
  }
}
