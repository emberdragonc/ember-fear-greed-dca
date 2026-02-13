# Supabase DCA Quick Reference

## Prerequisites

```bash
# Install Supabase CLI globally
npm install -g supabase

# Verify installation
supabase --version
```

## Initial Setup

```bash
cd /home/clawdbot/projects/ember-fear-greed-dca

# Login to Supabase (one-time)
supabase login

# Link to your project
supabase link --project-ref coulnwjergkqsjmdsioz
```

## Set Environment Secrets

Go to: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/settings/functions

Add these secrets:

```
BACKEND_PRIVATE_KEY=<private_key_without_0x>
PIMLICO_API_KEY=<your_key>
UNISWAP_API_KEY=<your_key>
ALCHEMY_API_KEY=NQlmwdn5GImg3XWpPUNp4
```

## Deploy Edge Function

```bash
# Deploy the function
supabase functions deploy dca-executor

# View logs
supabase functions logs dca-executor --tail

# Test manually
curl -X POST 'https://coulnwjergkqsjmdsioz.supabase.co/functions/v1/dca-executor' \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json"
```

## Setup pg_cron

```bash
# Apply migration
supabase db push

# OR manually in SQL Editor:
# Copy/paste content from migrations/20260213000000_setup_dca_cron.sql

# Then set the config:
# ALTER DATABASE postgres SET app.settings.supabase_url = 'https://coulnwjergkqsjmdsioz.supabase.co';
# ALTER DATABASE postgres SET app.settings.supabase_anon_key = '<your_anon_key>';
```

## Verify Cron Schedule

In Supabase SQL Editor:

```sql
-- List cron jobs
SELECT * FROM cron.job;

-- View recent runs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Manually trigger (testing)
SELECT invoke_dca_executor();
```

## Monitor Execution

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

## Common Commands

```bash
# List functions
supabase functions list

# Delete function
supabase functions delete dca-executor

# Pull remote config
supabase db pull

# Reset local DB (careful!)
supabase db reset

# Generate TypeScript types
supabase gen types typescript --project-id coulnwjergkqsjmdsioz > types/supabase.ts
```

## Troubleshooting

### Function won't deploy
```bash
# Check you're linked
supabase projects list

# Re-link
supabase link --project-ref coulnwjergkqsjmdsioz

# Check for syntax errors
deno check supabase/functions/dca-executor/index.ts
```

### Cron not running
```sql
-- Check if extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check job status
SELECT * FROM cron.job WHERE jobname LIKE '%dca%';

-- Check for errors
SELECT * FROM cron.job_run_details 
WHERE status != 'succeeded' 
ORDER BY start_time DESC;
```

### Function runtime errors
```bash
# View logs
supabase functions logs dca-executor --tail

# Or check in dashboard:
# https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/logs/edge-functions
```

## URLs

- **Dashboard**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz
- **Edge Functions**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/functions
- **SQL Editor**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/sql/new
- **Logs**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/logs/edge-functions
- **Cron Extension**: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/integrations/cron/overview

---

**Next**: See `SUPABASE_DCA_MIGRATION.md` for full migration guide  
**Implementation**: See `IMPLEMENTATION_PLAN.md` for development checklist
