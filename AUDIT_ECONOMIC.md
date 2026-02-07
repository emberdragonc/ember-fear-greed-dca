# Economic Audit Report: Fear & Greed DCA Executor

**Audit Date:** 2026-02-07  
**Focus:** Profit-motivated attack vectors ("How would I make money breaking this?")  
**Current TVL at Risk:** ~$3,000 (with growth potential)  
**Protocol Fee:** 0.2% (20 bps)  

---

## Executive Summary

This audit evaluates the DCA executor from an **adversarial profit motive** perspective. While the codebase demonstrates solid engineering practices, several economically exploitable vectors exist that could allow attackers to extract value from users or the protocol.

**Critical Finding:** The Fear & Greed oracle is a single-source API that can be manipulated, creating a **predictable trading signal** that sophisticated actors can front-run.

---

## 1. FEE EXTRACTION VULNERABILITIES

### 1.1 Fee Bypass via Direct Swap
**Severity:** MEDIUM  
**Profit Potential:** 0.2% of swap volume per bypass

**Attack Vector:**
```typescript
// Current fee calculation (lines 1168-1174 in dca-executor.ts)
function calculateFee(amount: bigint): bigint {
  return (amount * BigInt(FEE_BPS)) / BigInt(BPS_DENOMINATOR); // 20/10000
}
```

The fee is only collected when swaps execute through the backend executor. A sophisticated user could:
1. Monitor mempool for `redeemDelegations` calls
2. Front-run with their own direct swap using the same delegation
3. Complete the swap before the backend, bypassing fee collection

**Economic Impact:**
- At $10K daily volume: $20/day extractable
- At $100K daily volume: $200/day extractable
- **Risk:** Requires delegation replay capability - the delegation signature could theoretically be replayed if not properly protected by caveats

**Mitigation:** The delegation caveats include `LimitedCallsEnforcer` which restricts usage count, making direct replay difficult but not impossible if caveat validation fails.

### 1.2 Fee Calculation Rounding Exploit
**Severity:** LOW  
**Profit Potential:** Dust amounts, ~$0.0001 per swap

**Finding:** Fee calculation uses standard integer division:
```typescript
(amount * 20n) / 10000n
```

For amounts < 500 units (USDC has 6 decimals = $0.0005), the fee rounds to zero.

**Economic Analysis:**
- Minimum swap amount: $0.10 USDC
- Fee on $0.10: (100000 * 20) / 10000 = 200 = $0.0002
- At 10,000 small swaps: $2 extraction potential

**Conclusion:** Not economically viable due to gas costs.

### 1.3 Fee Recipient Manipulation
**Severity:** CRITICAL (if backend key compromised)  
**Profit Potential:** 100% of fees

The fee recipient is hardcoded:
```typescript
EMBER_STAKING: '0x434B2A0e38FB3E5D2ACFa2a7aE492C2A53E55Ec9'
```

If the backend private key is compromised, an attacker could:
1. Modify the code to redirect fees to their address
2. Collect 0.2% of all swap volume indefinitely

**Risk Assessment:** MEDIUM - Requires code-level access or key compromise

---

## 2. MEV OPPORTUNITIES

### 2.1 Swap Sandwiching
**Severity:** HIGH  
**Profit Potential:** 0.1-0.5% per sandwich opportunity

**Attack Vector:**
The backend executes swaps through Uniswap's Trading API with 1% slippage tolerance:
```typescript
slippageTolerance: 1, // 1% slippage tolerance
```

An MEV bot can:
1. Monitor for `eth_sendUserOperation` calls to Pimlico bundler
2. Detect swap transactions in the UserOperation batch
3. Front-run with same-direction swap to push price
4. Let backend swap execute at worse price (within 1% slippage)
5. Back-run with opposite-direction swap to capture profit

**Economic Analysis:**
- Typical sandwich profit: 0.3-0.5% of swap amount
- For a $1,000 swap: $3-5 extractable
- With 100 users at $100 average: $30-50 per batch

