// fear-greed.ts - Fear & Greed Index API client

import { CONFIG, FGClassification } from "./config";

export interface FearGreedResponse {
  name: string;
  data: [
    {
      value: string; // "0" to "100"
      value_classification: FGClassification;
      timestamp: string; // Unix timestamp
      time_until_update: string; // Seconds
    }
  ];
}

export interface FearGreedData {
  value: number;
  classification: FGClassification;
  timestamp: number;
  nextUpdateIn: number;
}

/**
 * Fetch the current Fear & Greed Index from Alternative.me API
 */
export async function fetchFearGreed(): Promise<FearGreedData> {
  const response = await fetch(CONFIG.FEAR_GREED_API, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Fear & Greed data: ${response.status} ${response.statusText}`
    );
  }

  const data: FearGreedResponse = await response.json();

  if (!data.data || data.data.length === 0) {
    throw new Error("Invalid response from Fear & Greed API");
  }

  const current = data.data[0];

  return {
    value: parseInt(current.value, 10),
    classification: current.value_classification,
    timestamp: parseInt(current.timestamp, 10) * 1000, // Convert to milliseconds
    nextUpdateIn: parseInt(current.time_until_update, 10),
  };
}

/**
 * Get color for F&G classification
 */
export function getFGColor(
  classification: FGClassification
): { bg: string; text: string; gauge: string } {
  switch (classification) {
    case "Extreme Fear":
      return {
        bg: "bg-red-100 dark:bg-red-900",
        text: "text-red-600 dark:text-red-400",
        gauge: "from-red-600 to-red-400",
      };
    case "Fear":
      return {
        bg: "bg-orange-100 dark:bg-orange-900",
        text: "text-orange-600 dark:text-orange-400",
        gauge: "from-orange-600 to-orange-400",
      };
    case "Neutral":
      return {
        bg: "bg-yellow-100 dark:bg-yellow-900",
        text: "text-yellow-600 dark:text-yellow-400",
        gauge: "from-yellow-600 to-yellow-400",
      };
    case "Greed":
      return {
        bg: "bg-lime-100 dark:bg-lime-900",
        text: "text-lime-600 dark:text-lime-400",
        gauge: "from-lime-600 to-lime-400",
      };
    case "Extreme Greed":
      return {
        bg: "bg-green-100 dark:bg-green-900",
        text: "text-green-600 dark:text-green-400",
        gauge: "from-green-600 to-green-400",
      };
    default:
      return {
        bg: "bg-gray-100 dark:bg-gray-800",
        text: "text-gray-600 dark:text-gray-400",
        gauge: "from-gray-600 to-gray-400",
      };
  }
}

/**
 * Calculate gauge percentage (0-100 scale)
 */
export function getGaugePercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}
