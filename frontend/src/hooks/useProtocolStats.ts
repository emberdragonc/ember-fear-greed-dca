// useProtocolStats - Fetch protocol TVL and wallet stats from API
'use client';

import { useState, useEffect } from 'react';

interface ProtocolStats {
  tvl: number;           // Total value locked in USD
  volume: number;        // Total volume processed in USD
  wallets: number;       // Number of active wallets
  executions: number;    // Total DCA executions
  fees: number;          // Total fees collected
}

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
      try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        setStats({
          tvl: data.tvl || 0,
          volume: data.volume || 0,
          wallets: data.wallets || 0,
          executions: data.executions || 0,
          fees: data.fees || 0,
        });
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
