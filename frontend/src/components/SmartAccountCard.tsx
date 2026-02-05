// SmartAccountCard.tsx - Display smart account info
'use client';

import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { useState } from 'react';

export function SmartAccountCard() {
  const { state, createSmartAccount, smartAccountAddress, isDeployed } = useSmartAccountContext();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!smartAccountAddress) return;
    try {
      await navigator.clipboard.writeText(smartAccountAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore copy errors
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          <span className="ml-3 text-gray-400">Setting up Smart Account...</span>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="p-6 bg-red-500/10 rounded-2xl border border-red-500/20 backdrop-blur-sm">
        <div className="text-center">
          <p className="text-red-400 mb-3">{state.error}</p>
          <button
            onClick={createSmartAccount}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'created' && smartAccountAddress) {
    const isBaseScan = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
    const explorerUrl = isBaseScan
      ? `https://basescan.org/address/${smartAccountAddress}`
      : `https://sepolia.basescan.org/address/${smartAccountAddress}`;

    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Smart Account
          </h3>
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
            isDeployed 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
          }`}>
            {isDeployed ? '● Deployed' : '○ Not Deployed'}
          </span>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Address</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-black/30 rounded-xl text-sm font-mono text-gray-300 break-all border border-white/5">
                {smartAccountAddress}
              </code>
              <button
                onClick={handleCopy}
                className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                title="Copy address"
              >
                {copied ? (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View on Explorer
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          {!isDeployed && (
            <div className="mt-4 p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <p className="text-sm text-blue-300">
                Your smart account will be deployed on your first transaction. 
                No extra setup needed!
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Idle state - show create button
  return (
    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
      <div className="text-center">
        <div className="w-14 h-14 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center border border-blue-500/20">
          <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Create Smart Account
        </h3>
        <p className="text-sm text-gray-400 mb-5">
          Your smart account is an ERC-4337 wallet that holds your funds and executes DCA trades.
        </p>
        <button
          onClick={createSmartAccount}
          className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-500 hover:to-indigo-500 transition-all font-medium shadow-lg shadow-blue-500/20"
        >
          Create Smart Account
        </button>
      </div>
    </div>
  );
}
