import type {
  CreateDummySessionRequest,
  CreateDummySessionResponse,
  DummyDepositStatusResponse,
  DummyPayRequest,
  DummyPayResponse,
} from "@/lib/dummy-on-ramp/types";

export class DummyOnRampApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "DummyOnRampApiError";
    this.code = code;
    this.status = status;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { message?: string; error?: string }).message ??
      (data as { error?: string }).error ??
      `Request failed: ${res.status}`;
    const code = (data as { code?: string }).code ?? "request_failed";
    throw new DummyOnRampApiError(code, msg, res.status);
  }
  return data as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonResponse<T>(res);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return parseJsonResponse<T>(res);
}

export async function createDummySession(body: CreateDummySessionRequest) {
  return postJson<CreateDummySessionResponse>("/api/dummy-on-ramp/session", body);
}

export async function submitDummyPayment(body: DummyPayRequest) {
  return postJson<DummyPayResponse>("/api/dummy-on-ramp/pay", body);
}

export async function fetchDummyDepositStatus(memoId: string) {
  return getJson<DummyDepositStatusResponse>(
    `/api/dummy-on-ramp/status/${encodeURIComponent(memoId)}`
  );
}
