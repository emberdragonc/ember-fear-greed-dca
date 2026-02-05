// BalanceDisplay - Shows ETH and USDC balances
'use client';

import { useAccount, useBalance, useReadContract } from 'wagmi';
import { base } from 'wagmi/chains';
import { TOKENS } from '@/lib/swap';
import { formatUnits } from 'viem';

// ERC20 ABI for balanceOf
const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

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

  // USDC balance via ERC20 balanceOf
  const { data: usdcBalanceRaw, isLoading: usdcLoading } = useReadContract({
    address: TOKENS.USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address,
    },
  });

  const isLoading = ethLoading || usdcLoading;

  // Format for display
  const ethFormatted = ethBalance ? parseFloat(formatUnits(ethBalance.value, 18)).toFixed(4) : '0';
  const usdcFormatted = usdcBalanceRaw ? parseFloat(formatUnits(usdcBalanceRaw as bigint, 6)).toFixed(2) : '0';

  return (
    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
      <h3 className="text-sm font-medium text-gray-400 mb-4">
        Wallet Balances
      </h3>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* ETH Balance */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-500/20">
                <span className="text-blue-400 font-bold">Ξ</span>
              </div>
              <div>
                <p className="font-medium text-white">ETH</p>
                <p className="text-xs text-gray-500">Ethereum</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-white">{ethFormatted}</p>
              <p className="text-xs text-gray-500">
                ≈ ${(parseFloat(ethFormatted) * 2500).toFixed(2)}
              </p>
            </div>
          </div>

          {/* USDC Balance */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center border border-emerald-500/20">
                <span className="text-emerald-400 font-bold">$</span>
              </div>
              <div>
                <p className="font-medium text-white">USDC</p>
                <p className="text-xs text-gray-500">USD Coin</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-white">{usdcFormatted}</p>
              <p className="text-xs text-gray-500">
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
