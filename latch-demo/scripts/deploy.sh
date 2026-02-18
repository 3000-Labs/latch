#!/bin/bash
set -e

NETWORK="testnet"
SOURCE="franky"

echo "=== Building contracts ==="
cd "$(dirname "$0")/.."
~/.cargo/bin/cargo build --target wasm32-unknown-unknown --release

echo ""
echo "=== Deploying Ed25519 Verifier ==="
VERIFIER=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/ed25519_verifier.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "Verifier: $VERIFIER"

echo ""
echo "=== Deploying Counter ==="
COUNTER=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/counter.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "Counter: $COUNTER"

echo ""
echo "=== Deploying Smart Account ==="
SMART_ACCOUNT=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/smart_account.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "Smart Account: $SMART_ACCOUNT"

echo ""
echo "=== DEPLOYED ADDRESSES ==="
echo "VERIFIER_ADDRESS=$VERIFIER"
echo "COUNTER_ADDRESS=$COUNTER"
echo "SMART_ACCOUNT_ADDRESS=$SMART_ACCOUNT"

# Write to .env file
cat > .env << EOF
VERIFIER_ADDRESS=$VERIFIER
COUNTER_ADDRESS=$COUNTER
SMART_ACCOUNT_ADDRESS=$SMART_ACCOUNT
NETWORK=testnet
RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
EOF

echo ""
echo "Addresses written to .env"
echo ""
echo "=== NEXT STEPS ==="
echo "1. Fund the smart account: stellar contract invoke ... or use Friendbot"
echo "2. Initialize with your Phantom pubkey:"
echo "   stellar contract invoke --id \$SMART_ACCOUNT_ADDRESS --source $SOURCE --network $NETWORK \\"
echo "     -- initialize \\"
echo "     --verifier \$VERIFIER_ADDRESS \\"
echo "     --public_key <PHANTOM_PUBKEY_HEX> \\"
echo "     --counter \$COUNTER_ADDRESS"
