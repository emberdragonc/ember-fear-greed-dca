'use client';

import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import { useEffect, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  isPositive?: boolean;
}

function AnimatedNumber({ value, suffix = '', prefix = '', decimals = 2, isPositive = true }: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;
    
    const timer = setInterval(() => {
      step++;
      current = Math.min(value, increment * step);
      setDisplayValue(current);
      
      if (step >= steps) {
        setDisplayValue(value);
        clearInterval(timer);
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);

  const colorClass = isPositive ? 'text-emerald-400' : 'text-red-400';
  
  return (
    <span className={colorClass}>
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </span>
  );
}

export function APYDisplay() {
  const { smartAccountAddress } = useSmartAccountContext();
  const { apyData, isLoading, hasRealData } = usePortfolioHistory(smartAccountAddress);

  if (!smartAccountAddress) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20 backdrop-blur-sm">
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
        </div>
      </div>
    );
  }

  // Don't show if no real data
  if (!hasRealData || apyData.totalDeposited === 0) {
    return (
      <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20 backdrop-blur-sm">
        <h3 className="text-sm font-medium text-gray-400 mb-2">📊 Your APY</h3>
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">Start DCA to see your APY</p>
          <p className="text-xs text-gray-600 mt-1">
            APY is calculated after your first successful execution
          </p>
        </div>
      </div>
    );
  }

  const isProfit = apyData.profitLoss >= 0;
  const isPositiveAPY = apyData.apy >= 0;

  return (
    <div className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">📊 Your APY</h3>
        {apyData.daysActive > 0 && (
          <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full">
            {apyData.daysActive} {apyData.daysActive === 1 ? 'day' : 'days'} active
          </span>
        )}
      </div>

      {/* Main APY Display */}
      <div className="text-center mb-6">
        <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
          {isPositiveAPY ? '+' : ''}{apyData.apy.toFixed(2)}%
        </p>
        <p className="text-xs text-gray-500 mt-1">Annualized Return</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
          <p className="text-xs text-gray-500 mb-1">Total Deposited</p>
          <p className="text-lg font-semibold text-white">
            ${apyData.totalDeposited.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
          <p className="text-xs text-gray-500 mb-1">Current Value</p>
          <p className="text-lg font-semibold text-white">
            ${apyData.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Profit/Loss */}
      <div className={`p-3 rounded-xl border ${isProfit ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Profit/Loss</span>
          <span className={`text-lg font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}${apyData.profitLoss.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-500">Return</span>
          <span className={`text-sm font-medium ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{apyData.profitLossPercent.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* First Deposit Date */}
      {apyData.firstDepositDate && (
        <p className="text-xs text-gray-500 text-center mt-3">
          First deposit: {apyData.firstDepositDate.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          })}
        </p>
      )}
    </div>
  );
}

export default APYDisplay;
