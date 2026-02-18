#![no_std]
use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env};

/// The prefix that Phantom wallet prepends to the auth payload hash.
/// This is needed because Phantom blocks signing raw 32-byte hashes
/// (they look like Solana transaction hashes).
const AUTH_PREFIX: &[u8] = b"Stellar Smart Account Auth:\n";

#[contract]
pub struct Ed25519Verifier;

#[contractimpl]
impl Ed25519Verifier {
    /// Verifies an Ed25519 signature over a prefixed message.
    ///
    /// Phantom wallet signs: PREFIX + hex(payload)
    /// This function reconstructs that message and verifies the signature.
    ///
    /// # Arguments
    /// * `payload`    - The raw bytes (32-byte hash from Soroban auth)
    /// * `public_key` - 32-byte Ed25519 public key from Phantom
    /// * `signature`  - 64-byte Ed25519 signature from Phantom
    ///
    /// Returns true if valid. Panics if invalid (Soroban convention).
    pub fn verify(
        e: Env,
        payload: Bytes,
        public_key: BytesN<32>,
        signature: BytesN<64>,
    ) -> bool {
        // Convert payload bytes to lowercase hex string
        let hex_payload = bytes_to_hex(&e, &payload);

        // Construct the prefixed message that Phantom actually signed:
        // "Stellar Smart Account Auth:\n" + hex(payload)
        let mut prefixed_msg = Bytes::from_slice(&e, AUTH_PREFIX);
        prefixed_msg.append(&hex_payload);

        // Verify signature against the prefixed message
        e.crypto().ed25519_verify(&public_key, &prefixed_msg, &signature);
        true
    }

    /// Verify a raw signature (no prefix transformation).
    /// Use this for signers that can sign raw hashes.
    pub fn verify_raw(
        e: Env,
        payload: Bytes,
        public_key: BytesN<32>,
        signature: BytesN<64>,
    ) -> bool {
        e.crypto().ed25519_verify(&public_key, &payload, &signature);
        true
    }
}

/// Convert bytes to lowercase hex string as Bytes.
/// Each input byte becomes two hex characters (0-9, a-f).
fn bytes_to_hex(e: &Env, bytes: &Bytes) -> Bytes {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
    let mut result = Bytes::new(e);

    for i in 0..bytes.len() {
        let byte = bytes.get(i).unwrap();
        result.push_back(HEX_CHARS[(byte >> 4) as usize]);
        result.push_back(HEX_CHARS[(byte & 0x0f) as usize]);
    }

    result
}

#[cfg(test)]
mod test;
