// TestnetBanner.tsx - Warning banner when on testnet
'use client';

import { useAccount } from 'wagmi';

export function TestnetBanner() {
  const { chainId } = useAccount();

  // Base Sepolia = 84532
  const isTestnet = chainId === 84532;

  if (!isTestnet) return null;

  return (
    <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-b border-yellow-500/30">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
        <span className="text-yellow-400 text-sm">⚠️</span>
        <p className="text-sm text-yellow-200">
          <span className="font-semibold">Testnet Mode</span>
          <span className="text-yellow-300/70 ml-1">
            — Connected to Base Sepolia. Swaps are simulated.
          </span>
        </p>
      </div>
    </div>
  );
}

export default TestnetBanner;
