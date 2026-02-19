# Phantom → Stellar Smart Account Demo Guide
## Sign a Stellar transaction using your Phantom wallet (Ed25519)

---

## What You're Building

A web app where a user connects their **Phantom wallet** (Solana) and uses it to authorize
an action on **Stellar** — specifically incrementing a counter contract. No Stellar wallet
needed. No seed phrases. Just Phantom.

The flow:
1. User connects Phantom
2. App constructs a Stellar transaction
3. Phantom signs the payload (Ed25519 — same curve Stellar uses natively)
4. Signature is verified by the OZ Ed25519 verifier contract on Stellar
5. Smart account authorizes the call, counter increments

---

## Prerequisites

```bash
# Rust (nightly — required for Soroban)
rustup default nightly
rustup target add wasm32-unknown-unknown

# Stellar CLI
cargo install --locked stellar-cli --features opt

# Node.js 18+ for the frontend
node --version

# Fund a deploy wallet on testnet
stellar keys generate deployer --network testnet --fund
stellar keys address deployer  # save this address
```

Verify your setup:
```bash
stellar --version
stellar keys ls
```

---

## Part 1: The Contracts

### Project Structure

```
phantom-stellar-demo/
├── contracts/
│   ├── ed25519-verifier/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   ├── smart-account/
│   │   ├── Cargo.toml
│   │   └── src/lib.rs
│   └── counter/
│       ├── Cargo.toml
│       └── src/lib.rs
├── Cargo.toml          (workspace)
├── frontend/
│   ├── index.html
│   └── app.js
└── scripts/
    └── deploy.sh
```

### Workspace Cargo.toml

```toml
[workspace]
members = [
    "contracts/ed25519-verifier",
    "contracts/smart-account",
    "contracts/counter",
]
resolver = "2"

[workspace.dependencies]
soroban-sdk = { version = "22.0.0", features = ["alloc"] }
stellar-accounts = { git = "https://github.com/OpenZeppelin/stellar-contracts", package = "stellar-accounts" }
```

---

### Contract 1: Ed25519 Verifier

This is the cryptographic oracle. It implements the OZ `Verifier` trait and validates
prefixed Ed25519 signatures. It's stateless and immutable.

**How it works:** Phantom can't sign raw 32-byte hashes (they look like Solana tx hashes).
So we prefix with `"Stellar Smart Account Auth:\n"` + hex(hash). The verifier validates
this format on-chain, then checks the Ed25519 signature.

**contracts/ed25519-verifier/Cargo.toml**
```toml
[package]
name = "ed25519-verifier"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }
stellar-accounts = { workspace = true }

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
```

**contracts/ed25519-verifier/src/lib.rs**
```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, xdr::FromXdr, Bytes, BytesN, Env};
use stellar_accounts::verifiers::Verifier;

const AUTH_PREFIX: &[u8] = b"Stellar Smart Account Auth:\n";
const PREFIX_LEN: usize = 28;
const PAYLOAD_LEN: usize = 32;
const HEX_LEN: usize = 64;
const TOTAL_LEN: usize = PREFIX_LEN + HEX_LEN; // 92 bytes

#[contract]
pub struct Ed25519Verifier;

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
    /// sig_data contains { prefixed_message, signature } XDR-encoded.
    /// prefixed_message = "Stellar Smart Account Auth:\n" + hex(signature_payload)
    fn verify(
        e: &Env,
        signature_payload: Bytes,    // 32-byte auth payload hash
        key_data: Self::KeyData,      // 32-byte public key
        sig_data: Self::SigData,      // XDR-encoded Ed25519SigData
    ) -> bool {
        let sig_struct: Ed25519SigData =
            Ed25519SigData::from_xdr(e, &sig_data).expect("invalid sig_data");

        let public_key: BytesN<32> = key_data.try_into().expect("key must be 32 bytes");

        // Validate format: PREFIX + hex(payload)
        let prefixed_msg_buf = sig_struct.prefixed_message.to_buffer::<TOTAL_LEN>();
        let msg = prefixed_msg_buf.as_slice();

        assert!(&msg[0..PREFIX_LEN] == AUTH_PREFIX, "missing prefix");

        let payload_array = signature_payload.to_buffer::<PAYLOAD_LEN>();
        let mut expected_hex = [0u8; HEX_LEN];
        hex_encode(&mut expected_hex, payload_array.as_slice());
        assert!(&msg[PREFIX_LEN..TOTAL_LEN] == &expected_hex[..], "hex mismatch");

        // Verify Ed25519 signature over the full prefixed message
        e.crypto().ed25519_verify(&public_key, &sig_struct.prefixed_message, &sig_struct.signature);
        true
    }
}

fn hex_encode(dst: &mut [u8], src: &[u8]) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for (i, &byte) in src.iter().enumerate() {
        dst[i * 2] = HEX[(byte >> 4) as usize];
        dst[i * 2 + 1] = HEX[(byte & 0x0f) as usize];
    }
}
```

