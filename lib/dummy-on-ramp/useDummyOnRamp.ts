"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDummySession,
  fetchDummyDepositStatus,
  submitDummyPayment,
} from "@/lib/dummy-on-ramp/api";
import type {
  CreateDummySessionResponse,
  DummyDepositStatusResponse,
  DummyPayResponse,
} from "@/lib/dummy-on-ramp/types";

export type DummyOnRampPhase =
  | "idle"
  | "creating"
  | "ready"
  | "paying"
  | "polling"
  | "done"
  | "error";

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 12;

export function useDummyOnRamp() {
  const [phase, setPhase] = useState<DummyOnRampPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CreateDummySessionResponse | null>(
    null
  );
  const [payment, setPayment] = useState<DummyPayResponse | null>(null);
  const [status, setStatus] = useState<DummyDepositStatusResponse | null>(
    null
  );
  const pollAttempts = useRef(0);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setSession(null);
    setPayment(null);
    setStatus(null);
    pollAttempts.current = 0;
  }, []);

  const createSession = useCallback(
    async (params: { destinationCAddress: string; amount: string }) => {
      setPhase("creating");
      setError(null);
      setPayment(null);
      setStatus(null);
      pollAttempts.current = 0;

      try {
        const next = await createDummySession({
          destinationCAddress: params.destinationCAddress,
          amount: params.amount,
        });
        setSession(next);
        setPhase("ready");
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setPhase("error");
      }
    },
    []
  );

  const simulateDeposit = useCallback(async () => {
    if (!session) return;

    setPhase("paying");
    setError(null);

    try {
      const result = await submitDummyPayment({
        poolAddress: session.poolAddress,
        memoId: session.memoId,
        amount: session.amount,
      });
      setPayment(result);
      setPhase("polling");
      pollAttempts.current = 0;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setPhase("error");
    }
  }, [session]);

  useEffect(() => {
    if (phase !== "polling" || !session?.memoId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const next = await fetchDummyDepositStatus(session.memoId);
        if (cancelled) return;
        setStatus(next);

        if (next.status === "completed") {
          setPhase("done");
          return;
        }
        if (next.status === "failed" || next.status === "expired") {
          setError(`Deposit intent ${next.status}.`);
          setPhase("error");
          return;
        }

        pollAttempts.current += 1;
        if (pollAttempts.current >= POLL_MAX_ATTEMPTS) {
          setError("Timed out waiting for relayer to complete forwarding.");
          setPhase("error");
        }
      } catch (e) {
        if (cancelled) return;
        pollAttempts.current += 1;
        if (pollAttempts.current >= POLL_MAX_ATTEMPTS) {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
          setPhase("error");
        }
      }
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [phase, session?.memoId]);

  return {
    phase,
    error,
    session,
    payment,
    status,
    createSession,
    simulateDeposit,
    reset,
  };
}
