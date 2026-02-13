# Supabase DCA Executor Migration Guide

This guide explains how to migrate DCA execution from OpenClaw cron to Supabase Edge Functions + pg_cron for improved reliability.

## Why Migrate?

**Current Problems:**
- ❌ OpenClaw down → DCA doesn't run
- ❌ Anthropic API issues → DCA doesn't run  
- ❌ Burns AI tokens just to execute a cron
- ❌ Single point of failure

**Supabase Benefits:**
- ✅ Independent: Runs even if OpenClaw/Anthropic down
- ✅ Cost: $0 AI tokens (Edge Functions are cheap)
- ✅ Reliable: Supabase 99.9% uptime SLA
- ✅ Direct DB: Already using Supabase for storage
- ✅ Built-in logging: Logs stored in Supabase automatically

## Architecture

```
pg_cron (12:00 UTC daily)
  → invoke_dca_executor() function
    → Edge Function (Deno runtime)
      → DCA Executor logic
        → Log results to dca_executions table
        → (Optional) POST to Telegram webhook

OpenClaw (optional monitoring):
  Cron (12:15 UTC daily)
    → Query Supabase for today's results
      → Report to Telegram if issues found
```

## Prerequisites

1. **Supabase Project**: You already have one (`coulnwjergkqsjmdsioz`)
2. **pg_cron Extension**: Already enabled ✅
3. **Supabase CLI**: Install with `npm install -g supabase`

## Setup Steps

### 1. Set Environment Variables for Edge Function

Go to your Supabase dashboard:
- **Project**: `coulnwjergkqsjmdsioz`
- **Settings** → **Edge Functions** → **Secrets**

Add the following secrets:

```bash
BACKEND_PRIVATE_KEY=<your_backend_eoa_private_key_without_0x>
PIMLICO_API_KEY=<your_pimlico_api_key>
UNISWAP_API_KEY=<your_uniswap_trading_api_key>
ALCHEMY_API_KEY=NQlmwdn5GImg3XWpPUNp4
```

Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available.

### 2. Deploy the Edge Function

From the project root:

```bash
cd /home/clawdbot/projects/ember-fear-greed-dca

# Login to Supabase (if not already)
npx supabase login

# Link to your project
npx supabase link --project-ref coulnwjergkqsjmdsioz

# Deploy the Edge Function
npx supabase functions deploy dca-executor
```

### 3. Run the Migration

Apply the pg_cron setup:

```bash
# Run the migration locally to test
npx supabase db push

# Or apply directly to production
psql $DATABASE_URL -f supabase/migrations/20260213000000_setup_dca_cron.sql
```

### 4. Configure the Edge Function URL in pg_cron

The migration needs your actual Supabase URL. Update the SQL function:

```sql
-- In Supabase SQL Editor, run:
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://coulnwjergkqsjmdsioz.supabase.co';
ALTER DATABASE postgres SET app.settings.supabase_anon_key = '<your_anon_key>';
```

Get your anon key from: **Settings** → **API** → **Project API keys** → **anon public**

### 5. Test the Edge Function Manually

```bash
# Test via curl
curl -X POST 'https://coulnwjergkqsjmdsioz.supabase.co/functions/v1/dca-executor' \
  -H "Authorization: Bearer <your_anon_key>" \
  -H "Content-Type: application/json"
```

Or test in Supabase dashboard:
- Go to **Edge Functions** → **dca-executor** → **Invoke**

### 6. Verify Cron Schedule

```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- View recent runs
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;

-- Manually trigger (for testing)
SELECT invoke_dca_executor();
```

### 7. Update OpenClaw Cron (Optional Monitoring)

Update your OpenClaw cron job to just monitor instead of execute:

```javascript
// In OpenClaw cron config
{
  "name": "DCA Monitor",
  "schedule": { "kind": "cron", "expr": "15 12 * * *", "tz": "UTC" },
  "payload": {
    "kind": "agentTurn",
    "message": "Check today's DCA execution in Supabase. Query dca_daily_executions for today's date. If failed or not found, investigate and report to Telegram."
  },
  "sessionTarget": "isolated"
}
```

## Current Status

### ✅ Completed
1. Supabase project initialized
2. Edge Function created (skeleton)
3. pg_cron migration written
4. Documentation complete

### 🚧 TODO (Next Steps)

1. **Complete Edge Function Implementation**:
   - Port full swap logic from `backend/swap-engine.ts`
   - Implement UserOperation batching
   - Add Uniswap quote fetching
   - Add approval handling
   - Add fee collection

2. **Deploy and Test**:
   - Deploy Edge Function to Supabase
   - Test with dry-run first
   - Run manual execution to verify
   - Enable cron schedule

3. **Monitor and Migrate**:
   - Run parallel execution (OpenClaw + Supabase) for 1 week
   - Compare results
   - Disable OpenClaw cron
   - Keep OpenClaw as backup/monitor only

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Auto-provided | `https://coulnwjergkqsjmdsioz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided | `eyJ...` |
| `BACKEND_PRIVATE_KEY` | Backend EOA private key (no 0x) | `abc123...` |
| `PIMLICO_API_KEY` | Pimlico bundler/paymaster key | `pim_...` |
| `UNISWAP_API_KEY` | Uniswap Trading API key | `xxx-yyy-zzz` |
| `ALCHEMY_API_KEY` | Alchemy RPC key | `NQlmwdn5GImg3XWpPUNp4` |

## Troubleshooting

### Edge Function fails to deploy
```bash
# Check Supabase CLI version
npx supabase --version

# Check if logged in
npx supabase projects list

# Re-link project
npx supabase link --project-ref coulnwjergkqsjmdsioz
```

### Cron doesn't trigger
```sql
-- Check cron jobs
SELECT * FROM cron.job WHERE jobname LIKE '%dca%';

-- Check recent runs
SELECT * FROM cron.job_run_details WHERE jobid IN (
  SELECT jobid FROM cron.job WHERE jobname LIKE '%dca%'
) ORDER BY start_time DESC;

-- Check for errors
SELECT * FROM cron.job_run_details WHERE status = 'failed';
```

### Edge Function fails at runtime
```bash
# View logs in Supabase dashboard
# Go to Edge Functions → dca-executor → Logs

# Or use CLI
npx supabase functions logs dca-executor --tail
```

## Next Actions

1. **Complete the Edge Function**: Port full swap logic
2. **Test deployment**: Deploy and run manual test
3. **Enable cron**: Activate the daily schedule
4. **Monitor**: Watch for 1 week before fully migrating

---

**Status**: 🚧 **Skeleton Created** - Ready for full implementation

Last updated: 2024-02-13
