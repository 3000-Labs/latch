#![cfg(test)]
use crate::{Ed25519Verifier, Ed25519VerifierClient};
use soroban_sdk::{Bytes, BytesN, Env};

#[test]
fn test_verify_valid_signature() {
    let env = Env::default();
    let contract_id = env.register(Ed25519Verifier, ());
    let client = Ed25519VerifierClient::new(&env, &contract_id);

    // Generate a keypair for testing
    let keypair = ed25519_dalek::SigningKey::generate(&mut rand::thread_rng());
    let public_key_bytes: [u8; 32] = keypair.verifying_key().to_bytes();

    // Create a test payload
    let payload_data: [u8; 32] = [1u8; 32];
    let payload = Bytes::from_slice(&env, &payload_data);

    // Sign the payload
    use ed25519_dalek::Signer;
    let signature = keypair.sign(&payload_data);
    let signature_bytes: [u8; 64] = signature.to_bytes();

    let public_key: BytesN<32> = BytesN::from_array(&env, &public_key_bytes);
    let sig: BytesN<64> = BytesN::from_array(&env, &signature_bytes);

    // Verify should return true
    let result = client.verify(&payload, &public_key, &sig);
    assert!(result);
}

#[test]
#[should_panic]
fn test_verify_invalid_signature() {
    let env = Env::default();
    let contract_id = env.register(Ed25519Verifier, ());
    let client = Ed25519VerifierClient::new(&env, &contract_id);

    // Generate a keypair for testing
    let keypair = ed25519_dalek::SigningKey::generate(&mut rand::thread_rng());
    let public_key_bytes: [u8; 32] = keypair.verifying_key().to_bytes();

    // Create a test payload
    let payload_data: [u8; 32] = [1u8; 32];
    let payload = Bytes::from_slice(&env, &payload_data);

    // Create an invalid signature (all zeros)
    let signature_bytes: [u8; 64] = [0u8; 64];

    let public_key: BytesN<32> = BytesN::from_array(&env, &public_key_bytes);
    let sig: BytesN<64> = BytesN::from_array(&env, &signature_bytes);

    // This should panic because the signature is invalid
    client.verify(&payload, &public_key, &sig);
}
