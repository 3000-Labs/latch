#![cfg(test)]
use crate::{Ed25519SigData, Ed25519Verifier, Ed25519VerifierClient};
use soroban_sdk::{xdr::ToXdr, Bytes, BytesN, Env};

extern crate std;

/// Prefix that matches what Phantom wallet expects
const AUTH_PREFIX: &[u8] = b"Stellar Smart Account Auth:\n";

/// Convert bytes to lowercase hex string (off-chain helper for tests)
fn bytes_to_hex(bytes: &[u8]) -> std::vec::Vec<u8> {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";
    let mut result = std::vec::Vec::with_capacity(bytes.len() * 2);
    for byte in bytes {
        result.push(HEX_CHARS[(byte >> 4) as usize]);
        result.push(HEX_CHARS[(byte & 0x0f) as usize]);
    }
    result
}

#[test]
fn test_verify_valid_signature() {
    let env = Env::default();
    let contract_id = env.register(Ed25519Verifier, ());
    let client = Ed25519VerifierClient::new(&env, &contract_id);

    // Generate a keypair for testing
    let keypair = ed25519_dalek::SigningKey::generate(&mut rand::thread_rng());
    let public_key_bytes: [u8; 32] = keypair.verifying_key().to_bytes();

    // Create a test payload (32-byte hash from Soroban auth)
    let payload_data: [u8; 32] = [1u8; 32];
    let payload = Bytes::from_slice(&env, &payload_data);

    // Construct the message that Phantom actually signs (OFF-CHAIN in real app):
    // "Stellar Smart Account Auth:\n" + hex(payload)
    let hex_payload = bytes_to_hex(&payload_data);
    let mut prefixed_msg_vec = AUTH_PREFIX.to_vec();
    prefixed_msg_vec.extend_from_slice(&hex_payload);

    // Sign the prefixed message (this is what Phantom does)
    use ed25519_dalek::Signer;
    let signature = keypair.sign(&prefixed_msg_vec);
    let signature_bytes: [u8; 64] = signature.to_bytes();

    // Convert to Soroban types
    let public_key = Bytes::from_slice(&env, &public_key_bytes);
    let prefixed_msg = Bytes::from_slice(&env, &prefixed_msg_vec);
    let sig = BytesN::from_array(&env, &signature_bytes);

    // Create Ed25519SigData struct and encode to XDR bytes
    let sig_data = Ed25519SigData {
        prefixed_message: prefixed_msg,
        signature: sig,
    };
    let sig_data_bytes = sig_data.to_xdr(&env);

    // Verify should return true
    let result = client.verify(&payload, &public_key, &sig_data_bytes);
    assert!(result);
}

#[test]
#[should_panic(expected = "prefixed_message has wrong length")]
fn test_verify_invalid_prefix() {
    let env = Env::default();
    let contract_id = env.register(Ed25519Verifier, ());
    let client = Ed25519VerifierClient::new(&env, &contract_id);

    let keypair = ed25519_dalek::SigningKey::generate(&mut rand::thread_rng());
    let public_key_bytes: [u8; 32] = keypair.verifying_key().to_bytes();

    let payload_data: [u8; 32] = [1u8; 32];
    let payload = Bytes::from_slice(&env, &payload_data);

    // Create message with WRONG prefix
    let hex_payload = bytes_to_hex(&payload_data);
    let mut wrong_prefixed_msg = b"Wrong Prefix:\n".to_vec();
    wrong_prefixed_msg.extend_from_slice(&hex_payload);

    use ed25519_dalek::Signer;
    let signature = keypair.sign(&wrong_prefixed_msg);
    let signature_bytes: [u8; 64] = signature.to_bytes();

    let public_key = Bytes::from_slice(&env, &public_key_bytes);
    let prefixed_msg = Bytes::from_slice(&env, &wrong_prefixed_msg);
    let sig = BytesN::from_array(&env, &signature_bytes);

    let sig_data = Ed25519SigData {
        prefixed_message: prefixed_msg,
        signature: sig,
    };
    let sig_data_bytes = sig_data.to_xdr(&env);

    // Should panic - wrong prefix
    client.verify(&payload, &public_key, &sig_data_bytes);
}

#[test]
#[should_panic(expected = "prefixed_message hex does not match payload")]
fn test_verify_wrong_payload() {
    let env = Env::default();
    let contract_id = env.register(Ed25519Verifier, ());
    let client = Ed25519VerifierClient::new(&env, &contract_id);

    let keypair = ed25519_dalek::SigningKey::generate(&mut rand::thread_rng());
    let public_key_bytes: [u8; 32] = keypair.verifying_key().to_bytes();

    // Sign one payload
    let payload_data: [u8; 32] = [1u8; 32];
    let hex_payload = bytes_to_hex(&payload_data);
    let mut prefixed_msg_vec = AUTH_PREFIX.to_vec();
    prefixed_msg_vec.extend_from_slice(&hex_payload);

    use ed25519_dalek::Signer;
    let signature = keypair.sign(&prefixed_msg_vec);
    let signature_bytes: [u8; 64] = signature.to_bytes();

    // But verify with a DIFFERENT payload
    let wrong_payload_data: [u8; 32] = [2u8; 32];
    let wrong_payload = Bytes::from_slice(&env, &wrong_payload_data);

    let public_key = Bytes::from_slice(&env, &public_key_bytes);
    let prefixed_msg = Bytes::from_slice(&env, &prefixed_msg_vec);
    let sig = BytesN::from_array(&env, &signature_bytes);

    let sig_data = Ed25519SigData {
        prefixed_message: prefixed_msg,
        signature: sig,
    };
    let sig_data_bytes = sig_data.to_xdr(&env);

    // Should panic - payload mismatch
    client.verify(&wrong_payload, &public_key, &sig_data_bytes);
}

#[test]
#[should_panic]
fn test_verify_wrong_signature() {
    let env = Env::default();
    let contract_id = env.register(Ed25519Verifier, ());
    let client = Ed25519VerifierClient::new(&env, &contract_id);

    let keypair = ed25519_dalek::SigningKey::generate(&mut rand::thread_rng());
    let public_key_bytes: [u8; 32] = keypair.verifying_key().to_bytes();

    let payload_data: [u8; 32] = [3u8; 32];
    let payload = Bytes::from_slice(&env, &payload_data);

    // Create valid prefixed message
    let hex_payload = bytes_to_hex(&payload_data);
    let mut prefixed_msg_vec = AUTH_PREFIX.to_vec();
    prefixed_msg_vec.extend_from_slice(&hex_payload);

    // But use WRONG signature (all zeros)
    let wrong_signature_bytes: [u8; 64] = [0u8; 64];

    let public_key = Bytes::from_slice(&env, &public_key_bytes);
    let prefixed_msg = Bytes::from_slice(&env, &prefixed_msg_vec);
    let sig = BytesN::from_array(&env, &wrong_signature_bytes);

    let sig_data = Ed25519SigData {
        prefixed_message: prefixed_msg,
        signature: sig,
    };
    let sig_data_bytes = sig_data.to_xdr(&env);

    // Should panic - invalid signature
    client.verify(&payload, &public_key, &sig_data_bytes);
}
