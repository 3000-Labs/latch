#![cfg(test)]
use crate::{Counter, CounterClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_increment() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Counter, ());
    let client = CounterClient::new(&env, &contract_id);

    let caller = Address::generate(&env);

    // Initial value should be 0
    assert_eq!(client.get(), 0);

    // First increment
    let result = client.increment(&caller);
    assert_eq!(result, 1);
    assert_eq!(client.get(), 1);

    // Second increment
    let result = client.increment(&caller);
    assert_eq!(result, 2);
    assert_eq!(client.get(), 2);
}

#[test]
fn test_multiple_callers() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Counter, ());
    let client = CounterClient::new(&env, &contract_id);

    let caller1 = Address::generate(&env);
    let caller2 = Address::generate(&env);

    // Both callers increment the same counter
    client.increment(&caller1);
    client.increment(&caller2);
    client.increment(&caller1);

    assert_eq!(client.get(), 3);
}