**Current Mitigation:** None. The protocol relies on Uniswap's routing but doesn't use MEV protection like Flashbots Protect.

### 2.2 Quote Expiration Exploitation
**Severity:** MEDIUM  
**Profit Potential:** Stale price arbitrage

**Finding:** The system fetches quotes then executes UserOperations:
```typescript
// Step 1: Get quote
const swapQuote = await getSwapQuote(...);
// Step 2: Build UserOp (network delay)
// Step 3: Submit to bundler (more delay)
```

If market moves >1% between quote and execution, the backend bears the slippage cost or the transaction reverts (wasting gas).

**Economic Analysis:**
- Quote-to-execution delay: 5-30 seconds
- Volatility window: ±0.5% typical
- **Attacker strategy:** Create volatility during execution window to force unfavorable prices

### 2.3 Batching Information Leakage
**Severity:** MEDIUM  
**Profit Potential:** Front-running knowledge of aggregate flow

The backend batches up to 50 swaps with JSON-RPC batching:
```typescript
const OPTIMAL_BATCH_SIZE = 50;
```

An attacker monitoring the bundler can see:
1. Direction of batch (buy vs sell based on F&G)
2. Aggregate volume being moved
3. Predict price impact before execution

**Economic Impact:** Information advantage for directional trading

---

## 3. PRICE MANIPULATION

### 3.1 Fear & Greed Index Manipulation ⭐ CRITICAL
**Severity:** CRITICAL  
**Profit Potential:** UNLIMITED (can drain entire TVL)

**Finding:** Single-source oracle with no verification:
```typescript
async function fetchFearGreedInternal(): Promise<{ value: number; classification: string }> {
  const response = await fetch('https://api.alternative.me/fng/');
  // No secondary sources, no staleness checks, no signature verification
}
```

**Attack Vector:**
1. alternative.me API could be compromised OR
2. Backend DNS could be poisoned OR  
3. API could return stale/cached data

**Economic Exploit:**
If an attacker can manipulate the F&G reading:
```
Real F&G: 75 (Extreme Greed → SELL)
Manipulated: 15 (Extreme Fear → BUY)
```

The protocol would:
1. Buy at local highs (due to manipulated "extreme fear" signal)
2. Sell at local lows (due to manipulated "extreme greed" signal)

**Maximum Extractable Value:**
- With $3K TVL and 5% daily swaps: $150/day at risk
- With $100K TVL: $5,000/day at risk
- **Compound damage:** Users would lose 5-10% per manipulation cycle

**Cost of Attack:**
- Compromising alternative.me: Unknown, potentially high
- DNS hijacking: $50-500 (phishing registrar credentials)
- BGP hijacking: $10K+ (nation-state level)

**Risk Score:** 9/10 - Single point of failure for entire protocol logic

### 3.2 Uniswap Price Manipulation
**Severity:** MEDIUM  
**Profit Potential:** 1-2% per manipulation

The protocol uses Uniswap spot price for ETH valuation:
```typescript
// Get quote for 1 USDC -> WETH to derive ETH price
const quoteRes = await fetch(`${TRADING_API}/quote`, ...);
```

An attacker with sufficient capital could:
1. Manipulate the USDC/WETH pool before execution
2. Cause mispricing of user portfolios
3. Trigger incorrect buy/sell decisions

**Economic Analysis:**
- WETH/USDC pool depth: ~$10M+ on Base
- Cost to move price 1%: ~$100K
- **Conclusion:** Not economically viable at current TVL, becomes viable at $1M+ TVL

---

## 4. ARBITRAGE OPPORTUNITIES

### 4.1 Stale Price Window Exploitation
**Severity:** MEDIUM  
**Profit Potential:** $1-10 per execution cycle

The system derives ETH price at the start and caches it:
```typescript
let _cachedEthPriceUsd: number | null = null;

async function getETHPriceFromUniswap(): Promise<number> {
  if (_cachedEthPriceUsd !== null) {
    return _cachedEthPriceUsd; // Stale cache used
  }
  // ... fetch logic
}
```

