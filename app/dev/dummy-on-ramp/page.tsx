"use client";

import { useState } from "react";
import { useDummyOnRamp } from "@/lib/dummy-on-ramp/useDummyOnRamp";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded border p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <code className="break-all rounded bg-muted px-2 py-1 text-xs">{value}</code>
    </div>
  );
}

const DEFAULT_C_ADDRESS =
  "CCOX4AG3XESDAZC7L27AMQZ6KKMUWEU2KCHFXJ2PXNAXMDUCL225MN2P";

export default function DevDummyOnRampPage() {
  const [destinationCAddress, setDestinationCAddress] =
    useState(DEFAULT_C_ADDRESS);
  const [amount, setAmount] = useState("5");

  const {
    phase,
    error,
    session,
    payment,
    status,
    createSession,
    simulateDeposit,
    reset,
  } = useDummyOnRamp();

  const busy =
    phase === "creating" || phase === "paying" || phase === "polling";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Dummy on-ramp (relayer E2E)</h1>
        <p className="text-sm text-muted-foreground">
          Dev-only provider that mints a funding intent the same way the
          extension Fund flow does (
          <code className="rounded bg-muted px-1">
            POST /v1/accounts/deposit-intent
          </code>{" "}
          on latch-api → relayer), submits a testnet XLM payment to the pool
          G-address with MemoID, and polls until funds are forwarded to the
          C-address.
        </p>
        <p className="text-xs text-muted-foreground">
          Preferred: set{" "}
          <code className="rounded bg-muted px-1">LATCH_API_ACCESS_TOKEN</code>{" "}
          to a wallet-scope JWT (extension sign-in;{" "}
          <code className="rounded bg-muted px-1">sub</code> must equal the
          destination C-address). Fallback without that token: direct relayer
          via{" "}
          <code className="rounded bg-muted px-1">RELAYER_URL</code> +{" "}
          <code className="rounded bg-muted px-1">RELAYER_API_KEY</code>{" "}
          (must match the relayer service secret, not a Render{" "}
          <code className="rounded bg-muted px-1">rnd_</code> key). Also needs a
          funded{" "}
          <code className="rounded bg-muted px-1">
            DUMMY_ONRAMP_DEPOSITOR_SEED
          </code>
          .
        </p>
      </div>

      <Section title="Funding session">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="destination-c-address">
              Destination C-address
            </label>
            <input
              id="destination-c-address"
              className="w-full rounded border bg-background px-3 py-2 text-sm"
              placeholder="C..."
              value={destinationCAddress}
              onChange={(e) => setDestinationCAddress(e.target.value)}
              disabled={busy || phase === "ready" || phase === "done"}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="deposit-amount">
              Amount (XLM)
            </label>
            <input
              id="deposit-amount"
              className="w-full rounded border bg-background px-3 py-2 text-sm"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy || phase === "ready" || phase === "done"}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              disabled={busy || phase === "ready" || phase === "done"}
              onClick={() =>
                void createSession({
                  destinationCAddress: destinationCAddress.trim(),
                  amount: amount.trim(),
                })
              }
            >
              {phase === "creating" ? "Creating intent…" : "1. Create intent"}
            </button>

            <button
              type="button"
              className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={phase !== "ready" && phase !== "error"}
              onClick={() => void simulateDeposit()}
            >
              {phase === "paying"
                ? "Submitting payment…"
                : "2. Simulate deposit"}
            </button>

            {phase === "done" || phase === "error" ? (
              <button
                type="button"
                className="text-sm underline"
                onClick={reset}
              >
                Start over
              </button>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {phase === "polling" ? (
            <p className="text-sm text-muted-foreground">
              Polling relayer status…
            </p>
          ) : null}
        </div>
      </Section>

      {session ? (
        <Section title="Deposit details">
          <div className="space-y-2">
            <Row label="Intent ID" value={session.intentId} />
            <Row label="Memo ID" value={session.memoId} />
            <Row label="Pool G-address" value={session.poolAddress} />
            <Row label="Amount" value={`${session.amount} XLM`} />
            <Row label="Expires at" value={session.expiresAt} />
            {session.via ? (
              <Row label="Created via" value={session.via} />
            ) : null}
          </div>
        </Section>
      ) : null}

      {payment ? (
        <Section title="Inbound payment">
          <div className="space-y-2">
            <Row label="Deposit tx hash" value={payment.txHash} />
            <Row label="Ledger" value={String(payment.ledger)} />
          </div>
        </Section>
      ) : null}

      {status ? (
        <Section title="Relayer status">
          <div className="space-y-2">
            <Row label="Status" value={status.status} />
            <Row label="C-address" value={status.cAddress} />
            {status.forwards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No forwards recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {status.forwards.map((forward) => (
                  <div
                    key={forward.txHash}
                    className="space-y-2 rounded border p-3"
                  >
                    <Row label="Inbound tx" value={forward.txHash} />
                    <Row label="Amount" value={`${forward.amount} ${forward.asset}`} />
                    <Row label="Forward status" value={forward.status} />
                    {forward.forwardTx ? (
                      <Row label="Forward tx" value={forward.forwardTx} />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      ) : null}
    </main>
  );
}
