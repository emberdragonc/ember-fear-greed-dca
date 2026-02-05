// DCAExecutor - Execute DCA based on Fear & Greed recommendation
'use client';

import { useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { base } from 'wagmi/chains';
import { formatUnits } from 'viem';
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
      const amount = (usdcBalance.value * BigInt(Math.floor(decision.percentage * 100))) / 10000n;
      return {
        direction: 'buy' as const,
        amount: amount.toString(),
        display: formatUnits(amount, 6),
        token: 'USDC',
      };
    }

    if (decision.direction === 'sell' && ethBalance) {
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

  // Status styles
  const getStatusStyles = () => {
    switch (status) {
      case 'checking_approval':
      case 'approving':
      case 'quoting':
      case 'swapping':
        return 'bg-yellow-500/10 border-yellow-500/20';
      case 'success':
        return 'bg-emerald-500/10 border-emerald-500/20';
      case 'error':
        return 'bg-red-500/10 border-red-500/20';
      default:
        return 'bg-white/5 border-white/10';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'checking_approval': return '🔍 Checking approval...';
      case 'approving': return '✍️ Approving token...';
      case 'quoting': return '📊 Getting best route...';
      case 'swapping': return '🔄 Executing swap...';
      case 'success': return '✅ Swap complete!';
      case 'error': return '❌ Swap failed';
      default: return null;
    }
  };

  if (!decision) {
    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-2xl border backdrop-blur-sm ${getStatusStyles()}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">
          DCA Recommendation
        </h3>
        <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-lg">
          F&G: {fgData?.value ?? '--'}/100
        </span>
      </div>

      {/* Current recommendation */}
      <div className="mb-5">
        <div className={`text-2xl font-bold mb-2 ${
          decision.direction === 'buy' ? 'text-emerald-400' :
          decision.direction === 'sell' ? 'text-red-400' :
          'text-gray-400'
        }`}>
          {decision.direction === 'hold' ? '⏸️ HOLD' : 
           decision.direction === 'buy' ? `📈 BUY ${decision.percentage}%` :
           `📉 SELL ${decision.percentage}%`}
        </div>
        <p className="text-sm text-gray-400">
          {decision.reason}
        </p>
      </div>

      {/* Swap details */}
      {swapDetails && (
        <div className="p-4 bg-black/20 rounded-xl mb-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Amount</span>
            <span className="font-medium text-white">
              {parseFloat(swapDetails.display).toFixed(swapDetails.token === 'ETH' ? 6 : 2)} {swapDetails.token}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Direction</span>
            <span className="font-medium text-white">
              {swapDetails.token} → {swapDetails.token === 'USDC' ? 'ETH' : 'USDC'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Protocol Fee</span>
            <span className="text-sm text-gray-400">
              {FEE_BIPS / 100}% → EMBER stakers
            </span>
          </div>
        </div>
      )}

      {/* Status message */}
      {getStatusText() && (
        <div className="mb-4 p-3 rounded-xl bg-black/30 border border-white/5">
          <p className="text-sm font-medium text-white">{getStatusText()}</p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          {txHash && (
            <a 
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 mt-1 block"
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
          className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${
            decision.direction === 'buy'
              ? 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-lg shadow-emerald-500/20 disabled:from-gray-600 disabled:to-gray-700 disabled:shadow-none'
              : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-lg shadow-red-500/20 disabled:from-gray-600 disabled:to-gray-700 disabled:shadow-none'
          } disabled:cursor-not-allowed`}
        >
          {isExecuting ? 'Executing...' : 
           status === 'success' ? 'Done!' :
           `Execute ${decision.direction === 'buy' ? 'Buy' : 'Sell'}`}
        </button>
      )}

      {decision.direction === 'hold' && (
        <div className="text-center py-3 text-gray-500">
          No action recommended at current sentiment level
        </div>
      )}
    </div>
  );
}

export default DCAExecutor;
