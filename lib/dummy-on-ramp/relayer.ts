import { ApiRequestError } from "@/lib/api-errors";
import {
  relayerApiKey,
  relayerTimeoutMs,
  relayerUrl,
} from "@/lib/dummy-on-ramp/config";
import type {
  DummyDepositStatusResponse,
  DummyForward,
  IntentStatus,
} from "@/lib/dummy-on-ramp/types";

const RETRY_INTERVAL_MS = 2000;

type CreateIntentInput = {
  cAddress: string;
  expectedAmt?: string;
  expiresIn?: number;
};

type RelayerIntentResponse = {
  intent_id: string;
  memo_id: string;
  pool_address: string;
  expires_at: string;
  error?: string;
};

type RelayerForwardPayload = {
  tx_hash: string;
  amount: string;
  asset: string;
  status: string;
  forward_tx?: string | null;
  created_at: string;
};

type RelayerDepositStatusResponse = {
  intent_id: string;
  memo_id: string;
  c_address: string;
  pool_address: string;
  status: string;
  expires_at: string;
  forwards?: RelayerForwardPayload[];
  error?: string;
};

function isRelayerBooting(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function authHeaders(): HeadersInit {
  const key = relayerApiKey();
  if (!key) {
    throw new ApiRequestError(
      "config_error",
      "RELAYER_API_KEY is not configured.",
      503
    );
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function relayerFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = relayerUrl();
  if (!base) {
    throw new ApiRequestError(
      "config_error",
      "RELAYER_URL is not configured.",
      503
    );
  }

  const budgetMs = relayerTimeoutMs();
  const deadline = Date.now() + budgetMs;
  const url = `${base}${path}`;

  while (true) {
    let resp: Response | undefined;
    let err: unknown;

    try {
      resp = await fetch(url, {
        ...init,
        headers: {
          ...authHeaders(),
          ...(init?.headers ?? {}),
        },
        signal: AbortSignal.timeout(budgetMs),
      });
      if (!isRelayerBooting(resp.status)) {
        return resp;
      }
    } catch (e) {
      err = e;
    }

    if (Date.now() + RETRY_INTERVAL_MS > deadline) {
      if (resp) return resp;
      throw new ApiRequestError(
        "relayer_unavailable",
        `Relayer request failed: ${err instanceof Error ? err.message : String(err)}`,
        503
      );
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }
}

function mapForward(f: RelayerForwardPayload): DummyForward {
  return {
    txHash: f.tx_hash,
    amount: f.amount,
    asset: f.asset,
    status: f.status as DummyForward["status"],
    forwardTx: f.forward_tx ?? null,
    createdAt: f.created_at,
  };
}

export async function createIntent(input: CreateIntentInput) {
  const body: Record<string, unknown> = {
    c_address: input.cAddress,
    expires_in: input.expiresIn ?? 3600,
  };
  if (input.expectedAmt) {
    body.expected_amt = input.expectedAmt;
  }

  const resp = await relayerFetch("/intents", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const raw = (await resp.json().catch(() => ({}))) as RelayerIntentResponse;
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new ApiRequestError(
        "relayer_unauthorized",
        "Relayer rejected RELAYER_API_KEY. Use the same secret configured on the latch-relayer service (≥32 chars, e.g. openssl rand -hex 32) — not a Render dashboard API key (rnd_…). Prefer the latch-api path (LATCH_API_ACCESS_TOKEN) which matches the extension Fund flow.",
        401
      );
    }
    const message =
      raw.error ??
      `Relayer create intent failed with status ${resp.status}.`;
    if (resp.status >= 500) {
      throw new ApiRequestError("relayer_unavailable", message, 503);
    }
    throw new ApiRequestError("relayer_error", message, resp.status);
  }

  if (raw.error) {
    throw new ApiRequestError("relayer_error", raw.error, 502);
  }

  return {
    intentId: raw.intent_id,
    memoId: raw.memo_id,
    poolAddress: raw.pool_address,
    expiresAt: raw.expires_at,
  };
}

export async function depositStatus(
  memoId: string
): Promise<DummyDepositStatusResponse> {
  const resp = await relayerFetch(
    `/deposit/status/${encodeURIComponent(memoId)}`
  );

  const raw = (await resp.json().catch(() => ({}))) as RelayerDepositStatusResponse;
  if (resp.status === 404) {
    throw new ApiRequestError(
      "intent_not_found",
      "Funding intent not found.",
      404
    );
  }
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new ApiRequestError(
        "relayer_unauthorized",
        "Relayer rejected RELAYER_API_KEY. Use the same secret configured on the latch-relayer service (≥32 chars, e.g. openssl rand -hex 32) — not a Render dashboard API key (rnd_…). Prefer the latch-api path (LATCH_API_ACCESS_TOKEN) which matches the extension Fund flow.",
        401
      );
    }
    const message =
      raw.error ??
      `Relayer deposit status failed with status ${resp.status}.`;
    if (resp.status >= 500) {
      throw new ApiRequestError("relayer_unavailable", message, 503);
    }
    throw new ApiRequestError("relayer_error", message, resp.status);
  }

  return {
    intentId: raw.intent_id,
    memoId: raw.memo_id,
    cAddress: raw.c_address,
    poolAddress: raw.pool_address,
    status: raw.status as IntentStatus,
    expiresAt: raw.expires_at,
    forwards: (raw.forwards ?? []).map(mapForward),
  };
}
