# Latch Demo: Full Flow Explainer

**How a Phantom wallet controls a Stellar Smart Account (C-address)**

This document traces every step of the Latch demo — from clicking "Connect Phantom" to seeing the counter increment on-chain. Each step shows what happens in the code, what data flows between components, and what executes on-chain.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              STELLAR NETWORK                                │
│                                                                              │
│   ┌───────────────┐    ┌───────────────┐    ┌──────────────────────────┐     │
│   │   Counter      │    │  Ed25519       │    │   Smart Account          │     │
│   │   Contract     │◄───│  Verifier      │◄───│   (C-address)            │     │
│   │               │    │               │    │                          │     │
│   │ increment()   │    │ verify()      │    │ __check_auth()           │     │
│   │ get()         │    │  ↳ ed25519    │    │  ↳ authenticate()        │     │
│   │               │    │    math only  │    │  ↳ validate context      │     │
│   └───────────────┘    └───────────────┘    │  ↳ enforce policies      │     │
│                                              │                          │     │
│                                              │ Context Rule #0:         │     │
│                                              │  WHO: External(verifier, │     │
│                                              │       phantom_pubkey)    │     │
│                                              │  WHAT: CallContract      │     │
│                                              │        (counter)         │     │
│                                              └──────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Soroban RPC
                                    │
┌──────────────────────────────────────────────────────────────────────────────┐
│                           LATCH DEMO APP (Next.js)                           │
│                                                                              │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│   │ /api/smart-      │  │ /api/transaction/ │  │ /api/transaction/       │  │
│   │   account        │  │   build           │  │   submit                │  │
│   │                  │  │                  │  │                          │  │
│   │ • Deploy C-addr  │  │ • Build tx       │  │ • Attach Phantom sig    │  │
│   │ • Initialize     │  │ • Simulate       │  │ • Enforcing Mode sim    │  │
│   │   context rule   │  │ • Get auth hash  │  │ • assembleTransaction   │  │
│   │ • Fund G-addr    │  │ • Return to      │  │ • Bundler signs + sends │  │
│   │                  │  │   frontend       │  │                          │  │
│   └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ HTTPS
                                    │
