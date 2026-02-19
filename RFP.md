C-Address Tooling & Onboarding
Added: Q1 2026

1. Scope of Work
Well-researched approach with reference/example implementation with onboarding flow on how to easily fund a C-address (Soroban Smart Account) without first using a traditional G-address.

2. Background & Context
The shift to C-addresses (Soroban smart accounts) is critical for next-generation dApps on Stellar, but two major adoption blockers persist: 1) the inability to easily fund a C-address without first using a traditional G-address, and a2) a lack of core, modern mobile tooling around the Smart Account standard by OpenZeppelin. This technical friction limits the utility of C-addresses for end-users and exchanges.

3. Requirements
C-Address Onboarding/Funding Solution with G-to-C Seamless Bridge: A protocol or service that enables the direct funding of a C-address using G-addresses, CEX withdrawals, and  possibly off-ramp solutions (e.g., a proxy service routing from credit card to G-address to C-address). The goal is to make the G-address step transparent or unnecessary for the end-user.

Viable C-Address Wallet: A reference implementation of a production level wallet to showcase the tooling and standard at parity with the Freighter wallet, including support showing all tokens held, history of transfers. 

Onboarding Kit/UX Flow: Develop a standard, open-source "onboarding kit" that creates a standard user experience flow for wallet providers/Stellar wallets. This kit should encompass:

A seamless flow for C-address creation, asset bridging, adding assets, and funding with XLM for fees.

Easy integrations with existing bridges when selecting a Stellar wallet.

An onboarding flow that supports funding a C-address from a standard G-address or CEX withdrawal.

Wishlist Item: The onboarding flow should allow users to sign in with other ecosystem wallets (e.g., Metamask, Phantom, Rabby, etc.), derive a new address, and then proceed through the funding flow, potentially funding their account/adding assets based on policies like address activity.

Associated tooling for building on and with C-address wallets as part of the reference implementation on the web and on mobile

Approach and structure needs to be designed with input from potential users (such as Ecosystem wallets)

The implementation should be fully Open Source

4. Evaluation Criteria
High technical capability and proven experience building on both Stellar operations and Soroban smart contracts

Ecosystem alignment and demonstrated ability and willingness to connect with the existing ecosystem (wallets) as they’d be the potential users of this

Coherent integration plan and timeline

5. Expected Deliverables
Smart contracts

SDKs or libraries

Documentation

Test suite

Audit fixes

Production-ready version

Example integrations