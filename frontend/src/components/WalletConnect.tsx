// WalletConnect.tsx - Custom wallet connection with explicit connect({ connector }) invocation
'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useState, useEffect, useRef } from 'react';

export function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close modal on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowModal(false);
      }
    }
    if (showModal) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModal]);

  // Close modal on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowModal(false);
    }
    if (showModal) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showModal]);

  if (!mounted) {
    return (
      <button
        disabled
        className="px-5 py-2.5 rounded-xl bg-gray-700 text-gray-400 font-medium cursor-wait"
      >
        Loading...
      </button>
    );
  }

  if (isConnected && address) {
    const formattedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const chainName = chainId === 8453 ? 'Base' : chainId === 84532 ? 'Sepolia' : 'Unknown';
    
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-sm font-medium text-white">
            {formattedAddress}
          </span>
          <span className="text-xs text-gray-500">{chainName}</span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-medium transition-all border border-gray-700"
        >
          <span className="sm:hidden">{formattedAddress}</span>
          <span className="hidden sm:inline">Disconnect</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowModal(true)}
        disabled={isPending}
        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed font-medium transition-all shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Connecting...
          </span>
        ) : (
          'Connect Wallet'
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            ref={modalRef}
            className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-800"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">
                Connect Wallet
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Connectors */}
            <div className="p-4 space-y-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    // EXPLICIT connect({ connector }) invocation - fixes broken wallet connection
                    connect({ connector });
                    setShowModal(false);
                  }}
                  disabled={!connector.ready}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                    {connector.name.toLowerCase().includes('metamask') ? (
                      <img src="https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg" alt="MetaMask" className="w-6 h-6" />
                    ) : connector.name.toLowerCase().includes('walletconnect') ? (
                      <img src="https://avatars.githubusercontent.com/u/37784886?s=200&v=4" alt="WalletConnect" className="w-6 h-6 rounded" />
                    ) : connector.name.toLowerCase().includes('coinbase') ? (
                      <img src="https://avatars.githubusercontent.com/u/1885080?s=200&v=4" alt="Coinbase" className="w-6 h-6 rounded" />
                    ) : (
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-white">
                      {connector.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {connector.name.toLowerCase().includes('injected') ? 'Browser extension' : 'Popular choice'}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 pb-4">
                <p className="text-sm text-red-400 bg-red-900/20 p-3 rounded-lg">
                  {error.message}
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-800/50 border-t border-gray-800">
              <p className="text-xs text-gray-500 text-center">
                By connecting, you agree to the Terms of Service
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
