import { ApiRequestError } from "@/lib/api-errors";
import {
  latchApiAccessToken,
  latchApiTimeoutMs,
  latchApiUrl,
} from "@/lib/dummy-on-ramp/config";
import type {
  DummyDepositStatusResponse,
  DummyForward,
  IntentStatus,
} from "@/lib/dummy-on-ramp/types";

type LatchApiEnvelope<T> = {
  data?: T;
  error?: { code?: string; message?: string };
};

type LatchDepositIntent = {
  intent_id: string;
  memo_id: string;
  pool_address: string;
  expires_at: string;
};

type LatchForward = {
  tx_hash: string;
  amount: string;
  asset: string;
  status: string;
  forward_tx?: string | null;
  created_at: string;
};

type LatchDepositStatus = {
  intent_id: string;
  memo_id: string;
  c_address: string;
  pool_address: string;
  status: string;
  expires_at: string;
  forwards?: LatchForward[];
};

export function latchApiConfigured(): boolean {
  return Boolean(latchApiUrl() && latchApiAccessToken());
}

function authHeaders(): HeadersInit {
  const token = latchApiAccessToken();
  if (!token) {
    throw new ApiRequestError(
      "config_error",
      "LATCH_API_ACCESS_TOKEN is not configured.",
      503
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function latchFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = latchApiUrl();
  if (!base) {
    throw new ApiRequestError(
      "config_error",
      "LATCH_API_URL / NEXT_PUBLIC_LATCH_API_URL is not configured.",
      503
    );
  }

  const budgetMs = latchApiTimeoutMs();
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(budgetMs),
    });
  } catch (e) {
    throw new ApiRequestError(
      "latch_api_unavailable",
      `Latch API request failed: ${e instanceof Error ? e.message : String(e)}`,
      503
    );
  }
}

async function parseEnvelope<T>(resp: Response): Promise<T> {
  const raw = (await resp.json().catch(() => ({}))) as LatchApiEnvelope<T> & {
    error?: string;
    message?: string;
  };

  if (!resp.ok) {
    const message =
      raw.error?.message ??
      (typeof raw.error === "string" ? raw.error : undefined) ??
      raw.message ??
      `Latch API failed with status ${resp.status}.`;
    const code = raw.error?.code ?? "latch_api_error";
    if (resp.status === 401 || resp.status === 403) {
      throw new ApiRequestError(
        "latch_api_unauthorized",
        "Latch API rejected the access token. Sign in via the extension (wallet JWT) and set LATCH_API_ACCESS_TOKEN, or use the direct relayer path with a matching RELAYER_API_KEY.",
        resp.status
      );
    }
    if (resp.status >= 500) {
      throw new ApiRequestError("latch_api_unavailable", message, 503);
    }
    throw new ApiRequestError(code, message, resp.status);
  }

  if (raw.data === undefined) {
    throw new ApiRequestError(
      "latch_api_error",
      "Latch API response missing data envelope.",
      502
    );
  }
  return raw.data;
}

function mapForward(f: LatchForward): DummyForward {
  return {
    txHash: f.tx_hash,
    amount: f.amount,
    asset: f.asset,
    status: f.status as DummyForward["status"],
    forwardTx: f.forward_tx ?? null,
    createdAt: f.created_at,
  };
}

/** Extension Fund path: POST /v1/accounts/deposit-intent → latch-api → relayer. */
export async function createDepositIntent(cAddress: string) {
  const resp = await latchFetch("/v1/accounts/deposit-intent", {
    method: "POST",
    body: JSON.stringify({
      smart_account_address: cAddress,
      network: "testnet",
    }),
  });
  const data = await parseEnvelope<LatchDepositIntent>(resp);
  return {
    intentId: data.intent_id,
    memoId: data.memo_id,
    poolAddress: data.pool_address,
    expiresAt: data.expires_at,
  };
}

/** Extension Fund path: GET /v1/accounts/deposit/status/{memo_id}. */
export async function fetchDepositIntentStatus(
  memoId: string
): Promise<DummyDepositStatusResponse> {
  const resp = await latchFetch(
    `/v1/accounts/deposit/status/${encodeURIComponent(memoId)}`
  );
  if (resp.status === 404) {
    throw new ApiRequestError(
      "intent_not_found",
      "Funding intent not found.",
      404
    );
  }
  const data = await parseEnvelope<LatchDepositStatus>(resp);
  return {
    intentId: data.intent_id,
    memoId: data.memo_id,
    cAddress: data.c_address,
    poolAddress: data.pool_address,
    status: data.status as IntentStatus,
    expiresAt: data.expires_at,
    forwards: (data.forwards ?? []).map(mapForward),
  };
}
