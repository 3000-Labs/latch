"use client";

import { useState, useCallback, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Contract,
  TransactionBuilder,
  Networks as StellarNetworks,
  rpc,
  Address,
} from "@stellar/stellar-sdk";
import {
  StellarWalletsKit,
  Networks,
} from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { AlbedoModule } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

type DemoState =
  | "disconnected"
  | "connecting"
  | "ready"
  | "building"
  | "signing"
  | "submitting"
  | "success"
  | "error";

export default function StellarDemoPage() {
  const [state, setState] = useState<DemoState>("disconnected");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterValue, setCounterValue] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isFunding, setIsFunding] = useState(false);

  useEffect(() => {
    // Initialize the kit once
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      modules: [
        new FreighterModule(),
        new LobstrModule(),
        new AlbedoModule(),
        new xBullModule(),
      ],
    });
  }, []);

  const connect = useCallback(async () => {
    setState("connecting");
    setError(null);
    try {
      const { address } = await StellarWalletsKit.authModal();
      setPublicKey(address);
      setState("ready");

      // Fetch initial counter value
      fetch("/api/counter")
        .then((res) => res.json())
        .then((data) => setCounterValue(data.value))
        .catch(console.error);

    } catch (err: any) {
      setError(err.message || "Failed to connect");
      setState("error");
    }
  }, []);

  const disconnect = useCallback(async () => {
    await StellarWalletsKit.disconnect();
    setPublicKey(null);
    setState("disconnected");
    setError(null);
    setCounterValue(null);
    setTxHash(null);
  }, []);

  const fundAccount = useCallback(async () => {
    if (!publicKey) return;
    setIsFunding(true);
    setError(null);
    try {
      const response = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
      if (!response.ok) {
        throw new Error("Friendbot funding failed");
      }
      // Wait a bit for the account to be created on ledger
      await new Promise(r => setTimeout(r, 2000));
      setState("ready");
      setError(null);
      console.log("Account funded!");
    } catch (err: any) {
      setError("Failed to fund account. Please try manually at friendbot.stellar.org");
    } finally {
      setIsFunding(false);
    }
  }, [publicKey]);

  const runDemo = useCallback(async () => {
    if (!publicKey) {
      setError("Connect wallet first");
      return;
    }

    setState("building");
    setError(null);

    const rpcUrl = "https://soroban-testnet.stellar.org";
    const server = new rpc.Server(rpcUrl);
    const COUNTER_ADDRESS = "CBRCNPTZ7YPP5BCGF42QSUWPYZQW6OJDPNQ4HDEYO7VI5Z6AVWWNEZ2U";

    try {
      console.log("Fetching account...");
      const account = await server.getAccount(publicKey);
      const contract = new Contract(COUNTER_ADDRESS);

      console.log("Building base transaction...");
      const tx = new TransactionBuilder(account, {
        fee: "10000", // Increased base fee for Soroban
        networkPassphrase: StellarNetworks.TESTNET,
      })
        .addOperation(contract.call("increment", new Address(publicKey).toScVal()))
        .setTimeout(300)
        .build();

      console.log("Simulating and preparing transaction...");
      const preparedTx = await server.prepareTransaction(tx);

      setState("signing");
      console.log("Requesting signature...");

      const { signedTxXdr } = await StellarWalletsKit.signTransaction(preparedTx.toXDR(), {
        networkPassphrase: StellarNetworks.TESTNET,
      });

      setState("submitting");
      console.log("Submitting transaction...");
      const txToSubmit = TransactionBuilder.fromXDR(signedTxXdr, StellarNetworks.TESTNET);
      const submitResult = await server.sendTransaction(txToSubmit);

      if (submitResult.status === "ERROR") {
        console.error("Submission error:", submitResult);
        const errorDetail = submitResult.errorResult
          ? ` (Result XDR: ${submitResult.errorResult})`
          : "";
        throw new Error(`Transaction submission failed: ${submitResult.status}${errorDetail}`);
      }

      console.log("Awaiting final confirmation...", submitResult.hash);

      let statusInfo;
      let attempts = 0;
      while (attempts < 30) { // Increased polling attempts
        statusInfo = await server.getTransaction(submitResult.hash);
        if (statusInfo.status === "SUCCESS") {
          break;
        }
        if (statusInfo.status === "FAILED") {
          console.error("Transaction failed during execution:", statusInfo);
          throw new Error(`Transaction failed during execution. Check Stellar Expert for hash: ${submitResult.hash}`);
        }
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
      }

      if (statusInfo?.status === "SUCCESS") {
        setTxHash(submitResult.hash);
        setState("success");

        // Fetch updated counter value
        const counterResponse = await fetch("/api/counter");
        if (counterResponse.ok) {
          const { value } = await counterResponse.json();
          setCounterValue(value);
        }
      } else {
        throw new Error(`Transaction failed: ${statusInfo?.status}`);
      }

    } catch (err: any) {
      console.error("Transaction error:", err);
      setState("error");
      if (err.message?.includes("Account not found") || err.message?.includes("404")) {
        setError(`Account not found on Testnet. You need to fund it first.`);
      } else {
        setError(err instanceof Error ? err.message : "Transaction failed");
      }
    }
  }, [publicKey]);

  const getStatusText = () => {
    switch (state) {
      case "disconnected": return "Not connected";
      case "connecting": return "Connecting to Wallet...";
      case "ready": return "Wallet ready";
      case "building": return "Building transaction...";
      case "signing": return "Sign with your wallet to authorize...";
      case "submitting": return "Executing on Stellar...";
      case "success": return "Transaction successful!";
      case "error": return "Error";
      default: return "";
    }
  };

  const COUNTER_ADDRESS = "CBRCNPTZ7YPP5BCGF42QSUWPYZQW6OJDPNQ4HDEYO7VI5Z6AVWWNEZ2U";

  return (
    <div className="min-h-svh bg-background">
      <div className="max-w-2xl mx-auto px-4 py-16">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center rounded-full border border-primary/30 px-3 py-1 text-xs font-mono text-primary mb-4 bg-primary/5">
            LIVE ON TESTNET
          </div>
          <h1 className="text-4xl font-mono font-bold tracking-tighter mb-4">
            Stellar Wallet Connectivity
          </h1>
          <p className="text-muted-foreground">
            Connect and sign standard Soroban Smart Contract transactions
            <br />
            <span className="text-xs">Supports Freighter, Lobstr, Albedo using Stellar Wallets Kit.</span>
          </p>
        </div>

        {/* Demo Card */}
        <div className="border rounded-lg p-8 bg-card">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div
              className={`w-2 h-2 rounded-full ${state === "ready" || state === "success"
                ? "bg-green-500"
                : state === "error"
                  ? "bg-red-500"
                  : state === "disconnected"
                    ? "bg-gray-400"
                    : "bg-yellow-500 animate-pulse"
                }`}
            />
            <span className="text-sm text-muted-foreground font-mono">
              {getStatusText()}
            </span>
          </div>

          {/* Public Key Display */}
          {publicKey && (
            <div className="mb-4 p-4 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Your Stellar Account (G-address)</p>
              <a
                href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm break-all text-blue-600 hover:underline"
              >
                {publicKey}
              </a>
            </div>
          )}

          {/* On-Chain Contracts Info */}
          {publicKey && (
            <div className="mb-4 p-4 bg-muted/50 rounded-md space-y-2">
              <p className="text-xs text-muted-foreground font-semibold mb-2">On-Chain Contracts (verify on Stellar Expert)</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Counter Contract</span>
                <a
                  href={`https://stellar.expert/explorer/testnet/contract/${COUNTER_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline"
                >
                  {COUNTER_ADDRESS.slice(0, 8)}...{COUNTER_ADDRESS.slice(-6)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Success Result */}
          {state === "success" && txHash && (
            <div className="mb-4 p-5 bg-green-500/10 border border-green-500/20 rounded-md space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">✅</span>
                <span className="text-sm font-semibold text-green-700">Transaction Confirmed On-Chain</span>
              </div>

              {counterValue !== null && (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground mb-1">Counter Value</p>
                  <p className="font-mono text-5xl font-bold text-foreground">{counterValue}</p>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-green-500/20">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Transaction Hash</p>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs break-all text-green-700 hover:underline"
                  >
                    {txHash}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Counter Display (non-success states) */}
          {counterValue !== null && state !== "success" && (
            <div className="mb-4 p-4 bg-muted rounded-md text-center">
              <p className="text-xs text-muted-foreground mb-1">Counter Value</p>
              <p className="font-mono text-4xl font-bold">{counterValue}</p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {state === "disconnected" && (
              <Button
                onClick={connect}
                size="lg"
                className="w-full font-mono"
              >
                Connect Wallet (Freighter, Lobstr, etc.)
              </Button>
            )}

            {(state === "ready" || state === "success") && (
              <>
                <Button
                  onClick={runDemo}
                  size="lg"
                  className="w-full font-mono bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {state === "success" ? "🔄 Increment Counter Again" : "⚡ Sign & Increment Counter"}
                </Button>
                <Button
                  onClick={disconnect}
                  variant="outline"
                  size="lg"
                  className="w-full font-mono"
                >
                  Disconnect
                </Button>
              </>
            )}

            {publicKey && (state === "disconnected" || state === "error" || error?.includes("Account not found")) && (
              <Button
                onClick={fundAccount}
                variant="rounded"
                size="lg"
                className="w-full font-mono"
                disabled={isFunding}
              >
                {isFunding ? "Funding..." : "🎁 Fund Wallet (Testnet XLM)"}
              </Button>
            )}

            {state === "error" && (
              <Button
                onClick={disconnect}
                variant="outline"
                size="lg"
                className="w-full font-mono"
              >
                Try Again
              </Button>
            )}

            {(state === "connecting" || state === "building" || state === "signing" || state === "submitting") && (
              <Button
                size="lg"
                className="w-full font-mono"
                disabled
              >
                {getStatusText()}
              </Button>
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="mt-12 space-y-6">
          <h2 className="text-xl font-mono font-bold">How it works</h2>
          <ol className="space-y-4 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-primary">01</span>
              <span>Connect any Stellar wallet using the Stellar Wallets Kit</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">02</span>
              <span>Build the Soroban contract call directly in JS</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">03</span>
              <span>Sign seamlessly with Freighter, Lobstr, or others</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">04</span>
              <span>Transaction executed fully on-chain!</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
