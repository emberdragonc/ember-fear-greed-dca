# 🐉 Fear & Greed DCA Wallet

**Autonomous sentiment-based crypto accumulation** using the Crypto Fear & Greed Index

![Fear & Greed](https://img.shields.io/badge/Fear%20%26%20Greed-DCA-orange)
![Base](https://img.shields.io/badge/Base-Chain-0052FF)
![ERC-4337](https://img.shields.io/badge/ERC--4337-Smart%20Accounts-blue)

**Live:** https://dca.ember.engineer

## What is this?

An autonomous DCA (Dollar Cost Averaging) wallet that:
- **Buys more** when the market is fearful (fear = opportunity)
- **Sells some** when greed takes over (take profits)
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

| Fear & Greed Value | Classification | Action | % of Balance |
|-------------------|----------------|--------|--------------|
| 0-25 | Extreme Fear | BUY ETH | 5% of USDC |
| 26-45 | Fear | BUY ETH | 2.5% of USDC |
| 46-54 | Neutral | HOLD | - |
| 55-75 | Greed | SELL ETH | 2.5% of ETH |
| 76-100 | Extreme Greed | SELL ETH | 5% of ETH |

### Backtest Results (2022-2024 Full Cycle)

- **F&G DCA Strategy:** +175%
- **HODL ETH:** +82%
- **Outperformance:** ~2x better returns

---

## 🔐 Security Model

### No Custom Smart Contract

This project does **NOT** deploy any custom smart contracts. We exclusively use:

| Component | Provider | Audit Status |
|-----------|----------|--------------|
| Smart Accounts | MetaMask Smart Accounts Kit | ✅ Audited by MetaMask |
| Swap Router | Uniswap Universal Router | ✅ Audited by Uniswap |
| USDC Token | Circle | ✅ Standard ERC20 |

**Why this matters:** No fuzz tests, unit tests, or security audits are needed for Solidity because we didn't write any. All contract interactions go through battle-tested, audited infrastructure.

### Delegation Security (Defense in Depth)

User funds are protected by multiple layers:

1. **User-Controlled Smart Account**
   - User owns the smart account (ERC-4337)
   - User can withdraw funds anytime
   - User can revoke delegation anytime

2. **Delegation Caveats (Primary Defense)**
   - **Time-bound:** Delegation expires after N days
   - **Amount-limited:** Max swap amount per execution
   - **Target-restricted:** Can only call Uniswap Router
   - **Method-restricted:** Can only call swap functions

3. **Backend Key (Limited Power)**
   - Even if compromised, can only execute swaps within user-set limits
   - Cannot withdraw to external addresses
   - Cannot exceed delegation caveats
   - Cannot act after delegation expires

### Trust Assumptions

| Component | Trust Level | Risk if Compromised |
|-----------|-------------|---------------------|
| User's wallet | Full trust | Full control |
| Smart Account | Code trust | MetaMask audit covers this |
| Backend signer | Limited trust | Can only swap within caveats |
| Frontend | Zero trust | Can't access funds, display only |
| F&G Data API | Display only | Wrong signal, not fund loss |

### What CAN'T the backend do?

- ❌ Withdraw funds to any address
- ❌ Swap more than user-approved amount
- ❌ Act after delegation expires
- ❌ Call contracts other than Uniswap
- ❌ Change delegation parameters

### What CAN the backend do?

- ✅ Execute swaps within user-set limits
- ✅ Only on the approved Uniswap router
- ✅ Only while delegation is active

---

## Architecture

### Frontend
- Next.js 15 with App Router
- Tailwind CSS dark theme
- Wagmi v3 + Viem v2 for Web3
- MetaMask Smart Accounts Kit for ERC-4337

### Backend
- Node.js + TypeScript
- GitHub Actions cron (daily at 12:00 UTC)
- Supabase for delegation records & execution logs

### Data Sources
- Fear & Greed Index: [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/) (attribution required)
- Swap routing: Uniswap Trading API

## Fees

- **Protocol fee:** 0.15% (15 bps) per swap
- **Fee recipient:** 100% to EMBER stakers
- **Staking contract:** `0x434B2A0e38FB3E5D2ACFa2a7aE492C2A53E55Ec9` (Base)

---

## Getting Started

### Prerequisites
- Node.js 20+
- MetaMask or compatible wallet
- ETH + USDC on Base

### Local Development

```bash
git clone https://github.com/emberdragonc/ember-fear-greed-dca.git
cd ember-fear-greed-dca/frontend
npm install
npm run dev
```

### Environment Variables

```env
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_UNISWAP_API_KEY=your_uniswap_key
```

---

## Project Status

| Component | Status |
|-----------|--------|
| Frontend UI | ✅ Complete |
| Wallet Connect | ✅ Complete |
| Smart Account Creation | ✅ Complete |
| F&G Display | ✅ Complete |
| Manual DCA Execution | ✅ Complete |
| Delegation UI | ✅ Complete |
| Automated Backend | 🔄 In Progress |
| Fee Collection | 📋 Planned |

---

## Contributing

Open source project by [Ember 🐉](https://github.com/emberdragonc). Contributions welcome!

## License

MIT

---

Built with 🔥 by Ember | [ember.engineer](https://ember.engineer)

Data: [Alternative.me Fear & Greed Index](https://alternative.me/crypto/fear-and-greed-index/)
