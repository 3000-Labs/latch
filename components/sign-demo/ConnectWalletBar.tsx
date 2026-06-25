"use client";

import { useLatchWallet } from "@/lib/sign-demo/useLatchWallet";

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWalletBar() {
  const { status, publicKey, network, error, connect, disconnect } = useLatchWallet();

  return (
    <div className="rounded border bg-muted/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Latch Wallet</span>

        {status === "no_extension" && (
          <span className="text-xs text-muted-foreground max-w-md">
            Extension not detected — load unpacked latch-web-extension (with provider-bridge fix),
            reload this page
          </span>
        )}

        {status === "disconnected" && (
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded bg-black text-white px-3 py-1.5 text-sm font-medium"
          >
            Connect Wallet
          </button>
        )}

        {status === "connecting" && (
          <span className="text-sm text-muted-foreground">
            Connecting… approve in the Latch popup if prompted
          </span>
        )}

        {status === "connected" && publicKey && (
          <span className="text-sm font-mono">
            {truncateAddress(publicKey)}
            {network && (
              <span className="ml-2 text-xs text-muted-foreground">· {network}</span>
            )}
          </span>
        )}

        {status === "error" && (
          <span className="text-sm text-destructive">{error ?? "Connection failed"}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {status === "error" && (
          <button
            type="button"
            onClick={() => void connect()}
            className="text-sm underline"
          >
            Retry
          </button>
        )}

        {status === "connected" && (
          <button type="button" onClick={disconnect} className="text-sm underline">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

