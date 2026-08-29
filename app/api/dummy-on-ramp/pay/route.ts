import { NextRequest, NextResponse } from "next/server";
import { apiError, ApiRequestError } from "@/lib/api-errors";
import { submitDepositPayment } from "@/lib/dummy-on-ramp/pay";
import {
  validateAmount,
  validateMemoId,
  validatePoolAddress,
} from "@/lib/dummy-on-ramp/validate";
import { devOnlyGuard } from "@/lib/on-ramp/dev-guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = devOnlyGuard();
  if (guard) return guard;

  try {
    const body = await request.json();
    const poolAddress = validatePoolAddress(body.poolAddress);
    const memoId = validateMemoId(body.memoId);
    const amount = validateAmount(body.amount);

    const result = await submitDepositPayment({
      poolAddress,
      memoId,
      amount,
    });

    return NextResponse.json({
      txHash: result.txHash,
      ledger: result.ledger,
    });
  } catch (e) {
    if (e instanceof ApiRequestError) {
      return apiError({
        status: e.status,
        code: e.code,
        message: e.message,
      });
    }
    return apiError({
      status: 500,
      code: "internal_error",
      message: e instanceof Error ? e.message : "Unexpected error.",
    });
  }
}
