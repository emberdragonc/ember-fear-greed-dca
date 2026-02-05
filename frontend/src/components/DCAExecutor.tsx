// DCAExecutor - Execute DCA based on Fear & Greed recommendation
'use client';

import { useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { base } from 'wagmi/chains';
import { formatUnits, parseUnits } from 'viem';
import { useFearGreed } from '@/hooks/useFearGreed';
import { useSwap } from '@/hooks/useSwap';
import { TOKENS, FEE_BIPS } from '@/lib/swap';

export function DCAExecutor() {
  const { address } = useAccount();
  const { decision, data: fgData } = useFearGreed();
  const { status, txHash, error, executeSwap, reset } = useSwap();
  const [isExecuting, setIsExecuting] = useState(false);

  // Get balances
  const { data: ethBalance } = useBalance({
    address,
    chainId: base.id,
  });

  const { data: usdcBalance } = useBalance({
    address,
    token: TOKENS.USDC as `0x${string}`,
    chainId: base.id,
  });

  // Calculate amounts based on decision
  const calculateSwapAmount = () => {
    if (!decision || decision.direction === 'hold') return null;

    if (decision.direction === 'buy' && usdcBalance) {
      // Buy ETH with % of USDC
      const amount = (usdcBalance.value * BigInt(Math.floor(decision.percentage * 100))) / 10000n;
      return {
        direction: 'buy' as const,
        amount: amount.toString(),
        display: formatUnits(amount, 6),
        token: 'USDC',
      };
    }

    if (decision.direction === 'sell' && ethBalance) {
      // Sell % of ETH for USDC
      const amount = (ethBalance.value * BigInt(Math.floor(decision.percentage * 100))) / 10000n;
      return {
        direction: 'sell' as const,
        amount: amount.toString(),
        display: formatUnits(amount, 18),
        token: 'ETH',
      };
    }

    return null;
  };

  const swapDetails = calculateSwapAmount();

  const handleExecute = async () => {
    if (!swapDetails) return;

    setIsExecuting(true);
    reset();

    try {
      await executeSwap(swapDetails.direction, swapDetails.amount);
    } finally {
      setIsExecuting(false);
    }
  };

  // Status colors
  const getStatusColor = () => {
    switch (status) {
      case 'checking_approval':
      case 'approving':
      case 'quoting':
      case 'swapping':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default:
        return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'checking_approval':
        return '🔍 Checking approval...';
      case 'approving':
        return '✍️ Approving token...';
      case 'quoting':
        return '📊 Getting best route...';
      case 'swapping':
        return '🔄 Executing swap...';
      case 'success':
        return '✅ Swap complete!';
      case 'error':
        return '❌ Swap failed';
      default:
        return null;
    }
  };

  if (!decision) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-xl shadow-sm border ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          DCA Recommendation
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          F&G: {fgData?.value ?? '--'}/100
        </span>
      </div>

      {/* Current recommendation */}
      <div className="mb-6">
        <div className={`text-2xl font-bold mb-2 ${
          decision.direction === 'buy' ? 'text-green-600 dark:text-green-400' :
          decision.direction === 'sell' ? 'text-red-600 dark:text-red-400' :
          'text-gray-600 dark:text-gray-400'
        }`}>
          {decision.direction === 'hold' ? '⏸️ HOLD' : 
           decision.direction === 'buy' ? `📈 BUY ${decision.percentage}%` :
           `📉 SELL ${decision.percentage}%`}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {decision.reason}
        </p>
      </div>

      {/* Swap details */}
      {swapDetails && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Amount</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {parseFloat(swapDetails.display).toFixed(swapDetails.token === 'ETH' ? 6 : 2)} {swapDetails.token}
            </span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Direction</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {swapDetails.token} → {swapDetails.token === 'USDC' ? 'ETH' : 'USDC'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500 dark:text-gray-400">Protocol Fee</span>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {FEE_BIPS / 100}% → EMBER stakers
            </span>
          </div>
        </div>
      )}

      {/* Status message */}
      {getStatusText() && (
        <div className="mb-4 p-3 rounded-lg bg-white/50 dark:bg-black/20">
          <p className="text-sm font-medium">{getStatusText()}</p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          {txHash && (
            <a 
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-1 block"
            >
              View on Basescan ↗
            </a>
          )}
        </div>
      )}

      {/* Execute button */}
      {decision.direction !== 'hold' && (
        <button
          onClick={handleExecute}
          disabled={isExecuting || status === 'success' || !swapDetails}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
            decision.direction === 'buy'
              ? 'bg-green-600 hover:bg-green-700 text-white disabled:bg-green-300'
              : 'bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300'
          } disabled:cursor-not-allowed`}
        >
          {isExecuting ? 'Executing...' : 
           status === 'success' ? 'Done!' :
           `Execute ${decision.direction === 'buy' ? 'Buy' : 'Sell'}`}
        </button>
      )}

      {decision.direction === 'hold' && (
        <div className="text-center py-3 text-gray-500 dark:text-gray-400">
          No action recommended at current sentiment level
        </div>
      )}
    </div>
  );
}

export default DCAExecutor;
