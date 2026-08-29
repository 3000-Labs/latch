import { StrKey } from "@stellar/stellar-sdk";
import { ApiRequestError } from "@/lib/api-errors";
import { validateCAddress } from "@/lib/on-ramp/validate";

export { validateCAddress };

export function validateAmount(amount: unknown): string {
  if (typeof amount !== "string" || !amount.trim()) {
    throw new ApiRequestError(
      "validation_error",
      "amount must be a positive number string.",
      400
    );
  }
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new ApiRequestError(
      "validation_error",
      "amount must be a positive number.",
      400
    );
  }
  return trimmed;
}

const UINT64_MAX = 18446744073709551615n;

export function validateMemoId(memoId: unknown): string {
  if (typeof memoId !== "string" || !memoId.trim()) {
    throw new ApiRequestError(
      "validation_error",
      "memoId is required.",
      400
    );
  }
  const trimmed = memoId.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new ApiRequestError(
      "validation_error",
      "memoId must be a decimal uint64 string.",
      400
    );
  }
  let value: bigint;
  try {
    value = BigInt(trimmed);
  } catch {
    throw new ApiRequestError(
      "validation_error",
      "memoId must be a valid uint64 string.",
      400
    );
  }
  // Relayer mints random uint64 memo_ids; keep as decimal string end-to-end
  // (JS Number loses precision above Number.MAX_SAFE_INTEGER).
  if (value > UINT64_MAX) {
    throw new ApiRequestError(
      "validation_error",
      "memoId exceeds uint64 range.",
      400
    );
  }
  return trimmed;
}

export function validatePoolAddress(address: unknown): string {
  if (typeof address !== "string" || !address.trim()) {
    throw new ApiRequestError(
      "validation_error",
      "poolAddress is required.",
      400
    );
  }
  const trimmed = address.trim();
  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    throw new ApiRequestError(
      "validation_error",
      "poolAddress must be a valid G-address.",
      400
    );
  }
  return trimmed;
}

