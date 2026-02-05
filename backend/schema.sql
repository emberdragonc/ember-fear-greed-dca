-- Fear & Greed DCA Database Schema
-- Run this in Supabase SQL Editor

-- Drop existing tables if updating schema
DROP TABLE IF EXISTS dca_executions CASCADE;
DROP TABLE IF EXISTS delegations CASCADE;
DROP TABLE IF EXISTS protocol_stats CASCADE;

-- Delegations table: stores user delegation data
CREATE TABLE delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  delegation_hash TEXT NOT NULL,
  delegation_signature TEXT NOT NULL,
  delegation_data JSONB NOT NULL, -- Full delegation object for redemption
  max_amount_per_swap NUMERIC NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_address)
);

-- DCA Executions table: logs all execution attempts
CREATE TABLE dca_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id UUID REFERENCES delegations(id),
  user_address TEXT NOT NULL,
  fear_greed_index INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell', 'hold')),
  amount_in TEXT NOT NULL,
  amount_out TEXT,
  fee_collected TEXT DEFAULT '0',
  tx_hash TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Protocol stats table: aggregate metrics
CREATE TABLE protocol_stats (
  id INTEGER PRIMARY KEY DEFAULT 1,
  total_volume NUMERIC DEFAULT 0,
  total_fees NUMERIC DEFAULT 0,
  total_executions INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize protocol stats
INSERT INTO protocol_stats (id, total_volume, total_fees, total_executions) 
VALUES (1, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Indexes for performance
CREATE INDEX idx_delegations_user ON delegations(user_address);
CREATE INDEX idx_delegations_expires ON delegations(expires_at);
CREATE INDEX idx_executions_user ON dca_executions(user_address);
CREATE INDEX idx_executions_status ON dca_executions(status);
CREATE INDEX idx_executions_created ON dca_executions(created_at DESC);

-- Function to increment protocol stats (called from backend)
CREATE OR REPLACE FUNCTION increment_protocol_stats(
  volume_delta NUMERIC,
  fees_delta NUMERIC
)
RETURNS void AS $$
BEGIN
  UPDATE protocol_stats
  SET 
    total_volume = total_volume + volume_delta,
    total_fees = total_fees + fees_delta,
    total_executions = total_executions + 1,
    updated_at = NOW()
  WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- View for active delegations count
CREATE OR REPLACE VIEW active_delegations AS
SELECT COUNT(*) as count
FROM delegations
WHERE expires_at > NOW();

-- View for protocol overview (for frontend stats)
CREATE OR REPLACE VIEW protocol_overview AS
SELECT 
  ps.total_volume,
  ps.total_fees,
  ps.total_executions,
  (SELECT COUNT(*) FROM delegations WHERE expires_at > NOW()) as active_wallets,
  ps.updated_at
FROM protocol_stats ps
WHERE ps.id = 1;

-- Row level security (RLS)
ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dca_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_stats ENABLE ROW LEVEL SECURITY;

-- Policies: Allow read access to all, write access to service role
CREATE POLICY "Public read delegations" ON delegations FOR SELECT USING (true);
CREATE POLICY "Service write delegations" ON delegations FOR ALL USING (true);

CREATE POLICY "Public read executions" ON dca_executions FOR SELECT USING (true);
CREATE POLICY "Service write executions" ON dca_executions FOR ALL USING (true);

CREATE POLICY "Public read stats" ON protocol_stats FOR SELECT USING (true);
CREATE POLICY "Service write stats" ON protocol_stats FOR ALL USING (true);
