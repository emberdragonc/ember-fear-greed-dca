// TestnetBanner - Shows when running in testnet/mock mode
'use client';

import { useChainId } from 'wagmi';

export function TestnetBanner() {
  const chainId = useChainId();
  const isTestnet = chainId !== 8453;

  if (!isTestnet) return null;

  return (
    <div className="bg-yellow-500 text-black text-center py-2 px-4 text-sm font-medium">
      ⚠️ TESTNET MODE - Swaps are simulated. Connect to Base Mainnet for real transactions.
    </div>
  );
}

export default TestnetBanner;
