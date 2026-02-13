# Setup DCA Cron Job - Instructions

## Quick Setup (5 minutes)

### Step 1: Open Supabase SQL Editor
https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/sql/new

### Step 2: Copy & Paste This SQL

```sql
-- Setup DCA cron job for daily execution at 12:00 UTC

-- Set configuration
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://coulnwjergkqsjmdsioz.supabase.co';
ALTER DATABASE postgres SET app.settings.supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvdWxud2plcmdrcXNqbWRzaW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTA5OTgsImV4cCI6MjA4NTg4Njk5OH0.Dvas-z5rgrai5T2bRe_0ZELgdBPCEdNy-HhNsbhOLFQ';

-- Enable pg_cron (already enabled via dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create invoke function
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

-- Schedule daily at 12:00 UTC
SELECT cron.schedule(
  'daily-dca-execution',
  '0 12 * * *',
  $$SELECT invoke_dca_executor()$$
);

-- Verify
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job 
WHERE jobname = 'daily-dca-execution';
```

### Step 3: Click "RUN"

You should see a result showing the cron job:

| jobid | jobname | schedule | command | active |
|-------|---------|----------|---------|--------|
| XX | daily-dca-execution | 0 12 * * * | SELECT invoke_dca_executor() | true |

### Step 4: Test It (Optional)

To test immediately without waiting for 12:00 UTC:

```sql
SELECT invoke_dca_executor();
```

Then check the Edge Function logs:
https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/logs/edge-functions

### Step 5: Monitor Tomorrow

Check execution results:

```sql
-- View cron run history
SELECT * FROM cron.job_run_details 
WHERE jobname = 'daily-dca-execution'
ORDER BY start_time DESC 
LIMIT 10;

-- View DCA decisions
SELECT * FROM dca_daily_executions 
WHERE execution_date >= CURRENT_DATE - 7
ORDER BY execution_date DESC;
```

## What Happens Tomorrow (Feb 14, 12:00 UTC)

1. ✅ pg_cron triggers at 12:00 UTC
2. ✅ Calls Edge Function via HTTP
3. ✅ Edge Function fetches F&G Index
4. ✅ Calculates buy/sell/hold decision
5. ✅ Logs to `dca_daily_executions` table
6. ⚠️ Does NOT execute swaps (simplified version)

## OpenClaw Backup (Recommended)

Since the Edge Function is simplified (no swap execution), also ensure OpenClaw cron is running at 12:05 UTC to execute actual swaps.

---

**Need help?** Check logs at:
- Edge Functions: https://supabase.com/dashboard/project/coulnwjergkqsjmdsioz/logs/edge-functions
- Cron Jobs: SQL Editor → `SELECT * FROM cron.job_run_details`
