# PRD — Design
### Latch + 3000 Labs | Lexie (Lead) + Designer 2 (Support)

---

## Overview

You are designing two things simultaneously:

1. **3000 Labs** — the company brand. The venture lab that builds Latch and future products.
2. **Latch** — the product brand. A crypto wallet and developer SDK for Stellar Smart Accounts.

Both need to feel premium, technical, and trustworthy. The target audience is developers, crypto-native users, and wallet teams — not mainstream. Think Linear, Vercel, Phantom — clean, dark-mode first, no noise.

---

## 1. 3000 Labs Brand

### What it is
3000 Labs is a web3 venture lab. Latch is its first product. The brand should position it as a serious builder — not a startup that got lucky, but a lab that ships.

### Deliverables

**Brand identity**
- Name: 3000 Labs
- Logo (wordmark + icon, horizontal + stacked)
- Color palette (primary, secondary, neutrals)
- Typography (heading + body, web-safe or Google Fonts)
- Brand voice: technical, direct, no hype

**Website (single page or minimal)**
- Hero: what 3000 Labs does in one sentence
- Products: Latch (link out) + placeholder for future products
- Team: Frankie (founder) + Lexie (co-founder) — short bios
- Contact / links (Twitter, GitHub)
- No blog needed at this stage

**Tone and feel:**
Reference: Linear.app, Vercel.com — minimal, dark, confident

---

## 2. Latch Brand

### What it is
Latch is an open-source infrastructure product. It's not a consumer app (yet) — it's a developer-first tool with a user-facing wallet on top. The brand needs to work for both audiences.

### Brand identity deliverables
- Logo (wordmark + icon, horizontal + stacked)
- Sub-brand relationship to 3000 Labs (e.g. "Latch by 3000 Labs")
- Color palette (can share foundation with 3000 Labs but distinct)
- Typography
- Icon set for key concepts (bridge, smart account, passkey, SDK)

---

## 3. Latch Landing Page

### Purpose
Convert visitors into users or developers. Two audiences land here:
- **Users** — want a wallet that doesn't require a Stellar seed phrase
- **Developers** — want to integrate C-address support into their wallet or dApp

### Sections
1. **Hero** — one headline, one subheadline, two CTAs: "Get Started" (wallet) + "Read the Docs" (devs)
2. **The Problem** — 2–3 sentences: funding a Stellar Smart Account today is broken
3. **The Solution** — Latch Bridge + Latch Wallet + Latch SDK explained simply, with visuals
4. **How it works** — 3–4 step visual flow (connect wallet → Smart Account created → funded via Bridge → ready)
5. **For Developers** — SDK section: code snippet, link to docs, wallet integration CTA
6. **Ecosystem** — Stellar, OpenZeppelin, SCF logos (trust signals)
7. **Footer** — links, GitHub, Twitter, docs

### Requirements
- Dark mode first
- Mobile responsive
- No animations that slow down load
- Handoff to web frontend dev as Figma file

---

## 4. Latch Web Wallet

### Purpose
The main wallet interface. Users manage their Stellar Smart Account here — see balances, send/receive, view history, manage signing permissions.

### Screens to design

**Onboarding flow (new user)**
1. Welcome screen — "Create your Stellar Smart Account"
2. Choose signer — Passkey (Face ID / Touch ID) | Phantom | MetaMask | Hardware key
3. Deploying — loading state with deterministic address preview shown early
4. Fund your account — Bridge instructions (send XLM to this G-address with this memo)
5. Waiting for deposit — live status, amount received
6. Ready — account funded, enter wallet

**Main wallet**
- Dashboard — total balance (USD), asset list (icon, name, amount, USD value), quick send/receive buttons
- Send — recipient C-address input, asset selector, amount, review screen, confirm + sign
- Receive — show your C-address (QR + copy), show proxy G-address + memo for CEX deposits
- Transaction history — chronological list (type, amount, counterparty, date, status)
- Asset detail — individual token page with mini chart (if possible) and history

**Session keys + permissions**
- Session keys list — active keys, scope, expiry, revoke button
- Create session key — contract allowlist, spend limit, time window, confirm
- dApp permissions — what each connected dApp can do

**Settings**
- Account details (C-address, registered signers)
- Add signer (add MetaMask, Passkey, etc.)
- Export address / QR
- Network (testnet / mainnet toggle)

### Requirements
- Dark mode primary, light mode secondary
- Works on desktop and mobile browser
- Component library in Figma (all states: default, hover, active, loading, error, empty)
- Every interactive element has all states designed

---

## 5. Latch Mobile Wallet

### Purpose
Same as web wallet, adapted for mobile. Native feel on iOS and Android.

### Screens
Same screens as web wallet, adapted for:
- Bottom navigation bar (Dashboard, Send, Receive, History, Settings)
- Touch targets minimum 44px
- Biometric prompt (Face ID / Touch ID) for signing — this is the primary signer on mobile
- Swipe gestures where appropriate

### Requirements
- Design in Figma at iPhone 14 Pro size (390×844), with Android adaptation noted
- Handoff includes spacing specs and component states

---

## 6. dApp Signing Page

### Purpose
When a dApp sends a signing request to Latch (via URL-embedded XDR or refractor.space), the user lands on this page, reviews the transaction, and approves or rejects.

### Screens
1. **Transaction review** — dApp name, what the tx does in plain English, contract being called, function, args (human-readable), fee
2. **Sign** — user authenticates (Passkey biometric / wallet pop-up)
3. **Success / Error** — result screen with return-to-dApp button

### Requirements
- Should feel like a secure popup, not a full page (constrained width, centered, modal-like)
- Must clearly show what the user is authorizing — no technical XDR blobs visible to user
- Error states for expired tx, wrong network, insufficient permissions

---

## 7. Developer Documentation Site

### Structure (information architecture only — GitBook or Docusaurus handles the styling)
- Introduction (what is Latch, what problem it solves)
- Quick Start (deploy a Smart Account in 5 minutes)
- Concepts (C-address, verifiers, context rules, policies, bridge)
- SDK Reference (@latch/core API, @latch/react hooks)
- Contracts (ABIs, addresses, how to interact)
- Integration Guides (how a wallet integrates Latch, how a dApp integrates)
- Bridge Guide (CEX deposit flow, memo format)
- Security (trust model, failure modes, audit report)

### Lexie's job here
- Write the content for every page above (from Frankie's technical input)
- Not designing the doc site — GitBook handles that. Focus is on writing quality.

---

## Handoff Format

All design deliverables:
- Figma files, organized by surface (3000 Labs / Latch Landing / Web Wallet / Mobile / dApp Signing)
- Component library with all states
- Dev handoff notes on spacing, fonts, colors as variables

Priority order:
1. 3000 Labs brand identity (needed first — everything else flows from this)
2. Latch brand identity
3. Latch landing page
4. Web wallet (most complex — start early)
5. Mobile wallet (adapt from web)
6. dApp signing page
7. Docs structure + writing (ongoing throughout build)

---

## Timeline

| Deliverable | Target |
|---|---|
| 3000 Labs brand | Week 1 |
| Latch brand | Week 1–2 |
| Landing page designs | Week 2 |
| Web wallet — onboarding + dashboard | Week 2–3 |
| Web wallet — all screens | Week 4 |
| Mobile wallet | Week 5–6 |
| dApp signing page | Week 5 |
| Docs writing | Ongoing, Week 3–12 |
