import { Address, Keypair, xdr } from "@stellar/stellar-sdk";

/**
 * OpenZeppelin `Signer::Delegated` calls `addr.require_auth_for_args((auth_digest,).into_val(e))`.
 * That SorobanAuthorizationEntry is NOT returned by RPC simulation (see OZ "Signers and Verifiers").
 *
 * Build the unsigned entry so the client can `signBlob` on `hashSorobanAuthPayload` for this row (not Freighter `signAuthEntry`).
 * Root invocation must be
 * `__check_auth` on the **smart account** contract with the same 32-byte payload as
 * `hashSorobanAuthPayload(smartAccountAuthEntry, networkPassphrase)`.
 */
export function buildUnsignedDelegatedGCheckAuthEntry(params: {
  smartAccountAddress: string;
  signerG: string;
  /** 32 bytes: SHA-256 of HashIdPreimage envelopeTypeSorobanAuthorization for the smart-account row. */
  authPayloadHash: Buffer;
  signatureExpirationLedger: number;
}): xdr.SorobanAuthorizationEntry {
  if (params.authPayloadHash.length !== 32) {
    throw new Error("authPayloadHash must be 32 bytes");
  }
  const raw = Keypair.random().rawPublicKey();
  // Match stellar-base `authorizeInvocation` nonce style; keep in safe integer range.
  let nonce = 0;
  for (let i = 0; i < 6; i++) {
    nonce = (nonce << 8) | raw[i];
  }

  const invokeArgs = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(params.smartAccountAddress).toScAddress(),
    functionName: Buffer.from("__check_auth", "utf8"),
    args: [xdr.ScVal.scvBytes(params.authPayloadHash)],
  });

  const rootInvocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invokeArgs),
    subInvocations: [],
  });

  const addrCreds = new xdr.SorobanAddressCredentials({
    address: Address.fromString(params.signerG).toScAddress(),
    nonce: new xdr.Int64(nonce),
    signatureExpirationLedger: params.signatureExpirationLedger,
    signature: xdr.ScVal.scvVec([]),
  });

  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(addrCreds),
    rootInvocation,
  });
}
