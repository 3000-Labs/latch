import { NextRequest, NextResponse } from "next/server";
import {
  Networks,
  rpc,
} from "@stellar/stellar-sdk";
import {
  buildWebauthnAccountInitParams,
  deployWebauthnSmartAccount,
  deriveWebauthnSalt,
  getFactoryConfigFromEnv,
  isSorobanContractDeployed,
  predictWebauthnSmartAccountAddress,
} from "@/lib/smart-account-factory-webauthn";

/**
 * WebAuthn smart account factory route.
 *
 * Deploys a smart account via the factory with a WebAuthn (P-256) signer.
 * keyData = 65-byte uncompressed P-256 pubkey || credentialId bytes.
 *
 * GET  ?credentialId=<base64url> — look up whether account is deployed
 * POST { keyDataHex, credentialId } — deploy via factory
 */

// In-memory cache keyed by credentialId (base64url)
const cache: Map<string, string> = new Map();

// ─── GET: look up existing account ───────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get("credentialId");
    const keyDataHex = searchParams.get("keyDataHex");

    if (!credentialId || !keyDataHex) {
      return NextResponse.json(
        { error: "Missing credentialId or keyDataHex query params." },
        { status: 400 }
      );
    }

    if (cache.has(credentialId)) {
      return NextResponse.json({ deployed: true, smartAccountAddress: cache.get(credentialId) });
    }

    const config = getFactoryConfigFromEnv();

    const server = new rpc.Server(config.rpcUrl);
    const salt = deriveWebauthnSalt(keyDataHex);
    const paramsMap = buildWebauthnAccountInitParams(keyDataHex, salt);
    const predictedAddress = await predictWebauthnSmartAccountAddress({
      server,
      networkPassphrase: config.networkPassphrase,
      factoryAddress: config.factoryAddress,
      params: paramsMap,
    });
    const deployed = await isSorobanContractDeployed(server, predictedAddress);

    if (deployed) cache.set(credentialId, predictedAddress);

    return NextResponse.json({ deployed, smartAccountAddress: predictedAddress });
  } catch (error) {
    console.error("WebAuthn account lookup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lookup failed" },
      { status: 500 }
    );
  }
}

// ─── POST: deploy via factory ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const config = getFactoryConfigFromEnv();
    if (!config.bundlerSecret) {
      return NextResponse.json({ error: "BUNDLER_SECRET not set." }, { status: 500 });
    }

    const { keyDataHex, credentialId } = await request.json();

    if (!keyDataHex || typeof keyDataHex !== "string" || keyDataHex.length < 132) {
      // 65 bytes = 130 hex chars minimum (pubkey only); must be > 65 bytes so > 132 hex chars
      return NextResponse.json(
        { error: "keyDataHex must be at least 132 hex chars (65-byte pubkey + credentialId)." },
        { status: 400 }
      );
    }
    if (!credentialId || typeof credentialId !== "string") {
      return NextResponse.json({ error: "credentialId is required." }, { status: 400 });
    }

    if (cache.has(credentialId)) {
      return NextResponse.json({
        smartAccountAddress: cache.get(credentialId),
        alreadyDeployed: true,
      });
    }

    const server = new rpc.Server(config.rpcUrl);
    const salt = deriveWebauthnSalt(keyDataHex);
    const paramsMap = buildWebauthnAccountInitParams(keyDataHex, salt);

    const predictedAddress = await predictWebauthnSmartAccountAddress({
      server,
      networkPassphrase: config.networkPassphrase,
      factoryAddress: config.factoryAddress,
      params: paramsMap,
    });

    const { smartAccountAddress, alreadyDeployed } = await deployWebauthnSmartAccount({
      server,
      networkPassphrase: config.networkPassphrase,
      factoryAddress: config.factoryAddress,
      bundlerSecret: config.bundlerSecret,
      params: paramsMap,
      predictedAddress,
    });

    cache.set(credentialId, smartAccountAddress);

    return NextResponse.json({
      smartAccountAddress,
      alreadyDeployed,
    });
  } catch (error) {
    console.error("WebAuthn account deploy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deployment failed" },
      { status: 500 }
    );
  }
}
