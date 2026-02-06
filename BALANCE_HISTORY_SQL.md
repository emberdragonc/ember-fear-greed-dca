# Balance History Table - Supabase SQL

Run this SQL in the Supabase SQL Editor to create the balance_history table:

```sql
-- Balance History Table
-- Records snapshots of user balances after each DCA execution
CREATE TABLE balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  eth_balance TEXT NOT NULL,           -- ETH + WETH combined, stored as string for precision
  usdc_balance TEXT NOT NULL,          -- USDC balance, stored as string for precision
  total_usd NUMERIC NOT NULL,          -- Total USD value at time of recording
  eth_price NUMERIC NOT NULL,          -- ETH price used for calculation
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_balance_history_user ON balance_history(user_address);
CREATE INDEX idx_balance_history_date ON balance_history(recorded_at DESC);

-- Optional: Enable Row Level Security (RLS) for public read access
-- ALTER TABLE balance_history ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Anyone can read balance history" ON balance_history FOR SELECT USING (true);
```

## Next Steps

After creating this table, the backend (dca-executor.ts) should record a snapshot after each DCA execution. This is a separate task.

The frontend chart will show:
- **Demo data** if no history exists yet
- **Real data** once the backend starts recording snapshots

## Frontend Components Added

1. **TotalBalanceCard** - Shows combined ETH + WETH + USDC value in USD
   - Fetches live ETH price from CoinGecko
   - Shows breakdown and allocation bar

2. **BalanceHistoryChart** - Line chart using recharts
   - Shows balance over time
   - Falls back to demo data when no history exists

Both components are now visible on the dashboard when connected.

Live at: https://dca.ember.engineer
