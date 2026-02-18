#![no_std]
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Bytes, BytesN, Env, Map, String, Val, Vec,
};
use stellar_accounts::smart_account::{
    add_context_rule, do_check_auth,
    ContextRule, ContextRuleType, Signatures, Signer, SmartAccountError,
};

#[contract]
pub struct PhantomSmartAccount;

// ── CustomAccountInterface ──────────────────────────────────────────────────

#[contractimpl]
impl CustomAccountInterface for PhantomSmartAccount {
    type Signature = Signatures;
    type Error = SmartAccountError;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: Signatures,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)?;
        Ok(())
    }
}

// ── SmartAccount trait ──────────────────────────────────────────────────────

#[contractimpl]
impl stellar_accounts::smart_account::SmartAccount for PhantomSmartAccount {
    fn get_context_rule(e: &Env, context_rule_id: u32) -> ContextRule {
        stellar_accounts::smart_account::get_context_rule(e, context_rule_id)
    }

    fn get_context_rules(e: &Env, context_rule_type: ContextRuleType) -> Vec<ContextRule> {
        stellar_accounts::smart_account::get_context_rules(e, &context_rule_type)
    }

    fn get_context_rules_count(e: &Env) -> u32 {
        stellar_accounts::smart_account::get_context_rules_count(e)
    }

    fn add_context_rule(
        e: &Env,
        context_type: ContextRuleType,
        name: String,
        valid_until: Option<u32>,
        signers: Vec<Signer>,
        policies: Map<Address, Val>,
    ) -> ContextRule {
        stellar_accounts::smart_account::add_context_rule(
            e, &context_type, &name, valid_until, &signers, &policies,
        )
    }

    fn update_context_rule_name(e: &Env, context_rule_id: u32, name: String) -> ContextRule {
        stellar_accounts::smart_account::update_context_rule_name(e, context_rule_id, &name)
    }

    fn update_context_rule_valid_until(
        e: &Env,
        context_rule_id: u32,
        valid_until: Option<u32>,
    ) -> ContextRule {
        stellar_accounts::smart_account::update_context_rule_valid_until(
            e, context_rule_id, valid_until,
        )
    }

    fn remove_context_rule(e: &Env, context_rule_id: u32) {
        stellar_accounts::smart_account::remove_context_rule(e, context_rule_id)
    }

    fn add_signer(e: &Env, context_rule_id: u32, signer: Signer) {
        stellar_accounts::smart_account::add_signer(e, context_rule_id, &signer)
    }

    fn remove_signer(e: &Env, context_rule_id: u32, signer: Signer) {
        stellar_accounts::smart_account::remove_signer(e, context_rule_id, &signer)
    }

    fn add_policy(e: &Env, context_rule_id: u32, policy: Address, install_param: Val) {
        stellar_accounts::smart_account::add_policy(e, context_rule_id, &policy, install_param)
    }

    fn remove_policy(e: &Env, context_rule_id: u32, policy: Address) {
        stellar_accounts::smart_account::remove_policy(e, context_rule_id, &policy)
    }
}

// ── Initialization ──────────────────────────────────────────────────────────

#[contractimpl]
impl PhantomSmartAccount {
    /// Call once after deploy to register the Phantom key.
    ///
    /// # Arguments
    /// * `verifier`   - Address of the deployed Ed25519Verifier contract
    /// * `public_key` - 32-byte Ed25519 public key from Phantom wallet
    /// * `counter`    - Address of the Counter contract (scope of this rule)
    pub fn initialize(
        e: Env,
        verifier: Address,
        public_key: BytesN<32>,
        counter: Address,
    ) {
        // Signer::External(verifier_address, raw_pubkey_bytes)
        let signer = Signer::External(
            verifier,
            Bytes::from_slice(&e, &public_key.to_array()),
        );

        let signers = Vec::from_array(&e, [signer]);
        let policies: Map<Address, Val> = Map::new(&e);

        add_context_rule(
            &e,
            &ContextRuleType::CallContract(counter),
            &String::from_str(&e, "phantom-signer"),
            None,      // no expiry for demo
            &signers,
            &policies,
        );
    }
}

#[cfg(test)]
mod test;
