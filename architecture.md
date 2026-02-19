# Latch: C-Address Onboarding Infrastructure

## Technical Architecture & Implementation Plan

**Submitted to:** Stellar Community Fund (SCF)  
**Track:** RFP Track — C-Address Tooling & Onboarding  
**Focus:** Bridge, Wallet, and SDK for Soroban Smart Accounts  

---

## Executive Summary

Latch provides the missing infrastructure link between legacy Stellar G-addresses and Soroban Smart Accounts (C-addresses). It solves the "funding problem" where users cannot easily fund a Smart Account from centralized exchanges (CEXs) or fiat on-ramps that only support G-addresses.

Our solution consists of three decoupled, production-grade components:
1. **Latch Bridge:** A non-custodial forwarding protocol that "latches" G-addresses to C-addresses.
2. **Latch Wallet:** A reference implementation demonstrating best-in-class Smart Account UX.
3. **Latch SDK:** A developer toolkit enabling any wallet to integrate C-address support.

### What We've Already Built (Demo)

The current demo proves the core primitive — **cross-chain wallet signing** — by allowing Phantom (Solana) users to control Stellar Smart Accounts. This validates the OpenZeppelin Smart Account standard in production and demonstrates:

- Smart Account deployment with deterministic addresses
- Context rules scoping permissions to specific contracts and signers
- Ed25519 signature verification via modular verifier contracts
- Fee abstraction via bundler-sponsored transactions
- Enforcing Mode simulation for accurate transaction assembly

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL FUNDING SOURCES                         │
│            CEXs (Binance, Coinbase) · Fiat On-Ramps · Wallets           │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ Send XLM/Assets + Memo
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     LATCH BRIDGE LAYER                                   │
│                                                                         │
│  ┌──────────────────────┐        ┌────────────────────────────────────┐ │
│  │ Bridge Proxy         │        │ Relay Service                     │ │
│  │ (G-address / Soroban)│◄──────►│ (Golang microservice)             │ │
│  │                      │        │                                    │ │
│  │ • Receives deposits  │        │ • Indexes ledger (stellar-go)     │ │
│  │ • Emits events       │        │ • Decodes memo → C-address        │ │
│  │ • Holds temporarily  │        │ • Constructs forwarding tx        │ │
│  └──────────────────────┘        │ • Submits via Fee Bump            │ │
│                                  └────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     STELLAR / SOROBAN                                    │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Smart Account    │  │ Verifier     │  │ Target Contracts         │  │
│  │ (C-address)      │  │ Contracts    │  │                          │  │
│  │                  │  │              │  │ • Stellar Asset Contract  │  │
│  │ OZ Standard      │  │ • Ed25519    │  │ • DeFi protocols         │  │
│  │ __check_auth     │  │ • secp256k1  │  │ • Any Soroban dApp       │  │
│  │ Context Rules    │  │ • Passkey    │  │                          │  │
│  │ Policies         │  │              │  │                          │  │
│  └──────────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           ▲
                           │ Soroban RPC
                           │
┌─────────────────────────────────────────────────────────────────────────┐
│                     LATCH SDK & WALLET                                   │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ @latch/core      │  │ @latch/react          │  │ Latch Wallet     │  │
│  │                  │  │                       │  │                  │  │
│  │ • Address derive │  │ • useSmartAccount()   │  │ • Token balances │  │
│  │ • Memo generate  │  │ • useTransaction()    │  │ • Transfer hist  │  │
│  │ • Auth helpers   │  │ • useBridge()         │  │ • Bridge UI      │  │
│  │ • Verifier ABIs  │  │                       │  │ • Multi-signer   │  │
│  └──────────────────┘  └──────────────────────┘  └──────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Smart Account Auth Flow (Proven in Demo)

The core auth flow validates cross-chain wallet signatures through the OpenZeppelin Smart Account standard:

```
                    External Wallet (Phantom, MetaMask, Passkey)
                                    │
                              signs auth payload
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   Soroban Auth Entry            │
                    │   credentials: {               │
                    │     address: smart_account,    │
                    │     nonce: unique,             │
                    │     expiration: ledger + 60,   │
                    │     signature: signed_data     │
                    │   }                            │
                    │   invocation: { contract,      │
                    │     function, args }           │
                    └───────────────┬───────────────┘
                                    │
                              submitted by Bundler
                                    │
                                    ▼
            ┌──────────────────────────────────────────────┐
            │        smart_account.__check_auth()          │
            │                                              │
            │  1. AUTHENTICATE                             │
            │     │                                        │
            │     └─→ verifier.verify(payload, key, sig)   │
            │         • Pure cryptographic check            │
            │         • Ed25519 / secp256k1 / Passkey       │
            │         • Returns true/false                  │
            │                                              │
            │  2. VALIDATE CONTEXT                         │
            │     │                                        │
            │     ├─ Find rules for CallContract(target)    │
            │     └─ Match signers against rule.signers     │
            │                                              │
            │  3. ENFORCE POLICIES                         │
            │     │                                        │
            │     └─ Spending limits, time locks, etc.      │
            │                                              │
            │  → Ok(()) = authorized                       │
            └──────────────────────────────────────────────┘
```

