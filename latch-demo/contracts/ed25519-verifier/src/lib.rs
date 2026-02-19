#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, xdr::FromXdr, Bytes, BytesN, Env};
use stellar_accounts::verifiers::Verifier;

/// The prefix that Phantom wallet prepends to the auth payload hash.
const AUTH_PREFIX: &[u8] = b"Stellar Smart Account Auth:\n";
const PREFIX_LEN: usize = 28; // "Stellar Smart Account Auth:\n" = 28 bytes
const PAYLOAD_LEN: usize = 32;
const HEX_LEN: usize = 64;
const TOTAL_LEN: usize = PREFIX_LEN + HEX_LEN; // 92 bytes

#[contract]
pub struct Ed25519Verifier;

/// Signature data containing both the prefixed message and signature.
#[contracttype]
pub struct Ed25519SigData {
    pub prefixed_message: Bytes,
    pub signature: BytesN<64>,
}

#[contractimpl]
impl Verifier for Ed25519Verifier {
    type KeyData = Bytes;
    type SigData = Bytes;

    /// Verifies an Ed25519 signature over a prefixed message.
    ///
    /// Optimized version using direct array indexing (g2c pattern).
    fn verify(
        e: &Env,
        signature_payload: Bytes,
        key_data: Self::KeyData,
        sig_data: Self::SigData,
    ) -> bool {
        // Decode sig_data from XDR
        let sig_struct: Ed25519SigData =
            Ed25519SigData::from_xdr(e, &sig_data).expect("sig_data must be valid Ed25519SigData");

        // Extract public key to BytesN (already validated by stellar_accounts)
        if key_data.len() != 32 {
            panic!("key_data must be 32 bytes");
        }
        let public_key: BytesN<32> = key_data
            .try_into()
            .unwrap_or_else(|_| panic!("failed to convert key_data"));

        // Validate prefixed_message length
        if sig_struct.prefixed_message.len() != TOTAL_LEN as u32 {
            panic!("prefixed_message has wrong length");
        }

        // Convert to fixed-size buffer for fast validation (g2c pattern)
        let prefixed_msg_buf = sig_struct.prefixed_message.to_buffer::<TOTAL_LEN>();
        let prefixed_msg_slice = prefixed_msg_buf.as_slice();

        // Validate prefix using direct slice comparison
        if &prefixed_msg_slice[0..PREFIX_LEN] != AUTH_PREFIX {
            panic!("prefixed_message missing required prefix");
        }

        // Convert signature_payload to array for fast hex encoding
        if signature_payload.len() != PAYLOAD_LEN as u32 {
            panic!("signature_payload must be 32 bytes");
        }
        let payload_array = signature_payload.to_buffer::<PAYLOAD_LEN>();

        // Generate expected hex using direct array indexing (g2c pattern)
        let mut expected_hex = [0u8; HEX_LEN];
        hex_encode(&mut expected_hex, payload_array.as_slice());

        // Validate hex portion using direct slice comparison
        if &prefixed_msg_slice[PREFIX_LEN..TOTAL_LEN] != &expected_hex[..] {
            panic!("prefixed_message hex does not match payload");
        }

        // All validation passed - verify signature
        e.crypto()
            .ed25519_verify(&public_key, &sig_struct.prefixed_message, &sig_struct.signature);

        true
    }
}

/// Fast hex encoding using direct array indexing (g2c pattern).
/// Each input byte becomes two hex characters (0-9, a-f).
fn hex_encode(dst: &mut [u8], src: &[u8]) {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    let mut di: usize = 0;
    for &byte in src {
        dst[di] = HEX_CHARS[(byte >> 4) as usize];
        dst[di + 1] = HEX_CHARS[(byte & 0x0f) as usize];
        di += 2;
    }
}

#[cfg(test)]
mod test;