---

### Contract 2: Counter (Target Contract)

The thing being authorized. Dead simple — just a number that goes up.

**contracts/counter/Cargo.toml**
```toml
[package]
name = "counter"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
```

**contracts/counter/src/lib.rs**
```rust
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

    pub fn get(e: Env) -> u32 {
        let key = symbol_short!("count");
        e.storage().persistent().get(&key).unwrap_or(0)
    }
}
```

---

### Contract 3: Smart Account

This is the C-address. It holds the context rule that says:
"Ed25519 key [phantom pubkey] is allowed to call any function on the counter contract."

**contracts/smart-account/Cargo.toml**
```toml
[package]
name = "smart-account"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }
stellar-accounts = { workspace = true }

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
```

**contracts/smart-account/src/lib.rs**
```rust
#![no_std]
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    Address, Bytes, BytesN, Env, Map, String, Val, Vec,
};
use stellar_accounts::smart_account::{
    add_context_rule, do_check_auth,
    ContextRule, ContextRuleType, Signatures, Signer,
};

#[contract]
pub struct MySmartAccount;

// ── CustomAccountInterface ──────────────────────────────────────────────────

#[contractimpl]
impl CustomAccountInterface for MySmartAccount {
    type Signature = Signatures;

    fn __check_auth(
        e: Env,
        payload: BytesN<32>,
        signatures: Signatures,
        auth_contexts: Vec<Context>,
    ) -> Result<(), soroban_sdk::Error> {
        do_check_auth(&e, &payload, &signatures, &auth_contexts)?;
        Ok(())
    }
}

// ── SmartAccount trait ──────────────────────────────────────────────────────
// Delegates everything to the storage module functions.
// NOTE: storage fns take refs; trait fns take owned values — we pass refs where needed.

#[contractimpl]
impl stellar_accounts::smart_account::SmartAccount for MySmartAccount {
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
        // storage::add_context_rule takes all refs
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
        // storage::add_signer takes &Signer
        stellar_accounts::smart_account::add_signer(e, context_rule_id, &signer)
    }

    fn remove_signer(e: &Env, context_rule_id: u32, signer: Signer) {
        stellar_accounts::smart_account::remove_signer(e, context_rule_id, &signer)
    }

    fn add_policy(e: &Env, context_rule_id: u32, policy: Address, install_param: Val) {
        // storage::add_policy takes &Address
        stellar_accounts::smart_account::add_policy(e, context_rule_id, &policy, install_param)
    }

    fn remove_policy(e: &Env, context_rule_id: u32, policy: Address) {
        stellar_accounts::smart_account::remove_policy(e, context_rule_id, &policy)
    }
}

// ── Initialization ──────────────────────────────────────────────────────────

#[contractimpl]
impl MySmartAccount {
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

        // storage::add_context_rule takes all refs
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
```

---

## Part 2: Build & Deploy

### Build All Contracts

