# DCA Executor Workflow - Correctness Audit Report

**Date:** 2026-02-07  
**Scope:** `/home/clawdbot/projects/ember-fear-greed-dca/backend/dca-executor.ts`  
**Auditor:** Sub-agent (Claude)  
**Focus:** Logic correctness, state transitions, edge cases, error handling, data flow

---

## Executive Summary

The DCA executor is a complex system for executing daily swaps based on the Fear & Greed index using MetaMask's Delegation Framework and ERC-4337 UserOperations. This audit identifies **2 CRITICAL**, **3 HIGH**, **4 MEDIUM**, and **8 LOW/INFO** severity findings.

---

## Findings by Severity

### CRITICAL (2)

#### CRITICAL-1: Integer Overflow Risk in Percentage Calculation
**File:** `dca-executor.ts`, line ~1242-1244  
**Code:**
```typescript
const percentage = BigInt(Math.floor(decision.percentage * 100));
let swapAmount = (balance * percentage) / 10000n;
```

**Issue:** `decision.percentage` can be values like 5, 2.5, 0. The multiplication `decision.percentage * 100` is done in JavaScript floating-point BEFORE conversion to BigInt. This can lead to precision loss.

**Example:**
- `2.5 * 100 = 250` ✓ (works)
- But floating-point imprecision: `2.5 * 100` might be `249.99999999999997`
- `Math.floor(249.99999999999997)` = `249` → **0.1% loss in precision**

**Impact:** Users get slightly less swapped than expected. Over time this compounds.

**Fix:** Use fixed-point arithmetic or scale differently:
```typescript
// Percentages are already in format: 5 = 5%, 2.5 = 2.5%
// Convert to basis points directly without intermediate floating-point
const percentageBps = Math.round(decision.percentage * 100); // 2.5% → 250 bps
let swapAmount = (balance * BigInt(percentageBps)) / 10000n;
```

---

#### CRITICAL-2: Race Condition in Nonce Key Generation
**File:** `dca-executor.ts`, lines ~1516-1517, ~1707-1708  
**Code:**
```typescript
// Phase 1
const PHASE1_NONCE_BASE = BigInt(Date.now()) * 1000n;

// Phase 2
const baseNonceKey = BigInt(Date.now());
```

**Issue:** Using `Date.now()` for nonce keys is vulnerable to collision if the executor runs twice within the same millisecond, or if system clock changes. Nonce keys MUST be unique per UserOp but are not persisted.

**Scenario:**
1. First run starts at T1, uses nonce keys T1, T1+1, T1+2...
2. First run fails after submitting some UserOps
3. Second run starts at T2 where T2 > T1 (new nonce keys)
4. This is safe... BUT if runs overlap or clock jumps backward, collision occurs

**Worse scenario:** If the same nonce key is reused before the previous UserOp with that key is mined, the new UserOp will fail with "nonce already used".

**Fix:** Maintain persistent nonce state or use deterministic key derivation:
```typescript
// Use combination of run timestamp + wallet index
const nonceKey = (BigInt(runId) << 32n) | BigInt(walletIndex);
// Or use a counter stored in database
```

---

### HIGH (3)

#### HIGH-1: Insufficient Balance Check After Fee Calculation
**File:** `dca-executor.ts`, line ~1246-1251  
**Code:**
```typescript
let swapAmount = (balance * percentage) / 10000n;

const maxAmount = BigInt(delegation.max_amount_per_swap);
if (swapAmount > maxAmount) {
  swapAmount = maxAmount;
}

const fee = calculateFee(swapAmount);
const swapAmountAfterFee = swapAmount - fee;
```

**Issue:** If `balance < swapAmount`, the swap will fail on-chain, but this is not checked BEFORE creating the UserOp. Only a `balance === 0n` check exists elsewhere, but partial balances aren't handled.

**Impact:** UserOps created with insufficient balance waste gas (paymaster fees) and fail on-chain.

**Fix:** Add explicit check:
```typescript
if (balance < swapAmount) {
  swapAmount = balance; // Swap entire balance
  // Or skip if we want to maintain percentage semantics
}
```

---

#### HIGH-2: Missing Max Swap Amount Validation After Fee
**File:** `dca-executor.ts`, lines ~1242-1253  
**Issue:** The `max_amount_per_swap` limit is applied BEFORE the fee is deducted. This means the actual swap amount (`swapAmountAfterFee`) could violate the user's intended maximum.

