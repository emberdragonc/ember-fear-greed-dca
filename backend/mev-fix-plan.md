# MEV Protection Fix Plan

## Changes Required

### 1. Dynamic Slippage Constants
```typescript
// Replace hardcoded slippageTolerance: 1 with dynamic calculation
// 0.5% for swaps < $100
// 0.3% for swaps > $100
```

### 2. Helper Function for Slippage
- Calculate USD value of swap based on ETH price
- Return appropriate slippage tolerance

### 3. Minimum Output Validation
- After getting quote, calculate minAmountOut from quote output
- Verify swap calldata includes slippage protection
- If not, add manual slippage adjustment

### 4. Flashbots/Pimlico Research
- Check if Pimlico supports private mempool for UserOperations
- Document findings

## Implementation Steps
1. Add helper to calculate swap USD value
2. Add getSlippageForSwapAmount function
3. Update getSwapQuoteInternal to use dynamic slippage
4. Update runDryRunSimulation to use same slippage
5. Add minAmountOut validation before swap execution
6. Research and document Flashbots options
