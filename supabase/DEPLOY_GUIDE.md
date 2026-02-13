# DCA Edge Function - Deployment Guide

This is the **complete step-by-step guide** to deploy the DCA executor to Supabase.

## ✅ Prerequisites

- [x] Supabase project: `coulnwjergkqsjmdsioz`
- [x] pg_cron enabled
- [x] Edge Function code complete (32KB, ~1000 lines)
- [x] All logic implemented and ready

## 🚀 Deployment Steps

### 1. Install Supabase CLI (if not already)

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
cd /home/clawdbot/projects/ember-fear-greed-dca
supabase login
```

This will open a browser for authentication.

### 3. Link to Your Project

```bash
supabase link --project-ref coulnwjergkqsjmdsioz
```

### 4. Set Environment Variables

Go to: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/settings/functions

Click **"Add secret"** and add these:

| Secret Name | Value | Where to Find |
|------------|-------|---------------|
| `BACKEND_PRIVATE_KEY` | `<your_backend_eoa_private_key>` | Remove `0x` prefix! |
| `PIMLICO_API_KEY` | `<your_pimlico_api_key>` | From Pimlico dashboard |
| `UNISWAP_API_KEY` | `<your_uniswap_trading_api_key>` | From Uniswap API portal |
| `ALCHEMY_API_KEY` | `NQlmwdn5GImg3XWpPUNp4` | Already known |

**CRITICAL**: Remove `0x` prefix from `BACKEND_PRIVATE_KEY` or the function will fail!

### 5. Deploy the Edge Function

```bash
supabase functions deploy dca-executor --no-verify-jwt
```

Expected output:
```
Deploying Function (project-ref: coulnwjergkqsjmdsioz)...
✓ Deployed dca-executor
Function URL: https://coulnwjergkqsjmdsioz.supabase.co/functions/v1/dca-executor
```

### 6. Test Manual Invocation

Get your anon key from: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/settings/api

```bash
# Set your anon key
ANON_KEY="<your_anon_key_here>"

# Test the function
curl -X POST "https://coulnwjergkqsjmdsioz.supabase.co/functions/v1/dca-executor" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json"
```

**Expected response** (if market is neutral):
```json
{
  "success": true,
  "action": "hold",
  "fgValue": 50,
  "message": "Market neutral - no swaps executed"
}
```

**Expected response** (if swaps executed):
```json
{
  "success": true,
  "action": "buy",
  "fgValue": 25,
  "delegations": 12,
  "successfulSwaps": 10,
  "totalVolume": "45.50",
  "totalFees": "0.091"
}
```

### 7. View Logs

```bash
# Watch logs in real-time
supabase functions logs dca-executor --tail

# Or view in dashboard:
# https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/logs/edge-functions
```

### 8. Setup pg_cron Trigger

Apply the migration:

```bash
supabase db push
```

Or manually in SQL Editor (https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/sql/new):

```sql
-- Setup config
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://coulnwjergkqsjmdsioz.supabase.co';
ALTER DATABASE postgres SET app.settings.supabase_anon_key = '<your_anon_key>';

-- Create function to invoke Edge Function
CREATE OR REPLACE FUNCTION invoke_dca_executor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url TEXT;
  anon_key TEXT;
BEGIN
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/dca-executor';
  anon_key := current_setting('app.settings.supabase_anon_key', true);
  
  PERFORM
    net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := '{}'::jsonb
    );
    
  RAISE NOTICE 'DCA executor invoked at %', now();
END;
$$;

-- Schedule cron job (12:00 UTC daily)
SELECT cron.schedule(
  'daily-dca-execution',
  '0 12 * * *',
  $$SELECT invoke_dca_executor()$$
);
```

### 9. Verify Cron Schedule

In SQL Editor:

```sql
-- View cron jobs
SELECT * FROM cron.job WHERE jobname LIKE '%dca%';

-- View recent runs
SELECT * FROM cron.job_run_details 
WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE '%dca%')
ORDER BY start_time DESC 
LIMIT 10;

