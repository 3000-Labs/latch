# Latch: C-Address Onboarding Infrastructure

## Technical Architecture & Implementation Plan

**Submitted to:** Stellar Community Fund (SCF)
**Track:** RFP Track — C-Address Tooling & Onboarding
**Focus:** Bridge, Wallet, and SDK for Soroban Smart Accounts

---

## Executive Summary

Latch provides the missing infrastructure link between legacy Stellar G-addresses and new Soroban Smart Accounts (C-addresses). It solves the "funding problem" where users cannot easily fund a Smart Account from centralized exchanges (CEXs) or fiat on-ramps that only support G-addresses.

Our solution consists of three decoupled, production-grade components:
1.  **Latch Bridge:** A non-custodial forwarding protocol that "latches" G-addresses to C-addresses.
2.  **Latch Wallet:** A reference implementation demonstrating best-in-class Smart Account UX.
3.  **Latch SDK:** A developer toolkit enabling any wallet to integrate C-address support in lines of code.

---

## 1. System Architecture Overview

### 1.1 High-Level Data Flow

Latch operates as a transparent shim layer between the legacy network and the Soroban runtime.

```
┌─────────────────────────────────────────────────────────────┐
│                    External Funding Sources                 │
│           (CEXs, Fiat On-Ramps, Legacy Wallets)             │
└──────────────────────┬──────────────────────────────────────┘
                       │ 1. Send XLM/Assets + Memo
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 Latch Bridge Proxy Contract                  │
│       (Stellar Classic G-Address / Soroban Contract)        │
│  • Receives funds                                           │
│  • Emits events / Holds funds temporarily                   │
└──────────────┬──────────────────────────────────────────────┘
               │
               │ 2. Monitors Transactions
               ▼
    ┌───────────────────────────────┐
    │      Latch Relay Service      │
    │  (Golang / Rust Microservice) │
    │  • Indexer (stellar-go)       │
    │  • Routing Engine             │
    │  • Tx Builder                 │
    └──────────┬────────────────────┘
               │
               │ 3. Submits Atomic Forwarding Tx
               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Stellar Core / Soroban                    │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
    ┌───────────────────────────────┐
    │     Target Smart Account      │
    │         (C-Address)           │
    └───────────────────────────────┘
```

### 1.2 Core Components

**1. Funding Bridge Proxy**
- A specialized G-address (eventually a Soroban contract) that serves as the entry point.
- Uses **Memo-Based Routing** to identify the intended C-address recipient from legacy senders.

**2. Relay Service**
- **Indexer:** Streams ledger data via RPC to detect incoming deposits.
- **Router:** Decodes memos to resolve target C-addresses.
- **Submitter:** Constructs and submits multi-operation envelopes (Claim + Create Account + Forward) wrapped in Fee Bump transactions if necessary.

**3. Latch Wallet & SDK**
- **Wallet:** A forkable reference implementation built with Next.js and Soroban Client.
- **SDK:** TypeScript/Rust libraries handling the client-side logic (generating correct memos, deploying account factories).

---

## 2. Stellar-Specific Integration

### 2.1 Smart Contract Layer (Soroban)

Latch leverages OpenZeppelin's Smart Account standards to ensure compatibility and security.

**Smart Account Factory:**
We use a factory pattern to deploy user accounts deterministically, allowing users to know their C-address before it's deployed.

```rust
// pseudo-code for Factory contract
pub fn deploy_account(env: Env, salt: Bytes32, owner: Address) -> Address {
    // 1. Derive address from salt + deployer
    let addr = env.deployer().with_current_contract(salt).deployed_address();
    
    // 2. Initialize account with OpenZeppelin standard config
    let account = AccountClient::new(&env, &addr);
    account.init(&owner);
    
    addr
}
```

**Fee Abstraction:**
The system integrates OpenZeppelin's Fee Abstraction module. Since a new user has no XLM to pay for their own account deployment, the Relay Service pays the gas (via Fee Bump), and the user can potentially reimburse in USDC or other tokens atomically.

### 2.2 Relay Service Implementation

The Relay is the heart of the bridge, written in **Golang** for high concurrency and type safety, leveraging the official `stellar-go` SDK.

**Ingestion Pipeline:**

```go
// Connect to Stellar RPC
client := horizonclient.DefaultPublicNetClient

// Stream Transactions
for {
    txs, err := client.StreamTransactions(ctx, cursor)
    for _, tx := range txs {
        if isPaymentToProxy(tx) {
            go processDeposit(tx)
        }
    }
}
```

**Routing Logic:**
The router parses the `Memo` field of incoming payments.
- **Format:** `[Version: 1B][TargetHash: 32B]`
- **Validation:** Checks checksums to prevent lost funds.

