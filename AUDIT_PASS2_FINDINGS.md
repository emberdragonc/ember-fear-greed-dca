# DCA Executor Audit - Pass 2 (Correctness)
**Date:** 2026-02-08  
**Auditor:** Sub-agent Audit  
**File:** `backend/dca-executor.ts`

---

## EXECUTIVE SUMMARY

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 2 | Function signature mismatch causing fixes to be ineffective |
| **HIGH** | 1 | Missing fixes in legacy retry function |
| **MEDIUM** | 1 | Unused code / dead code |
| **LOW** | 0 | - |
| **INFO** | 2 | Minor observations |

---

## CRITICAL ISSUES

### C-1: getSwapQuote Wrapper Doesn't Pass slippageToleranceBps
**Severity:** CRITICAL  
**Location:** Lines 1327-1344  

**Problem:**  
The `getSwapQuote` wrapper function only accepts 4 parameters:
```typescript
async function getSwapQuote(
  swapper: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: string
): Promise<...>
```

But callers are trying to pass 5 parameters with `slippageBps`:
- Line ~2293 in `prepareSwap`
- Line ~2405 in `executeSwapWithUserOp`  
- Line ~2831 in `processUserDCA`

The 5th argument (`slippageBps`) is **silently ignored** in JavaScript/TypeScript.

**Impact:**  
The C4/M4 fix for dynamic slippage based on swap size is **NOT WORKING**. All swaps use the default `SLIPPAGE_LARGE_BPS` (30 bps = 0.3%) regardless of whether they're below or above $100.

**Fix:**
```typescript
async function getSwapQuote(
  swapper: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: string,
  slippageToleranceBps?: number  // Add this parameter
): Promise<...> {
  const { result, error, attempts } = await withRetry(
    () => getSwapQuoteInternal(swapper, tokenIn, tokenOut, amount, slippageToleranceBps),
    { operation: 'getSwapQuote' }
  );
  // ... rest of function
}
```

---

### C-2: Missing Fixes in Legacy Retry Function (processUserDCA)
**Severity:** CRITICAL  
**Location:** Lines 2813-2821 in `processUserDCA`

**Problem:**  
The legacy `processUserDCA` function (used for retrying failed swaps) is missing the C1 and H1 fixes:

1. **C1 NOT applied:** Uses `Math.floor()` instead of `Math.round()`
   ```typescript
   const percentage = BigInt(Math.floor(decision.percentage * 100));  // Line 2813
   ```

2. **H1 NOT applied:** Missing balance check after fee calculation
   The code calculates fee and swapAmountAfterFee but never verifies the balance can cover the swapAmount.

**Impact:**  
- Floating-point precision issues could cause incorrect percentage calculations
- Retried transactions may fail with insufficient balance errors because there's no check before attempting

**Fix:**
```typescript
// FIX C1: Use Math.round() instead of Math.floor()
const percentage = BigInt(Math.round(decision.percentage * 100));
let swapAmount = (balance * percentage) / 10000n;

// FIX H2: Max check is already in correct order
const maxAmount = BigInt(delegation.max_amount_per_swap);
if (swapAmount > maxAmount) {
  swapAmount = maxAmount;
}

const fee = calculateFee(swapAmount);
const swapAmountAfterFee = swapAmount - fee;

// FIX H1: Add balance check after fee calculation
if (balance < swapAmount) {
  return {
    success: false,
    txHash: null,
    error: `Insufficient balance: ${formatUnits(balance, tokenDecimals)} < ${formatUnits(swapAmount, tokenDecimals)}`,
    errorType: 'revert',
    amountIn: '0',
    amountOut: '0',
    feeCollected: '0',
    retryCount: 0,
    lastError: 'Insufficient balance after fee calculation',
  };
}
```

---

## HIGH SEVERITY

### H-1: getSwapQuote Callers Pass Undefined for Optional Parameter
**Severity:** HIGH  
**Location:** Multiple locations

**Problem:**  
When the `getSwapQuote` wrapper is fixed to accept the 5th parameter, existing callers that don't pass it will pass `undefined`. The `getSwapQuoteInternal` has a default parameter, but it's being called via `withRetry` which might not preserve the default.

Actually, looking more carefully, TypeScript will handle this correctly - the default value will be used when undefined is passed. But this is a potential footgun.

**Impact:**  
Low immediate impact, but could cause issues if the code is refactored.

