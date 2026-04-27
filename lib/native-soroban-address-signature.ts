import { Address, Keypair, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { hashSorobanAuthPayload } from "@/lib/soroban-auth-payload";

/**
 * Host-native Stellar account authorization on a SorobanAuthorizationEntry (see stellar-base `authorizeEntry`).
 * Mutates `entry` in place (caller should pass a clone).
 */
export function applyNativeEd25519ToAddressCredentials(
  entry: xdr.SorobanAuthorizationEntry,
  signatureBase64: string,
  networkPassphrase: string
): void {
  const creds = entry.credentials();
  if (creds.switch().name !== "sorobanCredentialsAddress") {
    throw new Error("Expected sorobanCredentialsAddress on auth entry");
  }
  const addrCreds = creds.address();
  const gAddress = Address.fromScAddress(addrCreds.address()).toString();
  if (!gAddress.startsWith("G")) {
    throw new Error("Native Soroban address credentials expected a classic G address");
  }

  const sigBytes = Buffer.from(signatureBase64, "base64");
  if (sigBytes.length !== 64) {
    throw new Error(`Native Soroban auth signature must be 64 bytes (got ${sigBytes.length})`);
  }

  const payloadHash = hashSorobanAuthPayload(entry, networkPassphrase);
  if (!Keypair.fromPublicKey(gAddress).verify(payloadHash, sigBytes)) {
    throw new Error("nativeEd25519SignatureBase64 does not verify for this auth entry Soroban payload hash");
  }

  const pkBytes = StrKey.decodeEd25519PublicKey(gAddress);
  const sigScVal = nativeToScVal(
    {
      public_key: pkBytes,
      signature: sigBytes,
    },
    {
      type: {
        public_key: ["symbol", null],
        signature: ["symbol", null],
      },
    }
  );

  addrCreds.signature(xdr.ScVal.scvVec([sigScVal]));
}
