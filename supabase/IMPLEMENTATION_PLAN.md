# DCA Edge Function Implementation Plan

## Phase 1: Core Infrastructure ✅

- [x] Initialize Supabase project structure
- [x] Create Edge Function skeleton
- [x] Set up pg_cron migration
- [x] Document setup process
- [x] Define environment variables

## Phase 2: Port Backend Logic (HIGH PRIORITY)

### A. Client Setup
- [ ] Port `clients.ts` - viem clients initialization
  - [ ] Public client (Alchemy RPC)
  - [ ] Wallet client (backend EOA)
  - [ ] Smart account client (Permissionless.js)
  - [ ] Pimlico bundler client
  - [ ] Pimlico paymaster client

### B. Smart Account Management
- [ ] Port `smart-account.ts`
  - [ ] `initBackendSmartAccount()` - Initialize backend's smart account
  - [ ] `deployUndeployedAccounts()` - Deploy user smart accounts
  - [ ] Smart account address prediction

### C. Delegation Validation
- [ ] Port `delegation-validator.ts`
  - [ ] `validateDelegationCaveats()` - Caveat enforcement checks
  - [ ] `getActiveDelegations()` - Fetch from Supabase
  - [ ] Expiration checks
  - [ ] Delegate address validation

### D. Approval Handling
- [ ] Port `approvals.ts`
  - [ ] Check ERC20 allowance for Permit2
  - [ ] Check Permit2 allowance for Uniswap Router
  - [ ] Execute approval transactions if needed
  - [ ] Batch approval preparation

### E. Swap Engine (CRITICAL PATH)
- [ ] Port `swap-engine.ts` (5 major functions)
  
  **5.1. Quote Fetching**
  - [ ] `fetchSwapQuote()` - Get Uniswap Trading API quote
  - [ ] Quote validation (router whitelist)
  - [ ] Quote expiration checks
  - [ ] Retry logic for failed quotes
  
  **5.2. UserOp Preparation**
  - [ ] `prepareSwapUserOp()` - Build UserOperation
  - [ ] Encode calldata for redeemDelegations
  - [ ] Calculate gas limits
  - [ ] Handle paymaster sponsorship
  
  **5.3. Parallel Execution**
  - [ ] `processSwapsParallel()` - Batch UserOps
  - [ ] Nonce management (sequential key assignment)
  - [ ] Parallel bundler submission
  - [ ] Receipt polling
  
  **5.4. Fee Collection**
  - [ ] `collectFeesFromWallet()` - Transfer fees to EMBER Staking
  - [ ] Batch fee collection after swaps
  - [ ] Error handling for failed collections
  
  **5.5. Retry Logic**
  - [ ] `retrySwapWithOriginalAmounts()` - Retry failed swaps
  - [ ] Preserve original swap amounts
  - [ ] Sequential legacy mode fallback

### F. Error Handling
- [ ] Port `error-handler.ts`
  - [ ] `withRetry()` - Exponential backoff wrapper
  - [ ] Error classification (network/revert/timeout/etc)
  - [ ] Permanent vs transient failure detection

### G. Database Logging
- [ ] Port `db-logger.ts`
  - [ ] `logExecution()` - Log individual swap results
  - [ ] `updateProtocolStats()` - Update aggregated stats
  - [ ] Supabase client integration

### H. Fee Collection
- [ ] Port `fee-collector.ts`
  - [ ] Fee transfer to EMBER Staking
  - [ ] `depositRewards()` call encoding

## Phase 3: Testing & Validation

### A. Unit Tests
- [ ] Test Fear & Greed fetching
- [ ] Test decision calculation
- [ ] Test delegation filtering
- [ ] Test quote fetching (mock API)
- [ ] Test UserOp preparation
- [ ] Test fee calculation

### B. Integration Tests
- [ ] Deploy to Supabase staging
- [ ] Test with dry-run mode
- [ ] Test with single delegation
- [ ] Test with multiple delegations
- [ ] Test error scenarios
- [ ] Test retry logic

