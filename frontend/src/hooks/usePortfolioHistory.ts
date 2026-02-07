// usePortfolioHistory.ts - Hook to fetch and calculate portfolio history from dca_executions
import { useState, useEffect, useCallback } from 'react';

const FALLBACK_ETH_PRICE = 2000;

export interface PortfolioDataPoint {
  date: string;
  displayDate: string;
  total_usd: number;
  eth_balance: number;
  usdc_balance: number;
  eth_price: number;
  action?: string;
}

export interface APYData {
  apy: number;
  totalDeposited: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercent: number;
  daysActive: number;
  firstDepositDate: Date | null;
}

interface Execution {
  id: string;
  timestamp: string;
  action: 'buy' | 'sell' | 'hold';
  amount_in: string;
  amount_out: string | null;
  fear_greed_index: number;
  tx_hash: string | null;
  status: 'pending' | 'success' | 'failed';
  created_at: string;
}

// Fetch current ETH price from CoinGecko
async function getEthPrice(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { cache: 'no-store' }
    );
    if (!response.ok) throw new Error('Failed to fetch price');
    const data = await response.json();
    return data.ethereum?.usd || FALLBACK_ETH_PRICE;
  } catch (err) {
    console.error('Error fetching ETH price:', err);
    return FALLBACK_ETH_PRICE;
  }
}

// Fetch executions for a user
async function fetchExecutions(userAddress: string): Promise<Execution[]> {
  try {
    const response = await fetch(`/api/executions?userAddress=${userAddress.toLowerCase()}`);
    if (!response.ok) throw new Error('Failed to fetch executions');
    const data = await response.json();
    return data.executions || [];
  } catch (err) {
    console.error('Error fetching executions:', err);
    return [];
  }
}

// Calculate portfolio value over time from executions
function calculatePortfolioHistory(
  executions: Execution[],
  currentEthPrice: number
): { history: PortfolioDataPoint[]; apyData: APYData } {
  // Filter successful buy/sell executions (not hold)
  const successfulSwaps = executions
    .filter(e => e.status === 'success' && e.action !== 'hold')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (successfulSwaps.length === 0) {
    return {
      history: [],
      apyData: {
        apy: 0,
        totalDeposited: 0,
        currentValue: 0,
        profitLoss: 0,
        profitLossPercent: 0,
        daysActive: 0,
        firstDepositDate: null,
      },
    };
  }

  // Track cumulative balances
  let ethBalance = 0;
  let usdcBalance = 0;
  let totalDeposited = 0; // Track total USDC that went into the system

  const history: PortfolioDataPoint[] = [];
  const firstDepositDate = new Date(successfulSwaps[0].timestamp);

  for (const exec of successfulSwaps) {
    const isBuy = exec.action === 'buy';
    const inDecimals = isBuy ? 6 : 18; // USDC for buy, ETH for sell
    const outDecimals = isBuy ? 18 : 6; // ETH for buy, USDC for sell

    const amountIn = parseFloat(exec.amount_in) / Math.pow(10, inDecimals);
    const amountOut = exec.amount_out
      ? parseFloat(exec.amount_out) / Math.pow(10, outDecimals)
      : 0;

    if (isBuy) {
      // Buying ETH with USDC
      usdcBalance -= amountIn;
      ethBalance += amountOut;
      totalDeposited += amountIn; // Track how much USDC was put in
    } else {
      // Selling ETH for USDC
      ethBalance -= amountIn;
      usdcBalance += amountOut;
    }

    // Calculate portfolio value at this point in time
    // We need historical ETH price, but we don't have it stored
    // For now, we'll use current price for all historical points (approximation)
    // In production, you'd want to fetch historical prices
    const totalUsd = usdcBalance + ethBalance * currentEthPrice;

    history.push({
      date: exec.timestamp,
      displayDate: new Date(exec.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      total_usd: Math.max(0, totalUsd),
      eth_balance: ethBalance,
      usdc_balance: usdcBalance,
      eth_price: currentEthPrice,
      action: exec.action,
    });
  }

  // Current state
  const currentEthBalance = ethBalance;
  const currentUsdcBalance = usdcBalance;
  const currentValue = currentUsdcBalance + currentEthBalance * currentEthPrice;

  // Calculate APY
  const now = new Date();
  const daysActive = Math.max(1, Math.floor((now.getTime() - firstDepositDate.getTime()) / (1000 * 60 * 60 * 24)));
  const yearsActive = daysActive / 365;

  // Profit/loss calculation
  const profitLoss = currentValue - totalDeposited;
  const profitLossPercent = totalDeposited > 0 ? (profitLoss / totalDeposited) * 100 : 0;

  // APY calculation: annualized return
  // Formula: ((currentValue / totalDeposited) ^ (1 / years)) - 1
  let apy = 0;
  if (totalDeposited > 0 && yearsActive > 0) {
    const totalReturn = currentValue / totalDeposited;
    apy = (Math.pow(totalReturn, 1 / yearsActive) - 1) * 100;
  }

  return {
    history,
    apyData: {
      apy,
      totalDeposited,
      currentValue,
      profitLoss,
      profitLossPercent,
      daysActive,
      firstDepositDate,
    },
  };
}

export function usePortfolioHistory(userAddress: string | null) {
  const [history, setHistory] = useState<PortfolioDataPoint[]>([]);
  const [apyData, setApyData] = useState<APYData>({
    apy: 0,
    totalDeposited: 0,
    currentValue: 0,
    profitLoss: 0,
    profitLossPercent: 0,
    daysActive: 0,
    firstDepositDate: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch current ETH price and executions in parallel
      const [currentEthPrice, executions] = await Promise.all([
        getEthPrice(),
        fetchExecutions(userAddress),
      ]);

      if (executions.length === 0) {
        setHistory([]);
        setHasRealData(false);
        setIsLoading(false);
        return;
      }

      const { history: portfolioHistory, apyData: calculatedApy } = calculatePortfolioHistory(
        executions,
        currentEthPrice
      );

      setHistory(portfolioHistory);
      setApyData(calculatedApy);
      setHasRealData(portfolioHistory.length > 0);
    } catch (err) {
      console.error('Error in usePortfolioHistory:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHasRealData(false);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    history,
    apyData,
    isLoading,
    hasRealData,
    error,
    refresh,
  };
}

export default usePortfolioHistory;