### 2.3 Wallet & Client Layer

The Latch Wallet is a Next.js application designed to be the "golden path" for Smart Account users.

**Key Features:**
- **Passkey Integration:** Uses WebAuthn for hardware-enclave security without seed phrases.
- **Cross-Chain Signers:** Implements signature verification for secp256k1 (Ethereum) and ed25519 (Solana) to allow users to control Stellar accounts with MetaMask/Phantom.

---

## 3. Bridge Mechanics (Deep Dive)

### 3.1 The "Latching" Flow

1.  **Initiation:** User wants to fund C-address `C_USER`.
2.  **Mapping:** Latch SDK generates a unique Memo `M_USER` that maps to `C_USER`.
3.  **Deposit:** User sends XLM from Coinbase to `G_PROXY` with Memo `M_USER`.
4.  **Detection:** Relay Service sees tx to `G_PROXY` with `M_USER`.
5.  **Resolution:** Relay looks up `M_USER` -> `C_USER`.
6.  **Forwarding:** Relay submits a transaction:
    -   `Operation 1`: Payment from `G_PROXY` to `C_USER`.
    -   `Source Account`: Relay Hot Wallet (paying fees).

### 3.2 Addressing CEX Limitations

Centralized Exchanges (CEXs) often strip complex metadata. Latch relies *only* on the standard **Memo ID** or **Memo Text** fields, which are universally supported by every major exchange (Binance, Coinbase, Kraken) for Stellar deposits.

### 3.3 Security Model

-   **Non-Custodial (Eventually):** In the smart contract version, the Proxy Contract has logic that *only* allows forwarding to the address derived from the memo. The Relay cannot steal funds, only trigger the forward.
-   **Rate Limiting:** To prevent dust attacks, the Bridge enforces minimum deposit thresholds (e.g., 5 XLM).

---

## 4. SDK Implementation

### 4.1 Core Modules

**`@latch/core`**: Pure logic for address derivation and memo generation.
**`@latch/react`**: Hooks for wallet connection and state management.

### 4.2 Code Examples

**Funding an Account (TypeScript):**

```typescript
import { Latch } from '@latch/sdk';

const latch = new Latch({ network: 'testnet' });

// 1. Generate funding instructions
const { proxyAddress, memo } = latch.getFundingAddress(myCAddress);

console.log(`Send XLM to ${proxyAddress} with Memo: ${memo}`);

// 2. Watch for arrival
latch.watchDeposit(myCAddress, (tx) => {
    console.log("Funds arrived!", tx.amount);
});
```

**Departing a Smart Account (Rust):**

```rust
use latch_sdk::Client;

let client = Client::new(Network::Testnet);
let account = client.create_account(Signer::Passkey).await?;

println!("Deployed C-Address: {}", account.address());
```

---

## 5. Infrastructure & Deployment

### 5.1 Cloud Architecture

-   **Compute:** AWS Fargate (Containerized Relay Service).
-   **Database:** PostgreSQL (RDS) for caching routing tables and transaction history (though the ledger is the source of truth).
-   **Connectivity:** Dedicated Stellar RPC nodes (QuickNode or similar) to ensure 99.9% uptime for event listening.

### 5.2 Scalability

-   **Horizontal Scaling:** The Relay Service is stateless; multiple instances can process different ledger ranges.
-   **Queueing:** Incoming deposits are pushed to an AWS SQS queue to ensure they are processed exactly once, even if the indexer restarts.

---

## 6. Timeline & Milestones

**Tranche 0 (Weeks 0-2): Foundation**
-   [x] Project setup & Repo initialization.
-   [ ] Deploy Bridge Proxy Contract to Testnet.
-   [ ] Initialize Factory contracts.

**Tranche 1 (Weeks 2-5): MVP**
-   [ ] Core Relay Service (Go) operational on Testnet.
-   [ ] Basic SDK `getFundingAddress`.
-   [ ] Latch Wallet Alpha (View Only).

**Tranche 2 (Weeks 5-9): Full Feature Set**
-   [ ] Cross-Chain Signers (MetaMask/Phantom support).
-   [ ] Fee Abstraction implementation.
-   [ ] Full Dashboard in Wallet.

**Tranche 3 (Weeks 9-12): Mainnet**
-   [ ] Audits & Security Review.
-   [ ] Mainnet Deployment.
-   [ ] Public Launch.

---
## 7. Conclusion

Latch transforms the "zero-to-one" experience for Soroban. By abstracting the complexity of C-addresses and G-to-C bridging, we enable the next generation of users—users who may never even know what a "G-address" is—to onboard seamlessly.