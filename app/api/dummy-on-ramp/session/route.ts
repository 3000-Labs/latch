import { NextRequest, NextResponse } from "next/server";
import { apiError, ApiRequestError } from "@/lib/api-errors";
import { defaultDepositAmount } from "@/lib/dummy-on-ramp/config";
import {
  createDepositIntent,
  latchApiConfigured,
} from "@/lib/dummy-on-ramp/latch-api";
import { createIntent } from "@/lib/dummy-on-ramp/relayer";
import { validateAmount, validateCAddress } from "@/lib/dummy-on-ramp/validate";
import { devOnlyGuard } from "@/lib/on-ramp/dev-guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = devOnlyGuard();
  if (guard) return guard;

  try {
    const body = await request.json();
    const destinationCAddress = validateCAddress(body.destinationCAddress);
    const amount =
      typeof body.amount === "string" && body.amount.trim()
        ? validateAmount(body.amount)
        : defaultDepositAmount();

    // Prefer extension Fund path: latch-api → relayer. Fall back to a direct
    // RelayerService-style call when no wallet JWT is configured (local e2e).
    const intent = latchApiConfigured()
      ? await createDepositIntent(destinationCAddress)
      : await createIntent({
          cAddress: destinationCAddress,
          expectedAmt: amount,
          expiresIn: 3600,
        });

    return NextResponse.json(
      {
        intentId: intent.intentId,
        memoId: intent.memoId,
        poolAddress: intent.poolAddress,
        expiresAt: intent.expiresAt,
        amount,
        destinationCAddress,
        via: latchApiConfigured() ? "latch-api" : "relayer",
      },
      { status: 201 }
    );
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
