"use client";

import { useEffect, useState } from "react";
import {
  fetchFearGreed,
  FearGreedData,
  getFGColorHex,
  getGaugePercentage,
} from "@/lib/fear-greed";

interface FearGreedGaugeProps {
  value?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function FearGreedGauge({ value: externalValue, showLabel = true, size = 'md' }: FearGreedGaugeProps) {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(externalValue === undefined);
  const [error, setError] = useState<string | null>(null);

  // Use external value if provided, otherwise fetch
  const displayValue = externalValue ?? data?.value ?? 50;
  const displayLabel = data?.classification ?? getClassification(displayValue);

  useEffect(() => {
    // If external value is provided, skip fetching
    if (externalValue !== undefined) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const fg = await fetchFearGreed();
        setData(fg);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [externalValue]);

  const sizeClasses = {
    sm: 'w-32 h-16',
    md: 'w-48 h-24',
    lg: 'w-64 h-32',
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-zinc-100 dark:bg-zinc-900">
        <div className="w-16 h-16 border-4 border-zinc-300 dark:border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
        <p className="mt-4 text-zinc-500 dark:text-zinc-400">
          Loading Fear &amp; Greed Index...
        </p>
      </div>
    );
  }

  if (error && externalValue === undefined) {
    return (
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  const percentage = getGaugePercentage(displayValue);
  const color = getFGColorHex(displayValue);

  return (
    <div className="flex flex-col items-center">
      {/* Gauge SVG */}
      <svg viewBox="0 0 200 110" className={sizeClasses[size]}>
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="20"
          strokeLinecap="round"
          className="dark:stroke-zinc-700"
        />
        
        {/* Gradient arc */}
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ea3943" />
            <stop offset="25%" stopColor="#f7931a" />
            <stop offset="50%" stopColor="#999999" />
            <stop offset="75%" stopColor="#93c47d" />
            <stop offset="100%" stopColor="#16c784" />
          </linearGradient>
        </defs>
        
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="20"
          strokeLinecap="round"
          opacity="0.3"
        />
        
        {/* Needle */}
        <g transform={`rotate(${-90 + (percentage * 1.8)}, 100, 100)`}>
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="35"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="100" cy="100" r="8" fill={color} />
        </g>
        
        {/* Value display */}
        <text
          x="100"
          y="95"
          textAnchor="middle"
          className="fill-zinc-900 dark:fill-white text-2xl font-bold"
          fontSize="24"
        >
          {displayValue}
        </text>
      </svg>
      
      {/* Label */}
      {showLabel && (
        <p
          className="mt-2 text-lg font-semibold"
          style={{ color }}
        >
          {displayLabel}
        </p>
      )}
    </div>
  );
}

// Helper to get classification from value when no API data
function getClassification(value: number): string {
  if (value <= 25) return 'Extreme Fear';
  if (value <= 45) return 'Fear';
  if (value <= 54) return 'Neutral';
  if (value <= 75) return 'Greed';
  return 'Extreme Greed';
}
