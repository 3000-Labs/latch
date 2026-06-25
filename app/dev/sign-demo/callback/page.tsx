"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import {
  parseCallbackResult,
  stellarExpertTxUrl,
} from "@/lib/sign-demo/parseCallback";

function CallbackContent() {
  const params = useSearchParams();
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => {
    const search = params.toString();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    return parseCallbackResult(search, hash);
  }, [params]);

  const rawQuery =
    typeof window !== "undefined"
      ? window.location.search + window.location.hash
      : params.toString();

  async function copyRaw() {
    await navigator.clipboard.writeText(rawQuery);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto max-w-lg p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign callback</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Result from the wallet redirect after signing or rejection.
        </p>
      </div>

      {result.status === "signed" && (
        <div className="rounded border border-green-500/50 bg-green-500/10 p-4 space-y-2">
          <p className="font-medium text-green-800 dark:text-green-300">
            Transaction signed successfully
          </p>
          {result.txHash && (
            <p className="text-sm font-mono break-all">{result.txHash}</p>
          )}
          {result.txHash && (
            <a
              href={stellarExpertTxUrl(result.network, result.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              View on Stellar Expert
            </a>
          )}
        </div>
      )}

      {result.status === "rejected" && (
        <div className="rounded border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="font-medium">User rejected in wallet</p>
        </div>
      )}

      {result.status === "error" && (
        <div className="rounded border border-destructive/50 bg-destructive/5 p-4 space-y-1">
          <p className="font-medium text-destructive">Sign error</p>
          {result.code && (
            <p className="text-sm font-mono text-destructive/80">code: {result.code}</p>
          )}
          {result.message && (
            <p className="text-sm text-destructive/90">{result.message}</p>
          )}
        </div>
      )}

      <dl className="space-y-2 text-sm">
        {result.requestId && (
          <div className="flex gap-2">
            <dt className="font-semibold">requestId:</dt>
            <dd className="font-mono break-all">{result.requestId}</dd>
          </div>
        )}
        {result.network && (
          <div className="flex gap-2">
            <dt className="font-semibold">network:</dt>
            <dd className="font-mono">{result.network}</dd>
          </div>
        )}
        {result.signedAuthEntry && (
          <div className="flex gap-2">
            <dt className="font-semibold">signedAuthEntry:</dt>
            <dd className="font-mono break-all text-xs">{result.signedAuthEntry}</dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        onClick={() => void copyRaw()}
        className="text-sm underline text-muted-foreground"
      >
        {copied ? "Copied" : "Copy raw query string"}
      </button>

      <a href="/dev/sign-demo" className="block text-sm underline">
        Back to demo
      </a>
    </main>
  );
}

export default function SignDemoCallbackPage() {
  return (
    <Suspense fallback={<main className="p-8">Loading…</main>}>
      <CallbackContent />
    </Suspense>
  );
}