### C. End-to-End Test
- [ ] Manual trigger via curl
- [ ] Verify database logs
- [ ] Verify on-chain transactions
- [ ] Verify fees collected
- [ ] Compare with OpenClaw execution results

## Phase 4: Deployment

### A. Configuration
- [ ] Set all Edge Function secrets
- [ ] Configure pg_cron URLs
- [ ] Set up monitoring/alerting
- [ ] Document rollback procedure

### B. Gradual Rollout
- [ ] Week 1: Parallel execution (OpenClaw + Supabase)
  - [ ] Run both simultaneously
  - [ ] Compare results daily
  - [ ] Monitor for discrepancies
- [ ] Week 2: Primary + Backup
  - [ ] Supabase primary execution
  - [ ] OpenClaw backup monitor (reports failures)
- [ ] Week 3: Full Migration
  - [ ] Disable OpenClaw execution
  - [ ] Keep OpenClaw monitoring only
  - [ ] Update documentation

### C. Monitoring
- [ ] Set up Supabase Edge Function logs
- [ ] Create dashboard for execution metrics
- [ ] Set up Telegram alerts for failures
- [ ] Weekly review of execution stats

## Phase 5: Optimization (Post-Launch)

- [ ] Optimize batch size for parallel UserOps
- [ ] Reduce Edge Function cold start time
- [ ] Implement result caching where applicable
- [ ] Add more granular error reporting
- [ ] Performance benchmarking

## Dependencies & Compatibility

### External APIs
- ✅ Fear & Greed Index API (no auth required)
- ✅ Uniswap Trading API (has API key)
- ✅ Alchemy RPC (has API key)
- ✅ Pimlico Bundler (has API key)
- ✅ Pimlico Paymaster (has API key)

### Deno Compatibility Issues to Watch
- ⚠️ `permissionless` package - may need version pinning
- ⚠️ `viem` - ensure Deno-compatible import
- ⚠️ Node.js `crypto` → Use Web Crypto API
- ⚠️ Node.js `fs` → Not available (use Supabase Storage if needed)
- ⚠️ `process.env` → Use `Deno.env.get()`

### Database Schema
- ✅ `delegations` table exists
- ✅ `dca_executions` table exists
- ✅ `dca_daily_executions` table exists
- ⚠️ May need new indexes for performance

## Risk Assessment

### High Risk Items
1. **UserOp signing in Deno** - Different crypto primitives
2. **Parallel execution race conditions** - Nonce management
3. **Quote API rate limits** - Could hit limits with many delegations
4. **Gas estimation accuracy** - May need calibration

### Mitigation Strategies
1. Test signing thoroughly with known test vectors
2. Implement sequential nonce assignment per wallet
3. Implement quote caching and batching
4. Add gas buffer and dynamic estimation

## Success Criteria

- ✅ Edge Function deploys without errors
- ✅ Cron triggers on schedule
- ✅ Fetches Fear & Greed correctly
- ✅ Filters delegations correctly
- ✅ Executes swaps successfully (>90% success rate)
- ✅ Collects fees correctly
- ✅ Logs to database correctly
- ✅ Handles errors gracefully
- ✅ Runs faster than OpenClaw version (<5 min total)
- ✅ $0 cost for AI tokens

## Timeline Estimate

- **Phase 1**: ✅ Complete (1 hour)
- **Phase 2**: 🚧 In Progress (8-12 hours)
  - Core clients: 1-2 hours
  - Smart accounts: 1-2 hours
  - Delegations: 1 hour
  - Approvals: 1-2 hours
  - Swap engine: 4-6 hours (most complex)
  - Error handling: 1 hour
  - Logging: 1 hour
- **Phase 3**: Testing (4-6 hours)
- **Phase 4**: Deployment (2-3 weeks for gradual rollout)
- **Phase 5**: Optimization (ongoing)

**Total Development Time**: ~15-20 hours
**Total Migration Time**: 3-4 weeks (with testing period)

---

## Current Status

**Phase 1**: ✅ Complete  
**Phase 2**: 🚧 Ready to start - skeleton created  
**Next Action**: Port `clients.ts` and `config.ts` to Edge Function

Last updated: 2024-02-13