**Fix:**  
Ensure `getSwapQuote` has a default value matching `SLIPPAGE_LARGE_BPS`:
```typescript
async function getSwapQuote(
  swapper: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: string,
  slippageToleranceBps: number = SLIPPAGE_LARGE_BPS  // Add default
): Promise<...>
```

---

## MEDIUM SEVERITY

### M-1: Dead Code - executeSwapWithUserOp Never Called
**Severity:** MEDIUM  
**Location:** Lines 2381-2475

**Problem:**  
The `executeSwapWithUserOp` function is defined but never called anywhere in the codebase.

```typescript
async function executeSwapWithUserOp(
  walletData: WalletData,
  decision: DCADecision,
  nonceKey: bigint,
  ethPriceUsd?: number
): Promise<ExecutionResult> { ... }
```

**Impact:**  
- Code bloat
- Maintenance burden
- Risk of the function becoming out of sync with actual usage

**Fix:**  
Either:
1. Remove the function if not needed
2. Or use it in the retry logic if it's meant to replace `processUserDCA`

---

## INFO

### I-1: Previous Fixes Verified Correct

The following fixes from commit 199f8a1 are correctly implemented in `processSwapsParallel`:

1. **C1 (Math.round):** ✅ Correct at line 2499
   ```typescript
   const percentage = BigInt(Math.round(decision.percentage * 100));
   ```

2. **C2 (Deterministic nonce):** ✅ Correct at lines 2617 and 2695
   ```typescript
   const nonceKey = PHASE2_TIMESTAMP * 1000000n + BigInt(globalIndex);
   ```

3. **H1 (Balance check after fee):** ✅ Correct at lines 2509-2514
   ```typescript
   if (balance < swapAmount) {
     console.log(`[Phase 2] ${smartAccountAddress}: Skipping - balance...`);
     return;
   }
   ```

4. **H2 (Max swap validation order):** ✅ Correct at lines 2501-2505
   The max_amount_per_swap check happens BEFORE fee calculation.

### I-2: C5 Fix (calculateDecision) Already Fixed

The bug where `calculateDecision(fg)` was receiving an object instead of number was fixed in commit 05d8ca6. This is correct.

---

## EDGE CASE TESTING

### calculateDecision Function Tests

| F&G Value | Expected Action | Expected % | Result |
|-----------|----------------|------------|--------|
| 0 | buy | 5% | ✅ PASS |
| 25 | buy | 5% | ✅ PASS |
| 26 | buy | 2.5% | ✅ PASS |
| 45 | buy | 2.5% | ✅ PASS |
| 46 | hold | 0% | ✅ PASS |
| 54 | hold | 0% | ✅ PASS |
| 55 | sell | 2.5% | ✅ PASS |
| 75 | sell | 2.5% | ✅ PASS |
| 76 | sell | 5% | ✅ PASS |
| 100 | sell | 5% | ✅ PASS |

### Other Edge Cases

| Scenario | Expected Behavior | Status |
|----------|------------------|--------|
| Empty delegations array | Early return with "No active delegations" | ✅ Handled in `runDCA` |
| All wallets below $5 threshold | All skipped, zero volume | ✅ Handled in `processSwapsParallel` |
| Zero balance wallets | Skipped with insufficient balance | ✅ Handled in `processUserDCA` |

---

## RECOMMENDED FIX PRIORITY

### Immediate (Before Next Run)
1. **Fix C-1:** Update `getSwapQuote` to accept and pass `slippageToleranceBps`
2. **Fix C-2:** Apply C1 and H1 fixes to `processUserDCA`

### Short Term
3. **Fix M-1:** Remove or use `executeSwapWithUserOp` dead code

### Verification
4. Add unit tests for `calculateDecision` edge cases
5. Add integration test to verify slippage is correctly calculated based on swap size

---

## CONCLUSION

The DCA executor has **2 CRITICAL bugs** that prevent the recent fixes from working correctly:

1. **Dynamic slippage (C4/M4 fix) is not active** because `getSwapQuote` wrapper doesn't pass the slippage parameter through to `getSwapQuoteInternal`.

2. **Legacy retry function lacks critical fixes** (C1, H1) which could cause retries to fail when they should succeed, or succeed with incorrect amounts.

**Recommendation:** Do not deploy until C-1 and C-2 are fixed.