---

## 2. Smart Contract Layer (Soroban)

### 2.1 Deployed Contracts

| Contract | Purpose | Deployed (Testnet) |
|----------|---------|-------------------|
| Ed25519 Verifier | Verifies Ed25519 signatures with prefix format | `CBNCF7QBTMIAEIZ3H6EN6JU5RDLBTFZZKGSWPAXW6PGPNY3HHIW5HKCH` |
| Counter | Demo target contract (increment/get) | `CBRCNPTZ7YPP5BCGF42QSUWPYZQW6OJDPNQ4HDEYO7VI5Z6AVWWNEZ2U` |
| Smart Account | Per-user C-address, OZ standard | Deterministic from user pubkey |

### 2.2 Verifier Architecture

Verifiers are **modular, stateless contracts** that implement the `Verifier` trait from OpenZeppelin:

```rust
pub trait Verifier {
    type KeyData;   // e.g., Bytes (raw public key)
    type SigData;   // e.g., Bytes (XDR-encoded signature struct)

    fn verify(
        e: &Env,
        signature_payload: Bytes,   // 32-byte auth payload hash
        key_data: Self::KeyData,     // public key
        sig_data: Self::SigData,     // signature + metadata
    ) -> bool;
}
```

The **Ed25519 Verifier** (currently deployed) validates prefixed messages:

```
Input:  sig_data = { prefixed_message, signature }
        where prefixed_message = "Stellar Smart Account Auth:\n" + hex(payload_hash)

Check 1: Prefix matches "Stellar Smart Account Auth:\n"
Check 2: hex portion matches hex(signature_payload)
Check 3: ed25519_verify(public_key, prefixed_message, signature)

Output: true (or panic)
```

**To support MetaMask:** Deploy a secp256k1 verifier that does `secp256k1_recover` instead. The smart account code stays identical.

### 2.3 Smart Account (OZ Standard)

The smart account implements `CustomAccountInterface` from Soroban and delegates all logic to the OZ `stellar-accounts` library:

```rust
impl CustomAccountInterface for MySmartAccount {
    type Signature = Signatures;

    fn __check_auth(e: Env, payload: BytesN<32>, signatures: Signatures,
                    auth_contexts: Vec<Context>) -> Result<(), Error> {
        do_check_auth(&e, &payload, &signatures, &auth_contexts)?;
        Ok(())
    }
}
```

**Context rules** scope permissions:

```rust
// Example: Allow Phantom pubkey to call counter contract
add_context_rule(
    &e,
    &ContextRuleType::CallContract(counter_address),
    &String::from_str(&e, "phantom-signer"),
    None,  // no expiry
    &vec![Signer::External(verifier_addr, pubkey_bytes)],
    &Map::new(&e),  // no policies
);
```

### 2.4 Smart Account Factory (Planned)

Deterministic address derivation before deployment:

```rust
pub fn deploy_account(env: Env, salt: BytesN<32>, owner_pubkey: Bytes,
                      verifier: Address) -> Address {
    let addr = env.deployer().with_current_contract(salt).deployed_address();
    let account = SmartAccountClient::new(&env, &addr);
    account.initialize(&verifier, &owner_pubkey);
    addr
}
```

Users know their C-address before it exists on-chain — enabling pre-funded bridging.

---

## 3. Bridge Mechanics

### 3.1 The "Latching" Flow

```
1. User wants to fund C-address C_USER
2. Latch SDK generates memo M_USER mapping to C_USER
3. User sends XLM from Coinbase to G_PROXY with Memo M_USER
4. Relay Service detects tx to G_PROXY with M_USER
5. Relay resolves M_USER → C_USER
6. Relay submits forwarding tx (Fee Bump):
   Op 1: Payment from G_PROXY to C_USER
   Source: Relay Hot Wallet (pays fees)
```

### 3.2 CEX Compatibility

CEXs only support standard **Memo ID** or **Memo Text** fields. Latch uses these universally-supported fields for routing:

- **Format:** `[Version: 1B][TargetHash: 28B][Checksum: 3B]` encoded in Memo Text
- **Validation:** Checksum prevents lost funds from typos
- **Supported by:** Binance, Coinbase, Kraken, and all major exchanges

### 3.3 Security Model

- **Non-Custodial:** The proxy contract only allows forwarding to the address derived from the memo. The relay cannot redirect funds.
- **Rate Limiting:** Minimum deposit thresholds prevent dust attacks (e.g., 5 XLM).
- **Transparency:** All routing is verifiable on-chain via events.