```bash
# From project root
stellar contract build

# Or individually:
cargo build --target wasm32-unknown-unknown --release \
  -p ed25519-verifier \
  -p smart-account \
  -p counter
```

WASM files will be at:
```
target/wasm32-unknown-unknown/release/ed25519_verifier.wasm
target/wasm32-unknown-unknown/release/smart_account.wasm
target/wasm32-unknown-unknown/release/counter.wasm
```

---

### scripts/deploy.sh

```bash
#!/bin/bash
set -e

NETWORK="testnet"
SOURCE="deployer"

echo "=== Deploying Ed25519 Verifier ==="
VERIFIER=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/ed25519_verifier.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "Verifier: $VERIFIER"

echo "=== Deploying Counter ==="
COUNTER=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/counter.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "Counter: $COUNTER"

echo "=== Deploying Smart Account ==="
SMART_ACCOUNT=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/smart_account.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "Smart Account: $SMART_ACCOUNT"

echo ""
echo "=== SAVE THESE ADDRESSES ==="
echo "VERIFIER_ADDRESS=$VERIFIER"
echo "COUNTER_ADDRESS=$COUNTER"
echo "SMART_ACCOUNT_ADDRESS=$SMART_ACCOUNT"

# Write to .env for frontend
cat > frontend/.env << EOF
VITE_VERIFIER_ADDRESS=$VERIFIER
VITE_COUNTER_ADDRESS=$COUNTER
VITE_SMART_ACCOUNT_ADDRESS=$SMART_ACCOUNT
VITE_NETWORK=testnet
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
EOF

echo ""
echo ".env written to frontend/.env"
echo ""
echo "=== NEXT STEP ==="
echo "Run initialize after connecting Phantom to get the public key:"
echo "stellar contract invoke --id \$SMART_ACCOUNT --source $SOURCE --network $NETWORK \\"
echo "  -- initialize \\"
echo "  --verifier \$VERIFIER \\"
echo "  --public_key <PHANTOM_PUBKEY_HEX> \\"
echo "  --counter \$COUNTER"
```

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

---

## Part 3: Gas Sponsorship

Yes — you're right, this is required. The smart account (C-address) needs XLM for
transaction fees, but new users won't have any. The solution is a **fee bump transaction**
where a sponsor (your backend or a funded wallet) wraps the user's transaction and pays the fee.

### How It Works

```
User transaction (signed by Phantom via smart account)
    └── wrapped in FeeBump transaction
            └── signed & paid by your SPONSOR_ACCOUNT
```

The user never needs XLM. The sponsor pays. In your demo this is just a funded testnet
wallet. In production it's a relayer service.

### Sponsor Account Setup

```bash
# Create and fund a sponsor key on testnet
stellar keys generate sponsor --network testnet --fund
stellar keys address sponsor  # add to .env as VITE_SPONSOR_KEY
```

> For production, never expose the sponsor private key in frontend code.
> Route fee bump transactions through a backend API endpoint instead.

---

## Part 4: Signature Generation (The Key Part)

This is the trickiest piece. The signature must match exactly what the on-chain
verifier expects: a **prefixed message** containing the hex-encoded payload hash.

### The Flow

```
1. Build Stellar transaction
2. Compute the authorization payload hash (32 bytes)
3. Create prefixed message: "Stellar Smart Account Auth:\n" + hex(hash)
4. Ask Phantom to sign the prefixed message → get 64-byte signature
5. Package prefixed_message + signature into Ed25519SigData struct
6. Set on auth entry with Signer::External format
7. Enforcing Mode simulation validates everything
8. Submit
```

### Frontend: app.js

