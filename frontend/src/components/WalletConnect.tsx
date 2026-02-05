// WalletConnect.tsx - Connect wallet button using wagmi
'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useState, useEffect } from 'react';

export function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        disabled
        className="px-4 py-2 rounded-lg bg-gray-200 text-gray-500 font-medium cursor-wait"
      >
        Loading...
      </button>
    );
  }

  if (isConnected && address) {
    // Format address for display
    const formattedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    
    return (
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {formattedAddress}
          </span>
          <span className="text-xs text-gray-500">
            {chainId === 8453 ? 'Base Mainnet' : chainId === 84532 ? 'Base Sepolia' : 'Unknown Chain'}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-medium transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end">
      <div className="flex gap-2">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending || false}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {isPending ? 'Connecting...' : `Connect ${connector.name}`}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error.message}</p>
      )}
    </div>
  );
}
