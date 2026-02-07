'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';

// Mock data for demonstration when no history exists
const generateMockData = () => {
  const now = new Date();
  const data = [];
  let baseValue = 1000;
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    // Simulate some growth with volatility
    baseValue = baseValue * (1 + (Math.random() * 0.06 - 0.02));
    data.push({
      date: date.toISOString().split('T')[0],
      displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      total_usd: parseFloat(baseValue.toFixed(2)),
    });
  }
  return data;
};

interface ChartDataPoint {
  date: string;
  displayDate: string;
  total_usd: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-900/95 border border-white/10 rounded-lg p-3 shadow-lg backdrop-blur-sm">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className="text-lg font-bold text-emerald-400">
          ${payload[0].value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
      </div>
    );
  }
  return null;
};

export function BalanceHistoryChart() {
  const { smartAccountAddress } = useSmartAccountContext();
  const { history, isLoading, hasRealData, error } = usePortfolioHistory(smartAccountAddress);

  // Use real data if available, otherwise mock data
  const chartData: ChartDataPoint[] = hasRealData && history.length > 0
    ? history.map((point) => ({
        date: point.date,
        displayDate: point.displayDate,
        total_usd: point.total_usd,
      }))
    : generateMockData();

  if (!smartAccountAddress) {
    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <h3 className="text-sm font-medium text-gray-400 mb-4">📈 Balance History</h3>
        <p className="text-sm text-gray-500 text-center py-8">
          Create a smart account to view balance history
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">📈 Balance History</h3>
        {!hasRealData && !isLoading && (
          <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full">
            Demo Data
          </span>
        )}
        {hasRealData && (
          <span className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full">
            Live Data
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-sm text-red-400">Failed to load history</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
        </div>
      ) : (
        <>
          {!hasRealData && (
            <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <p className="text-xs text-blue-400">
                📊 Chart will populate with real data after your first DCA execution.
                Showing demo data for preview.
              </p>
            </div>
          )}
          
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                  vertical={false}
                />
                <XAxis
                  dataKey="displayDate"
                  stroke="#6b7280"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}`}
                  width={45}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total_usd"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 6,
                    fill: '#10b981',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {hasRealData && history.length > 1 && (
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="p-2 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-500">Start</p>
                <p className="text-sm font-semibold text-white">
                  ${history[0]?.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-2 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-500">Current</p>
                <p className="text-sm font-semibold text-white">
                  ${history[history.length - 1]?.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-2 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-500">Change</p>
                {(() => {
                  const start = history[0]?.total_usd || 0;
                  const end = history[history.length - 1]?.total_usd || 0;
                  const change = start > 0 ? ((end - start) / start) * 100 : 0;
                  const isPositive = change >= 0;
                  return (
                    <p className={`text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isPositive ? '+' : ''}{change.toFixed(2)}%
                    </p>
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default BalanceHistoryChart;
