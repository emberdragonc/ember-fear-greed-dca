// BalanceDisplay - Shows ETH and USDC balances
'use client';

import { useAccount, useBalance } from 'wagmi';
import { base } from 'wagmi/chains';
import { TOKENS } from '@/lib/swap';
import { formatUnits } from 'viem';

interface BalanceDisplayProps {
  onBalancesLoaded?: (balances: { eth: string; usdc: string }) => void;
}

export function BalanceDisplay({ onBalancesLoaded }: BalanceDisplayProps) {
  const { address } = useAccount();

  // ETH balance
  const { data: ethBalance, isLoading: ethLoading } = useBalance({
    address,
    chainId: base.id,
  });

  // USDC balance
  const { data: usdcBalance, isLoading: usdcLoading } = useBalance({
    address,
    token: TOKENS.USDC as `0x${string}`,
    chainId: base.id,
  });

  const isLoading = ethLoading || usdcLoading;

  // Format for display
  const ethFormatted = ethBalance ? parseFloat(formatUnits(ethBalance.value, 18)).toFixed(4) : '0';
  const usdcFormatted = usdcBalance ? parseFloat(formatUnits(usdcBalance.value, 6)).toFixed(2) : '0';

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
        Wallet Balances
      </h3>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ETH Balance */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <span className="text-sm">Ξ</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">ETH</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ethereum</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900 dark:text-white">{ethFormatted}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ≈ ${(parseFloat(ethFormatted) * 2500).toFixed(2)}
              </p>
            </div>
          </div>

          {/* USDC Balance */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <span className="text-sm">$</span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">USDC</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">USD Coin</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-900 dark:text-white">{usdcFormatted}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ≈ ${usdcFormatted}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BalanceDisplay;