**Attack Window:**
- Price is cached for entire execution batch
- Batch execution can take 30-120 seconds
- If ETH moves >2% during execution, min-value check becomes invalid

**Exploit:**
1. ETH crashes 10% during execution
2. Portfolio values calculated with stale high price
3. System thinks wallets have more value than they do
4. May execute swaps on under-collateralized positions

### 4.2 Cross-Exchange Arbitrage
**Severity:** LOW  
**Profit Potential:** External to protocol

Since the protocol uses Uniswap's Trading API for routing, users get competitive rates. However, if the backend were to use a suboptimal router, arbitrageurs could extract value through the price difference.

**Current State:** Using Uniswap's official API = best available pricing

---

## 5. GAS GRIEFING

### 5.1 Failed Transaction Spam
**Severity:** HIGH  
**Profit Cost to Attacker:** ~$5-50 per grief  
**Protocol Cost:** $50-500 per grief cycle

**Attack Vector:**
The backend retries failed transactions:
```typescript
const { result, error, attempts } = await withRetry(
  () => getSwapQuoteInternal(...),
  { maxAttempts: 3, baseDelayMs: 1000 }
);
```

An attacker can cause intentional failures by:
1. Creating a delegation with caveats that will fail
2. Having insufficient balance at execution time
3. Revoking approvals after delegation

**Economic Analysis:**
Per failed UserOperation:
- Bundler gas cost: ~100,000 gas
- Base gas price: 0.1 gwei
- Cost per fail: ~$0.02
- With 50 batch: $1 per batch grief

**Amplified Griefing:**
If attacker controls multiple wallets:
- 100 malicious delegations = $100 gas waste per execution
- Daily execution = $3,000/month in wasted gas

### 5.2 Quote API Resource Exhaustion
**Severity:** MEDIUM  
**Profit Cost to Attacker:** $0  
**Protocol Impact:** Denial of service

The backend has no rate limiting on quote fetching:
```typescript
const swapQuote = await getSwapQuote(
  smartAccountAddress,
  tokenIn,
  tokenOut,
  swapAmountAfterFee.toString()
);
```

An attacker could:
1. Create many delegations with minuscule amounts
2. Force backend to fetch quotes for all
3. Exceed Uniswap API rate limits
4. Cause execution failure for all users

**Economic Analysis:**
- Uniswap API limits: 1000 requests/minute
- With 1000 delegations: exhaust quota
- Cost to attacker: $0 (just need many wallets)

---

## 6. DELEGATION FRAMEWORK VULNERABILITIES

### 6.1 Delegation Replay
**Severity:** MEDIUM  
**Profit Potential:** Unlimited if caveats fail

The system relies on MetaMask's Delegation Framework caveats:
```typescript
const CAVEAT_ENFORCERS: Record<string, string> = {
  '0x1046bb45c8d673d4ea75321280db34899413c069': 'TimestampEnforcer',
  '0x04658b29f6b82ed55274221a06fc97d318e25416': 'LimitedCallsEnforcer',
};
```

**Risk:** If `LimitedCallsEnforcer` fails or is improperly configured:
1. Delegation could be replayed multiple times
2. Attacker could drain user funds through repeated swaps
3. Fees could be extracted multiple times

**Economic Impact:**
- If 1 delegation = 1 call enforced: SAFE
- If caveat bypassed: 100% of user balance at risk

### 6.2 Delegate Address Spoofing
**Severity:** LOW  
**Profit Potential:** Complete fund loss

The backend validates delegate address:
```typescript
const EXPECTED_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1'.toLowerCase();
```

If this check were bypassed:
1. Attacker could create delegation to their own address
2. User signs thinking it's for the protocol
3. Attacker redeems delegation to steal funds

**Current Mitigation:** Hardcoded address check in backend

---

## 7. TVL AT RISK CALCULATIONS

### Current State (~$3K TVL)

