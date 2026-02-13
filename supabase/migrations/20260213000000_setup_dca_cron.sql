-- Setup pg_cron for daily DCA execution
-- This migration creates a cron job that triggers the Supabase Edge Function daily at 12:00 UTC

-- Enable pg_cron extension (should already be enabled via dashboard)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to invoke the Edge Function
-- This uses pg_net to make an HTTP POST to the Edge Function
CREATE OR REPLACE FUNCTION invoke_dca_executor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_url TEXT;
  anon_key TEXT;
BEGIN
  -- Get the Supabase URL and anon key from vault or set manually
  -- Replace these with your actual values or use Supabase vault
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/dca-executor';
  anon_key := current_setting('app.settings.supabase_anon_key', true);
  
  -- Make async HTTP request to Edge Function
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

-- Schedule the cron job to run daily at 12:00 UTC
SELECT cron.schedule(
  'daily-dca-execution',           -- Job name
  '0 12 * * *',                    -- Cron expression: 12:00 UTC daily
  $$SELECT invoke_dca_executor()$$ -- Command to run
);

-- Optional: Add a pre-flight check at 11:55 UTC
SELECT cron.schedule(
  'dca-preflight-check',
  '55 11 * * *',                   -- 11:55 UTC daily
  $$SELECT invoke_dca_executor()$$ -- Same function, will just check and hold if neutral
);

-- Create a table to track cron execution logs
CREATE TABLE IF NOT EXISTS cron_execution_log (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT,
  details JSONB
);

-- Optional: View cron schedule
-- SELECT * FROM cron.job;

-- Optional: View cron run history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

COMMENT ON FUNCTION invoke_dca_executor IS 'Invokes the DCA executor Edge Function via HTTP POST';
COMMENT ON TABLE cron_execution_log IS 'Tracks manual execution logs for DCA cron jobs';
