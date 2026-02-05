# 🐉 Fear & Greed DCA Wallet

**Autonomous sentiment-based crypto accumulation** using the Crypto Fear & Greed Index

![Fear & Greed](https://img.shields.io/badge/Fear%20%26%20Greed-DCA-orange)
![Base](https://img.shields.io/badge/Base-Chain-0052FF)
![ERC-4337](https://img.shields.io/badge/ERC--4337-Smart%20Accounts-blue)

## What is this?

An autonomous DCA (Dollar Cost Averaging) wallet that:
- **Buys more** when the market is fearful (fear = opportunity)
- **Sells when overvalued** when greed takes over
- Uses ERC-4337 smart accounts for full user custody
- Runs on Base for low fees and fast execution

## How It Works

```
┌─────────────┐    ┌──────────────┐    ┌────────────┐    ┌─────────────┐
│   Fear &    │───▶│   Backend    │───▶│   Smart    │───▶│  Uniswap    │
│   Greed     │    │    Signer    │    │  Account   │    │    V3       │
│   Index     │    │   (Cron)     │    │  (User)    │    │   (Swap)    │
└─────────────┘    └──────────────┘    └────────────┘    └─────────────┘
```

### Trading Logic

| Fear & Greed Value | Classification | Action | Multiplier |
|-------------------|----------------|--------|------------|
| 0-25 | Extreme Fear | BUY | 2x |
| 26-45 | Fear | BUY | 1x |
| 46-54 | Neutral | HOLD | - |
| 55-75 | Greed | SELL | 1x |
| 76-100 | Extreme Greed | SELL | 2x |

## Architecture

### Frontend
- Next.js 16 with Tailwind CSS v4
- Wagmi + Viem for Web3 interactions
- MetaMask Smart Accounts Kit for ERC-4337 smart accounts

### Smart Accounts
- MetaMask HybridDeleGator for delegation support
- User maintains full custody
- Backend has limited, time-bound delegation for swaps only

### Backend
- Node.js + TypeScript
- Vercel Cron for daily execution
- Supabase for user data and execution logs

## Project Structure

```
ember-fear-greed-dca/
├── frontend/           # Next.js frontend
│   ├── src/
│   │   ├── app/       # Next.js app router
│   │   ├── components/# React components
│   │   ├── hooks/     # Custom hooks
│   │   └── lib/       # Utilities
│   ├── package.json
│   └── next.config.ts
├── api/               # Backend API & cron jobs
│   ├── cron/          # Cron job handlers
│   └── lib/           # API utilities
├── contracts/         # Foundry contracts (for testing)
│   ├── src/
│   └── test/
└── foundry.toml       # Foundry configuration
```

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- MetaMask or compatible wallet

### Install & Run

```bash
# Clone the repo
git clone https://github.com/emberdragonc/ember-fear-greed-dca.git
cd ember-fear-greed-dca

# Install frontend dependencies
cd frontend
npm install

# Run dev server
npm run dev
```

Open http://localhost:3000 to view the app.

### Environment Variables

Create `.env.local` in the frontend directory:

```env
# Chain (Base Sepolia for testing)
NEXT_PUBLIC_CHAIN_ID=84532

# Backend Signer (provided by backend setup)
NEXT_PUBLIC_BACKEND_SIGNER=0x...
```

## Development Phases

See [FEAR_GREED_DCA_SPEC.md](./specs/FEAR_GREED_DCA_SPEC.md) for full specification.

| Phase | Description | Status |
|-------|-------------|--------|
| PR0 | Project Setup | ✅ Complete |
| PR1 | Smart Account Integration | 🔄 Pending |
| PR2 | Delegation Setup | 📋 Planned |
| PR3 | Fear & Greed Service | 📋 Planned |
| PR4 | Swap Execution | 📋 Planned |
| PR5 | User Dashboard | 📋 Planned |
| PR6 | Testnet Polish | 📋 Planned |
| PR7 | Audit & Mainnet | 📋 Planned |

## Security

- **Trustless**: Backend cannot steal funds, only execute approved swaps
- **Time-bound**: Delegations expire and must be renewed
- **Limited scope**: Backend can only swap within user-specified limits
- **Full custody**: Users can withdraw funds at any time

## Contributing

This is an open source project by [Ember](https://github.com/emberdragonc). Contributions welcome!

## License

MIT - See LICENSE file for details

---

Built with 🔥 by Ember using MetaMask Smart Accounts Kit & Uniswap V3