**Example:**
- User sets `max_amount_per_swap = 100 USDC`
- Swap amount calculated: 100 USDC
- Fee (0.2%): 0.2 USDC
- `swapAmountAfterFee = 99.8 USDC` ✓ (acceptable)

- But if fee was 20% (hypothetical):
  - `swapAmountAfterFee = 80 USDC` which might not match user's expectation

**Fix:** Document this behavior clearly or adjust logic to apply max limit after fee.

---

#### HIGH-3: Silent Database Failures in Protocol Stats Update
**File:** `dca-executor.ts`, line ~2065-2070  
**Code:**
```typescript
async function updateProtocolStats(volume: bigint, fees: bigint) {
  const { error } = await supabase.rpc('increment_protocol_stats', {
    volume_delta: volume.toString(),
    fees_delta: fees.toString(),
  });

  if (error) {
    console.error('Failed to update stats:', error);
  }
}
```

**Issue:** Stats update failures are only logged, not retried or reported as part of execution result. This can lead to data inconsistency where swaps succeed but stats don't reflect them.

**Fix:** Add retry logic or include in the overall success/failure determination.

---

### MEDIUM (4)

#### MEDIUM-1: Decimal Precision Issue in MIN_WALLET_VALUE_USD Check
**File:** `dca-executor.ts`, line ~1679-1680  
**Code:**
```typescript
const usdcValueUsd = Number(formatUnits(usdcBalance, 6));
const ethValueUsd = Number(formatUnits(ethBalance, 18)) * ethPriceUsd;
```

**Issue:** `formatUnits` returns a string which is converted to Number. For large balances, JavaScript Number precision loss occurs (Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991).

**Example:**
- Balance: 10,000,000 USDC (10 million)
- `formatUnits` → "10000000"
- `Number("10000000")` → 10000000 ✓ (safe)

But for very large balances or more decimals, precision loss occurs.

**Fix:** Use BigInt comparison:
```typescript
// Compare in raw units with price normalization
const usdcValueUsdBps = usdcBalance * 10000n / 1_000_000n; // USDC has 6 decimals
const minValueBps = BigInt(MIN_WALLET_VALUE_USD * 10000);
```

---

#### MEDIUM-2: Unbounded Array Processing in Batch Operations
**File:** `dca-executor.ts`, lines ~1750-1800  
**Issue:** While there's batching with `OPTIMAL_BATCH_SIZE`, there's no upper limit check on total delegations. Processing 10,000 delegations would create 200 batches, taking ~100 seconds with 500ms delays.

**Impact:** Long-running execution risks:
- API rate limits
- Expired quotes
- Session timeouts
- Stale F&G data

**Fix:** Add a maximum delegation limit per run:
```typescript
const MAX_DELEGATIONS_PER_RUN = 500;
if (delegations.length > MAX_DELEGATIONS_PER_RUN) {
  console.warn(`Too many delegations (${delegations.length}), processing first ${MAX_DELEGATIONS_PER_RUN}`);
  delegations = delegations.slice(0, MAX_DELEGATIONS_PER_RUN);
}
```

---

#### MEDIUM-3: Missing Permit2 Expiration Handling in Approval Check
**File:** `dca-executor.ts`, lines ~1304-1320  
**Code:**
```typescript
async function checkPermit2Allowance(smartAccountAddress: Address): Promise<boolean> {
  const result = await publicClient.readContract({...});
  const amount = BigInt(result[0]);
  const expiration = Number(result[1]);
  const now = Math.floor(Date.now() / 1000);
  return amount > 0n && expiration > now;
}
```

**Issue:** If Permit2 allowance expires between check and execution, the swap will fail. This is a TOCTOU (Time-of-Check-Time-of-Use) vulnerability.

**Fix:** Re-check before critical operations or set generous expiration windows.

---

#### MEDIUM-4: Error Message Truncation May Lose Critical Data
**File:** `dca-executor.ts`, lines ~1169-1175  
**Code:**
```typescript
console.error(`[Batch] HTTP error ${response.status}: ${errorText.slice(0, 200)}`);
```

**Issue:** Error messages are truncated to 200 chars, potentially losing important debugging information about the error cause.

**Fix:** Log full error to a file or structured logging system, only truncate console output.

---

### LOW/INFO (8)

#### LOW-1: Unused Legacy Functions Still Present
**File:** `dca-executor.ts`, lines ~973-1070  
**Issue:** `executeDelegatedERC20Approval` and `executeDelegatedPermit2Approval` (non-UserOp versions) are defined but never called. Code bloat increases maintenance burden.

