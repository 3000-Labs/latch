# Latch

**C-Address Tooling & Onboarding for Stellar**

Latch is open-source infrastructure that bridges the gap between legacy Stellar G-addresses and Soroban Smart Accounts (C-addresses). Users create and control Smart Accounts using wallets they already have — Phantom, MetaMask, Passkeys — without ever needing a Stellar seed phrase or G-address.

> **RFP Track:** C-Address Tooling & Onboarding (Q1 2026)
> Built on [OpenZeppelin's Stellar Smart Account standard](https://github.com/OpenZeppelin/stellar-contracts)

---

## The Problem

Two adoption blockers prevent C-address (Soroban Smart Account) usage today:

1. **Funding:** You can't easily fund a C-address from a CEX, fiat on-ramp, or existing wallet. Every path requires a G-address first.
2. **Tooling:** There's no production-grade wallet or SDK that treats C-addresses as first-class citizens.

## The Solution

Latch provides three decoupled, production-grade components:

| Component | What it does | Status |
|-----------|-------------|--------|
| **Latch Bridge** | Non-custodial G-to-C forwarding protocol. CEX withdrawal → G-address → C-address, transparent to the user. | In Development |
| **Latch Wallet** | Reference Smart Account wallet — tokens, history, transfers — at parity with Freighter. | In Development |
| **Latch SDK** | TypeScript/Rust libraries for any wallet to integrate C-address support. | In Development |

## Live Demo

The current demo proves the core primitive: **a Phantom (Solana) wallet controlling a Stellar Smart Account**.

```
Phantom Wallet → Ed25519 Signature → On-chain Verifier → Smart Account → Counter Contract
```

- User connects Phantom (Ed25519 key, no Stellar wallet needed)
- Smart Account deployed with context rules scoped to the user's key
- User signs authorization payloads in Phantom
- Ed25519 verifier contract validates signatures on-chain
- Smart Account authorizes the invocation, counter increments
- Bundler pays all fees (user never needs XLM)

### Try it

```bash
npm install
npm run dev
# Open http://localhost:3000/demo
# Requires Phantom wallet extension
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL WALLETS                            │
│              Phantom (Ed25519) · MetaMask (secp256k1)               │
│                    Passkeys · Any Ed25519 key                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Signs auth payloads
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        LATCH MIDDLEWARE                              │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ Onboarding   │  │ Transaction      │  │ Bridge                │ │
│  │ Service      │  │ Service          │  │ Service               │ │
│  │              │  │                  │  │                       │ │
│  │ • Deploy     │  │ • Build tx       │  │ • Memo routing        │ │
│  │ • Initialize │  │ • Simulate       │  │ • G→C forwarding      │ │
│  │ • Fund       │  │ • Submit         │  │ • CEX compatibility   │ │
│  └──────────────┘  └──────────────────┘  └───────────────────────┘ │
│                                                                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Soroban RPC
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      STELLAR / SOROBAN                               │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ Smart Account│  │ Signature        │  │ Target                │ │
│  │ (C-address)  │  │ Verifiers        │  │ Contracts             │ │
│  │              │  │                  │  │                       │ │
│  │ OZ Standard  │  │ • Ed25519        │  │ • Token transfers     │ │
│  │ Context Rules│  │ • secp256k1      │  │ • DeFi protocols      │ │
│  │ Policies     │  │ • Passkey        │  │ • Any Soroban dApp    │ │
│  └──────────────┘  └──────────────────┘  └───────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### How Cross-Chain Signing Works

The key insight: **Ed25519 is Ed25519 everywhere.** Phantom's keypair uses the same curve as Stellar. We don't bridge chains — we bridge *signing capability*.

1. A **modular verifier contract** handles pure cryptographic verification (Ed25519, secp256k1, etc.)
2. The **smart account** delegates signature checks to the verifier via cross-contract calls
3. **Context rules** scope permissions: which signers can call which contracts
4. **Policies** add guardrails: spending limits, time restrictions, multisig thresholds

Swapping the verifier contract is all it takes to support a different signature scheme. The smart account logic stays identical.

---

## Project Structure

```
latch/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── smart-account/        # Deploy & initialize smart accounts
│   │   ├── transaction/
│   │   │   ├── build/            # Build tx, Recording Mode simulation
│   │   │   └── submit/           # Enforcing Mode simulation, submit
│   │   └── counter/              # Read counter value
│   └── demo/                     # Demo page (Phantom → Smart Account)
├── latch-demo/
│   └── contracts/
│       ├── ed25519-verifier/     # Ed25519 signature verifier (Rust/Soroban)
│       ├── smart-account/        # OZ Smart Account implementation (Rust/Soroban)
│       └── counter/              # Target contract for demo (Rust/Soroban)
├── scripts/                      # Test & reference scripts
│   ├── test-full-flow.mjs        # End-to-end smart account flow
│   ├── method1-tx-signing.mjs    # Soroban Method 1 reference
│   ├── method2-auth-entry-signing.mjs  # Soroban Method 2 reference
│   └── check-tx.mjs             # Transaction inspection utility
├── reference/
│   └── stellar-contracts/        # OZ Stellar Contracts (local reference)
├── DEMO_EXPLAINER.md             # Step-by-step demo flow breakdown
├── DEMO_GUIDE.md                 # Build & deploy guide
├── architecture.md               # Full technical architecture
└── RFP.md                        # SCF RFP requirements
```

## Documentation

| Document | Description |
|----------|-------------|
| [**DEMO_EXPLAINER.md**](./DEMO_EXPLAINER.md) | Step-by-step walkthrough of the full demo flow with technical diagrams |
| [**DEMO_GUIDE.md**](./DEMO_GUIDE.md) | How to build, deploy, and run the contracts and demo |
| [**architecture.md**](./architecture.md) | Full technical architecture — Bridge, Wallet, SDK |
| [**RFP.md**](./RFP.md) | SCF RFP requirements for C-Address Tooling & Onboarding |

## Tech Stack

- **Contracts:** Rust + Soroban SDK + [OpenZeppelin Stellar Contracts](https://github.com/OpenZeppelin/stellar-contracts)
- **Frontend:** Next.js 15, React 19, TypeScript
- **Stellar SDK:** `@stellar/stellar-sdk` 13.3.0
- **Network:** Stellar Testnet (Soroban RPC)
- **Wallet Integration:** Phantom (Ed25519), extensible to MetaMask (secp256k1) and Passkeys

## Deployed Contracts (Testnet)

| Contract | Address |
|----------|---------|
| Ed25519 Verifier | `CBNCF7QBTMIAEIZ3H6EN6JU5RDLBTFZZKGSWPAXW6PGPNY3HHIW5HKCH` |
| Counter | `CBRCNPTZ7YPP5BCGF42QSUWPYZQW6OJDPNQ4HDEYO7VI5Z6AVWWNEZ2U` |
| Smart Account | Per-user, deterministic from public key |

---

## Roadmap

**Phase 1 — Core Demo (Current)**
- [x] Ed25519 verifier contract with prefix support
- [x] Smart Account with OZ context rules
- [x] Phantom → Smart Account demo (web)
- [x] Bundler-sponsored fee abstraction
- [x] Enforcing Mode simulation (correct Soroban signing)

**Phase 2 — Bridge & Multi-Signer**
- [ ] Bridge proxy contract (G-to-C forwarding)
- [ ] Relay service (deposit monitoring + routing)
- [ ] secp256k1 verifier (MetaMask support)
- [ ] Passkey verifier (WebAuthn)
- [ ] Multi-signer context rules

**Phase 3 — Wallet & SDK**
- [ ] Reference wallet (token balances, transfer history)
- [ ] Mobile wallet (React Native)
- [ ] `@latch/sdk` — TypeScript SDK for wallet providers
- [ ] `latch-sdk` — Rust SDK for contract developers
- [ ] Onboarding kit (standard UX flow)

**Phase 4 — Production**
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] CEX integration guides
- [ ] Ecosystem wallet partnerships

## License

MIT