```javascript
import { Connection, PublicKey } from '@solana/web3.js';
import {
  StellarSdk,
  Contract,
  TransactionBuilder,
  Networks,
  Operation,
  xdr,
  Address,
  hash,
  StrKey,
} from '@stellar/stellar-sdk';
import { SorobanRpc } from '@stellar/stellar-sdk';

const RPC_URL = import.meta.env.VITE_RPC_URL;
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE;
const COUNTER_ADDRESS = import.meta.env.VITE_COUNTER_ADDRESS;
const SMART_ACCOUNT_ADDRESS = import.meta.env.VITE_SMART_ACCOUNT_ADDRESS;
const VERIFIER_ADDRESS = import.meta.env.VITE_VERIFIER_ADDRESS;

const server = new SorobanRpc.Server(RPC_URL);

// ─── Step 1: Connect Phantom ────────────────────────────────────────────────

async function connectPhantom() {
  if (!window.solana?.isPhantom) {
    alert('Phantom wallet not found. Install it from phantom.app');
    return null;
  }
  const response = await window.solana.connect();
  const pubkey = response.publicKey; // Solana PublicKey object
  console.log('Phantom connected:', pubkey.toString());
  
  // Solana pubkeys ARE 32-byte Ed25519 keys — same format Stellar uses
  const pubkeyBytes = pubkey.toBytes(); // Uint8Array(32)
  return { pubkey, pubkeyBytes };
}

// ─── Step 2: Build the transaction ─────────────────────────────────────────

async function buildIncrementTx(smartAccountAddress) {
  // The smart account IS the caller — it's the C-address authorizing the call
  const account = await server.getAccount(smartAccountAddress);
  
  const tx = new TransactionBuilder(account, {
    fee: '1000000', // high fee — will be covered by fee bump
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: COUNTER_ADDRESS,
        function: 'increment',
        args: [
          // caller = the smart account address
          new Address(smartAccountAddress).toScVal(),
        ],
      })
    )
    .setTimeout(300)
    .build();

  return tx;
}

// ─── Step 3: Simulate & get auth payload ───────────────────────────────────

async function simulateAndGetPayload(tx) {
  const simResult = await server.simulateTransaction(tx);
  
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  // Extract the auth entry for the smart account
  const authEntry = simResult.result.auth[0];
  const credentials = authEntry.credentials().address();
  const nonce = credentials.nonce();
  
  // Ledger validity window — give 5 minutes (roughly 60 ledgers)
  const latestLedger = simResult.latestLedger;
  const validUntilLedger = latestLedger + 60;
  credentials.signatureExpirationLedger(validUntilLedger);

  // Compute the payload hash that needs to be signed
  // This is what Phantom will sign
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: Buffer.from(hash(Buffer.from(NETWORK_PASSPHRASE))),
      nonce: nonce,
      signatureExpirationLedger: validUntilLedger,
      invocation: authEntry.rootInvocation(),
    })
  );

  const payloadHash = hash(preimage.toXDR()); // 32 bytes — this is what gets signed

  return { tx, authEntry, payloadHash, validUntilLedger };
}

// ─── Step 4: Sign with Phantom ─────────────────────────────────────────────

async function signWithPhantom(payloadHashHex) {
  // Prefix required: Phantom blocks raw 32-byte messages
  const AUTH_PREFIX = "Stellar Smart Account Auth:\n";
  const prefixedMessage = AUTH_PREFIX + payloadHashHex;
  const messageBytes = new TextEncoder().encode(prefixedMessage);

  // Phantom popup appears — user sees the prefixed message
  const { signature } = await window.solana.signMessage(messageBytes);
  
  console.log('Signature from Phantom:', Buffer.from(signature).toString('hex'));
  return { signature, prefixedMessage }; // 64-byte sig + the full message
}

// ─── Step 5: Build the auth entry ─────────────────────────────────────────

function buildSignedAuthEntry(authEntry, phantomPubkeyBytes, signatureBytes, prefixedMessage) {
  // Build Ed25519SigData struct: { prefixed_message, signature }
  const sigDataMap = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('prefixed_message'),
      val: xdr.ScVal.scvBytes(Buffer.from(prefixedMessage, 'utf-8')),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signature'),
      val: xdr.ScVal.scvBytes(Buffer.from(signatureBytes)),
    }),
  ]);
  const sigDataBytes = xdr.ScVal.scvBytes(sigDataMap.toXDR());

  // Build Signer::External(verifier_address, public_key)
  const signerKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('External'),
    new Address(VERIFIER_ADDRESS).toScVal(),
    xdr.ScVal.scvBytes(Buffer.from(phantomPubkeyBytes)),
  ]);

  const sigInnerMap = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: signerKey,
      val: sigDataBytes,  // XDR-encoded Ed25519SigData
    }),
  ]);

  // Set the signature on the auth entry
  authEntry.credentials().address().signature(xdr.ScVal.scvVec([sigInnerMap]));
  return authEntry;
}

// ─── Step 6: Fee bump (gas sponsorship) ────────────────────────────────────

async function wrapWithFeeBump(innerTx, sponsorKeypair) {
  // Rebuild inner tx with the auth entry attached
  const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
    sponsorKeypair,
    '2000000', // max fee in stroops (sponsor pays this)
    innerTx,
    NETWORK_PASSPHRASE,
  );
  feeBumpTx.sign(sponsorKeypair);
  return feeBumpTx;
}

// ─── Main: Wire it all together ────────────────────────────────────────────

async function runDemo() {
  document.getElementById('status').textContent = 'Connecting Phantom...';
  
  const { pubkey, pubkeyBytes } = await connectPhantom();
  document.getElementById('pubkey').textContent = pubkey.toString();

  document.getElementById('status').textContent = 'Building transaction...';
  const tx = await buildIncrementTx(SMART_ACCOUNT_ADDRESS);

  document.getElementById('status').textContent = 'Simulating...';
  const { authEntry, payloadHash, validUntilLedger } = await simulateAndGetPayload(tx);

  document.getElementById('status').textContent = 'Waiting for Phantom signature...';
  const signature = await signWithPhantom(payloadHash, pubkey);

  document.getElementById('status').textContent = 'Building auth entry...';
  const signedAuth = buildSignedAuthEntry(authEntry, pubkeyBytes, signature);

  // Attach auth to transaction
  // Re-assemble the transaction with the signed auth entry
  // (stellar-sdk SorobanRpc.assembleTransaction handles this)
  const assembledTx = SorobanRpc.assembleTransaction(tx, [signedAuth]).build();

  // NOTE: For demo purposes, sign with sponsor keypair directly
  // In production, send to backend for fee bump
  document.getElementById('status').textContent = 'Submitting...';
  
  const result = await server.sendTransaction(assembledTx);
  console.log('Transaction submitted:', result.hash);

  // Poll for result
  let txResult;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    txResult = await server.getTransaction(result.hash);
    if (txResult.status !== 'NOT_FOUND') break;
  }

  if (txResult?.status === 'SUCCESS') {
    const count = await server.simulateTransaction(
      new TransactionBuilder(await server.getAccount(SMART_ACCOUNT_ADDRESS), {
        fee: '100', networkPassphrase: NETWORK_PASSPHRASE
      })
      .addOperation(Operation.invokeContractFunction({
        contract: COUNTER_ADDRESS, function: 'get', args: []
      }))
      .setTimeout(30).build()
    );
    document.getElementById('count').textContent = 
      `Counter is now: ${count.result?.retval?.value()}`;
    document.getElementById('status').textContent = '✅ Success!';
  } else {
    document.getElementById('status').textContent = `❌ Failed: ${txResult?.resultXdr}`;
  }
}

document.getElementById('btn').addEventListener('click', runDemo);
```