**Fix:** Remove dead code or mark as deprecated.

---

#### LOW-2: Hardcoded Gas Limits
**File:** `dca-executor.ts`, lines ~790, ~915, ~1007  
**Code:**
```typescript
gas: 500000n,  // Factory deploy
gas: 300000n,  // Approval
gas: 300000n,  // Fee transfer
```

**Issue:** Gas limits are hardcoded and may be insufficient for complex operations or network congestion. No estimation is performed.

**Fix:** Use gas estimation with buffer:
```typescript
const estimatedGas = await publicClient.estimateGas({...});
const gasWithBuffer = (estimatedGas * 120n) / 100n; // 20% buffer
```

---

#### LOW-3: Missing Input Validation on delegation_data
**File:** `dca-executor.ts`, throughout  
**Code:**
```typescript
const signedDelegation = typeof delegation.delegation_data === 'string'
  ? JSON.parse(delegation.delegation_data)
  : delegation.delegation_data;
```

**Issue:** No validation that `delegation_data` has required fields (signature, delegate, delegator, caveats). Malformed data will cause runtime errors.

**Fix:** Add validation schema:
```typescript
function validateDelegation(data: any): asserts data is SignedDelegation {
  if (!data.signature || !data.delegate || !data.delegator) {
    throw new Error('Invalid delegation structure');
  }
}
```

---

#### LOW-4: Retry Count Miscalculation in Total
**File:** `dca-executor.ts`, line ~1955  
**Code:**
```typescript
totalRetries += swapQuote.retryInfo.attempts - 1;
// ... later ...
totalRetries += swapResult.retryInfo.attempts - 1;
```

**Issue:** If both quote and swap retry, total retries reflects the sum, but the `- 1` logic assumes 0-indexed counting which may not align with actual retry attempts.

**Fix:** Clarify retry counting semantics or use explicit counters.

---

#### LOW-5: Process Exit on Fatal Error Swallows Stack Trace
**File:** `dca-executor.ts`, lines ~2124-2128  
**Code:**
```typescript
runDCA()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
```

**Issue:** The error object may not serialize well with `console.error`, potentially losing stack trace information.

**Fix:**
```typescript
.catch((error) => {
  console.error('Fatal error:', error);
  if (error instanceof Error) {
    console.error('Stack:', error.stack);
  }
  process.exit(1);
});
```

---

#### LOW-6: Magic Numbers Throughout Code
**File:** `dca-executor.ts`, various  
**Issue:** Hardcoded values like `10000n` (BPS denominator), `1000n`, `500000n` appear throughout without constants.

**Fix:** Define named constants:
```typescript
const GAS_LIMITS = {
  DEPLOY: 500_000n,
  APPROVAL: 300_000n,
  SWAP: 500_000n,
} as const;
```

---

#### LOW-7: Inconsistent Error Type Classification
**File:** `dca-executor.ts`, lines ~115-145  
**Code:**
```typescript
if (errorString.includes('insufficient') ||
    errorString.includes('transfer amount exceeds')) {
  return { type: 'revert', message: errorMessage, originalError: error, retryable: false };
}
```

**Issue:** String matching for error classification is fragile and may miss variants or be locale-dependent.

**Fix:** Use structured error codes where available from the SDK/bundler.

---

#### INFO-1: Dry-Run Simulation Uses Wrong Router Address
**File:** `dca-executor.ts`, line ~669  
**Code:**
```typescript
async function simulateSwap(...) {
  // Uses UNISWAP_ROUTER for simulation
  args: [ADDRESSES.UNISWAP_ROUTER, amountIn]
}
```

**Note:** The simulation uses a simplified transfer check, not an actual swap simulation. This is noted in comments but could be more explicit about limitations.

---

## Data Flow Verification

### Happy Path Flow
```
1. Fetch F&G Index
   └─> API call to alternative.me
   
2. Calculate Decision
   └─> Percentage based on F&G value
   
3. Get Active Delegations
   └─> Supabase query with expires_at filter
   
4. Filter Valid Delegations
   └─> Check delegate address matches expected
   └─> Validate caveats (timestamp, limits)
   
5. Phase 0: Deploy Accounts (if needed)
   └─> Check code at address
   └─> Deploy via factory if not deployed
   
6. Phase 1: Check/Set Approvals
   └─> Check ERC20 allowance
   └─> Check Permit2 allowance
   └─> Submit approval UserOps if needed
   
7. Phase 2: Execute Swaps
   └─> Get balances (USDC + ETH)
   └─> Calculate total USD value
   └─> Skip if < $5
   └─> Calculate swap amount (balance * percentage / 100)
   └─> Apply max_amount_per_swap limit
   └─> Calculate fee (0.2%)
   └─> Get swap quote from Uniswap API
   └─> Build UserOperation
   └─> Send batched UserOps
   └─> Wait for receipts
   
8. Log Results
   └─> Insert into dca_executions table
   └─> Update protocol_stats
```