-- Manually trigger (for testing)
SELECT invoke_dca_executor();
```

### 10. Monitor Execution

Check database for results:

```sql
-- Check today's execution
SELECT * FROM dca_daily_executions 
WHERE execution_date = CURRENT_DATE 
ORDER BY created_at DESC;

-- View recent swaps
SELECT * FROM dca_executions 
WHERE created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC;

-- Check for failures
SELECT * FROM dca_executions 
WHERE success = false 
AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

## 🧪 Testing Checklist

Before enabling daily cron:

- [ ] Manual invocation works (curl test)
- [ ] Logs show correct behavior
- [ ] Test with 1-2 delegations first
- [ ] Verify on-chain transactions (Basescan)
- [ ] Check fees collected to EMBER Staking
- [ ] Database logs written correctly
- [ ] No errors in Supabase logs

## 🔄 Migration Plan

**Week 1: Parallel Execution**
- OpenClaw cron continues
- Supabase cron runs at 12:05 UTC (5 min offset)
- Compare results daily
- Fix any discrepancies

**Week 2: Primary with Backup**
- Supabase runs at 12:00 UTC (primary)
- OpenClaw runs at 12:10 UTC (backup/monitor)
- OpenClaw reports if Supabase failed

**Week 3: Full Migration**
- Disable OpenClaw execution cron
- Keep OpenClaw monitoring only
- Update docs

## 🚨 Troubleshooting

### Function fails to deploy
```bash
# Check you're logged in
supabase projects list

# Re-link
supabase link --project-ref coulnwjergkqsjmdsioz

# Check for syntax errors
deno check supabase/functions/dca-executor/index.ts
```

### Function runs but no swaps
1. Check logs for errors: `supabase functions logs dca-executor --tail`
2. Verify environment variables are set
3. Check Fear & Greed value (might be neutral)
4. Verify delegations exist in database
5. Check smart account balances

### UserOp submission fails
1. Check backend EOA has ETH for gas
2. Verify Pimlico API key is valid
3. Check delegation signatures are valid
4. Look for error in bundler response

### Fee collection fails
1. Check backend EOA has permission
2. Verify EMBER Staking contract address
3. Check token approvals
4. Look for revert reason in logs

### Cron doesn't trigger
```sql
-- Check if cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check job status
SELECT * FROM cron.job WHERE jobname LIKE '%dca%';

-- Check for errors
SELECT * FROM cron.job_run_details 
WHERE status != 'succeeded' 
ORDER BY start_time DESC;
```

## 📊 Monitoring Dashboard

Create a view for easy monitoring:

```sql
CREATE OR REPLACE VIEW dca_monitoring AS
SELECT 
  de.execution_date,
  de.fear_greed_index,
  de.decision,
  de.total_swaps,
  de.successful_swaps,
  de.total_volume_usd,
  de.total_fees_usd,
  ROUND((de.successful_swaps::numeric / NULLIF(de.total_swaps, 0)) * 100, 2) as success_rate_pct
FROM dca_daily_executions de
ORDER BY de.execution_date DESC
LIMIT 30;

-- Query it
SELECT * FROM dca_monitoring;
```

## 📝 Success Criteria

- ✅ Function deploys without errors
- ✅ Manual test succeeds
- ✅ Logs show correct execution flow
- ✅ On-chain transactions confirmed
- ✅ Fees collected to EMBER Staking
- ✅ Database logs written correctly
- ✅ pg_cron triggers on schedule
- ✅ Success rate > 90%

## 🎯 Rollback Plan

If issues arise:

1. **Disable cron job**:
   ```sql
   SELECT cron.unschedule('daily-dca-execution');
   ```

2. **Re-enable OpenClaw cron** (if disabled)

3. **Investigate and fix**

4. **Test again** before re-enabling

5. **Re-enable cron**:
   ```sql
   SELECT cron.schedule(
     'daily-dca-execution',
     '0 12 * * *',
     $$SELECT invoke_dca_executor()$$
   );
   ```

## 🔗 Useful Links

- **Supabase Dashboard**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz
- **Edge Functions**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/functions
- **SQL Editor**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/sql/new
- **Logs**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/logs/edge-functions
- **Cron Extension**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/integrations/cron/overview

---

**Ready to deploy?** Start with Step 1 above! 🚀
