import type {
  Network,
  OpenSignRequestParams,
  SignTransactionRequest,
  SignTransactionResponse,
} from "./types";

export class LatchWalletError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "LatchWalletError";
    this.code = code;
  }
}

interface LatchProvider {
  isConnected(): Promise<boolean>;
  getPublicKey(): Promise<string>;
  getNetwork(): Promise<Network>;
  signTransaction(request: SignTransactionRequest): Promise<SignTransactionResponse>;
  openSignRequest?(params: OpenSignRequestParams): Promise<void>;
}

export function isLatchInjected(): boolean {
  return typeof window !== "undefined" && typeof window.latch !== "undefined";
}

function requireLatch(): LatchProvider {
  const latch = window.latch;
  if (!latch) {
    throw new LatchWalletError(
      "Latch extension not detected. Install the extension, rebuild it with the latest provider-bridge fix, and reload this page.",
      "no_extension"
    );
  }
  return latch;
}

function wrapError(e: unknown): never {
  if (e instanceof LatchWalletError) throw e;
  const err = e as { message?: string; code?: string };
  const message = err?.message ?? String(e);
  if (
    message.includes("sendMessage() called from a webpage") ||
    message.includes("must specify an Extension ID")
  ) {
    throw new LatchWalletError(
      "Stale Latch extension provider detected. In chrome://extensions reload Latch Wallet, then hard-refresh this page (Cmd+Shift+R).",
      "outdated_extension"
    );
  }
  throw new LatchWalletError(message, err?.code);
}

export async function probeLatchExtension(): Promise<"installed" | "missing"> {
  if (!isLatchInjected()) return "missing";
  try {
    const ok = await requireLatch().isConnected();
    return ok ? "installed" : "missing";
  } catch {
    return "missing";
  }
}

/** Connect = request public key; opens wallet approval popup on first visit */
export async function connectLatchWallet(): Promise<{
  publicKey: string;
  network: Network;
}> {
  try {
    const latch = requireLatch();
    const publicKey = await latch.getPublicKey();
    const network = await latch.getNetwork();
    return { publicKey, network };
  } catch (e) {
    wrapError(e);
  }
}

export async function signWithLatch(
  request: SignTransactionRequest
): Promise<SignTransactionResponse> {
  try {
    return await requireLatch().signTransaction(request);
  } catch (e) {
    wrapError(e);
  }
}

/**
 * Open sign-request tab via extension (avoids chrome-extension:// redirect from web pages).
 */
export async function openSignRequestViaLatch(
  params: OpenSignRequestParams
): Promise<void> {
  try {
    const latch = requireLatch();
    if (typeof latch.openSignRequest !== "function") {
      throw new LatchWalletError(
        "Extension is outdated — rebuild latch-web-extension with openSignRequest support (see extension-integration/ in API repo).",
        "outdated_extension"
      );
    }
    await latch.openSignRequest(params);
  } catch (e) {
    wrapError(e);
  }
}
