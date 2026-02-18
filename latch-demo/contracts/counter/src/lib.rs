#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env};

#[contract]
pub struct Counter;

#[contractimpl]
impl Counter {
    /// Increment the counter. Requires auth from `caller`.
    pub fn increment(e: Env, caller: Address) -> u32 {
        caller.require_auth();
        let key = symbol_short!("count");
        let count: u32 = e.storage().persistent().get(&key).unwrap_or(0);
        let new_count = count + 1;
        e.storage().persistent().set(&key, &new_count);
        new_count
    }

    /// Get current counter value.
    pub fn get(e: Env) -> u32 {
        let key = symbol_short!("count");
        e.storage().persistent().get(&key).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