### Data Flow Issues Identified

1. **Fee calculation order:** Fee is calculated on the swap amount AFTER max_amount limit, meaning users pay fee on limited amount, not original percentage amount.

2. **Balance double-read:** Balances are read once in Phase 2 prep, but swaps happen later. Price could change, making the $5 minimum check potentially stale.

3. **Quote expiration:** Uniswap quotes have limited validity, but there's no re-quoting mechanism if batch processing takes too long.

---

## State Transition Analysis

| State | Transition | Valid? | Notes |
|-------|-----------|--------|-------|
| None → Deployed | Factory deploy | ✓ | Uses deterministic salt |
| Deployed → Approved | Permit2 + ERC20 approve | ✓ | Parallel UserOps with unique nonces |
| Approved → Swapped | UserOp execution | ✓ | Via delegation redemption |
| Swapped → Logged | DB insert | ⚠️ | Silent failures possible |

### State Transition Concerns

1. **No rollback mechanism:** If Phase 2 fails after Phase 1 completes, approvals remain set but swap doesn't happen. This is acceptable (user keeps approvals).

2. **Partial batch failure:** If a batch of 50 has 25 failures, those 25 aren't automatically retried within the same run. Only end-of-run retry handles this.

---

## Edge Case Analysis

| Edge Case | Handling | Status |
|-----------|----------|--------|
| Zero balance | Checked, skipped | ✓ |
| Empty delegations array | Early return | ✓ |
| Max value overflow | Uses BigInt | ✓ |
| Expired delegation | Caveat validation catches | ✓ |
| Network timeout | Retry with backoff | ✓ |
| API rate limit | Retry with backoff | ✓ |
| Quote expiration | Retry logic | ✓ |
| Delegation with no signature | Checked before use | ✓ |
| Same wallet multiple times | UNIQUE constraint in DB | ✓ |
| Negative F&G value | Would use default (sell 5%) | ⚠️ Not explicitly handled |
| F&G > 100 | Would use default (sell 5%) | ⚠️ Not explicitly handled |
| Clock skew (expiry check) | Uses local Date.now() | ⚠️ Could be inaccurate |
| Paymaster out of funds | Would fail with AA21 | ✗ Not handled |
| Bundler unavailable | Retry only | ⚠️ No fallback bundler |

---

## Dry-Run vs Execution Path Divergence

### Key Differences

| Aspect | Dry-Run | Execution | Risk |
|--------|---------|-----------|------|
| Balance check | Single token | Both USDC+ETH | Medium - dry-run may pass when exec skips |
| Value calculation | Uniswap quote | Same | Low |
| Simulation | alchemy_simulateAssetChanges | Real UserOp | High - different code paths |
| Fee handling | Not applied | Applied | Medium - amounts differ |
| Approval checks | Not checked | Full phase | Medium - dry-run may miss approval issues |

### Recommendation
Dry-run should mirror the execution logic more closely, ideally by using the same preparation functions with a "simulation" flag.

---

## Recommendations Summary

### Immediate (Fix Before Mainnet)
1. **CRITICAL-1:** Fix percentage calculation precision
2. **CRITICAL-2:** Implement persistent nonce management
3. **HIGH-1:** Add explicit balance sufficiency check

### Short-term (Fix Within Sprint)
4. **HIGH-2:** Document or fix max_amount/fee ordering
5. **HIGH-3:** Add stats update retry
6. **MEDIUM-1:** Use BigInt for USD value comparisons
7. **MEDIUM-2:** Add max delegation limit

### Long-term (Technical Debt)
8. Remove dead code (LOW-1)
9. Add comprehensive input validation (LOW-3)
10. Implement proper gas estimation (LOW-2)

---

## Conclusion

The DCA executor is **functionally correct** for the happy path but has several edge cases and precision issues that could cause problems at scale. The two CRITICAL issues (precision loss and nonce collision risk) should be addressed before production deployment with significant TVL.

The error handling is comprehensive with retry logic, but silent failures in logging and stats updates could lead to data inconsistency.

**Overall Correctness Score: 7/10** (Good but needs refinement for production scale)
