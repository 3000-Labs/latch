#![no_std]
use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env};

#[contract]
pub struct Ed25519Verifier;

#[contractimpl]
impl Ed25519Verifier {
    /// Verifies an Ed25519 signature.
    ///
    /// # Arguments
    /// * `payload`    - The raw bytes that were signed (typically a 32-byte hash)
    /// * `public_key` - 32-byte Ed25519 public key
    /// * `signature`  - 64-byte Ed25519 signature
    ///
    /// Returns true if valid. Panics if invalid (Soroban convention).
    pub fn verify(
        e: Env,
        payload: Bytes,
        public_key: BytesN<32>,
        signature: BytesN<64>,
    ) -> bool {
        e.crypto().ed25519_verify(&public_key, &payload, &signature);
        true
    }
}

#[cfg(test)]
mod test;
