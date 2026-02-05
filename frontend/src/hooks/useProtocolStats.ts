// useProtocolStats - Fetch protocol TVL and volume stats from Supabase
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface ProtocolStats {
  tvl: number;           // Total value locked in USD (placeholder for now)
  volume: number;        // Total volume processed in USD
  wallets: number;       // Number of active wallets
  executions: number;    // Total DCA executions
  fees: number;          // Total fees collected
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats>({
    tvl: 0,
    volume: 0,
    wallets: 0,
    executions: 0,
    fees: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchStats() {
      // Return defaults if Supabase not configured
      if (!supabaseUrl || !supabaseKey) {
        setStats({
          tvl: 0,
          volume: 0,
          wallets: 0,
          executions: 0,
          fees: 0,
        });
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fetch from protocol_overview view
        const { data, error: fetchError } = await supabase
          .from('protocol_overview')
          .select('*')
          .single();

        if (fetchError) {
          // View might not exist yet, return defaults
          console.warn('Protocol stats not available:', fetchError.message);
          setStats({
            tvl: 0,
            volume: 0,
            wallets: 0,
            executions: 0,
            fees: 0,
          });
        } else if (data) {
          // Convert from base units to USD
          // Assuming volume/fees are in USDC (6 decimals)
          setStats({
            tvl: 0, // TODO: Calculate from smart account balances
            volume: parseFloat(data.total_volume) / 1e6,
            wallets: data.active_wallets || 0,
            executions: data.total_executions || 0,
            fees: parseFloat(data.total_fees) / 1e6,
          });
        }
      } catch (err) {
        console.error('Failed to fetch protocol stats:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch stats'));
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  return { stats, loading, error };
}
