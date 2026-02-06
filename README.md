# 🐉 Fear & Greed DCA

**Autonomous sentiment-based crypto accumulation** using the Crypto Fear & Greed Index

![Fear & Greed](https://img.shields.io/badge/Fear%20%26%20Greed-DCA-orange)
![Base](https://img.shields.io/badge/Base-Chain-0052FF)
![ERC-4337](https://img.shields.io/badge/ERC--4337-Smart%20Accounts-blue)

**Live:** https://dca.ember.engineer

## What is this?

An autonomous DCA (Dollar Cost Averaging) system that:
- **Buys more ETH** when the market is fearful (fear = opportunity)
- **Sells some ETH** when greed takes over (take profits)
- Uses **ERC-4337 smart accounts** for full user custody
- Runs on **Base** for low fees and fast execution
- Executes **daily at 12:00 UTC** via GitHub Actions

## How It Works

```
┌─────────────┐    ┌──────────────┐    ┌────────────┐    ┌─────────────┐
│   Fear &    │───▶│   Backend    │───▶│   User's   │───▶│  Uniswap    │
│   Greed     │    │   Smart      │    │   Smart    │    │    V3       │
│   Index     │    │   Account    │    │   Account  │    │   (Swap)    │
└─────────────┘    └──────────────┘    └────────────┘    └─────────────┘
                   (via delegation)    (user custody)
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

### No Custom Smart Contracts

This project does **NOT** deploy any custom smart contracts. We exclusively use:

| Component | Provider | Audit Status |
|-----------|----------|--------------|
| Smart Accounts | MetaMask Delegation Framework v1.3.0 | ✅ Audited |
| Swap Router | Uniswap Universal Router | ✅ Audited |
| Bundler | Pimlico | ✅ Production infrastructure |
| USDC Token | Circle | ✅ Standard ERC20 |

**Why this matters:** No fuzz tests, unit tests, or security audits are needed for Solidity because we didn't write any. All contract interactions go through battle-tested, audited infrastructure.

### Delegation Security (Defense in Depth)

User funds are protected by multiple layers:

1. **User-Controlled Smart Account**
   - User owns their smart account (ERC-4337)
   - User can withdraw funds anytime
   - User can revoke delegation anytime

2. **Delegation Caveats (Primary Defense)**
   - **Time-bound:** Delegation expires after 30 days
   - **Amount-limited:** Max swap amount per execution
   - **Target-restricted:** Can only call Uniswap Router + USDC/WETH transfers
   - **Method-restricted:** Can only call approved swap/transfer functions

3. **Backend Smart Account (Limited Power)**
   - The delegate is itself a smart account, not an EOA
   - Even if compromised, can only execute swaps within user-set limits
   - Cannot withdraw to arbitrary addresses
   - Cannot exceed delegation caveats
   - Cannot act after delegation expires

### Trust Assumptions

| Component | Trust Level | Risk if Compromised |
|-----------|-------------|---------------------|
| User's wallet | Full trust | Full control |
| Smart Account | Code trust | MetaMask audit covers this |
| Backend delegate | Limited trust | Can only swap within caveats |
| Frontend | Zero trust | Can't access funds, display only |
| F&G Data API | Display only | Wrong signal, not fund loss |

### What CAN'T the backend do?

- ❌ Withdraw funds to any address
- ❌ Swap more than user-approved amounts
- ❌ Act after delegation expires
- ❌ Call contracts other than approved routers
- ❌ Change delegation parameters

### What CAN the backend do?

- ✅ Execute swaps within user-set limits
- ✅ Collect protocol fee (0.20%) via pre-approved transfer
- ✅ Only while delegation is active

---

## Contract Addresses (Base Mainnet)

| Contract | Address |
|----------|---------|
| Backend Delegate (Smart Account) | `0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1` |
| SimpleFactory (v1.3.0) | `0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c` |
| HybridDeleGator Implementation | `0x48dBe696A4D990079e039489bA2053B36E8FFEC4` |
| EMBER Staking (Fee Recipient) | `0x434B2A0e38FB3E5D2ACFa2a7aE492C2A53E55Ec9` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` |

---

## Architecture

### Frontend
- Next.js 15 with App Router
- Tailwind CSS (dark glassmorphism theme)
- Wagmi v2 + Viem v2 for Web3
- MetaMask Smart Accounts Kit for ERC-4337
- Real-time balance tracking (ETH + WETH combined)

### Backend
- Node.js + TypeScript
- GitHub Actions cron (daily at 12:00 UTC)
- Pimlico bundler for UserOp submission
- Alchemy RPC for reliable reads
- Supabase for delegation records & execution logs

### Data Sources
- Fear & Greed Index: [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/)
- Swap routing: Uniswap Trading API
- Price feeds: CoinGecko

## Fees

- **Protocol fee:** 0.20% (20 bps) per swap
- **Uniswap LP fee:** ~0.05%
- **Total:** ~0.25% per swap
- **Fee recipient:** 100% to EMBER stakers

---

## Funding Thresholds

| Status | Requirement |
|--------|-------------|
| New users | $10 USDC minimum to activate |
| Active users | $5 total balance (USDC + WETH) to stay included |

---

## Getting Started

### Prerequisites
- Node.js 20+
- MetaMask or compatible wallet
- USDC on Base (minimum $10 to start)

### Local Development

```bash
git clone https://github.com/emberdragonc/ember-fear-greed-dca.git
cd ember-fear-greed-dca/frontend
npm install
npm run dev
```

### Environment Variables

```env
# Frontend
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_UNISWAP_API_KEY=your_uniswap_key

# Backend (GitHub Secrets)
BACKEND_PRIVATE_KEY=your_backend_signer_key
PIMLICO_API_KEY=your_pimlico_key
ALCHEMY_API_KEY=your_alchemy_key
SUPABASE_SERVICE_KEY=your_service_key
```

---

## Project Status

| Component | Status |
|-----------|--------|
| Frontend UI | ✅ Complete |
| Wallet Connect | ✅ Complete |
| Smart Account Creation | ✅ Complete |
| F&G Display | ✅ Complete |
| Delegation UI | ✅ Complete |
| Automated Backend | ✅ Complete |
| Fee Collection | ✅ Complete |
| Daily Cron Execution | ✅ Live |

---

## How to Use

1. **Connect Wallet** - Connect your MetaMask or WalletConnect wallet
2. **Create Smart Account** - One-click counterfactual deployment
3. **Fund Wallet** - Send at least $10 USDC to your smart account
4. **Activate DCA** - Sign a delegation to authorize automated swaps
5. **Relax** - The system executes daily based on market sentiment

---

## Contributing

Open source project by [Ember 🐉](https://github.com/emberdragonc). Contributions welcome!

## License

MIT

---

Built with 🔥 by Ember | [ember.engineer](https://ember.engineer)

Data: [Alternative.me Fear & Greed Index](https://alternative.me/crypto/fear-and-greed-index/)
