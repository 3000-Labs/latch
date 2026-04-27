import * as crypto from "crypto";
import { decode as cborDecode } from "cbor-x";

export function getRpIdFromRequest(req: Request): string {
  // Prefer explicit env for local dev behind proxies.
  const env = process.env.WEBAUTHN_RP_ID;
  if (env && env.trim()) return env.trim();

  const host = req.headers.get("host") || "localhost";
  return host.split(":")[0];
}

export function getExpectedOriginFromRequest(req: Request): string {
  const env = process.env.WEBAUTHN_ORIGIN;
  if (env && env.trim()) return env.trim();

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost";
  return `${proto}://${host}`;
}

export function sha256Hex(str: string) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

export function stableUserIdBytes(userId: string): Uint8Array {
  // @simplewebauthn/server no longer accepts string userID.
  // Using UTF-8 bytes keeps a stable mapping while still allowing us to store userId as TEXT in SQLite.
  return new TextEncoder().encode(userId);
}

export function toBase64Url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function fromBase64Url(str: string) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Convert a COSE_Key (EC2 P-256) buffer to raw uncompressed 65-byte pubkey (0x04||x||y).
 * @simplewebauthn/server gives `credentialPublicKey` as COSE bytes.
 */
export function coseEc2ToRawP256Uncompressed(cosePublicKey: Buffer): Buffer {
  const decoded = cborDecode(new Uint8Array(cosePublicKey)) as Map<number, unknown> | Record<string, unknown>;

  const get = (k: number): unknown => {
    if (decoded instanceof Map) return decoded.get(k);
    // cbor-x may decode to plain object with string keys
    return (decoded as any)[String(k)];
  };

  const x = get(-2);
  const y = get(-3);

  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
    throw new Error("Unsupported COSE key format: missing -2/-3 coordinates");
  }
  if (x.byteLength !== 32 || y.byteLength !== 32) {
    throw new Error("Unsupported COSE key format: expected 32-byte x/y");
  }
  return Buffer.concat([Buffer.from([0x04]), Buffer.from(x), Buffer.from(y)]);
}