### frontend/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Phantom → Stellar Smart Account Demo</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; }
    button { background: #ab9ff2; color: white; border: none; padding: 14px 28px;
             border-radius: 8px; font-size: 16px; cursor: pointer; }
    button:hover { background: #9b8ee0; }
    #status { margin-top: 20px; font-size: 14px; color: #555; }
    #count  { margin-top: 10px; font-size: 24px; font-weight: bold; }
    #pubkey { font-size: 11px; color: #888; word-break: break-all; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>Phantom → Stellar</h1>
  <p>Use your Phantom wallet to authorize a transaction on Stellar. No Stellar wallet needed.</p>
  <button id="btn">Connect Phantom & Increment Counter</button>
  <div id="pubkey"></div>
  <div id="status"></div>
  <div id="count"></div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

---

## Part 5: Initialize the Smart Account

After deploying contracts AND after the user connects Phantom (so you have their pubkey),
call `initialize` once to register their key:

```bash
# Convert Phantom pubkey (base58) to hex first
# In JS: Buffer.from(pubkey.toBytes()).toString('hex')

stellar contract invoke \
  --id $SMART_ACCOUNT_ADDRESS \
  --source deployer \
  --network testnet \
  -- initialize \
  --verifier $VERIFIER_ADDRESS \
  --public_key <32_BYTE_HEX_PUBKEY> \
  --counter $COUNTER_ADDRESS
```

For the actual demo, call `initialize` from JS after Phantom connects the first time
(check if already initialized first by reading contract storage).

---

## Part 6: Gas Sponsorship in Production

For the demo, two approaches:

**Option A — Friendbot funded deployer (easiest for demo)**
Keep a testnet-funded keypair in your backend. Every transaction gets fee-bumped
by that keypair. Fine for testnet, obviously not production.

**Option B — Fee Abstraction (the proper way)**
OpenZeppelin ships a `fee-abstraction` package in the same repo. It lets users pay
fees in USDC while a relayer covers XLM. This is the production answer and maps
directly to the RFP requirement. Worth mentioning in your pitch even if you demo
Option A.

```
packages/fee-abstraction/  ← already exists in the OZ repo
```

---

## Common Issues

**"Simulation failed: account not found"**
The smart account C-address needs a minimum XLM balance to exist on-chain. After
deploying, fund it:
```bash
stellar account fund $SMART_ACCOUNT_ADDRESS --network testnet
# or use Friendbot: https://friendbot.stellar.org?addr=$SMART_ACCOUNT_ADDRESS
```

**"Phantom signMessage returns different bytes than expected"**
Phantom signs over the exact bytes you pass to `signMessage()`. We pass a **prefixed
message** (`"Stellar Smart Account Auth:\n" + hex(hash)`) — 92 bytes total. The
on-chain verifier validates this exact format. Never pass raw 32-byte hashes to
Phantom (they'll be blocked as potential Solana tx hash phishing).

**"ExternalVerificationFailed"**
The signature bytes don't match. Double-check:
- pubkey is 32 bytes (Solana pubkeys are natively 32 bytes ✓)
- signature is 64 bytes (Ed25519 signatures are natively 64 bytes ✓)
- payload passed to Phantom matches exactly what the verifier checks

**Rust compilation errors with stellar-accounts**
The OZ library is in active development. If the API doesn't match, check the
actual source in `packages/accounts/src/smart_account/mod.rs` and adjust your
contract accordingly.

---

## Demo Script (What to Say)

1. *"This is a regular Phantom wallet — same one Solana users already have."*
2. *"We're going to authorize a transaction on Stellar. Watch — no Stellar wallet."*
3. [click button] *"Phantom pops up. The user signs exactly like they do on Solana."*
4. [approve] *"That's it. The Ed25519 verifier on Stellar confirmed the signature."*
5. *"The smart account authorized the call. Counter incremented on Stellar."*
6. *"This user never created a Stellar account. Never touched XLM. Never saw a seed phrase."*
7. *"This is the wishlist item from the RFP — and it works today."*

---

## Resources

- OZ Stellar Contracts: https://github.com/OpenZeppelin/stellar-contracts
- Stellar CLI Docs: https://developers.stellar.org/docs/tools/stellar-cli
- Soroban SDK: https://docs.rs/soroban-sdk
- Phantom signMessage: https://docs.phantom.app/solana/signing-a-message
- Fee Bump Transactions: https://developers.stellar.org/docs/learn/transactions/fee-bump
- Friendbot (testnet funding): https://friendbot.stellar.org
