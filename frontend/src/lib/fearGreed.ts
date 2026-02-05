// Fear & Greed Index Service
// Data source: Alternative.me - Attribution required when displaying

export interface FearGreedData {
  value: number;
  valueClassification: string;
  timestamp: string;
  timeUntilUpdate: string;
}

export interface FearGreedHistorical {
  data: Array<{
    value: string;
    value_classification: string;
    timestamp: string;
  }>;
}

export type DCAAction = 'buy_5' | 'buy_2.5' | 'hold' | 'sell_2.5' | 'sell_5';

export interface DCADecision {
  action: DCAAction;
  percentage: number;
  direction: 'buy' | 'sell' | 'hold';
  fearGreedValue: number;
  classification: string;
  reason: string;
}

// API endpoint
const FG_API = 'https://api.alternative.me/fng/';

/**
 * Fetch current Fear & Greed Index
 */
export async function fetchFearGreedIndex(): Promise<FearGreedData> {
  const response = await fetch(FG_API);
  if (!response.ok) {
    throw new Error(`Fear & Greed API error: ${response.status}`);
  }
  
  const data = await response.json();
  const current = data.data[0];
  
  return {
    value: parseInt(current.value, 10),
    valueClassification: current.value_classification,
    timestamp: current.timestamp,
    timeUntilUpdate: current.time_until_update,
  };
}

/**
 * Fetch historical Fear & Greed data
 */
export async function fetchFearGreedHistory(limit: number = 30): Promise<FearGreedHistorical> {
  const response = await fetch(`${FG_API}?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Fear & Greed API error: ${response.status}`);
  }
  return response.json();
}

/**
 * Calculate DCA decision based on Fear & Greed value
 * 
 * Strategy:
 * - Extreme Fear (0-25): Buy 5% of USDC balance
 * - Fear (26-45): Buy 2.5% of USDC balance  
 * - Neutral (46-54): Hold
 * - Greed (55-75): Sell 2.5% of ETH balance
 * - Extreme Greed (76-100): Sell 5% of ETH balance
 */
export function calculateDCADecision(value: number, classification: string): DCADecision {
  if (value <= 25) {
    return {
      action: 'buy_5',
      percentage: 5,
      direction: 'buy',
      fearGreedValue: value,
      classification,
      reason: 'Extreme Fear - Maximum buying opportunity. Market historically oversold.',
    };
  }
  
  if (value <= 45) {
    return {
      action: 'buy_2.5',
      percentage: 2.5,
      direction: 'buy',
      fearGreedValue: value,
      classification,
      reason: 'Fear - Moderate buying opportunity. Accumulate cautiously.',
    };
  }
  
  if (value <= 54) {
    return {
      action: 'hold',
      percentage: 0,
      direction: 'hold',
      fearGreedValue: value,
      classification,
      reason: 'Neutral - Market balanced. No action needed.',
    };
  }
  
  if (value <= 75) {
    return {
      action: 'sell_2.5',
      percentage: 2.5,
      direction: 'sell',
      fearGreedValue: value,
      classification,
      reason: 'Greed - Take modest profits. Market heating up.',
    };
  }
  
  return {
    action: 'sell_5',
    percentage: 5,
    direction: 'sell',
    fearGreedValue: value,
    classification,
    reason: 'Extreme Greed - Take profits. Market historically overbought.',
  };
}

/**
 * Get color for Fear & Greed value
 */
export function getFearGreedColor(value: number): string {
  if (value <= 25) return '#ea3943'; // Extreme Fear - Red
  if (value <= 45) return '#f7931a'; // Fear - Orange
  if (value <= 54) return '#999999'; // Neutral - Gray
  if (value <= 75) return '#93c47d'; // Greed - Light Green
  return '#16c784'; // Extreme Greed - Green
}

/**
 * Get gradient colors for gauge
 */
export function getGaugeGradient(): string[] {
  return ['#ea3943', '#f7931a', '#999999', '#93c47d', '#16c784'];
}
