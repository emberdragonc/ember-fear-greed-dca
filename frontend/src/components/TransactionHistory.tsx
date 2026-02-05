// TransactionHistory.tsx - Shows DCA execution history
'use client';

import { useState, useEffect } from 'react';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';

interface Execution {
  id: string;
  timestamp: string;
  action: 'buy' | 'sell';
  amount: string;
  token: string;
  fgValue: number;
  fgClassification: string;
  txHash: string;
}

export function TransactionHistory() {
  const { smartAccountAddress } = useSmartAccountContext();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch from Supabase when backend is connected
    // For now, show empty state
    setLoading(false);
    setExecutions([]);
  }, [smartAccountAddress]);

  if (!smartAccountAddress) {
    return null;
  }

  return (
    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
      <h3 className="text-sm font-medium text-gray-400 mb-4">DCA History</h3>
      
      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
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
              className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  exec.action === 'buy' 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {exec.action === 'buy' ? '↓' : '↑'}
                </div>
                <div>
                  <p className="font-medium text-white text-sm">
                    {exec.action === 'buy' ? 'Bought' : 'Sold'} {exec.amount} {exec.token}
                  </p>
                  <p className="text-xs text-gray-500">
                    F&G: {exec.fgValue} ({exec.fgClassification})
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  {new Date(exec.timestamp).toLocaleDateString()}
                </p>
                <a 
                  href={`https://basescan.org/tx/${exec.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  View →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TransactionHistory;
