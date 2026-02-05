// useProtocolStats - Fetch protocol TVL and volume stats
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface ProtocolStats {
  tvl: number;           // Total value locked in USD
  volume: number;        // Total volume processed in USD
  wallets: number;       // Number of active wallets
  executions: number;    // Total DCA executions
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats>({
    tvl: 0,
    volume: 0,
    wallets: 0,
    executions: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        if (!supabaseUrl || !supabaseKey) {
          // Return mock data if Supabase not configured
          setStats({
            tvl: 0,
            volume: 0,
            wallets: 0,
            executions: 0,
          });
          setLoading(false);
          return;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get unique wallet count
        const { count: walletCount } = await supabase
          .from('delegations')
          .select('*', { count: 'exact', head: true });

        // Get execution count and volume
        const { data: executions } = await supabase
          .from('dca_executions')
          .select('amount_in, amount_out, status')
          .eq('status', 'success');

        const executionCount = executions?.length || 0;
        const totalVolume = executions?.reduce((sum, e) => {
          // Rough USD estimation (would need price feeds for accuracy)
          const amount = parseFloat(e.amount_out || e.amount_in || '0');
          return sum + amount;
        }, 0) || 0;

        setStats({
          tvl: 0, // Would need to sum smart account balances
          volume: totalVolume,
          wallets: walletCount || 0,
          executions: executionCount,
        });
      } catch (error) {
        console.error('Failed to fetch protocol stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  return { stats, loading };
}
