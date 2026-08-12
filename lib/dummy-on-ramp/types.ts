export type IntentStatus = "pending" | "completed" | "expired" | "failed";

export type ForwardStatus = "pending" | "done" | "failed" | "pending_retry";

export type CreateDummySessionRequest = {
  destinationCAddress: string;
  amount?: string;
};

export type CreateDummySessionResponse = {
  intentId: string;
  memoId: string;
  poolAddress: string;
  expiresAt: string;
  amount: string;
  destinationCAddress: string;
  /** Which backend minted the intent: latch-api (extension path) or relayer direct. */
  via?: "latch-api" | "relayer";
};

export type DummyPayRequest = {
  poolAddress: string;
  memoId: string;
  amount: string;
};

export type DummyPayResponse = {
  txHash: string;
  ledger: number;
};

export type DummyForward = {
  txHash: string;
  amount: string;
  asset: string;
  status: ForwardStatus;
  forwardTx: string | null;
  createdAt: string;
};

export type DummyDepositStatusResponse = {
  intentId: string;
  memoId: string;
  cAddress: string;
  poolAddress: string;
  status: IntentStatus;
  expiresAt: string;
  forwards: DummyForward[];
};
