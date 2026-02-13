-- Migration: Add error_detail and wallet_address columns to dca_executions
-- Date: 2026-02-12
-- Reason: Support enhanced error logging added in commit 3f7650e

-- Add error_detail column for granular error tracking
ALTER TABLE dca_executions 
ADD COLUMN IF NOT EXISTS error_detail TEXT;

-- Add wallet_address column to track which wallet executed the swap
ALTER TABLE dca_executions 
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'dca_executions'
ORDER BY ordinal_position;
