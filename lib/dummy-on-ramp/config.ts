const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";
const DEFAULT_NETWORK_PASSPHRASE =
  "Test SDF Network ; September 2015";
const DEFAULT_DEPOSIT_AMOUNT = "5";
const DEFAULT_RELAYER_TIMEOUT_SEC = 25;
const DEFAULT_LATCH_API_URL = "https://latch-backend.onrender.com";

export function latchApiUrl(): string {
  return (
    process.env.LATCH_API_URL ??
    process.env.NEXT_PUBLIC_LATCH_API_URL ??
    DEFAULT_LATCH_API_URL
  ).replace(/\/$/, "");
}

/** Wallet-scope JWT from extension sign-in (sub = C-address). Server-only. */
export function latchApiAccessToken(): string {
  return process.env.LATCH_API_ACCESS_TOKEN ?? "";
}

export function latchApiTimeoutMs(): number {
  const raw = process.env.LATCH_API_TIMEOUT_SEC;
  const sec = raw ? Number(raw) : DEFAULT_RELAYER_TIMEOUT_SEC;
  if (!Number.isFinite(sec) || sec <= 0) {
    return DEFAULT_RELAYER_TIMEOUT_SEC * 1000;
  }
  return sec * 1000;
}

export function relayerUrl(): string {
  return (process.env.RELAYER_URL ?? "").replace(/\/$/, "");
}

export function relayerApiKey(): string {
  return process.env.RELAYER_API_KEY ?? "";
}

export function relayerTimeoutMs(): number {
  const raw = process.env.RELAYER_TIMEOUT_SEC;
  const sec = raw ? Number(raw) : DEFAULT_RELAYER_TIMEOUT_SEC;
  if (!Number.isFinite(sec) || sec <= 0) {
    return DEFAULT_RELAYER_TIMEOUT_SEC * 1000;
  }
  return sec * 1000;
}

export function depositorSeed(): string {
  return process.env.DUMMY_ONRAMP_DEPOSITOR_SEED ?? "";
}

export function horizonUrl(): string {
  return (
    process.env.HORIZON_URL_TESTNET ??
    process.env.NEXT_PUBLIC_HORIZON_URL ??
    DEFAULT_HORIZON_URL
  ).replace(/\/$/, "");
}

export function networkPassphrase(): string {
  return (
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? DEFAULT_NETWORK_PASSPHRASE
  );
}

export function defaultDepositAmount(): string {
  return process.env.DUMMY_ONRAMP_DEFAULT_AMOUNT ?? DEFAULT_DEPOSIT_AMOUNT;
}
