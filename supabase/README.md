# DCA Executor - Supabase Edge Function

**Status**: 🟡 **70% Complete** - Core logic ported, UserOp execution needs completion

## Overview

This Edge Function replaces OpenClaw-based DCA execution with a more reliable, independent solution:

- **No AI dependency** - Runs without Anthropic API
- **99.9% uptime** - Supabase infrastructure
- **$0 AI cost** - No token burn for cron jobs
- **Independent** - Works even if OpenClaw is down

## Architecture

```
pg_cron (12:00 UTC)
  ↓
invoke_dca_executor() SQL function
  ↓
Edge Function (Deno runtime)
  ↓
├─ Fetch Fear & Greed Index
├─ Calculate buy/sell/hold decision
├─ Filter active delegations
├─ Fetch Uniswap quotes
├─ Execute swaps via Pimlico bundler
└─ Log results to Supabase
```

## Current Implementation Status

### ✅ Fully Implemented (70%)

1. **Fear & Greed API** - Fetches and caches index
2. **Decision Engine** - Calculates buy/sell/hold with percentage
3. **Delegation Filtering** - Validates caveats, expiration, delegate address
4. **Balance Checking** - USDC and WETH balances via Alchemy
5. **Quote Fetching** - Uniswap Trading API with retry logic
6. **Router Validation** - Whitelist protection against compromised API
7. **Slippage Calculation** - Dynamic based on swap size
8. **Fee Calculation** - 0.20% fee on swap amount
9. **Database Logging** - Writes to `dca_executions` and `dca_daily_executions`
10. **Error Handling** - Retry logic with exponential backoff
11. **Smart Account Setup** - Pimlico bundler and paymaster integration

### ⚠️ Partially Implemented (20%)

1. **Approval Checking** - ERC20 approval works, Permit2 needs completion
2. **Delegation Helpers** - Basic structure in `_shared/delegation.ts`

### ❌ TODO (10%)

1. **UserOperation Preparation** - Building UserOp with delegation redemption calldata
2. **Parallel Execution** - Batching and submitting multiple UserOps
3. **Fee Collection** - Transferring collected fees to EMBER Staking
4. **Smart Account Deployment** - Checking/deploying user smart accounts
5. **Retry Logic** - Sequential fallback for failed parallel swaps

## File Structure

```
supabase/
├── functions/
│   ├── dca-executor/
│   │   ├── index.ts          # Main Edge Function (23KB)
│   │   └── deno.json          # Deno config
│   ├── _shared/
│   │   └── delegation.ts      # Delegation framework helpers
│   └── deno.json              # Global Deno config
├── migrations/
│   └── 20260213000000_setup_dca_cron.sql  # pg_cron setup
├── DEPLOY.sh                  # Deployment script
├── QUICKSTART.md              # Quick reference
├── IMPLEMENTATION_PLAN.md     # Detailed checklist
└── README.md                  # This file
```

## Quick Deploy (For Testing)

```bash
# 1. Deploy the Edge Function
./supabase/DEPLOY.sh

# 2. Set secrets in Supabase dashboard
# https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/settings/functions
# Required:
# - BACKEND_PRIVATE_KEY
# - PIMLICO_API_KEY
# - UNISWAP_API_KEY
# - ALCHEMY_API_KEY

# 3. Test manually
curl -X POST 'https://coulnwjergkqsjmdsioz.supabase.co/functions/v1/dca-executor' \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json"
```

## What Happens When You Run It Now

The current implementation will:

1. ✅ Fetch Fear & Greed Index
2. ✅ Calculate decision (buy/sell/hold)
3. ✅ Filter valid delegations
4. ✅ Check balances
5. ✅ Fetch Uniswap quotes
6. ✅ Calculate fees and slippage
7. ⚠️ **Skip actual swap execution** (logs "not yet implemented")
8. ✅ Write results to database

**Result**: You'll see the decision and quote data in logs, but no on-chain transactions yet.

## Completing the Implementation

The remaining work is primarily in the `executeSwap()` function in `index.ts`:

```typescript
// Current implementation stops here:
const { quote, swap } = quoteResult
console.log(`Quote: ${formatUnits(BigInt(quote.output.amount), ...)}`)
console.log(`⚠️ Execution requires MetaMask delegation framework (TODO)`)

// TODO: Add this logic:
// 1. Build redeemDelegations calldata using delegation framework
// 2. Create UserOperation with:
//    - target: DELEGATION_MANAGER
//    - value: 0
//    - callData: redeemDelegations(...)
// 3. Sign UserOp with smart account
// 4. Submit to Pimlico bundler
// 5. Wait for UserOpHash and receipt
// 6. Collect fees (transfer to EMBER Staking)
// 7. Return ExecutionResult with txHash
```

### Key Files to Reference

From the existing backend:
- `backend/swap-engine.ts` - Lines 300-600 (UserOp preparation)
- `backend/smart-account.ts` - Smart account setup
- `backend/fee-collector.ts` - Fee collection logic

The main challenge is adapting the MetaMask Delegation Framework's `redeemDelegations` encoding to work in Deno.

## Testing Strategy

1. **Local Deno Test** - Run function locally with test data
2. **Dry-Run Mode** - Deploy and test without executing swaps
3. **Single Wallet Test** - Test with one delegation first
4. **Parallel Test** - Test with 2-3 delegations
5. **Production** - Full deployment with monitoring

## Monitoring

After deployment, monitor via:

```sql
-- Check today's execution
SELECT * FROM dca_daily_executions 
WHERE execution_date = CURRENT_DATE;

-- View recent swaps
SELECT * FROM dca_executions 
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- Check cron runs
SELECT * FROM cron.job_run_details 
WHERE jobname LIKE '%dca%'
ORDER BY start_time DESC LIMIT 10;
```

## Migration Timeline

**Suggested approach:**

1. **Week 1**: Complete UserOp logic, test locally
2. **Week 2**: Deploy to production, run parallel with OpenClaw
3. **Week 3**: Compare results, tune as needed
4. **Week 4**: Disable OpenClaw execution, full migration

## Support

- **Docs**: `SUPABASE_DCA_MIGRATION.md` - Full migration guide
- **Quick Ref**: `QUICKSTART.md` - Common commands
- **Checklist**: `IMPLEMENTATION_PLAN.md` - Detailed progress

---

**Last Updated**: 2024-02-13  
**Implementation**: 70% complete  
**Estimated Remaining**: 4-6 hours for full swap execution
