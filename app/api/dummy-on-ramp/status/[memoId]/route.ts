import { NextRequest, NextResponse } from "next/server";
import { apiError, ApiRequestError } from "@/lib/api-errors";
import {
  fetchDepositIntentStatus,
  latchApiConfigured,
} from "@/lib/dummy-on-ramp/latch-api";
import { depositStatus } from "@/lib/dummy-on-ramp/relayer";
import { validateMemoId } from "@/lib/dummy-on-ramp/validate";
import { devOnlyGuard } from "@/lib/on-ramp/dev-guard";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ memoId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const guard = devOnlyGuard();
  if (guard) return guard;

  try {
    const { memoId: rawMemoId } = await context.params;
    const memoId = validateMemoId(rawMemoId);
    const status = latchApiConfigured()
      ? await fetchDepositIntentStatus(memoId)
      : await depositStatus(memoId);
    return NextResponse.json(status);
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
