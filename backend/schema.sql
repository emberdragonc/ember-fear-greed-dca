-- Fear & Greed DCA Schema

-- Delegations table - tracks user delegations
CREATE TABLE IF NOT EXISTS delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  smart_account_address TEXT NOT NULL,
  base_percentage DECIMAL(5,2) NOT NULL DEFAULT 5.0,
  target_asset TEXT NOT NULL DEFAULT 'ETH',
  delegation_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  caveats JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active delegations lookup
CREATE INDEX IF NOT EXISTS idx_delegations_active 
ON delegations (status, expires_at) 
WHERE status = 'active';

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_delegations_user 
ON delegations (user_address);

-- Executions table - tracks DCA executions
CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id UUID REFERENCES delegations(id),
  fg_value INTEGER NOT NULL,
  fg_classification TEXT,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'hold')),
  percentage DECIMAL(5,2) NOT NULL,
  amount_in TEXT,
  amount_out TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for execution history
CREATE INDEX IF NOT EXISTS idx_executions_delegation 
ON executions (delegation_id, executed_at DESC);

-- Index for daily lookups (to prevent duplicate executions)
CREATE INDEX IF NOT EXISTS idx_executions_daily 
ON executions (delegation_id, DATE(executed_at));

-- Fear & Greed history (optional - for analytics)
CREATE TABLE IF NOT EXISTS fg_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value INTEGER NOT NULL,
  classification TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily snapshot function
CREATE OR REPLACE FUNCTION record_fg_snapshot(p_value INTEGER, p_classification TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO fg_history (value, classification)
  VALUES (p_value, p_classification);
END;
$$ LANGUAGE plpgsql;

-- Prevent duplicate daily executions
CREATE OR REPLACE FUNCTION check_daily_execution(p_delegation_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM executions 
    WHERE delegation_id = p_delegation_id 
    AND DATE(executed_at) = CURRENT_DATE
    AND status = 'success'
  );
END;
$$ LANGUAGE plpgsql;