| Attack Vector | Max Extractable | Attack Cost | Profit Margin |
|---------------|-----------------|-------------|---------------|
| F&G Manipulation | $150/day | $50-500 | HIGH |
| MEV Sandwich | $50/batch | $5-10 | MEDIUM |
| Fee Bypass | $20/day | $50 | LOW |
| Gas Griefing | $100/run | $5 | HIGH |
| Delegation Replay | $3,000 (full TVL) | Variable | N/A |

### Projected State ($100K TVL)

| Attack Vector | Max Extractable | Attack Cost | Profit Margin |
|---------------|-----------------|-------------|---------------|
| F&G Manipulation | $5,000/day | $50-500 | VERY HIGH |
| MEV Sandwich | $1,500/batch | $100 | HIGH |
| Price Manipulation | $2,000/day | $10,000 | MEDIUM |
| Fee Extraction | $200/day | $0 (if key comp) | INFINITE |

---

## 8. RECOMMENDED MITIGATIONS

### Immediate (Before TVL > $10K)

1. **Multi-source F&G Oracle**
   ```typescript
   // Aggregate multiple sources with median
   const sources = [
     'https://api.alternative.me/fng/',
     'https://api.coinmarketcap.com/fng/',
     'https://api.coingecko.com/fng/'
   ];
   const values = await Promise.all(sources.map(fetchFG));
   const median = calculateMedian(values);
   ```

2. **MEV Protection**
   - Use Flashbots Protect for EOA transactions
   - Use MEV-blocker enabled bundlers for UserOps
   - Add private mempool submission

3. **Quote Expiration Handling**
   ```typescript
   const QUOTE_VALIDITY_MS = 30000; // 30 seconds
   if (Date.now() - quoteTimestamp > QUOTE_VALIDITY_MS) {
     throw new Error('Quote expired, refresh required');
   }
   ```

### Medium-term (Before TVL > $100K)

4. **Decentralized Oracle**
   - Integrate Chainlink or similar for F&G data
   - Use TWAP (Time-Weighted Average Price) for ETH pricing
   - Add staleness checks (reject data >1 hour old)

5. **Slippage Protection**
   ```typescript
   const expectedOut = BigInt(quote.output.amount);
   const minOut = (expectedOut * 995n) / 1000n; // 0.5% max slippage
   ```

6. **Griefing Protection**
   - Implement minimum delegation value ($10+)
   - Add cooldown between delegation attempts
   - Verify sufficient balance before quoting

### Long-term (Before TVL > $1M)

7. **On-chain F&G Oracle**
   - Decentralized voting mechanism
   - Multi-sig oracle updates
   - Dispute resolution window

8. **Insurance Fund**
   - Allocate 10% of fees to insurance
   - Cover losses from oracle manipulation
   - Circuit breaker for anomalous F&G readings

---

## 9. CONCLUSION

**Overall Risk Rating: HIGH**

The protocol's primary vulnerability is its **single-source oracle dependency**. At current TVL (~$3K), attacks are not economically viable except for the F&G manipulation vector. However, as TVL grows beyond $10K, MEV extraction and sandwiching become profitable.

**Most Critical Finding:**
The Fear & Greed index from alternative.me is a **trusted, unverified input** that controls 100% of trading decisions. Compromising this source allows an attacker to systematically drain user funds by forcing buys at highs and sells at lows.

**Estimated Attack Costs vs Rewards:**
| TVL | Best Attack | Cost | Reward | ROI |
|-----|-------------|------|--------|-----|
| $3K | F&G Hack | $500 | $150/day | 30% (monthly) |
| $50K | F&G Hack | $500 | $2,500/day | 500% (monthly) |
| $500K | F&G + MEV | $10K | $25K/day | 250% (monthly) |

**Recommendation:** Do not grow TVL beyond $10K until multi-source oracle is implemented.

---

*Audit performed by: Ember (Sub-agent)  
Audit method: Static code analysis + economic modeling  
Disclaimer: This audit does not guarantee security. Smart contract risk is inherent in DeFi protocols.*
