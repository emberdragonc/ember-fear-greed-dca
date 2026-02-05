// config.ts - Fear & Greed DCA Configuration

export const CONFIG = {
  // Feature flags
  ENABLE_MAINNET: false, // OFF until audit passes
  ENABLE_EXTREME_MULTIPLIER: true, // 2x on extreme F&G

  // Thresholds (0-100)
  EXTREME_FEAR_MAX: 25,
  FEAR_MAX: 45,
  NEUTRAL_MAX: 54,
  GREED_MAX: 75,
  // Above 75 = Extreme Greed

  // Limits
  MAX_DAILY_AMOUNT_USDC: 1000_000000n, // 1000 USDC max per day
  MIN_AMOUNT_USDC: 10_000000n, // 10 USDC minimum

  // Chain IDs
  BASE_MAINNET: 8453,
  BASE_SEPOLIA: 84532,

  // Addresses (Base Mainnet)
  ADDRESSES: {
    [8453]: {
      USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      WETH: "0x4200000000000000000000000000000000000006",
      UNISWAP_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481", // SwapRouter02
    },
    [84532]: {
      USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC Base Sepolia
      WETH: "0x4200000000000000000000000000000000000006",
      UNISWAP_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481",
    },
  },

  // Backend
  BACKEND_SIGNER: process.env.NEXT_PUBLIC_BACKEND_SIGNER || "0x",

  // API
  FEAR_GREED_API: "https://api.alternative.me/fng/",

  // Default DCA settings
  DEFAULTS: {
    BASE_AMOUNT: 50_000000n, // 50 USDC
    EXECUTION_HOUR: 12, // 12:00 UTC
  },
};

// Fear & Greed classifications
export type FGClassification =
  | "Extreme Fear"
  | "Fear"
  | "Neutral"
  | "Greed"
  | "Extreme Greed";

export interface FGThreshold {
  max: number;
  classification: FGClassification;
  action: "BUY" | "SELL" | "HOLD";
  multiplier: number;
}

export const FG_THRESHOLDS: FGThreshold[] = [
  { max: 25, classification: "Extreme Fear", action: "BUY", multiplier: 2 },
  { max: 45, classification: "Fear", action: "BUY", multiplier: 1 },
  { max: 54, classification: "Neutral", action: "HOLD", multiplier: 0 },
  { max: 75, classification: "Greed", action: "SELL", multiplier: 1 },
  { max: 100, classification: "Extreme Greed", action: "SELL", multiplier: 2 },
];

// Get action and multiplier based on F&G value
export function getFGAction(value: number): {
  action: "BUY" | "SELL" | "HOLD";
  multiplier: number;
  classification: FGClassification;
} {
  const threshold = FG_THRESHOLDS.find((t) => value <= t.max);
  if (!threshold) {
    // Fallback to extreme greed
    return {
      action: "SELL",
      multiplier: 2,
      classification: "Extreme Greed",
    };
  }
  return {
    action: threshold.action,
    multiplier: threshold.multiplier,
    classification: threshold.classification,
  };
}
