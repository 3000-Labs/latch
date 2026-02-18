"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type DemoState =
  | "disconnected"
  | "connecting"
  | "deploying"
  | "ready"
  | "building"
  | "signing"
  | "submitting"
  | "success"
  | "error";

export default function DemoPage() {
  const [state, setState] = useState<DemoState>("disconnected");
  const [phantomPubkey, setPhantomPubkey] = useState<string | null>(null);
  const [phantomPubkeyHex, setPhantomPubkeyHex] = useState<string | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
  const [gAddress, setGAddress] = useState<string | null>(null);  // User's Stellar G-address
  const [error, setError] = useState<string | null>(null);
  const [counterValue, setCounterValue] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isPhantomAvailable, setIsPhantomAvailable] = useState(false);

  // Check if Phantom is available (only on client)
  useEffect(() => {
    const checkPhantom = () => {
      const available = !!(window as unknown as { solana?: { isPhantom?: boolean } }).solana?.isPhantom;
      setIsPhantomAvailable(available);
    };
    checkPhantom();
  }, []);

  // Connect to Phantom and deploy smart account
  const connectAndDeploy = useCallback(async () => {
    setState("connecting");
    setError(null);

    try {
      const solana = (window as unknown as { solana?: {
        isPhantom?: boolean;
        connect: () => Promise<{ publicKey: { toString: () => string; toBytes: () => Uint8Array } }>;
      } }).solana;

      if (!solana?.isPhantom) {
        throw new Error("Phantom wallet not found. Install it from phantom.app");
      }

      const response = await solana.connect();
      const pubkey = response.publicKey;
      const pubkeyHex = Buffer.from(pubkey.toBytes()).toString("hex");

      setPhantomPubkey(pubkey.toString());
      setPhantomPubkeyHex(pubkeyHex);

      console.log("Phantom connected:", pubkey.toString());
      console.log("Pubkey hex:", pubkeyHex);

      // Deploy/get smart account for this user
      setState("deploying");

      const deployResponse = await fetch("/api/smart-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKeyHex: pubkeyHex }),
      });

      if (!deployResponse.ok) {
        const errorData = await deployResponse.json();
        console.error("Deploy error details:", errorData);
        throw new Error(errorData.error || "Failed to deploy smart account");
      }

      const { smartAccountAddress: addr, gAddress: userGAddress, alreadyDeployed } = await deployResponse.json();
      setSmartAccountAddress(addr);
      setGAddress(userGAddress);

      console.log(
        alreadyDeployed
          ? `Smart account already exists: ${addr}`
          : `Deployed new smart account: ${addr}`
      );
      console.log(`User G-address: ${userGAddress}`);

      setState("ready");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, []);

  // Execute transaction via smart account
  const runDemo = useCallback(async () => {
    if (!phantomPubkeyHex || !smartAccountAddress || !gAddress) {
      setError("Connect Phantom first");
      return;
    }

    setState("building");
    setError(null);

    try {
      // Step 1: Build and simulate the transaction via API
      console.log("Building transaction...");
      const buildResponse = await fetch("/api/transaction/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smartAccountAddress, gAddress }),
      });

      if (!buildResponse.ok) {
        const errorData = await buildResponse.json();
        throw new Error(errorData.error || "Failed to build transaction");
      }

      const { txXdr, authEntryXdr, simulationResultXdr, authPayloadHash, txHash: transactionHash, validUntilLedger } =
        await buildResponse.json();

      console.log("Auth payload hash:", authPayloadHash);
      console.log("Transaction hash:", transactionHash);
      console.log("Valid until ledger:", validUntilLedger);

      // Step 2: Sign BOTH hashes with Phantom
      setState("signing");
      console.log("Requesting Phantom signatures...");

      const solana = (window as unknown as {
        solana?: {
          signMessage: (
            message: Uint8Array,
            encoding: string
          ) => Promise<{ signature: Uint8Array; publicKey: { toBytes: () => Uint8Array } }>;
        };
      }).solana;

      if (!solana) {
        throw new Error("Phantom wallet not found");
      }

      // Helper to convert hex to bytes
      const hexToBytes = (hex: string) => new Uint8Array(
        hex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
      );

      // Sign the auth payload hash (for smart account authorization)
      console.log("Signing auth payload...");
      const authPayloadBytes = hexToBytes(authPayloadHash);
      const authSignResult = await solana.signMessage(authPayloadBytes, "utf8");
      const authSignatureHex = Buffer.from(authSignResult.signature).toString("hex");
      console.log("Auth signature received:", authSignatureHex);

      // Sign the transaction hash (for envelope signature)
      console.log("Signing transaction envelope...");
      const txHashBytes = hexToBytes(transactionHash);
      const envelopeSignResult = await solana.signMessage(txHashBytes, "utf8");
      const envelopeSignatureHex = Buffer.from(envelopeSignResult.signature).toString("hex");
      console.log("Envelope signature received:", envelopeSignatureHex);

      // Step 3: Submit the transaction via API
      setState("submitting");
      console.log("Submitting transaction...");

      const submitResponse = await fetch("/api/transaction/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txXdr,
          authEntryXdr,
          simulationResultXdr,
          authSignatureHex,
          envelopeSignatureHex,
          publicKeyHex: phantomPubkeyHex,
        }),
      });

      if (!submitResponse.ok) {
        const errorData = await submitResponse.json();
        throw new Error(errorData.error || "Failed to submit transaction");
      }

      const { hash } = await submitResponse.json();
      console.log("Transaction successful:", hash);

      // Success!
      setState("success");
      setTxHash(hash);

      // Fetch updated counter value
      const counterResponse = await fetch("/api/counter");
      if (counterResponse.ok) {
        const { value } = await counterResponse.json();
        setCounterValue(value);
      }

    } catch (err) {
      console.error("Transaction error:", err);
      setState("error");
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  }, [phantomPubkeyHex, smartAccountAddress, gAddress]);

  const disconnect = useCallback(() => {
    setPhantomPubkey(null);
    setPhantomPubkeyHex(null);
    setSmartAccountAddress(null);
    setGAddress(null);
    setState("disconnected");
    setError(null);
    setCounterValue(null);
    setTxHash(null);
  }, []);

  const getStatusText = () => {
    switch (state) {
      case "disconnected": return "Not connected";
      case "connecting": return "Connecting to Phantom...";
      case "deploying": return "Deploying your Smart Account...";
      case "ready": return "Smart Account ready";
      case "building": return "Building transaction...";
      case "signing": return "Sign with Phantom to authorize...";
      case "submitting": return "Executing on Stellar...";
      case "success": return "Transaction successful!";
      case "error": return "Error";
      default: return "";
    }
  };

  return (
    <div className="min-h-svh bg-background">
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          &larr; Back to Home
        </Link>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground mb-4">
            SMART ACCOUNT DEMO
          </div>
          <h1 className="text-4xl font-mono font-bold tracking-tighter mb-4">
            Phantom → Smart Account
          </h1>
          <p className="text-muted-foreground">
            Control a Soroban Smart Account using your Phantom wallet.
            <br />
            <span className="text-xs">Ed25519 signatures verified on-chain.</span>
          </p>
        </div>

        {/* Demo Card */}
        <div className="border rounded-lg p-8 bg-card">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div
              className={`w-2 h-2 rounded-full ${
                state === "ready" || state === "success"
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

          {/* Phantom Pubkey Display */}
          {phantomPubkey && (
            <div className="mb-4 p-4 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Phantom Public Key (Solana format)</p>
              <p className="font-mono text-sm break-all">{phantomPubkey}</p>
            </div>
          )}

          {/* G-Address Display */}
          {gAddress && (
            <div className="mb-4 p-4 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Your Stellar Account (G-address)</p>
              <a
                href={`https://stellar.expert/explorer/testnet/account/${gAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm break-all text-blue-600 hover:underline"
              >
                {gAddress}
              </a>
            </div>
          )}

          {/* Smart Account Display */}
          {smartAccountAddress && (
            <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Your Smart Account (C-address)</p>
              <a
                href={`https://stellar.expert/explorer/testnet/contract/${smartAccountAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm break-all text-primary hover:underline"
              >
                {smartAccountAddress}
              </a>
            </div>
          )}

          {/* Counter Display */}
          {counterValue !== null && (
            <div className="mb-4 p-4 bg-muted rounded-md text-center">
              <p className="text-xs text-muted-foreground mb-1">Counter (modified via Smart Account)</p>
              <p className="font-mono text-4xl font-bold">{counterValue}</p>
            </div>
          )}

          {/* Transaction Hash */}
          {txHash && !txHash.startsWith("placeholder") && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-md">
              <p className="text-xs text-muted-foreground mb-1">Transaction Hash</p>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs break-all text-green-600 hover:underline"
              >
                {txHash}
              </a>
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
                onClick={connectAndDeploy}
                size="lg"
                className="w-full font-mono"
                disabled={!isPhantomAvailable}
              >
                {isPhantomAvailable
                  ? "Connect Phantom & Create Smart Account"
                  : "Install Phantom Wallet"}
              </Button>
            )}

            {(state === "ready" || state === "success") && (
              <>
                <Button
                  onClick={runDemo}
                  size="lg"
                  className="w-full font-mono"
                >
                  Execute via Smart Account
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

            {(state === "connecting" || state === "deploying" || state === "building" || state === "signing" || state === "submitting") && (
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
              <span>Connect Phantom to get your Ed25519 public key</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">02</span>
              <span>A Smart Account (C-address) is deployed and configured to trust your key</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">03</span>
              <span>When you act, Phantom signs the authorization payload</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">04</span>
              <span>The on-chain Ed25519 verifier validates your signature</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-primary">05</span>
              <span>The Smart Account authorizes the action - you control Stellar with Phantom</span>
            </li>
          </ol>

          <p className="text-xs text-muted-foreground border-t pt-6">
            <strong>This is Smart Account adoption.</strong> Your Phantom wallet controls a Soroban C-address.
            The same pattern works for MetaMask, Passkeys, or any Ed25519/secp256k1 signer.
          </p>
        </div>
      </div>
    </div>
  );
}
