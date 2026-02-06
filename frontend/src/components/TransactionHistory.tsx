// TransactionHistory.tsx - Shows DCA execution history
'use client';

import { useState, useEffect } from 'react';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { useAccount } from 'wagmi';

interface Execution {
  id: string;
  timestamp: string;
  action: 'buy' | 'sell' | 'hold';
  amount_in: string;
  amount_out: string | null;
  fear_greed_index: number;
  tx_hash: string | null;
  status: 'pending' | 'success' | 'failed';
  error_message: string | null;
}

export function TransactionHistory() {
  const { smartAccountAddress } = useSmartAccountContext();
  const { address: eoaAddress } = useAccount();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchExecutions() {
      if (!smartAccountAddress && !eoaAddress) {
        setLoading(false);
        return;
      }

      try {
        // Try with smart account address first, fall back to EOA
        const addressToQuery = eoaAddress?.toLowerCase();
        if (!addressToQuery) {
          setLoading(false);
          return;
        }

        const response = await fetch(`/api/executions?userAddress=${addressToQuery}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch executions');
        }

        const data = await response.json();
        setExecutions(data.executions || []);
      } catch (err) {
        console.error('Failed to fetch executions:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchExecutions();
  }, [smartAccountAddress, eoaAddress]);

  if (!smartAccountAddress && !eoaAddress) {
    return null;
  }

  // Helper to format swap - shows both sides
  const formatSwap = (exec: Execution) => {
    const isBuy = exec.action === 'buy';
    // Input: USDC (6 decimals) for buy, ETH (18 decimals) for sell
    const inDecimals = isBuy ? 6 : 18;
    const outDecimals = isBuy ? 18 : 6;
    const inAmount = parseFloat(exec.amount_in) / Math.pow(10, inDecimals);
    const outAmount = exec.amount_out ? parseFloat(exec.amount_out) / Math.pow(10, outDecimals) : null;
    
    const inStr = `${inAmount.toFixed(isBuy ? 2 : 6)} ${isBuy ? 'USDC' : 'ETH'}`;
    const outStr = outAmount ? `${outAmount.toFixed(isBuy ? 6 : 2)} ${isBuy ? 'ETH' : 'USDC'}` : '...';
    
    return { inStr, outStr };
  };

  // Helper to get F&G classification
  const getFGClassification = (value: number): string => {
    if (value <= 25) return 'Extreme Fear';
    if (value <= 45) return 'Fear';
    if (value <= 54) return 'Neutral';
    if (value <= 75) return 'Greed';
    return 'Extreme Greed';
  };

  return (
    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
      <h3 className="text-sm font-medium text-gray-400 mb-4">DCA History</h3>
      
      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
        </div>
      ) : error ? (
        <div className="text-center py-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : executions.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-1">No executions yet</p>
          <p className="text-xs text-gray-600">
            DCA runs daily at 12:00 UTC based on the Fear & Greed Index
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {executions.map((exec) => (
            <div 
              key={exec.id}
              className={`flex items-center justify-between p-3 rounded-xl border ${
                exec.status === 'success'
                  ? 'bg-white/5 border-white/5'
                  : exec.status === 'failed'
                  ? 'bg-red-500/10 border-red-500/20'
                  : 'bg-yellow-500/10 border-yellow-500/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  exec.action === 'buy' 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : exec.action === 'sell'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {exec.action === 'buy' ? '↓' : exec.action === 'sell' ? '↑' : '—'}
                </div>
                <div>
                  {exec.action !== 'hold' ? (
                    <>
                      <p className="font-medium text-white text-sm">
                        {exec.action === 'buy' ? 'Buy' : 'Sell'}: {formatSwap(exec).inStr} → {formatSwap(exec).outStr}
                      </p>
                    </>
                  ) : (
                    <p className="font-medium text-white text-sm">Hold (no action)</p>
                  )}
                  <p className="text-xs text-gray-500">
                    F&G: {exec.fear_greed_index} ({getFGClassification(exec.fear_greed_index)})
                  </p>
                  {exec.status === 'failed' && exec.error_message && (
                    <p className="text-xs text-red-400 mt-1 truncate max-w-[200px]" title={exec.error_message}>
                      {exec.error_message}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  {new Date(exec.timestamp).toLocaleDateString()}
                </p>
                {exec.tx_hash ? (
                  <a 
                    href={`https://basescan.org/tx/${exec.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View →
                  </a>
                ) : (
                  <span className={`text-xs ${
                    exec.status === 'pending' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {exec.status === 'pending' ? 'Pending' : 'Failed'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TransactionHistory;
