import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as crypto from "crypto";
import * as StellarSdk from "@stellar/stellar-sdk";

const execAsync = promisify(exec);
const { StrKey } = StellarSdk;

// Contract addresses on testnet
const VERIFIER_ADDRESS = "CCHVR2WS5FRHVEG7BLMBS6BADCBK54ZEGP7CA5X3T6TJFPCQIDHDVZFV";
const COUNTER_ADDRESS = "CBRCNPTZ7YPP5BCGF42QSUWPYZQW6OJDPNQ4HDEYO7VI5Z6AVWWNEZ2U";
const SMART_ACCOUNT_WASM_HASH = "cf67f31cbff555b5a6c1fb3ab4411b9cdf34e96d4d2cf52dbec5d1f13fc6db40";

const DEPLOYER_KEY = "franky";
const NETWORK = "testnet";

// Simple in-memory cache to track deployed accounts
// In production, use a database
const deployedAccounts: Map<string, { smartAccountAddress: string; gAddress: string }> = new Map();

// Derive Stellar G-address from Ed25519 public key bytes
function deriveGAddressFromPubkey(pubkeyHex: string): string {
  try {
    const pubkeyBytes = Buffer.from(pubkeyHex, "hex");
    // Use StrKey to encode raw Ed25519 public key bytes into G-address format
    const gAddress = StrKey.encodeEd25519PublicKey(pubkeyBytes);
    return gAddress;
  } catch (err) {
    console.error("Error deriving G-address:", err);
    throw new Error(`Failed to derive G-address from pubkey: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Fund account via Friendbot (testnet only)
async function fundAccountIfNeeded(gAddress: string): Promise<void> {
  try {
    // Check if account exists using Horizon API (simpler than Soroban RPC for this)
    const horizonResponse = await fetch(
      `https://horizon-testnet.stellar.org/accounts/${gAddress}`
    );
    if (horizonResponse.ok) {
      console.log(`Account ${gAddress} already funded`);
      return;
    }
  } catch (err) {
    console.log(`Account check failed, will try to fund:`, err);
  }

  // Account doesn't exist, fund via Friendbot
  console.log(`Funding account ${gAddress} via Friendbot...`);
  const response = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(gAddress)}`
  );
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Friendbot error:`, errorText);
    throw new Error(`Failed to fund account: ${response.statusText}`);
  }
  console.log(`Account ${gAddress} funded successfully`);
}

export async function POST(request: NextRequest) {
  try {
    const { publicKeyHex } = await request.json();

    if (!publicKeyHex || typeof publicKeyHex !== "string" || publicKeyHex.length !== 64) {
      return NextResponse.json(
        { error: "Invalid public key. Expected 64-character hex string." },
        { status: 400 }
      );
    }

    // Derive the user's Stellar G-address from their Phantom pubkey
    const userGAddress = deriveGAddressFromPubkey(publicKeyHex);
    console.log(`Derived G-address: ${userGAddress}`);

    // Check if already deployed for this pubkey
    if (deployedAccounts.has(publicKeyHex)) {
      const cached = deployedAccounts.get(publicKeyHex)!;
      return NextResponse.json({
        smartAccountAddress: cached.smartAccountAddress,
        gAddress: cached.gAddress,
        alreadyDeployed: true,
      });
    }

    // Fund the user's G-address via Friendbot (testnet)
    await fundAccountIfNeeded(userGAddress);

    // Generate deterministic salt from pubkey
    const salt = crypto.createHash("sha256").update(publicKeyHex).digest("hex");

    console.log(`Deploying smart account for pubkey: ${publicKeyHex}`);
    console.log(`Using salt: ${salt}`);

    // Deploy smart account with deterministic address
    const deployCmd = `stellar contract deploy \
      --wasm-hash ${SMART_ACCOUNT_WASM_HASH} \
      --source ${DEPLOYER_KEY} \
      --network ${NETWORK} \
      --salt ${salt}`;

    let smartAccountAddress: string;

    try {
      const { stdout } = await execAsync(deployCmd, {
        env: { ...process.env, PATH: "/opt/homebrew/bin:/usr/local/bin:" + process.env.PATH },
      });
      smartAccountAddress = stdout.trim();
      console.log(`Deployed smart account: ${smartAccountAddress}`);
    } catch (deployError: unknown) {
      // If already deployed with this salt, get the address using stellar contract id
      const errorMessage = deployError instanceof Error ? deployError.message : String(deployError);
      if (errorMessage.includes("contract already exists")) {
        // Use stellar CLI to get the predicted address for this salt
        const idCmd = `stellar contract id wasm \
          --source-account ${DEPLOYER_KEY} \
          --network ${NETWORK} \
          --salt ${salt}`;

        try {
          const { stdout: idOutput } = await execAsync(idCmd, {
            env: { ...process.env, PATH: "/opt/homebrew/bin:/usr/local/bin:" + process.env.PATH },
          });
          smartAccountAddress = idOutput.trim();
          console.log(`Smart account already exists: ${smartAccountAddress}`);
        } catch {
          // Fallback: try to extract from error message
          const match = errorMessage.match(/C[A-Z2-7]{55}/);
          if (match) {
            smartAccountAddress = match[0];
          } else {
            throw deployError;
          }
        }
      } else {
        throw deployError;
      }
    }

    // Initialize the smart account with the Phantom pubkey
    const initCmd = `stellar contract invoke \
      --id ${smartAccountAddress} \
      --source ${DEPLOYER_KEY} \
      --network ${NETWORK} \
      -- initialize \
      --verifier ${VERIFIER_ADDRESS} \
      --public_key ${publicKeyHex} \
      --counter ${COUNTER_ADDRESS}`;

    try {
      await execAsync(initCmd, {
        env: { ...process.env, PATH: "/opt/homebrew/bin:/usr/local/bin:" + process.env.PATH },
      });
      console.log(`Initialized smart account with pubkey`);
    } catch (initError: unknown) {
      const errorMessage = initError instanceof Error ? initError.message : String(initError);
      // If already initialized, that's fine
      if (!errorMessage.includes("already") && !errorMessage.includes("initialized")) {
        console.error("Init error:", errorMessage);
        // Continue anyway - might already be initialized
      }
    }

    // Cache the deployment
    deployedAccounts.set(publicKeyHex, { smartAccountAddress, gAddress: userGAddress });

    return NextResponse.json({
      smartAccountAddress,
      gAddress: userGAddress,
      verifierAddress: VERIFIER_ADDRESS,
      counterAddress: COUNTER_ADDRESS,
      alreadyDeployed: false,
    });
  } catch (error) {
    console.error("Error deploying smart account:", error);
    // Return more detailed error info for debugging
    const errorMessage = error instanceof Error ? error.message : "Failed to deploy smart account";
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: errorMessage,
        details: errorStack,
        type: error?.constructor?.name
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    verifierAddress: VERIFIER_ADDRESS,
    counterAddress: COUNTER_ADDRESS,
    network: NETWORK,
  });
}