---

## 4. Relay Service

The Relay is the bridge's backend, written in **Golang** for high concurrency:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Relay Service                               │
│                                                                 │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌────────┐│
│  │ Indexer   │────►│ Router   │────►│ Builder  │────►│Submit  ││
│  │           │     │          │     │          │     │        ││
│  │ Streams   │     │ Memo →   │     │ Multi-op │     │ Fee    ││
│  │ ledger    │     │ C-addr   │     │ envelope │     │ Bump   ││
│  │ via RPC   │     │ resolve  │     │ construct│     │ + send ││
│  └──────────┘     └──────────┘     └──────────┘     └────────┘│
│                                                                 │
│  Stateless · Horizontally scalable · SQS-backed                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. SDK Design

### 5.1 Core Modules

**`@latch/core`** — Pure logic, no framework dependencies:
```typescript
import { Latch } from '@latch/core';

const latch = new Latch({ network: 'testnet' });

// Generate funding instructions for a C-address
const { proxyAddress, memo } = latch.getFundingAddress(myCAddress);
console.log(`Send XLM to ${proxyAddress} with Memo: ${memo}`);

// Watch for deposit arrival
latch.watchDeposit(myCAddress, (tx) => {
    console.log("Funds arrived!", tx.amount);
});
```

**`@latch/react`** — React hooks for wallet integration:
```typescript
import { useSmartAccount, useBridge } from '@latch/react';

function WalletPage() {
    const { account, deploy, isDeployed } = useSmartAccount();
    const { fund, status } = useBridge(account?.address);

    return (
        <div>
            <p>C-Address: {account?.address}</p>
            <button onClick={fund}>Fund from CEX</button>
        </div>
    );
}
```

### 5.2 Onboarding Kit

A standard, open-source onboarding flow for wallet providers:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 1. Connect   │    │ 2. Deploy    │    │ 3. Fund      │    │ 4. Ready     │
│              │    │              │    │              │    │              │
│ Sign in with │───►│ Create Smart │───►│ Bridge from  │───►│ Full wallet  │
│ Phantom,     │    │ Account      │    │ CEX or       │    │ access with  │
│ MetaMask,    │    │ (C-address)  │    │ G-address    │    │ no G-address │
│ or Passkey   │    │              │    │              │    │ required     │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 6. Infrastructure & Deployment

### 6.1 Cloud Architecture

- **Compute:** AWS Fargate (containerized Relay Service)
- **Database:** PostgreSQL (RDS) for routing cache and transaction history
- **RPC:** Dedicated Stellar RPC nodes (QuickNode) for 99.9% uptime
- **Queue:** AWS SQS for exactly-once deposit processing

### 6.2 Scalability

- **Horizontal Scaling:** Relay is stateless; multiple instances process different ledger ranges
- **Queueing:** Deposits pushed to SQS ensure processing even across restarts
- **Rate Limits:** Configurable per-address and per-asset thresholds

---

## 7. Timeline & Milestones

**Phase 0 — Foundation (Complete)**
- [x] Project setup & repository initialization
- [x] Ed25519 verifier contract with prefix support
- [x] Smart Account with OZ context rules
- [x] Phantom → Smart Account demo (web)
- [x] Bundler-sponsored fee abstraction
- [x] Enforcing Mode simulation (Soroban best practices)
- [x] Full technical documentation

**Phase 1 — Bridge MVP (Weeks 1-4)**
- [ ] Deploy Bridge Proxy Contract to Testnet
- [ ] Core Relay Service (Golang) operational on Testnet
- [ ] Basic SDK `getFundingAddress` + `watchDeposit`
- [ ] Smart Account Factory for deterministic deployment

**Phase 2 — Multi-Signer & Wallet (Weeks 4-8)**
- [ ] secp256k1 verifier (MetaMask/Rabby support)
- [ ] Passkey verifier (WebAuthn)
- [ ] Reference wallet — token balances, transfer history
- [ ] Fee Abstraction (OZ module integration)
- [ ] Onboarding Kit (standard UX flow)

**Phase 3 — Production (Weeks 8-12)**
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] Mobile wallet (React Native)
- [ ] CEX integration guides
- [ ] Ecosystem wallet partnerships
- [ ] Public launch

---

## 8. Conclusion

Latch transforms the "zero-to-one" experience for Soroban Smart Accounts. By abstracting the complexity of C-addresses and G-to-C bridging, we enable the next generation of users — users who may never even know what a "G-address" is — to onboard seamlessly using the wallets they already have.

The current demo proves the hardest part: **cross-chain signature verification works on Soroban today.** The remaining work — Bridge, Wallet, SDK — is infrastructure that builds on this proven foundation.