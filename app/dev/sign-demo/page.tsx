"use client";

import { useCallback, useEffect, useState } from "react";
import { ConnectWalletBar } from "@/components/sign-demo/ConnectWalletBar";
import { LatchWalletProvider, useLatchWallet } from "@/lib/sign-demo/useLatchWallet";
import { SignDemoApiResult } from "@/components/sign-demo/SignDemoApiResult";
import { TruncatedXdr } from "@/components/sign-demo/TruncatedXdr";
import {
  buildSignDemo,
  fetchSignPayload,
  prepareSign,
  SignDemoApiError,
  storeSignPayload,
} from "@/lib/sign-demo/api";
import { signWithLatch, openSignRequestViaLatch } from "@/lib/sign-demo/latchWallet";
import type { DemoAction, Network, PrepareSignResponse } from "@/lib/sign-demo/types";
import {
  appOrigin,
  callbackUrl,
  newRequestId,
} from "@/lib/sign-demo/walletUrl";

const ACCOUNT_STORAGE_KEY = "latch.signDemo.account";

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

function SignDemoPageContent() {
  const wallet = useLatchWallet();
  const [manualOverride, setManualOverride] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState("");
  const [network, setNetwork] = useState<Network>("testnet");
  const [signerType, setSignerType] = useState<"passkey" | "phantom" | "freighter" | "">("");
  const [signerG, setSignerG] = useState("");
  const [demoAction, setDemoAction] = useState<DemoAction>("noop");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [assetId, setAssetId] = useState("native");

  const [unsignedTxXdr, setUnsignedTxXdr] = useState<string | null>(null);
  const [builtForAccount, setBuiltForAccount] = useState<string | null>(null);
  const [buildDescription, setBuildDescription] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<SignDemoApiError | Error | null>(null);
  const [buildLoading, setBuildLoading] = useState(false);

  const [prepareResult, setPrepareResult] = useState<PrepareSignResponse | null>(null);
  const [prepareError, setPrepareError] = useState<SignDemoApiError | Error | null>(null);
  const [prepareLoading, setPrepareLoading] = useState(false);

  const [payloadResult, setPayloadResult] = useState<{
    payloadRef: string;
    expiresAt: string;
    match: boolean;
  } | null>(null);
  const [payloadError, setPayloadError] = useState<SignDemoApiError | Error | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);

  const [redirectStatus, setRedirectStatus] = useState<string | null>(null);
  const [inPageResult, setInPageResult] = useState<string | null>(null);
  const [inPageError, setInPageError] = useState<string | null>(null);
  const [inPageLoading, setInPageLoading] = useState(false);

  const origin = appOrigin();
  const cbUrl = callbackUrl(origin);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACCOUNT_STORAGE_KEY);
      if (saved) setSmartAccountAddress(saved);
    } catch {
      // ignore
    }
  }, []);

  const persistAccount = useCallback((addr: string) => {
    setSmartAccountAddress(addr);
    try {
      localStorage.setItem(ACCOUNT_STORAGE_KEY, addr);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (wallet.status === "connected" && wallet.publicKey && !manualOverride) {
      persistAccount(wallet.publicKey);
      if (wallet.network) setNetwork(wallet.network);
    }
  }, [wallet.status, wallet.publicKey, wallet.network, manualOverride, persistAccount]);

  const resolveSmartAccountAddress = useCallback((): string => {
    if (wallet.status === "connected" && wallet.publicKey && !manualOverride) {
      return wallet.publicKey.trim();
    }
    return smartAccountAddress.trim();
  }, [wallet.status, wallet.publicKey, manualOverride, smartAccountAddress]);

  useEffect(() => {
    if (!unsignedTxXdr || !builtForAccount) return;
    const current = resolveSmartAccountAddress();
    if (current && builtForAccount !== current) {
      setUnsignedTxXdr(null);
      setBuiltForAccount(null);
      setBuildDescription(null);
      setPrepareResult(null);
      setPrepareError(null);
      setPayloadResult(null);
      setPayloadError(null);
    }
  }, [unsignedTxXdr, builtForAccount, resolveSmartAccountAddress]);

  async function handleBuild() {
    const account = resolveSmartAccountAddress();
    if (!account) {
      setBuildError(new Error("Set a smart account address or connect your wallet."));
      return;
    }

    setBuildLoading(true);
    setBuildError(null);
    setBuildDescription(null);
    setUnsignedTxXdr(null);
    setBuiltForAccount(null);
    setPrepareResult(null);
    setPrepareError(null);
    setPayloadResult(null);
    setPayloadError(null);
    try {
      const res = await buildSignDemo({
        network,
        smartAccountAddress: account,
        demoAction,
        ...(demoAction === "transfer"
          ? { recipient: recipient.trim(), amount, assetId }
          : {}),
      });
      setUnsignedTxXdr(res.unsignedTxXdr);
      setBuiltForAccount(account);
      setBuildDescription(res.description);
    } catch (e) {
      setBuildError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setBuildLoading(false);
    }
  }

  async function handlePrepareSign() {
    if (!unsignedTxXdr) return;
    const account = resolveSmartAccountAddress();
    setPrepareLoading(true);
    setPrepareError(null);
    setPrepareResult(null);
    try {
      const res = await prepareSign({
        network,
        smartAccountAddress: account,
        unsignedTxXdr,
        ...(signerType ? { signerType } : {}),
        ...(signerType === "freighter" && signerG ? { signerG: signerG.trim() } : {}),
      });
      setPrepareResult(res);
    } catch (e) {
      setPrepareError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setPrepareLoading(false);
    }
  }

  async function handleSignPayloadTest() {
    if (!unsignedTxXdr) return;
    const account = resolveSmartAccountAddress();
    setPayloadLoading(true);
    setPayloadError(null);
    setPayloadResult(null);
    try {
      const requestId = newRequestId();
      const stored = await storeSignPayload({
        network,
        smartAccountAddress: account,
        unsignedTxXdr,
        callback: cbUrl,
        requestId,
        origin,
        submit: true,
      });
      const fetched = await fetchSignPayload(stored.payloadRef);
      setPayloadResult({
        payloadRef: stored.payloadRef,
        expiresAt: stored.expiresAt,
        match: fetched.unsignedTxXdr === unsignedTxXdr,
      });
    } catch (e) {
      setPayloadError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setPayloadLoading(false);
    }
  }

  function walletSignParams(account: string) {
    return {
      network,
      account,
      callback: cbUrl,
      requestId: newRequestId(),
      submit: true as const,
      origin,
    };
  }

  function requireConnectedWalletAccount(): string | null {
    if (wallet.status !== "connected" || !wallet.publicKey) {
      setRedirectStatus("Connect wallet first (Section A / Connect Wallet bar).");
      return null;
    }
    if (manualOverride && resolveSmartAccountAddress() !== wallet.publicKey) {
      setRedirectStatus(
        "Manual account override does not match the connected wallet. Disable override or switch wallet account."
      );
      return null;
    }
    if (builtForAccount && builtForAccount !== wallet.publicKey) {
      setRedirectStatus(
        "Transaction was built for a different account. Rebuild the demo transaction after connecting."
      );
      return null;
    }
    return wallet.publicKey.trim();
  }

  async function redirectInlineXdr() {
    if (!unsignedTxXdr) {
      setRedirectStatus("Build a transaction first.");
      return;
    }
    const account = requireConnectedWalletAccount();
    if (!account) return;
    try {
      setRedirectStatus("Opening Latch wallet…");
      await openSignRequestViaLatch({
        ...walletSignParams(account),
        xdr: unsignedTxXdr,
      });
      setRedirectStatus(
        "Sign-request tab opened in extension. Complete signing there — you will return to the callback page."
      );
    } catch (e) {
      setRedirectStatus(e instanceof Error ? e.message : String(e));
    }
  }

  async function redirectPayloadRef() {
    if (!unsignedTxXdr) {
      setRedirectStatus("Build a transaction first.");
      return;
    }
    const account = requireConnectedWalletAccount();
    if (!account) return;
    try {
      const requestId = newRequestId();
      const { payloadRef } = await storeSignPayload({
        network,
        smartAccountAddress: account,
        unsignedTxXdr,
        callback: cbUrl,
        requestId,
        origin,
        submit: true,
      });
      setRedirectStatus("Opening Latch wallet…");
      await openSignRequestViaLatch({
        ...walletSignParams(account),
        requestId,
        payloadRef,
      });
      setRedirectStatus(
        "Sign-request tab opened. Complete signing in the extension wallet tab."
      );
    } catch (e) {
      setRedirectStatus(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleInPageSign() {
    if (!unsignedTxXdr || wallet.status !== "connected" || !wallet.publicKey) return;
    setInPageLoading(true);
    setInPageError(null);
    setInPageResult(null);
    try {
      const res = await signWithLatch({
        xdr: unsignedTxXdr,
        network,
        accountToSign: wallet.publicKey,
      });
      setInPageResult(
        res.txHash
          ? `txHash: ${res.txHash}`
          : res.signedTxXdr
            ? `signedTxXdr: ${res.signedTxXdr.slice(0, 48)}…`
            : res.signedXdr
              ? `signedXdr: ${res.signedXdr.slice(0, 48)}…`
              : JSON.stringify(res)
      );
    } catch (e) {
      setInPageError(e instanceof Error ? e.message : String(e));
    } finally {
      setInPageLoading(false);
    }
  }

  const accountReadOnly = wallet.status === "connected" && !manualOverride;

  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Latch Sign Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Test external-sign API endpoints, connect wallet, and exercise sign flows.
        </p>
      </div>

      <ConnectWalletBar />

      <Section title="Section A — Account">
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={manualOverride}
              onChange={(e) => setManualOverride(e.target.checked)}
            />
            Manual override
          </label>
          {wallet.status === "connected" && !manualOverride && (
            <span className="text-muted-foreground">Connected account</span>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Smart account (C-address)</span>
          <input
            className="w-full border rounded px-3 py-2 text-sm font-mono disabled:opacity-60"
            value={smartAccountAddress}
            onChange={(e) => persistAccount(e.target.value)}
            readOnly={accountReadOnly}
            placeholder="C..."
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Network</span>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={network}
            onChange={(e) => setNetwork(e.target.value as Network)}
            disabled={accountReadOnly}
          >
            <option value="testnet">testnet</option>
            <option value="mainnet">mainnet</option>
          </select>
        </label>

        <div className="flex gap-3">
          <label className="block space-y-1 flex-1">
            <span className="text-sm font-medium">Signer type (prepare-sign)</span>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={signerType}
              onChange={(e) =>
                setSignerType(e.target.value as typeof signerType)
              }
            >
              <option value="">default</option>
              <option value="passkey">passkey</option>
              <option value="phantom">phantom</option>
              <option value="freighter">freighter</option>
            </select>
          </label>
          {signerType === "freighter" && (
            <label className="block space-y-1 flex-1">
              <span className="text-sm font-medium">Signer G-address</span>
              <input
                className="w-full border rounded px-3 py-2 text-sm font-mono"
                value={signerG}
                onChange={(e) => setSignerG(e.target.value)}
                placeholder="G..."
              />
            </label>
          )}
        </div>
      </Section>

      <Section title="Section B — Build demo transaction">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Demo action</span>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={demoAction}
            onChange={(e) => setDemoAction(e.target.value as DemoAction)}
          >
            <option value="noop">noop (self-transfer smoke test)</option>
            <option value="transfer">transfer</option>
          </select>
        </label>

        {demoAction === "transfer" && (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Recipient</span>
              <input
                className="w-full border rounded px-3 py-2 text-sm font-mono"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="G... or C..."
              />
            </label>
            <div className="flex gap-3">
              <label className="block space-y-1 flex-1">
                <span className="text-sm font-medium">Amount</span>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="block space-y-1 w-28">
                <span className="text-sm font-medium">Asset</span>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                >
                  <option value="native">XLM</option>
                  <option value="USDC">USDC</option>
                </select>
              </label>
            </div>
          </>
        )}

        <button
          type="button"
          disabled={buildLoading || !resolveSmartAccountAddress()}
          onClick={() => void handleBuild()}
          className="rounded bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {buildLoading ? "Building…" : "Build demo tx"}
        </button>

        {buildDescription && (
          <p className="text-sm text-muted-foreground">{buildDescription}</p>
        )}
        {unsignedTxXdr && <TruncatedXdr xdr={unsignedTxXdr} label="Unsigned tx XDR" />}
        {buildError && (
          <SignDemoApiResult title="Build" error={buildError} />
        )}
      </Section>

      <Section title="Section C — API test (no wallet)">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={prepareLoading || !unsignedTxXdr}
            onClick={() => void handlePrepareSign()}
            className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {prepareLoading ? "Testing…" : "Test prepare-sign"}
          </button>
          <button
            type="button"
            disabled={payloadLoading || !unsignedTxXdr}
            onClick={() => void handleSignPayloadTest()}
            className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {payloadLoading ? "Testing…" : "Test sign-payload POST + GET"}
          </button>
        </div>

        <SignDemoApiResult
          title="prepare-sign"
          result={prepareResult}
          error={prepareError}
        />

        {payloadResult && (
          <div className="rounded border bg-muted/30 p-3 space-y-1 text-sm">
            <p className="font-medium">sign-payload round-trip — success</p>
            <p>
              payloadRef: <span className="font-mono">{payloadResult.payloadRef}</span>
            </p>
            <p>
              expiresAt: <span className="font-mono">{payloadResult.expiresAt}</span>
            </p>
            <p className={payloadResult.match ? "text-green-700" : "text-destructive"}>
              XDR match: {payloadResult.match ? "yes" : "no"}
            </p>
          </div>
        )}
        {payloadError && (
          <SignDemoApiResult title="sign-payload" error={payloadError} />
        )}
      </Section>

      <Section title="Section D — Wallet redirect (via window.latch)">
        <p className="text-sm text-muted-foreground">
          Uses <code className="text-xs">window.latch.openSignRequest()</code> so the extension
          opens the sign tab internally (web pages cannot navigate to{" "}
          <code className="text-xs">chrome-extension://</code> URLs).
        </p>
        {wallet.status !== "connected" && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Connect wallet above before using redirect sign.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!unsignedTxXdr || wallet.status !== "connected"}
            onClick={redirectInlineXdr}
            className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Sign with Latch (inline XDR)
          </button>
          <button
            type="button"
            disabled={!unsignedTxXdr || wallet.status !== "connected"}
            onClick={() => void redirectPayloadRef()}
            className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Sign with Latch (payload ref)
          </button>
        </div>
        {redirectStatus && (
          <p className="text-sm text-muted-foreground">{redirectStatus}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Callback: <code className="font-mono">{cbUrl}</code>
        </p>
        <p className="text-xs text-muted-foreground">
          Test callback UI:{" "}
          <a
            href="/dev/sign-demo/callback?requestId=test&status=signed&txHash=abc&network=testnet"
            className="underline"
          >
            signed stub
          </a>
          {" · "}
          <a
            href="/dev/sign-demo/callback?requestId=test&status=rejected"
            className="underline"
          >
            rejected stub
          </a>
          {" · "}
          <a
            href="/dev/sign-demo/callback?requestId=test&status=error&code=test_error&message=Demo+error"
            className="underline"
          >
            error stub
          </a>
        </p>
      </Section>

      <Section title="Section E — In-page sign (connected wallet)">
        <button
          type="button"
          disabled={
            inPageLoading ||
            wallet.status !== "connected" ||
            !unsignedTxXdr ||
            !wallet.publicKey
          }
          onClick={() => void handleInPageSign()}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {inPageLoading ? "Signing…" : "Sign transaction in-page"}
        </button>
        {wallet.status !== "connected" && (
          <p className="text-sm text-muted-foreground">
            Connect wallet above to enable in-page signing.
          </p>
        )}
        {inPageResult && <TruncatedXdr xdr={inPageResult} label="Signed XDR" />}
        {inPageError && (
          <p className="text-sm text-destructive">{inPageError}</p>
        )}
      </Section>
    </main>
  );
}

export default function SignDemoPage() {
  return (
    <LatchWalletProvider>
      <SignDemoPageContent />
    </LatchWalletProvider>
  );
}
