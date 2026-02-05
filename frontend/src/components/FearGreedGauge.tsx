// FearGreedGauge.tsx - Visual gauge for Fear & Greed Index
'use client';

import { useFearGreed } from '@/hooks/useFearGreed';

export default function FearGreedGauge() {
  const { data, loading: isLoading, error } = useFearGreed();

  if (isLoading) {
    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-red-500/20 backdrop-blur-sm">
        <p className="text-red-400 text-center">Failed to load Fear & Greed data</p>
      </div>
    );
  }

  const value = data.value;
  const classification = data.valueClassification;
  
  // Calculate needle rotation (-90 to 90 degrees)
  const rotation = (value / 100) * 180 - 90;

  // Get color based on value
  const getColor = (val: number) => {
    if (val <= 25) return { main: '#ef4444', glow: 'rgba(239,68,68,0.3)' };
    if (val <= 45) return { main: '#f97316', glow: 'rgba(249,115,22,0.3)' };
    if (val <= 54) return { main: '#6b7280', glow: 'rgba(107,114,128,0.3)' };
    if (val <= 75) return { main: '#84cc16', glow: 'rgba(132,204,22,0.3)' };
    return { main: '#22c55e', glow: 'rgba(34,197,94,0.3)' };
  };

  const colors = getColor(value);

  // Get action text
  const getAction = (val: number) => {
    if (val <= 25) return { text: 'BUY 5%', color: 'text-emerald-400' };
    if (val <= 45) return { text: 'BUY 2.5%', color: 'text-emerald-400' };
    if (val <= 54) return { text: 'HOLD', color: 'text-gray-400' };
    if (val <= 75) return { text: 'SELL 2.5%', color: 'text-red-400' };
    return { text: 'SELL 5%', color: 'text-red-400' };
  };

  const action = getAction(value);

  return (
    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">Fear & Greed Index</h3>
        <span className="text-xs text-gray-500">Updated daily</span>
      </div>
      
      {/* Gauge */}
      <div className="relative flex flex-col items-center">
        {/* Semi-circle gauge */}
        <svg viewBox="0 0 200 120" className="w-full max-w-[240px]">
          {/* Background arc */}
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#6b7280" />
              <stop offset="75%" stopColor="#84cc16" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          
          {/* Outer arc (gauge track) */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.3"
          />
          
          {/* Progress arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 251.2} 251.2`}
          />
          
          {/* Needle */}
          <g transform={`rotate(${rotation}, 100, 100)`}>
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="35"
              stroke={colors.main}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="8" fill={colors.main} />
            <circle cx="100" cy="100" r="4" fill="#0a0b0d" />
          </g>
        </svg>

        {/* Value display - positioned above the needle center */}
        <div 
          className="absolute text-center"
          style={{ bottom: '45px' }}
        >
          <div 
            className="text-4xl font-bold"
            style={{ color: colors.main, textShadow: `0 0 20px ${colors.glow}` }}
          >
            {value}
          </div>
        </div>
        
        {/* Classification - positioned below the gauge */}
        <div className="text-sm text-gray-400 capitalize mt-2 text-center">
          {classification}
        </div>
      </div>

      {/* Action indicator */}
      <div className="mt-6 p-3 rounded-xl bg-white/5 border border-white/10 text-center">
        <p className="text-xs text-gray-500 mb-1">Current Signal</p>
        <p className={`text-lg font-bold ${action.color}`}>{action.text}</p>
      </div>

      {/* Attribution */}
      <p className="mt-4 text-[10px] text-gray-600 text-center">
        Data: <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400">Alternative.me</a>
      </p>
    </div>
  );
}
