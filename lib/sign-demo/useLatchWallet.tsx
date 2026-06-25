"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { WalletConnectionState } from "./types";
import {
  connectLatchWallet,
  isLatchInjected,
  probeLatchExtension,
  LatchWalletError,
} from "./latchWallet";

const STORAGE_KEY = "latch.signDemo.walletSession";

type LatchWalletContextValue = WalletConnectionState & {
  connect: () => Promise<{ publicKey: string; network: WalletConnectionState["network"] } | undefined>;
  disconnect: () => void;
  refreshProbe: () => Promise<void>;
};

const LatchWalletContext = createContext<LatchWalletContextValue | null>(null);

function useLatchWalletState(): LatchWalletContextValue {
  const [state, setState] = useState<WalletConnectionState>({
    status: "disconnected",
    publicKey: null,
    network: null,
    origin: typeof window !== "undefined" ? window.location.origin : "",
    error: null,
    connectedAt: null,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { publicKey: string; network: string };
      setState((s) => ({
        ...s,
        publicKey: saved.publicKey,
        network: saved.network as WalletConnectionState["network"],
        status: "disconnected",
      }));
    } catch {
      // ignore
    }
  }, []);

  const refreshProbe = useCallback(async () => {
    const probe = await probeLatchExtension();
    if (probe === "missing") {
      setState((s) => ({ ...s, status: "no_extension", error: null }));
    }
  }, []);

  useEffect(() => {
    void refreshProbe();
  }, [refreshProbe]);

  useEffect(() => {
    if (state.status !== "no_extension") return;
    const id = setInterval(() => {
      void refreshProbe();
    }, 2000);
    return () => clearInterval(id);
  }, [state.status, refreshProbe]);

  const connect = useCallback(async () => {
    if (!isLatchInjected()) {
      setState((s) => ({
        ...s,
        status: "no_extension",
        error: "Latch extension not detected",
      }));
      return;
    }
    setState((s) => ({ ...s, status: "connecting", error: null }));
    try {
      const { publicKey, network } = await connectLatchWallet();
      const connectedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ publicKey, network }));
      setState({
        status: "connected",
        publicKey,
        network,
        origin: window.location.origin,
        error: null,
        connectedAt,
      });
      return { publicKey, network };
    } catch (e) {
      const message =
        e instanceof LatchWalletError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setState((s) => ({
        ...s,
        status: "error",
        error: message,
      }));
      throw e;
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({
      status: isLatchInjected() ? "disconnected" : "no_extension",
      publicKey: null,
      network: null,
      origin: window.location.origin,
      error: null,
      connectedAt: null,
    });
  }, []);

  return { ...state, connect, disconnect, refreshProbe };
}

export function LatchWalletProvider({ children }: { children: ReactNode }) {
  const value = useLatchWalletState();
  return (
    <LatchWalletContext.Provider value={value}>{children}</LatchWalletContext.Provider>
  );
}

export function useLatchWallet(): LatchWalletContextValue {
  const ctx = useContext(LatchWalletContext);
  if (!ctx) {
    throw new Error("useLatchWallet must be used within LatchWalletProvider");
  }
  return ctx;
}
