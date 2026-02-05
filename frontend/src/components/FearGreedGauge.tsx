"use client";

import { useEffect, useState } from "react";
import {
  fetchFearGreed,
  FearGreedData,
  getFGColor,
  getGaugePercentage,
} from "@/lib/fear-greed";

export default function FearGreedGauge() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

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

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p className="text-red-600 dark:text-red-400">
          {error || "Unable to load Fear & Greed data"}
        </p>
      </div>
    );
  }

  const colors = getFGColor(data.classification);
  const percentage = getGaugePercentage(data.value);

  return (
    <div
      className={`flex flex-col items-center p-8 rounded-2xl ${colors.bg} transition-colors duration-500`}
    >
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
          Crypto Fear &amp; Greed Index
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Updated: {new Date(data.timestamp).toLocaleString()}
        </p>
      </div>

      {/* Gauge */}
      <div className="relative w-48 h-24 overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className="absolute top-0 left-0 w-full h-full rounded-full"
            style={{
              background: `conic-gradient(from 180deg, transparent ${percentage}%, #52525b ${percentage}%)`,
              transform: "rotate(180deg)",
            }}
          />
        </div>
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2">
          <div
            className="w-1 h-20 origin-bottom bg-gradient-to-t rounded-full"
            style={{
              background: `linear-gradient(to top, ${getColorHex(data.value)}, transparent)`,
              transform: `rotate(${percentage * 1.8 - 90}deg)`,
            }}
          />
        </div>
      </div>

      {/* Value */}
      <div className="text-center mt-4">
        <span className="text-5xl font-bold text-zinc-800 dark:text-zinc-100">
          {data.value}
        </span>
        <p
          className={`text-xl font-semibold mt-2 ${colors.text} uppercase tracking-wider`}
        >
          {data.classification}
        </p>
      </div>

      {/* Scale */}
      <div className="w-full max-w-xs mt-6">
        <div className="flex justify-between text-xs text-zinc-400 mb-1">
          <span>Extreme Fear</span>
          <span>Neutral</span>
          <span>Extreme Greed</span>
        </div>
        <div className="h-3 rounded-full bg-gradient-to-r from-red-600 via-yellow-400 to-green-500" />
        <div
          className="w-3 h-4 bg-zinc-800 dark:bg-white rounded-full transform -translate-x-1/2 mt-1 transition-all duration-500"
          style={{ marginLeft: `${percentage}%` }}
        />
      </div>

      {/* Legend */}
      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div className="text-zinc-600 dark:text-zinc-400">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2" />
          0-25: Extreme Fear (Buy 2x)
        </div>
        <div className="text-zinc-600 dark:text-zinc-400">
          <span className="inline-block w-3 h-3 rounded-full bg-orange-500 mr-2" />
          26-45: Fear (Buy 1x)
        </div>
        <div className="text-zinc-600 dark:text-zinc-400">
          <span className="inline-block w-3 h-3 rounded-full bg-yellow-500 mr-2" />
          46-54: Neutral (Hold)
        </div>
        <div className="text-zinc-600 dark:text-zinc-400">
          <span className="inline-block w-3 h-3 rounded-full bg-lime-500 mr-2" />
          55-75: Greed (Sell 1x)
        </div>
        <div className="text-zinc-600 dark:text-zinc-400 col-span-2 text-center">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2" />
          76-100: Extreme Greed (Sell 2x)
        </div>
      </div>
    </div>
  );
}

function getColorHex(value: number): string {
  if (value <= 25) return "#dc2626";
  if (value <= 45) return "#ea580c";
  if (value <= 54) return "#ca8a04";
  if (value <= 75) return "#65a30d";
  return "#16a34a";
}
