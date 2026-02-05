// useFearGreed - Hook for Fear & Greed data with auto-refresh
'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  FearGreedData, 
  DCADecision,
  fetchFearGreedIndex,
  calculateDCADecision,
} from '@/lib/fearGreed';

interface UseFearGreedResult {
  data: FearGreedData | null;
  decision: DCADecision | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useFearGreed(autoRefreshMs: number = 60000): UseFearGreedResult {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [decision, setDecision] = useState<DCADecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const fgData = await fetchFearGreedIndex();
      setData(fgData);
      
      const dcaDecision = calculateDCADecision(
        fgData.value, 
        fgData.valueClassification
      );
      setDecision(dcaDecision);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch Fear & Greed data'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefreshMs <= 0) return;
    
    const interval = setInterval(refresh, autoRefreshMs);
    return () => clearInterval(interval);
  }, [refresh, autoRefreshMs]);

  return { data, decision, loading, error, refresh, lastUpdated };
}
