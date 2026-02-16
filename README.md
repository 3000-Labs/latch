# Latch

**Latching G-Addresses to C-Addresses on Stellar.**

Latch provides open-source C-address onboarding infrastructure for Stellar, enabling users to create and fund Soroban Smart Accounts without ever touching a traditional G-address.

## Features

- **Latch Bridge**: A funding bridge protocol for G-to-C address funding.
- **Latch Wallet**: A reference Smart Account wallet implementation (Protocol 20+).
- **Latch SDK**: TypeScript and Rust libraries for developers to integrate C-address support.

## Getting Started

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

### Prerequisites

- Node.js (Latest LTS recommended)
- `npm` or `yarn` or `pnpm`

### Installation

```bash
npm install
# or
yarn install
# or
pnpm install
```

### Running the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- `app/`: Next.js App Router pages and layouts.
- `components/`: React components.
  - `components/gl`: Three.js / React Three Fiber 3D components.
  - `components/ui`: Reusable UI components (likely Shadcn/Radix based).
- `lib/`: Utility functions and shared logic.
- `public/`: Static assets.

## Documentation

For the full project proposal and detailed technical specifications, see [PROJECT_PROPOSAL.md](./PROJECT_PROPOSAL.md).

## License

MIT