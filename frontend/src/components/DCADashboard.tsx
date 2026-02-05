// DCADashboard - Main dashboard showing F&G status and DCA actions
'use client';

import { useFearGreed } from '@/hooks/useFearGreed';
import { getFGColorHex } from '@/lib/fear-greed';
import FearGreedGauge from './FearGreedGauge';

interface ActionHistoryItem {
  date: string;
  action: string;
  amount: string;
  fgValue: number;
  txHash?: string;
}

interface DCADashboardProps {
  balances?: {
    eth: string;
    usdc: string;
  };
  actionHistory?: ActionHistoryItem[];
}

export function DCADashboard({ balances, actionHistory = [] }: DCADashboardProps) {
  const { data, decision, loading, error, lastUpdated, refresh } = useFearGreed(60000);

  const directionColors = {
    buy: 'text-green-600 dark:text-green-400',
    sell: 'text-red-600 dark:text-red-400', 
    hold: 'text-gray-600 dark:text-gray-400',
  };

  const directionBg = {
    buy: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    sell: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    hold: 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
  };

  const directionIcon = {
    buy: '📈',
    sell: '📉',
    hold: '⏸️',
  };

  return (
    <div className="space-y-6">
      {/* Fear & Greed Display */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Fear & Greed Index
          </h3>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50"
          >
            {loading ? 'Updating...' : '↻ Refresh'}
          </button>
        </div>

        {error ? (
          <div className="text-center py-8">
            <p className="text-red-500">Error loading Fear & Greed data</p>
            <button 
              onClick={refresh}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <FearGreedGauge value={data?.value ?? 50} />
            
            {data && (
              <div className="mt-4 text-center">
                <p 
                  className="text-2xl font-bold"
                  style={{ color: getFGColorHex(data.value) }}
                >
                  {data.valueClassification}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Index: {data.value}/100
                </p>
              </div>
            )}
            
            {/* Attribution - Required by Alternative.me */}
            <p className="text-xs text-gray-400 mt-3">
              Data: <a 
                href="https://alternative.me/crypto/fear-and-greed-index/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline hover:text-gray-600"
              >
                Alternative.me Fear & Greed Index
              </a>
            </p>
          </div>
        )}

        {lastUpdated && (
          <p className="text-xs text-gray-400 text-center mt-2">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Current DCA Decision */}
      {decision && (
        <div className={`p-6 rounded-xl border ${directionBg[decision.direction]}`}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{directionIcon[decision.direction]}</span>
            <div>
              <h3 className={`text-xl font-bold ${directionColors[decision.direction]}`}>
                {decision.direction === 'hold' ? 'HOLD' : `${decision.direction.toUpperCase()} ${decision.percentage}%`}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Current recommendation
              </p>
            </div>
          </div>
          
          <p className="text-gray-700 dark:text-gray-200 mb-4">
            {decision.reason}
          </p>

          {balances && decision.direction !== 'hold' && (
            <div className="p-3 bg-white/50 dark:bg-black/20 rounded-lg">
              <p className="text-sm">
                {decision.direction === 'buy' ? (
                  <>
                    Would swap <span className="font-bold">{(parseFloat(balances.usdc) * (decision.percentage / 100)).toFixed(2)} USDC</span>
                    {' → '}ETH
                  </>
                ) : (
                  <>
                    Would swap <span className="font-bold">{(parseFloat(balances.eth) * (decision.percentage / 100)).toFixed(4)} ETH</span>
                    {' → '}USDC
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Strategy Breakdown */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Strategy Rules
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between p-2 rounded bg-red-50 dark:bg-red-900/20">
            <span>Extreme Fear (0-25)</span>
            <span className="font-medium text-green-600">Buy 5%</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-orange-50 dark:bg-orange-900/20">
            <span>Fear (26-45)</span>
            <span className="font-medium text-green-600">Buy 2.5%</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50">
            <span>Neutral (46-54)</span>
            <span className="font-medium text-gray-600 dark:text-gray-400">Hold</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-lime-50 dark:bg-lime-900/20">
            <span>Greed (55-75)</span>
            <span className="font-medium text-red-600">Sell 2.5%</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-green-50 dark:bg-green-900/20">
            <span>Extreme Greed (76-100)</span>
            <span className="font-medium text-red-600">Sell 5%</span>
          </div>
        </div>
      </div>

      {/* Recent Actions */}
      {actionHistory.length > 0 && (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recent Actions
          </h3>
          <div className="space-y-3">
            {actionHistory.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {item.action} {item.amount}
                  </p>
                  <p className="text-xs text-gray-500">
                    F&G: {item.fgValue} • {item.date}
                  </p>
                </div>
                {item.txHash && (
                  <a 
                    href={`https://basescan.org/tx/${item.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm"
                  >
                    View ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DCADashboard;
