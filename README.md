# Suilotion

<div align="center">

**A Decentralized Peer-to-Peer Help Platform for 42 Students**

Built on Sui Blockchain | Immutable Reputation System | Transparent & Trustless

[![Sui](https://img.shields.io/badge/Built%20on-Sui-6fbcf0?style=for-the-badge&logo=sui)](https://sui.io)
[![42](https://img.shields.io/badge/For-42%20Students-black?style=for-the-badge)](https://42.fr)

</div>

---

## Overview

**Suilotion** is a blockchain-based peer-to-peer help platform exclusively designed for 42 students. It enables students to request help from peers, offer assistance, and build a verifiable on-chain reputation through an immutable reward system.

### Key Features

- **Soulbound Token (SBT) Identity**: Non-transferable student profiles linked to wallet addresses
- **Community-Driven Difficulty Voting**: Transparent and democratic difficulty assessment
- **Tier System**: Progressive reputation levels (Newcomer → Bronze → Silver → Gold → Diamond)
- **XP & Reward System**: Earn experience points and rewards for helping others
- **42 Intra Integration**: Seamless authentication with 42 Intra accounts
- **Two-Party Confirmation**: Both mentor and mentee must confirm completion

---

## Problem & Solution

Traditional help platforms suffer from fake ratings, identity manipulation, and centralized control. Suilotion solves these with:

- **Soulbound Tokens (SBT)**: One wallet = One identity, preventing fake accounts
- **Immutable Records**: All data stored on-chain, cannot be altered
- **Two-Party Confirmation**: Both parties must confirm with on-chain proof
- **Public Blockchain**: All transactions are queryable and verifiable

---

## Features

- Create help requests for 14 different 42 topics (Shell, Libft, CPP, etc.)
- Offer assistance and browse requests
- Community voting on request difficulty (1-5 scale)
- Tier progression system with NFT rewards
- XP rewards based on difficulty (10-50 XP per help)
- 42 Intra OAuth authentication and profile sync

---

## Technology Stack

- **Blockchain**: Sui Network, Move Language
- **Frontend**: React + TypeScript, Vite, @mysten/dapp-kit
- **Authentication**: 42 Intra OAuth, Sui Wallet

---

## Getting Started

### Prerequisites

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)
- Node.js 18+
- 42 Intra Account

### Installation

1. **Clone and build the smart contract**
   ```bash
   git clone <repository-url>
   cd Suilotion
   sui move build
   ```

2. **Set up the frontend**
   ```bash
   cd frontend
   npm install
   ```

3. **Configure environment variables**
   
   Create `.env` file in `frontend/` directory:
   ```env
   VITE_INTRA_CLIENT_ID=your_42_intra_client_id
   VITE_INTRA_CLIENT_SECRET=your_42_intra_client_secret
   VITE_INTRA_REDIRECT_URI=http://localhost:5173
   ```
   
   Get OAuth credentials from: https://profile.intra.42.fr/oauth/applications

4. **Start the development server**
   ```bash
   npm run dev
   ```
   
   Open http://localhost:5173 in your browser

---

## Deployment

### Smart Contract

```bash
sui move build
sui client publish --gas-budget 100000000
```

After deployment, update `frontend/src/App.tsx` with the new `PACKAGE_ID` and `REGISTRY_ID`.

### Frontend

```bash
cd frontend
npm run build
```

Deploy the `dist/` folder to your hosting service (Vercel, Netlify, etc.).

---

## Current Deployment

**Network**: Sui Testnet

**Package ID**: `0x20d90ee0b94abb3c75b1551532b96d51a697130b3f80e8cfdbeb4d8c9cce7ce0`

**Registry ID**: `0xbc71e6fbb0cb92bb4490214f7af260ff8a638500f47f14a6d544df112a6428a5`

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is developed for educational purposes as part of the **42 Kocaeli - Sui Foundation Hackathon**.

---

## Resources

- [Sui Documentation](https://docs.sui.io)
- [Move Language Book](https://move-language.github.io/move/)
- [42 Intra API](https://api.intra.42.fr)

---

<div align="center">

**Made by 42 Students, for 42 Students**

</div>
