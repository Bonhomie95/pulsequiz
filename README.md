<div align="center">

<img src="https://img.shields.io/badge/React_Native-Expo-000020?style=for-the-badge&logo=expo&logoColor=white" />
<img src="https://img.shields.io/badge/Solana-Web3-9945FF?style=for-the-badge&logo=solana&logoColor=white" />
<img src="https://img.shields.io/badge/Zustand-State_Mgmt-FF6B35?style=for-the-badge" />
<img src="https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />

# 🎯 PulseQuiz

**A mobile-first trivia game with real crypto rewards.**  
Answer questions. Win USDT/USDC. Powered by Solana.

</div>

---

## 📱 Overview

PulseQuiz is a production-grade mobile trivia game built with React Native (Expo). Players compete in 10-question sessions across difficulty tiers and earn real cryptocurrency rewards — paid out in USDT or USDC via an integrated Solana wallet.

The app features a full Web3 economy, streak systems, mystery boxes, leaderboards, and smooth animations — all running on a secure, PIN-protected wallet architecture.

---

## ✨ Features

### Gameplay
- 10-question sessions — Easy / Medium / Hard difficulty
- Hint system, streak rewards, and milestone bonuses
- Mystery box drops and tier progression system
- Confetti celebrations and smooth Lottie/Reanimated animations

### Web3 & Payments
- PIN-secured in-app Solana wallet
- USDT & USDC payouts to any Solana-compatible wallet
- Solana Web3.js integration for on-chain transactions
- In-app purchases via Apple/Google billing

### UX & Polish
- Leaderboards with global rankings
- Deep linking support
- Offline avatar fallback
- AdMob & Meta Audience Network ad integration
- Dark-first UI with custom design system

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Mobile Framework | React Native (Expo) |
| Navigation | Expo Router |
| State Management | Zustand |
| Animations | Reanimated 2, Lottie |
| Blockchain | Solana Web3.js |
| Wallet Support | Phantom, Solflare |
| Backend | Node.js / Express |
| Database | MongoDB |
| Ads | AdMob, Meta Audience Network |

---

## 🏗 Architecture

```
pulsequiz/
├── app/                   # Expo Router screens
│   ├── (auth)/            # PIN setup, wallet creation
│   ├── (game)/            # Quiz session, results, milestones
│   ├── (wallet)/          # Deposit, withdraw, balance
│   └── (leaderboard)/     # Global rankings, streaks
├── components/            # Reusable UI components
├── store/                 # Zustand global state
├── hooks/                 # Custom React hooks
├── services/              # API + Web3 service layer
└── assets/                # Lottie animations, images
```

---

## 🔐 Security

- Wallet keys secured behind device PIN
- No private keys stored in plain text
- JWT-authenticated API endpoints
- Rate limiting on quiz submission routes

---

## 📦 Getting Started

```bash
# Clone the repo
git clone https://github.com/Bonhomie95/pulsequiz.git
cd pulsequiz

# Install dependencies
npm install

# Start Expo dev server
npx expo start
```

> **Note:** You will need to configure your own `.env` file with Solana RPC endpoint, backend URL, and ad unit IDs.

---

## 🌍 Status

> 🚧 Active development — core gameplay and wallet system complete. App Store submission in progress.

---

<div align="center">
  <sub>Built by <a href="https://github.com/Bonhomie95">Adeyemi Joseph</a></sub>
</div>