┌──────────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (User's Machine)                           │
│                                                                              │
│   ┌──────────────────┐              ┌──────────────────────────────────────┐ │
│   │ Phantom Wallet   │              │ Demo Page (app/demo/page.tsx)       │ │
│   │                  │              │                                      │ │
│   │ • Ed25519 key    │◄────────────►│ • Connect Phantom                   │ │
│   │ • signMessage()  │  signMessage │ • Show smart account address        │ │
│   │ • Public key     │              │ • Execute via Smart Account         │ │
│   └──────────────────┘              │ • Display counter + tx hash         │ │
│                                      └──────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Connect Phantom & Deploy Smart Account

**User Action:** Click "Connect Phantom & Create Smart Account"

### Step 1.1 — Get Phantom's Ed25519 Public Key

```
Browser                                  Phantom Extension
   │                                          │
   │  provider.connect()               →      │
   │                                          │ User approves connection
   │  ← { publicKey: "7Fp2..." }              │
   │                                          │
   │  bs58.decode(publicKey)                  │
   │  → pubkeyHex: "64c301fb975ca796..."      │
```

Phantom's public key is a 32-byte Ed25519 key encoded in Base58 (Solana format). We decode it to raw hex because Stellar works with raw bytes.

**Key insight:** Phantom uses Ed25519, Stellar uses Ed25519. Same curve, same key format. This is why cross-chain signing works — it's not a bridge, it's the same math.

### Step 1.2 — Deploy Smart Account

```
Browser                              /api/smart-account                    Stellar CLI
   │                                       │                                    │
   │  POST { publicKeyHex }          →     │                                    │
   │                                       │  1. Derive G-address from pubkey   │
   │                                       │     StrKey.encodeEd25519PublicKey() │
   │                                       │     → "GBSMGAP3..."                │
   │                                       │                                    │
   │                                       │  2. Fund G-address via Friendbot   │
   │                                       │     GET friendbot.stellar.org      │
   │                                       │                                    │
   │                                       │  3. Deploy smart account      →    │
   │                                       │     stellar contract deploy         │
   │                                       │     --wasm-hash <smart_account>     │
   │                                       │     --salt sha256(pubkey+"v6")      │
   │                                       │     ← "CD37YWN..."                 │
   │                                       │                                    │
   │                                       │  4. Initialize smart account  →    │
   │                                       │     stellar contract invoke         │
   │                                       │     -- initialize                   │
   │                                       │     --verifier CBNCF7Q...           │
   │                                       │     --public_key 64c301fb...        │
   │                                       │     --counter CBRCNPT...            │
   │                                       │                                    │
   │  ← { smartAccountAddress,             │                                    │
   │       gAddress,                       │                                    │
   │       alreadyDeployed }               │                                    │
```

### What `initialize` does on-chain

The `initialize` function registers a **context rule** in the smart account's storage:

```rust
add_context_rule(
    &e,
    &ContextRuleType::CallContract(counter),     // WHAT: calling the counter
    &String::from_str(&e, "phantom-signer"),      // Human name
    None,                                          // No expiry
    &signers,                                      // WHO: [External(verifier, pubkey)]
    &policies,                                     // No extra policies
);
```

This stores on-chain:
```
┌────────────────────────────────────────────────────────────────┐
│ Smart Account Storage (CD37YWN...)                             │
│                                                                │
│ Context Rule #0:                                               │
│   Type:    CallContract(CBRCNPT...)  ← counter address         │
│   Name:    "phantom-signer"                                    │
│   Signers: [ External(                                         │
│               verifier = CBNCF7Q..., ← verifier contract       │
│               key_data = 64c301fb... ← phantom pubkey bytes    │
│             ) ]                                                │
│   Policies: []                       ← no restrictions         │
│   Expires:  None                     ← never                   │
└────────────────────────────────────────────────────────────────┘
```

**Without this context rule, every transaction would fail** with error #3002 (UnvalidatedContext) — the smart account wouldn't know who is allowed to do what.

---

## Phase 2: Execute via Smart Account

**User Action:** Click "Execute via Smart Account"

### Step 2.1 — Build Transaction (Recording Mode)

```
Browser                              /api/transaction/build              Soroban RPC
   │                                       │                                │
   │  POST { smartAccountAddress }   →     │                                │
   │                                       │  1. Get bundler account    →   │
   │                                       │     ← { sequence, etc }        │
   │                                       │                                │
   │                                       │  2. Build transaction:         │
   │                                       │     Source: bundler (GBL4F...)  │
   │                                       │     Op: counter.increment(     │
   │                                       │         CD37YWN...)            │
   │                                       │     Fee: 1,000,000 stroops     │
   │                                       │     Timeout: 300 seconds       │
   │                                       │                                │
   │                                       │  3. Simulate (Recording)  →    │
   │                                       │     Soroban runs increment()   │
   │                                       │     Counter calls              │
   │                                       │       require_auth(CD37YWN)    │
   │                                       │     Simulator returns:         │
   │                                       │       "CD37YWN needs to auth"  │
   │                                       │       unsigned auth entry      │
   │                                       │     ← simResult                │
   │                                       │                                │
   │                                       │  4. Set signature expiration:  │
   │                                       │     latestLedger + 60          │
   │                                       │     (~5 minutes)               │
   │                                       │                                │
   │                                       │  5. Compute auth payload hash: │
   │                                       │     preimage = {               │
   │                                       │       networkId,               │
   │                                       │       nonce,                   │
   │                                       │       expirationLedger,        │
   │                                       │       invocation               │
   │                                       │     }                          │
   │                                       │     hash = SHA256(preimage)    │
   │                                       │     → 32 bytes → hex string   │
   │                                       │                                │
   │  ← { txXdr,                           │                                │
   │       authEntryXdr,                   │                                │
   │       authPayloadHash,                │                                │
   │       validUntilLedger }              │                                │
```

**What's returned to the frontend:**

| Field | What it is | Size |
|-------|-----------|------|
| `txXdr` | The raw unsigned transaction (base64) | ~500 bytes |
| `authEntryXdr` | The unsigned auth entry — who needs to authorize what (base64) | ~300 bytes |
| `authPayloadHash` | SHA-256 of the authorization details (hex string) | 64 hex chars |
| `validUntilLedger` | When the signature expires (integer) | e.g. `1095730` |

### Step 2.2 — Phantom Signs the Auth Payload

```
Browser                                          Phantom Extension
   │                                                  │
   │  message = "Stellar Smart Account Auth:\n"       │
   │          + "8fa814c0b44fb9c442b10b1c..."          │
   │                                                  │
   │  provider.signMessage(encode(message))     →     │
   │                                                  │ ┌─────────────────────┐
   │                                                  │ │ Phantom Popup       │
   │                                                  │ │                     │
   │                                                  │ │ "Sign Message"      │
   │                                                  │ │                     │
   │                                                  │ │ Stellar Smart       │
   │                                                  │ │ Account Auth:       │
   │                                                  │ │ 8fa814c0b44fb...    │
   │                                                  │ │                     │
   │                                                  │ │ [Approve] [Reject]  │
   │                                                  │ └─────────────────────┘
   │                                                  │
   │  ← { signature: Uint8Array(64) }                 │  Ed25519_Sign(
   │                                                  │    privateKey,
   │     signatureHex = "2695b9fd100f20f01e70..."      │    messageBytes)
```

**Why the prefix?**
1. Phantom blocks raw 32-byte messages (looks like Solana transaction phishing)
2. Users see human-readable text in the popup
3. The verifier contract knows to expect and validate this exact format

### Step 2.3 — Submit Transaction (Enforcing Mode)

```
Browser                              /api/transaction/submit              Soroban RPC
   │                                       │                                │
   │  POST { txXdr,                  →     │                                │
   │         authEntryXdr,                 │                                │
   │         authSignatureHex,             │                                │
   │         prefixedMessage,              │                                │
   │         publicKeyHex }                │                                │
   │                                       │                                │
   │                                       │  1. Reconstruct tx + authEntry │
   │                                       │                                │
   │                                       │  2. Build signature struct:    │
   │                                       │     Ed25519SigData {           │
   │                                       │       prefixed_message,        │
   │                                       │       signature               │
   │                                       │     } → XDR bytes             │
   │                                       │                                │
   │                                       │  3. Build signer key:          │
   │                                       │     [External,                 │
   │                                       │      verifier_address,         │
   │                                       │      phantom_pubkey]           │
   │                                       │                                │
   │                                       │  4. Set signature on auth:     │
   │                                       │     authEntry.credentials()    │
   │                                       │       .signature = Vec[Map[    │
   │                                       │         signerKey → sigData    │
   │                                       │       ]]                       │
   │                                       │                                │
   │                                       │  5. Build new tx with auth     │
   │                                       │     Source: bundler             │
   │                                       │     Op: counter.increment(     │
   │                                       │         CD37YWN...)            │
   │                                       │     Auth: [signed auth entry]  │
   │                                       │                                │
   │                                       │  6. Simulate (Enforcing)  →    │
   │                                       │     Soroban runs the FULL      │
   │                                       │     __check_auth flow:         │
   │                                       │     • Verifies sig via verifier│
   │                                       │     • Validates context rule   │
   │                                       │     • Returns accurate fees    │
   │                                       │     ← enforcingSim             │
   │                                       │                                │
   │                                       │  7. assembleTransaction()      │
   │                                       │     Applies correct footprint, │
   │                                       │     resource fees, CPU/memory  │
   │                                       │                                │
   │                                       │  8. Bundler signs tx envelope  │
   │                                       │     (pays network fees)        │
   │                                       │                                │
   │                                       │  9. sendTransaction()     →    │
   │                                       │     ← txHash                   │
   │                                       │                                │
   │                                       │ 10. Poll getTransaction() →    │
   │                                       │     ← status: SUCCESS          │
   │                                       │                                │
   │  ← { hash: "330c833..." }             │                                │
```

---

## Phase 3: On-Chain Execution

When the transaction lands on Stellar, here's what the runtime does:

```
Stellar Validator receives transaction
│
├─ Verify envelope signature: bundler (GBL4F...) ✓
│
├─ Execute Operation: invokeHostFunction
│   │
│   ├─ Run counter.increment(CD37YWN...)
│   │   │
│   │   └─ require_auth(CD37YWN...)
│   │       │
│   │       └─ CD37YWN is a C-address → call __check_auth
│   │
│   └─ smart_account.__check_auth(payload_hash, signatures, contexts)
│       │
│       ├─ Phase 1: AUTHENTICATE
│       │   │
│       │   │  signatures = Map { External(CBNCF7Q, 64c301fb) → sig_data }
│       │   │
│       │   │  External signer → cross-contract call to verifier:
│       │   │
│       │   └─ verifier.verify(payload_hash, pubkey, sig_data)
│       │       │
│       │       ├─ Decode sig_data → { prefixed_message, signature }
│       │       │
│       │       ├─ Check 1: prefixed_message starts with
│       │       │            "Stellar Smart Account Auth:\n" ✓
│       │       │
│       │       ├─ Check 2: hex portion matches SHA256(payload_hash) ✓
│       │       │            "8fa814c0b44fb9c442..." == hex(payload_hash)
│       │       │
│       │       ├─ Check 3: ed25519_verify(pubkey, prefixed_message, signature) ✓
│       │       │            Pure cryptographic verification
│       │       │
│       │       └─ return true ✓
│       │
│       ├─ Phase 2: VALIDATE CONTEXTS
│       │   │
│       │   │  Context: CallContract(counter, "increment", [CD37YWN])
│       │   │
│       │   ├─ Look up rules for CallContract(CBRCNPT...)
│       │   │  → Found Rule #0!
│       │   │
│       │   ├─ Rule requires signer: External(CBNCF7Q, 64c301fb)
│       │   │  Transaction has signer: External(CBNCF7Q, 64c301fb) ✓
│       │   │
│       │   └─ All signers matched, no policies → VALID ✓
│       │
│       ├─ Phase 3: ENFORCE POLICIES
│       │   │
│       │   └─ policies is empty → skip ✓
│       │
│       └─ return Ok(()) → Authorization approved! ✓
│
├─ counter.increment executes:
│   count = storage.get("count") → 4
│   count = 5
│   storage.set("count", 5)
│   return 5
│
└─ Transaction SUCCESS ✓
    Hash: 330c833977858e014a6ffb27201b1457ce37bc35d491af0a5265be6c3d39bd34
```

---

## The Signature Chain of Trust

```
                    What the user sees in Phantom:
                    ┌─────────────────────────────────────────┐
                    │ "Stellar Smart Account Auth:\n          │
                    │  8fa814c0b44fb9c442b10b1c46f8758b..."   │
                    └────────────────────┬────────────────────┘
                                         │
                                    signed by
                                         │
                    ┌────────────────────▼────────────────────┐
                    │         Phantom Private Key              │
                    │   (never leaves the browser extension)   │
                    └────────────────────┬────────────────────┘
                                         │
                                    produces
                                         │
┌────────────────────────────────────────▼────────────────────────────────────┐
│                          64-byte Ed25519 Signature                          │
│  "2695b9fd100f20f01e70f06287afc9a7f209a16ab0b0cac25fba99dca1c93753..."     │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                   verified by
                                         │
                    ┌────────────────────▼────────────────────┐
                    │   Ed25519 Verifier Contract (on-chain)   │
                    │   • Validates prefix format              │
                    │   • Validates hex matches payload hash   │
                    │   • Verifies ed25519 signature           │
                    │   • Returns true                         │
                    └────────────────────┬────────────────────┘
                                         │
                                   trusted by
                                         │
                    ┌────────────────────▼────────────────────┐
                    │   Smart Account's Context Rule           │
                    │   "External(verifier, pubkey) can call   │
                    │    the counter contract"                  │
                    └────────────────────┬────────────────────┘
                                         │
                                   authorizes
                                         │
                    ┌────────────────────▼────────────────────┐
                    │   counter.increment(smart_account)       │
                    │   count: 4 → 5                           │
                    └─────────────────────────────────────────┘
```

---

## Key Concepts Explained

### Why does the verifier work with any Ed25519 signer?

The verifier is a **pure math contract**. It doesn't know about Phantom, Solana, or Stellar. It receives:
- A 32-byte public key
- A message (the prefixed auth payload)
- A 64-byte signature

Then it calls `e.crypto().ed25519_verify(pubkey, message, signature)` — standard Ed25519 cryptography. If the math checks out, it returns `true`.

This means the **same verifier** works with:
- Phantom (Solana wallet — Ed25519)
- Any Stellar G-address (also Ed25519)
- An SSH ed25519 key
- Any key generated offline

For **secp256k1** wallets (MetaMask, Rabby), you'd deploy a different verifier contract that does ECDSA math instead. The smart account doesn't care — it just calls `verifier.verify()`.

### What are context rules?

Context rules are the smart account's **permission system**. They define WHO can do WHAT:

```
WHO:  Signer = External(verifier_contract, public_key_bytes)
WHAT: ContextRuleType = CallContract(target_contract_address)
```

You can have multiple rules for different contracts, different signers, and different policies (spending limits, time restrictions, multisig thresholds).

Without a matching context rule, the smart account returns error #3002 (UnvalidatedContext) — "I don't have a rule that allows this action by this signer."

### What's the difference between Recording and Enforcing simulation?

| | Recording Mode | Enforcing Mode |
|---|---|---|
| **When** | First simulation (build step) | Second simulation (submit step) |
| **Auth entries** | Returns unsigned templates | Validates signed entries |
| **Footprint** | Approximate (doesn't know sig verification cost) | Accurate (runs full __check_auth) |
| **Fees** | Placeholder | Correct |
| **Purpose** | "What needs to be authorized?" | "Is the authorization valid?" |

### Why does the bundler sign the transaction?

The bundler (server-side keypair) is the **transaction source** — the account that pays network fees. The user via Phantom only signs the **authorization entry** (Method 2: Auth-Entry Signing). This separation means:
- The user never needs XLM for fees
- The user never needs a Stellar G-address
- A service (the bundler) sponsors all transaction costs

This is the core of the **fee abstraction** pattern: users authorize actions, sponsors pay for execution.

---

## Deployed Contracts (Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| Ed25519 Verifier | `CBNCF7QBTMIAEIZ3H6EN6JU5RDLBTFZZKGSWPAXW6PGPNY3HHIW5HKCH` | Verifies Ed25519 signatures with prefix |
| Counter | `CBRCNPTZ7YPP5BCGF42QSUWPYZQW6OJDPNQ4HDEYO7VI5Z6AVWWNEZ2U` | Target contract (increment/get) |
| Smart Account | Per-user, deterministic | User's C-address, deployed on first connect |

---

## Running the Demo

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Open http://localhost:3000/demo in your browser
# Ensure the Phantom wallet extension is installed
```

### Demo Steps
1. Click **"Connect Phantom & Create Smart Account"**
2. Approve the Phantom connection popup
3. Wait for smart account deployment (~20 seconds)
4. Click **"Execute via Smart Account"**
5. Sign the authorization message in Phantom
6. Wait for on-chain confirmation (~6 seconds)
7. See the counter value and transaction hash

### Verify on Explorer
Each successful transaction links to [Stellar Expert](https://stellar.expert/explorer/testnet) where you can see:
- The bundler as transaction source (pays fees)
- The smart account as the authorized invoker
- The counter contract invocation
- Diagnostic events from `__check_auth`
