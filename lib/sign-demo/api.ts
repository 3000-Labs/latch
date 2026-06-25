import type {
  BuildSignDemoRequest,
  BuildSignDemoResponse,
  PrepareSignRequest,
  PrepareSignResponse,
  SignPayloadStoreRequest,
  SignPayloadStoreResponse,
} from "./types";

const apiBase = () =>
  (process.env.NEXT_PUBLIC_LATCH_API_URL ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  const base = apiBase();
  return base ? `${base}${path}` : path;
}

export class SignDemoApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "SignDemoApiError";
    this.code = code;
    this.status = status;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { message?: string; error?: string }).message ??
      (data as { error?: string }).error ??
      `Request failed: ${res.status}`;
    const code = (data as { code?: string }).code ?? "request_failed";
    throw new SignDemoApiError(code, msg, res.status);
  }
  return data as T;
}

export async function buildSignDemo(body: BuildSignDemoRequest) {
  return postJson<BuildSignDemoResponse>("/api/transaction/build-sign-demo", body);
}

export async function prepareSign(body: PrepareSignRequest) {
  return postJson<PrepareSignResponse>("/api/transaction/prepare-sign", body);
}

export async function storeSignPayload(body: SignPayloadStoreRequest) {
  return postJson<SignPayloadStoreResponse>("/api/sign-payload", body);
}

export async function fetchSignPayload(payloadRef: string) {
  const res = await fetch(apiUrl(`/api/sign-payload/${encodeURIComponent(payloadRef)}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { message?: string; error?: string }).message ??
      (data as { error?: string }).error ??
      `HTTP ${res.status}`;
    const code = (data as { code?: string }).code ?? "request_failed";
    throw new SignDemoApiError(code, msg, res.status);
  }
  return data as SignPayloadStoreRequest;
}
