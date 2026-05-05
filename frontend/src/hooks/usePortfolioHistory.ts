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
  action: 'buy' | 'sell' | 'hold' | 'rebalance';
  amount_in: string;
  amount_out: string | null;
  fear_greed_index: number;
  tx_hash: string | null;
  status: 'pending' | 'success' | 'failed';
  created_at: string;
}

// Fetch current ETH price from our Uniswap-based API (no CoinGecko)
async function getEthPrice(): Promise<number> {
  try {
    const response = await fetch('/api/eth-price', { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch price');
    const data = await response.json();
    return data.price || FALLBACK_ETH_PRICE;
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

// Derive ETH price from a swap: USDC in / ETH out (for buys)
function deriveEthPrice(exec: Execution): number | null {
  try {
    const isBuy = exec.action === 'buy';
    if (!exec.amount_in || !exec.amount_out) return null;
    const usdcRaw = isBuy ? parseFloat(exec.amount_in) : parseFloat(exec.amount_out);
    const ethRaw = isBuy ? parseFloat(exec.amount_out) : parseFloat(exec.amount_in);
    const usdc = usdcRaw / 1e6;
    const eth = ethRaw / 1e18;
    if (eth <= 0) return null;
    return usdc / eth;
  } catch {
    return null;
  }
}

// Calculate portfolio value over time from executions
// Uses execution-time ETH prices derived from swap rates for historical accuracy.
function calculatePortfolioHistory(
  executions: Execution[],
  currentEthPrice: number
): { history: PortfolioDataPoint[]; apyData: APYData } {
  // Filter successful buy/sell executions (not hold, not rebalance)
  const successfulSwaps = executions
    .filter(e => e.status === 'success' && (e.action === 'buy' || e.action === 'sell'))
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
  let totalUsdcSpent = 0;
  let totalUsdcReceived = 0;

  // Group all swaps by calendar date, tracking running state after each
  // so we emit one data point per day (last execution of the day wins)
  const dailyMap = new Map<string, PortfolioDataPoint>();
  const firstDepositDate = new Date(successfulSwaps[0].timestamp);

  for (const exec of successfulSwaps) {
    const isBuy = exec.action === 'buy';
    const inDecimals = isBuy ? 6 : 18;
    const outDecimals = isBuy ? 18 : 6;

    const amountIn = parseFloat(exec.amount_in) / Math.pow(10, inDecimals);
    const amountOut = exec.amount_out
      ? parseFloat(exec.amount_out) / Math.pow(10, outDecimals)
      : 0;

    if (isBuy) {
      ethBalance += amountOut;
      totalUsdcSpent += amountIn;
    } else {
      ethBalance -= amountIn;
      totalUsdcReceived += amountOut;
    }

    // Use the swap rate as the ETH price at this point in time
    const execEthPrice = deriveEthPrice(exec) ?? currentEthPrice;

    // Portfolio value at execution time = ETH held * price then + USDC received
    const totalUsd = ethBalance * execEthPrice + totalUsdcReceived;

    const dateKey = exec.timestamp.split('T')[0]; // YYYY-MM-DD
    dailyMap.set(dateKey, {
      date: exec.timestamp,
      displayDate: new Date(exec.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      total_usd: Math.max(0, totalUsd),
      eth_balance: ethBalance,
      usdc_balance: totalUsdcReceived,
      eth_price: execEthPrice,
      action: exec.action,
    });
  }

  // Build chronological daily history
  const history = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);

  // Override the last point to use current market price for the latest value
  if (history.length > 0) {
    const last = history[history.length - 1];
    const currentTotal = last.eth_balance * currentEthPrice + last.usdc_balance;
    history[history.length - 1] = {
      ...last,
      total_usd: Math.max(0, currentTotal),
      eth_price: currentEthPrice,
    };
  }

  const currentValue = ethBalance * currentEthPrice + totalUsdcReceived;
  const totalDeposited = totalUsdcSpent;

  const now = new Date();
  const daysActive = Math.max(1, Math.floor((now.getTime() - firstDepositDate.getTime()) / (1000 * 60 * 60 * 24)));
  const yearsActive = daysActive / 365;

  const profitLoss = currentValue - totalDeposited;
  const profitLossPercent = totalDeposited > 0 ? (profitLoss / totalDeposited) * 100 : 0;

  let apy = 0;
  if (totalDeposited > 0 && yearsActive > 0 && currentValue > 0) {
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
