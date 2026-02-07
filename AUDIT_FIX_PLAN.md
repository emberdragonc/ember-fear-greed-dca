# DCA Executor Audit Fix Plan

## Priority Order

### P0 - CRITICAL (Must fix before production)

| ID | Issue | Source | Fix |
|----|-------|--------|-----|
| C1 | Integer overflow in percentage calc | Correctness | Use `Math.round()` or integer math |
| C2 | Nonce key collision (Date.now()) | Correctness | Use `(runId << 32) \| walletIndex` |
| C3 | No on-chain delegation verification | Adversarial | Verify signature before execution |
| C4 | MEV sandwich attacks | Adversarial + Economic | Add slippage protection + Flashbots |
| C5 | Single F&G oracle source | Economic | Add backup sources or staleness check |

### P1 - HIGH (Fix before scaling)

| ID | Issue | Source | Fix |
|----|-------|--------|-----|
| H1 | No balance check after fee | Correctness | Add `balance >= swapAmount + fee` check |
| H2 | Max swap validation order | Correctness | Validate before fee calculation |
| H3 | Silent DB failures | Correctness | Add error handling for Supabase writes |
| H4 | $5 minimum bypass (race condition) | Adversarial | Re-check balance just before execution |
| H5 | Uniswap API trust | Adversarial | Whitelist router addresses |
| H6 | Non-atomic fee collection | Adversarial | Combine fee transfer with swap |

### P2 - MEDIUM (Address when possible)

| ID | Issue | Source | Fix |
|----|-------|--------|-----|
| M1 | Rate limit exhaustion DoS | Adversarial | Add request throttling |
| M2 | Decimal precision in USD check | Correctness | Use BigInt for all calculations |
| M3 | Gas griefing via malicious delegations | Economic | Minimum delegation value $10 |
| M4 | Reduce slippage from 1% to 0.5% | Economic | Update SLIPPAGE_BPS constant |

## Alternative F&G Oracle Sources

Research needed:
- LunarCrush API (social sentiment)
- Santiment API (on-chain + social)
- Glassnode (on-chain metrics)
- Create our own from BTC price volatility

Fallback approach: If F&G API fails or is stale (>6 hours), use HOLD action.

## Sub-Agent Assignment

1. **Agent A:** Fix C1, C2, H1, H2 (calculation/validation fixes)
2. **Agent B:** Fix C4, M4 (MEV protection + slippage)
3. **Agent C:** Fix H3, H5 (error handling + API validation)
4. **Agent D:** Research F&G alternatives + implement C5

---
Generated: 2026-02-07
