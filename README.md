# 🐉 Fear & Greed DCA

**Autonomous sentiment-based crypto accumulation** using the Crypto Fear & Greed Index

![Fear & Greed](https://img.shields.io/badge/Fear%20%26%20Greed-DCA-orange)
![Base](https://img.shields.io/badge/Base-Chain-0052FF)
![ERC-4337](https://img.shields.io/badge/ERC--4337-Smart%20Accounts-blue)

**Live:** https://dca.ember.engineer

## What is this?

An autonomous DCA system that adjusts buy/sell behavior based on market sentiment:
- **Buys more** when the market is fearful
- **Sells some** when greed takes over
- Uses **ERC-4337 smart accounts** for user custody
- Runs on **Base** for low fees

## Architecture

Uses MetaMask Delegation Framework for non-custodial automation. Users delegate swap permissions to the protocol, which executes based on Fear & Greed signals.

## Security

This protocol has undergone internal security review. See [SECURITY_AUDIT.md](./SECURITY_AUDIT.md).

### Key Features
- Multi-source oracle redundancy
- MEV protection via dynamic slippage
- Anti-griefing measures
- Row-level security on all data

## Links

- **App:** https://dca.ember.engineer
- **Base:** Mainnet
- **Part of:** [EMBER ecosystem](https://ember.engineer)

## License

MIT
