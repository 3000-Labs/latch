> ## Documentation Index
> Fetch the complete documentation index at: https://docs.phantom.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Browser SDK

> Vanilla JavaScript SDK for Phantom Connect integration.

The Phantom Connect Browser SDK provides a framework-agnostic JavaScript/TypeScript interface for connecting to existing Phantom user wallets in web apps.

### Quick start

Generate a new Solana project using the **Phantom Embedded JS Starter** template.

<Tabs>
  <Tab title="npm">
    ```bash  theme={null}
    npx -y create-solana-dapp@latest -t solana-foundation/templates/community/phantom-embedded-js
    ```
  </Tab>

  <Tab title="pnpm">
    ```bash  theme={null}
    pnpm create solana-dapp@latest -t solana-foundation/templates/community/phantom-embedded-js
    ```
  </Tab>

  <Tab title="yarn">
    ```bash  theme={null}
    yarn create solana-dapp -t solana-foundation/templates/community/phantom-embedded-js
    ```
  </Tab>

  <Tab title="bun">
    ```bash  theme={null}
    bun create solana-dapp@latest -t solana-foundation/templates/community/phantom-embedded-js
    ```
  </Tab>
</Tabs>

Run the command above in your terminal to get started.

[View template on Solana Templates →](https://solana.com/developers/templates/phantom-embedded-js)

***

## Features

* **Non-custodial**: Full user control of private keys for both injected and embedded wallets.
* **Dual provider support**: Works with Phantom browser extension or creates embedded wallets.
* **Chain-specific APIs**: Dedicated interfaces for Solana and Ethereum operations.
* **Native transactions**: Work with blockchain-native objects, not base64url strings.
* **Multi-chain**: Solana and Ethereum support with dedicated methods.
* **TypeScript**: Full type safety for all transaction formats.
* **Unified API**: Same interface for both injected and embedded providers.
* **Multiple auth methods**: Google, Apple, and browser extension.

## Security

The Phantom Connect Browser SDK connects to existing Phantom user wallets, ensuring:

* Users control their own wallets and private keys.
* Users maintain full control of their assets.
* Integration with Phantom's secure wallet infrastructure.
* No private key handling in your app.

## Prerequisites

* Register your app: Sign up or log in to the [Phantom Portal](https://phantom.com/portal/) and register your app.
* Obtain your App ID:
  * In Phantom Portal, expand your app in the left navigation, then select **Set Up**.
  * Your App ID appears at the top of the page.
* Allowlist your domains and redirect URLs: Add your app's domains and redirect URLs in the Phantom Portal to enable wallet connections.

## Authentication providers

The SDK supports multiple authentication providers that you configure via the `providers` array:

### Available providers

| Provider     | Description                                          | Requires appId |
| ------------ | ---------------------------------------------------- | -------------- |
| `"injected"` | Phantom browser extension                            | No             |
| `"google"`   | Google OAuth                                         | Yes            |
| `"apple"`    | Apple ID                                             | Yes            |
| `"deeplink"` | Deeplink to Phantom mobile app (mobile devices only) | Yes            |

### Configuration examples

**Injected provider only (browser extension)**

```typescript  theme={null}
const sdk = new BrowserSDK({
  providers: ["injected"], // Only allow browser extension
  addressTypes: [AddressType.solana, AddressType.ethereum],
});
```

**Multiple authentication methods**

```typescript  theme={null}
const sdk = new BrowserSDK({
  providers: ["google", "apple", "injected", "deeplink"], // Allow all methods
  addressTypes: [AddressType.solana, AddressType.ethereum],
  appId: "your-app-id", // Required for embedded providers
  authOptions: {
    authUrl: "https://connect.phantom.app/login", // optional
    redirectUrl: "https://yourapp.com/callback", // optional, defaults to current page
  },
  autoConnect: true, // optional, auto-connect to existing session
});
```

**Mobile deeplink support**

The `"deeplink"` provider enables a button that opens the Phantom mobile app on mobile devices. This option only appears when the Phantom browser extension is not installed. When clicked, it redirects users to the Phantom mobile app to complete authentication.

```typescript  theme={null}
const sdk = new BrowserSDK({
  providers: ["google", "apple", "deeplink"], // Include deeplink for mobile support
  addressTypes: [AddressType.solana, AddressType.ethereum],
  appId: "your-app-id",
});
```

Notes about `redirectUrl`:

* Must be an existing page/route in your app.
* Must be allowlisted in your Phantom Portal app configuration.
* This is where users will be redirected after completing OAuth authentication.

## Installation

```bash  theme={null}
npm install @phantom/browser-sdk
```

## Quick start

### Injected provider (browser extension)

```typescript  theme={null}
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

// Connect to Phantom browser extension
const sdk = new BrowserSDK({
  providers: ["injected"], // Only allow browser extension
  addressTypes: [AddressType.solana, AddressType.ethereum],
});

const { addresses } = await sdk.connect({ provider: "injected" });
console.log("Connected addresses:", addresses);

// Chain-specific operations
const message = "Hello from Phantom!";
const solanaSignature = await sdk.solana.signMessage(message);

// Encode the message as hex for EVM
const encoded = "0x" + Buffer.from(message, "utf8").toString("hex");
const ethSignature = await sdk.ethereum.signPersonalMessage(encoded, addresses[1].address);
```

### Embedded provider (multiple auth methods)

```typescript  theme={null}
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

// Create embedded non-custodial wallet with multiple auth providers
const sdk = new BrowserSDK({
  providers: ["google", "apple"], // Allow Google and Apple OAuth
  addressTypes: [AddressType.solana, AddressType.ethereum],
  appId: "your-app-id", // Get your app ID from phantom.com/portal
});

const { addresses } = await sdk.connect({ provider: "google" });
console.log("Addresses:", addresses);

// Use chain-specific APIs
const solanaResult = await sdk.solana.signAndSendTransaction(mySolanaTransaction);
const ethResult = await sdk.ethereum.sendTransaction(myEthTransaction);
```

## Chain-specific APIs

The SDK provides separate interfaces for each blockchain with optimized methods:

### Solana chain (sdk.solana)

```typescript  theme={null}
// Message signing
const signature = await sdk.solana.signMessage("Hello Solana!");

// Transaction signing (without sending)
const signedTx = await sdk.solana.signTransaction(transaction);

// Sign and send transaction
const result = await sdk.solana.signAndSendTransaction(transaction);

// Network switching
await sdk.solana.switchNetwork('devnet');

// Utilities
const publicKey = await sdk.solana.getPublicKey();
const isConnected = sdk.solana.isConnected();
```

### Ethereum chain (sdk.ethereum)

<Info>
  EVM support for Phantom Connect embedded wallets will go live later in 2026.
</Info>

```typescript  theme={null}
// EIP-1193 requests
const accounts = await sdk.ethereum.request({ method: 'eth_accounts' });
const chainId = await sdk.ethereum.request({ method: 'eth_chainId' });

// Message signing
const signature = await sdk.ethereum.signPersonalMessage(message, address);

// EIP-712 typed data signing
const typedDataSignature = await sdk.ethereum.signTypedData(typedData, address);

// Transaction sending
const result = await sdk.ethereum.sendTransaction({
  to: "0x...",
  value: "1000000000000000000", // 1 ETH in wei
  gas: "21000",
});

// Network switching
await sdk.ethereum.switchChain(1); // Ethereum mainnet
await sdk.ethereum.switchChain(137); // Polygon

// Utilities
const chainId = await sdk.ethereum.getChainId();
const accounts = await sdk.ethereum.getAccounts();
const isConnected = sdk.ethereum.isConnected();
```

**Supported EVM Networks:**

| Network          | Chain ID   | Usage                            |
| ---------------- | ---------- | -------------------------------- |
| Ethereum Mainnet | `1`        | `ethereum.switchChain(1)`        |
| Ethereum Sepolia | `11155111` | `ethereum.switchChain(11155111)` |
| Polygon Mainnet  | `137`      | `ethereum.switchChain(137)`      |
| Polygon Amoy     | `80002`    | `ethereum.switchChain(80002)`    |
| Base Mainnet     | `8453`     | `ethereum.switchChain(8453)`     |
| Base Sepolia     | `84532`    | `ethereum.switchChain(84532)`    |
| Arbitrum One     | `42161`    | `ethereum.switchChain(42161)`    |
| Arbitrum Sepolia | `421614`   | `ethereum.switchChain(421614)`   |
| Monad Mainnet    | `143`      | `ethereum.switchChain(143)`      |
| Monad Testnet    | `10143`    | `ethereum.switchChain(10143)`    |

## Auto-Confirm (injected provider only)

The SDK provides Auto-Confirm functionality that allows automatic transaction confirmation for specified chains. This feature is only available when using the injected provider (Phantom browser extension).

```typescript  theme={null}
import { NetworkId } from "@phantom/browser-sdk";

// Enable auto-confirm for specific chains
const result = await sdk.enableAutoConfirm({
  chains: [NetworkId.SOLANA_MAINNET, NetworkId.ETHEREUM_MAINNET]
});

// Enable auto-confirm for all supported chains  
const result = await sdk.enableAutoConfirm();

// Disable auto-confirm
await sdk.disableAutoConfirm();

// Get current status
const status = await sdk.getAutoConfirmStatus();

// Get supported chains for auto-confirm
const supportedChains = await sdk.getSupportedAutoConfirmChains();
```

<Warning>
  Auto-confirm methods are only available for injected providers (Phantom browser extension). Calling these methods on embedded providers will throw an error.
</Warning>

## Extension detection

The SDK provides functions to check if the Phantom extension is installed:

```typescript  theme={null}
import { waitForPhantomExtension } from "@phantom/browser-sdk";

// Check if Phantom extension is available (with optional timeout in ms)
const isAvailable = await waitForPhantomExtension(5000);

if (isAvailable) {
  console.log("Phantom extension is available!");
} else {
  console.log("Phantom extension not found");
}
```

## Wallet discovery

The SDK can discover multiple injected wallets using Wallet Standard for Solana and EIP-6963 for Ethereum. This allows users to choose from any installed wallet that supports the configured address types.

### Discover wallets

Asynchronously discover all available injected wallets:

```typescript  theme={null}
// Discover wallets asynchronously
const wallets = await sdk.discoverWallets();

console.log("Discovered wallets:", wallets);
// Example output:
// [
//   {
//     id: "backpack",
//     name: "Backpack",
//     icon: "https://backpack.app/icon.png",
//     addressTypes: [AddressType.solana],
//     chains: ["solana:mainnet", "solana:devnet"]
//   },
//   {
//     id: "metamask-io",
//     name: "MetaMask",
//     icon: "https://metamask.io/icon.png",
//     addressTypes: [AddressType.ethereum],
//     chains: ["eip155:1", "eip155:5", "eip155:11155111"]
//   }
// ]
```

### Get discovered wallets

Get wallets from the internal registry (synchronous):

```typescript  theme={null}
// Get already discovered wallets
const wallets = sdk.getDiscoveredWallets();
```

## Event handlers

```typescript  theme={null}
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

const sdk = new BrowserSDK({
  providers: ["google", "apple"],
  appId: "your-app-id",
  addressTypes: [AddressType.solana],
});

// Fired when connection starts
sdk.on("connect_start", (data) => {
  console.log("Connection starting:", data.source); // "auto-connect" | "manual-connect"
});

// Fired when connection succeeds
sdk.on("connect", (data) => {
  console.log("Connected successfully!");
  console.log("Provider type:", data.provider);
  console.log("Addresses:", data.addresses);
  console.log("Status:", data.status);
});

// Fired when connection fails
sdk.on("connect_error", (data) => {
  console.error("Connection failed:", data.error);
  console.log("Source:", data.source);
});

// Fired when disconnected
sdk.on("disconnect", (data) => {
  console.log("Disconnected from wallet");
});

// Remove listeners when done
sdk.off("connect", handleConnect);
```

### Available events

| Event           | When fired            | Key data                                    |
| --------------- | --------------------- | ------------------------------------------- |
| `connect_start` | Connection initiated  | `source`, `authOptions`                     |
| `connect`       | Connection successful | `provider`, `addresses`, `status`, `source` |
| `connect_error` | Connection failed     | `error`, `source`                           |
| `disconnect`    | Disconnected          | `source`                                    |
| `error`         | General SDK errors    | Error details                               |

### Using events with autoConnect

```typescript  theme={null}
const sdk = new BrowserSDK({
  providers: ["google", "apple"],
  appId: "your-app-id",
  addressTypes: [AddressType.solana],
  autoConnect: true,
});

// Set up event listeners BEFORE autoConnect
sdk.on("connect", (data) => {
  console.log("Auto-connected successfully!");
  updateUIWithAddresses(data.addresses);
});

sdk.on("connect_error", (data) => {
  console.log("Auto-connect failed:", data.error);
  showConnectButton();
});

// Auto-connect will trigger events
await sdk.autoConnect();
```

## Debug configuration

The SDK provides dynamic debug configuration that can be changed at runtime:

```typescript  theme={null}
import { DebugLevel } from "@phantom/browser-sdk";

// Enable debug logging
sdk.enableDebug();

// Disable debug logging
sdk.disableDebug();

// Set debug level
sdk.setDebugLevel(DebugLevel.INFO);

// Set debug callback function
sdk.setDebugCallback((message) => {
  console.log(`[${message.category}] ${message.message}`, message.data);
});

// Configure all debug settings at once
sdk.configureDebug({
  enabled: true,
  level: DebugLevel.DEBUG,
  callback: (message) => {
    console.log(`[${message.level}] ${message.category}: ${message.message}`);
  },
});
```

### Debug levels

| Level              | Value | Description                       |
| ------------------ | ----- | --------------------------------- |
| `DebugLevel.ERROR` | 0     | Only error messages               |
| `DebugLevel.WARN`  | 1     | Warning and error messages        |
| `DebugLevel.INFO`  | 2     | Info, warning, and error messages |
| `DebugLevel.DEBUG` | 3     | All debug messages (most verbose) |

## Available AddressType values

| AddressType            | Supported chains                      |
| ---------------------- | ------------------------------------- |
| `AddressType.solana`   | Solana Mainnet, Devnet, Testnet       |
| `AddressType.ethereum` | Ethereum, Polygon, Arbitrum, and more |

## What you can do

<CardGroup cols={3}>
  <Card title="Connect to wallets" icon="plug" href="/sdks/browser-sdk/connect">
    Learn how to connect to Phantom embeded wallet with vanilla JavaScript
  </Card>

  <Card title="Sign messages" icon="signature" href="/sdks/browser-sdk/sign-messages">
    Implement message signing for authentication and verification
  </Card>

  <Card title="Sign and send transactions" icon="paper-plane" href="/sdks/browser-sdk/sign-and-send-transaction">
    Handle transaction signing and broadcasting across blockchains
  </Card>
</CardGroup>

## Starter kits and examples

Framework-agnostic JavaScript examples and templates:

<CardGroup cols={2}>
  <Card title="Browser SDK demo app" icon="globe" href="https://github.com/phantom/wallet-sdk/tree/main/examples/browser-sdk-demo-app">
    Full-featured vanilla JavaScript example with all SDK features
  </Card>

  <Card title="All examples" icon="github" href="https://github.com/phantom/wallet-sdk/tree/main/examples">
    Browse all example apps on GitHub
  </Card>

  <Card title="Code recipes" icon="book-open" href="/resources/recipes">
    Code snippets and implementation patterns
  </Card>

  <Card title="Interactive sandbox" icon="flask" href="/resources/sandbox">
    Test The Phantom Connect Browser SDK in our interactive sandbox
  </Card>
</CardGroup>

## Additional resources

<CardGroup cols={3}>
  <Card title="SDK overview" icon="book" href="/wallet-sdks-overview">
    Compare all Phantom SDKs and choose the right one
  </Card>

  <Card title="Phantom Connect" icon="link" href="/phantom-connect">
    Learn about authentication flows and user experience
  </Card>

  <Card title="JWT authentication" icon="key" href="/sdks/guides/wallet-authentication-with-jwts">
    Implement custom JWT-based authentication
  </Card>
</CardGroup>

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.phantom.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Connect

> Connect to Phantom wallets with the Browser SDK.

The Phantom Connect Browser SDK provides `sdk.connect()` to establish a connection to the wallet and access chain-specific operations.

<Info>
  **Learn about Phantom Connect**: For details about authentication flows, login, account selection, and session management, see the [Phantom Connect](/phantom-connect) guide.
</Info>

## Basic connection

### Connection flow

After instantiating the SDK, use `sdk.connect()` to establish a connection to the wallet:

```typescript  theme={null}
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

// 1. Create SDK instance with allowed providers
const sdk = new BrowserSDK({
  providers: ["google", "apple", "injected"], // Allowed auth providers
  addressTypes: [AddressType.solana, AddressType.ethereum],
  appId: "your-app-id", // Required when using embedded providers
});

// 2. Connect to wallet (provider parameter must be in allowed providers list)
const { addresses } = await sdk.connect({ provider: "google" });
console.log("Connected addresses:", addresses);

// 3. Use chain-specific methods
const signature = await sdk.solana.signMessage("Hello!");
const ethResult = await sdk.ethereum.sendTransaction({
  to: "0x...",
  value: "1000000000000000000",
  gas: "21000",
});
```

## Authentication providers

The `connect()` method requires a `provider` parameter and automatically switches between providers based on the authentication method you specify:

```typescript  theme={null}
// Connect with injected provider (Phantom extension)
// Automatically switches to injected provider if not already using it
await sdk.connect({ provider: "injected" });

// Connect with Google authentication (embedded provider)
// Automatically switches to embedded provider if not already using it
await sdk.connect({ provider: "google" });

// Connect with Apple authentication (embedded provider)
await sdk.connect({ provider: "apple" });
```

<Info>
  The `"deeplink"` provider opens the Phantom mobile app on mobile devices. It only appears when the Phantom extension is not installed. Include it in your `providers` array for mobile support.
</Info>

### Connecting to injected extension

The `injected` provider directly connects to the user's Phantom browser extension (not an embedded wallet). Before using this option, check if the extension is installed:

```typescript  theme={null}
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

const sdk = new BrowserSDK({
  providers: ["google", "apple", "injected"],
  addressTypes: [AddressType.solana, AddressType.ethereum],
  appId: "your-app-id",
});

// Check if Phantom extension is installed
const isInstalled = await sdk.isPhantomInstalled();

if (isInstalled) {
  // Connect directly to the extension wallet
  await sdk.connect({ provider: "injected" });
} else {
  // Fallback to embedded wallet with OAuth
  await sdk.connect({ provider: "google" });
}
```

When to use the `injected` provider:

* User wants to use their existing extension wallet directly.
* No embedded wallet creation needed.
* Direct access to extension accounts and balances.

## Configuration options

### SDK configuration

```typescript  theme={null}
const sdk = new BrowserSDK({
  // List of allowed authentication providers (REQUIRED)
  providers: ["google", "apple", "injected", "deeplink"],
  
  // Networks to enable
  addressTypes: [AddressType.solana, AddressType.ethereum],
  
  // Required when using embedded providers (google, apple, deeplink)
  appId: "your-app-id",
  
  // Optional configuration
  authOptions: {
    authUrl: "https://connect.phantom.app/login", // optional
    redirectUrl: "https://yourapp.com/auth/callback", // optional, defaults to current page
  },
  
  // Auto-connect to existing session (default: true when embedded providers are used)
  autoConnect: true,
});
```

Notes about `redirectUrl` (for embedded provider):

* Must be an existing page/route in your app.
* Must be allowlisted in your Phantom Portal app configuration.
* This is where users will be redirected after completing OAuth authentication.

## Chain-specific operations

After connection, use dedicated chain interfaces:

### Solana operations

```typescript  theme={null}
// Message signing
const signature = await sdk.solana.signMessage("Hello Solana!");

// Transaction signing (without sending)
const signedTx = await sdk.solana.signTransaction(transaction);

// Sign and send transaction
const result = await sdk.solana.signAndSendTransaction(transaction);

// Network switching (works on embedded for solana)
await sdk.solana.switchNetwork('devnet');

// Utilities
const publicKey = await sdk.solana.getPublicKey();
const isConnected = sdk.solana.isConnected();
```

### Ethereum operations

<Info>
  EVM support for Phantom Connect embedded wallets will go live later in 2026.
</Info>

```typescript  theme={null}
// EIP-1193 requests
const accounts = await sdk.ethereum.request({ method: 'eth_accounts' });
const chainId = await sdk.ethereum.request({ method: 'eth_chainId' });

// Message signing
const signature = await sdk.ethereum.signPersonalMessage(message, address);

// EIP-712 typed data signing
const typedDataSignature = await sdk.ethereum.signTypedData(typedData, address);

// Transaction sending
const result = await sdk.ethereum.sendTransaction({
  to: "0x...",
  value: "1000000000000000000", // 1 ETH in wei
  gas: "21000",
});

// Network switching
await sdk.ethereum.switchChain(1); // Ethereum mainnet
await sdk.ethereum.switchChain(137); // Polygon

// Utilities
const chainId = await sdk.ethereum.getChainId();
const accounts = await sdk.ethereum.getAccounts();
const isConnected = sdk.ethereum.isConnected();
```

## Auto-connect feature

The SDK can automatically reconnect to existing sessions when instantiated, providing a seamless user experience.

```typescript  theme={null}
const sdk = new BrowserSDK({
  providers: ["google", "apple"],
  addressTypes: [AddressType.solana],
  appId: "your-app-id",
  autoConnect: true, // Default: true when embedded providers are used, false for injected-only
});

// SDK will automatically check for existing valid session and connect in background
// No need to call connect() if user already has a session

// Check if already connected
if (sdk.isConnected()) {
  console.log("Already connected!");
  const addresses = await sdk.getAddresses();
} else {
  // First time or session expired, need to connect manually
  await sdk.connect({ provider: "google" });
}
```

### Disabling auto-connect

```typescript  theme={null}
const sdk = new BrowserSDK({
  providers: ["google", "apple"],
  appId: "your-app-id",
  addressTypes: [AddressType.solana],
  autoConnect: false, // Disable auto-connect
});

// Now you must manually call connect() every time
await sdk.connect({ provider: "google" });
```

### Auto-connect events

You can listen for connection events to update your UI accordingly:

```typescript  theme={null}
// Set up event listeners BEFORE autoConnect
sdk.on("connect", (data) => {
  console.log("Connected successfully!");
  console.log("Source:", data.source); // "auto-connect" | "manual-connect"
  console.log("Provider type:", data.provider);
  console.log("Addresses:", data.addresses);
  // Update your UI state here
});

sdk.on("connect_error", (data) => {
  console.log("Connection failed:", data.error);
  console.log("Source:", data.source); // "auto-connect" | "manual-connect"
  // Show connect button to user
});

// Auto-connect will trigger events
await sdk.autoConnect();
```

## Handling connection errors

When a connection fails, the `connect()` promise rejects with an error.

```typescript  theme={null}
try {
  const { addresses } = await sdk.connect({ provider: "google" });
  // Connection successful
  console.log("Connected addresses:", addresses);
} catch (error) {
  // Connection failed (user cancelled, network error, etc)
  console.error("Connection failed:", error);
}
```

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.phantom.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Sign messages

> Message signing with Browser SDK

The Phantom Connect Browser SDK provides chain-specific message signing methods through dedicated interfaces (`sdk.solana` and `sdk.ethereum`).

## Chain-specific message signing

### Solana message signing

```typescript  theme={null}
// Sign a message with Solana wallet
const signature = await sdk.solana.signMessage("Hello Solana!");
// Returns: { signature: string, rawSignature: string }
```

### Ethereum message signing

```typescript  theme={null}
// Sign personal message
const signature = await sdk.ethereum.signPersonalMessage("Hello Ethereum!", address);

// Sign EIP-712 typed data
const typedDataSignature = await sdk.ethereum.signTypedData(typedData, address);
```

## Complete examples

### Solana message signing

```typescript  theme={null}
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

const sdk = new BrowserSDK({
  providers: ["injected"],
  addressTypes: [AddressType.solana],
});

await sdk.connect({ provider: "injected" });

// Sign a message
const signature = await sdk.solana.signMessage("Hello Solana!");
console.log("Signature:", signature.signature);
console.log("Raw signature:", signature.rawSignature);
```

### Ethereum message signing

```typescript  theme={null}
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

const sdk = new BrowserSDK({
  providers: ["injected"],
  addressTypes: [AddressType.ethereum],
});

await sdk.connect({ provider: "injected" });
const accounts = await sdk.ethereum.getAccounts();

// Sign personal message
const message = "Hello Ethereum!";
const signature = await sdk.ethereum.signPersonalMessage(message, accounts[0]);
console.log("Signature:", signature.signature);
```

### EIP-712 typed data signing

```typescript  theme={null}
const typedData = {
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" }
    ],
    Mail: [
      { name: "from", type: "string" },
      { name: "to", type: "string" },
      { name: "contents", type: "string" }
    ]
  },
  primaryType: "Mail",
  domain: {
    name: "Ether Mail",
    version: "1",
    chainId: 1,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"
  },
  message: {
    from: "Alice",
    to: "Bob",
    contents: "Hello!"
  }
};

const accounts = await sdk.ethereum.getAccounts();
const signature = await sdk.ethereum.signTypedData(typedData, accounts[0]);
console.log("Typed data signature:", signature.signature);
```
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.phantom.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Sign and send transactions

> Transaction signing and sending with Browser SDK

The Phantom Connect Browser SDK provides chain-specific transaction methods through dedicated interfaces (`sdk.solana` and `sdk.ethereum`) for optimal transaction handling.

<Warning>
  **Embedded wallet limitations**: The `signTransaction` and `signAllTransactions` methods **aren't supported** for embedded wallets. For embedded wallets, use only `signAndSendTransaction` that signs and broadcasts the transaction in a single step.
</Warning>

<Info>
  **Transaction security for embedded wallets**: All transactions signed for embedded wallets pass through Phantom's advanced simulation system before execution. This security layer automatically blocks malicious transactions and transactions from origins that have been reported as malicious, providing an additional layer of protection for your users' assets.
</Info>

## Chain-specific transaction methods

### Solana transactions (sdk.solana)

```typescript  theme={null}
// Sign and send transaction
const result = await sdk.solana.signAndSendTransaction(transaction);

// Just sign (without sending) - Note: Not supported for embedded wallets
const signedTx = await sdk.solana.signTransaction(transaction);
```

### Ethereum transactions (sdk.ethereum)

```typescript  theme={null}
// Send transaction
const result = await sdk.ethereum.sendTransaction({
  to: "0x...",
  value: "1000000000000000000",
  gas: "21000",
});
```

## Transaction examples

### Solana transaction examples

The SDK supports multiple Solana transaction libraries. Here are examples using both `@solana/web3.js` and `@solana/kit`:

#### Solana with @solana/web3.js

```typescript  theme={null}
import {
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

const sdk = new BrowserSDK({
  providers: ["injected"],
  addressTypes: [AddressType.solana],
});

await sdk.connect({ provider: "injected" });

// Get recent blockhash
const connection = new Connection("https://api.mainnet-beta.solana.com");
const { blockhash } = await connection.getLatestBlockhash();

// Create transfer instruction
const fromAddress = await sdk.solana.getPublicKey();
const transferInstruction = SystemProgram.transfer({
  fromPubkey: new PublicKey(fromAddress),
  toPubkey: new PublicKey(toAddress),
  lamports: 0.001 * LAMPORTS_PER_SOL,
});

// Create VersionedTransaction
const messageV0 = new TransactionMessage({
  payerKey: new PublicKey(fromAddress),
  recentBlockhash: blockhash,
  instructions: [transferInstruction],
}).compileToV0Message();

const transaction = new VersionedTransaction(messageV0);

// Send transaction using chain-specific API
const result = await sdk.solana.signAndSendTransaction(transaction);
console.log("Transaction signature:", result.hash);
```

#### Solana with @solana/kit

```typescript  theme={null}
import {
  createSolanaRpc,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  address,
  compileTransaction,
} from "@solana/kit";
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

const sdk = new BrowserSDK({
  providers: ["injected"],
  addressTypes: [AddressType.solana],
});

await sdk.connect({ provider: "injected" });

// Create transaction with @solana/kit
const rpc = createSolanaRpc("https://api.mainnet-beta.solana.com");
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const userPublicKey = await sdk.solana.getPublicKey();
const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayer(address(userPublicKey), tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
);

const transaction = compileTransaction(transactionMessage);

// Send using chain-specific API
const result = await sdk.solana.signAndSendTransaction(transaction);
console.log("Transaction signature:", result.hash);
```

### Ethereum transaction examples

```typescript  theme={null}
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

const sdk = new BrowserSDK({
  providers: ["injected"],
  addressTypes: [AddressType.ethereum],
});

await sdk.connect({ provider: "injected" });

// Simple ETH transfer
const result = await sdk.ethereum.sendTransaction({
  to: "0x742d35Cc6634C0532925a3b8D4C8db86fB5C4A7E",
  value: "1000000000000000000", // 1 ETH in wei
  gas: "21000",
  gasPrice: "20000000000", // 20 gwei
});

// EIP-1559 transaction with maxFeePerGas
const result2 = await sdk.ethereum.sendTransaction({
  to: "0x742d35Cc6634C0532925a3b8D4C8db86fB5C4A7E",
  value: "1000000000000000000", // 1 ETH in wei
  data: "0x...", // contract call data
  gas: "50000",
  maxFeePerGas: "30000000000", // 30 gwei
  maxPriorityFeePerGas: "2000000000", // 2 gwei
});

console.log("Transaction hash:", result.hash);
```

#### Ethereum with viem

```typescript  theme={null}
import { parseEther, parseGwei, encodeFunctionData } from "viem";
import { BrowserSDK, AddressType } from "@phantom/browser-sdk";

const sdk = new BrowserSDK({
  providers: ["injected"],
  addressTypes: [AddressType.ethereum],
});

// Simple transfer with viem utilities
const result = await sdk.ethereum.sendTransaction({
  to: "0x742d35Cc6634C0532925a3b8D4C8db86fB5C4A7E",
  value: parseEther("1").toString(), // 1 ETH
  gas: "21000",
  gasPrice: parseGwei("20").toString(), // 20 gwei
});

// Contract interaction
const result2 = await sdk.ethereum.sendTransaction({
  to: tokenContractAddress,
  data: encodeFunctionData({
    abi: tokenAbi,
    functionName: "transfer",
    args: [recipientAddress, parseEther("100")],
  }),
  gas: "50000",
  maxFeePerGas: parseGwei("30").toString(),
  maxPriorityFeePerGas: parseGwei("2").toString(),
});
```
