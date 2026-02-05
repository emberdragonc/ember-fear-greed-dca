'use client';

import { useAccount } from 'wagmi';
import { WalletConnect } from '@/components/WalletConnect';
import { SmartAccountCard } from '@/components/SmartAccountCard';
import { DelegationSetup } from '@/components/DelegationSetup';
import { FearGreedGauge } from '@/components/FearGreedGauge';

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐉</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Fear & Greed DCA
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Autonomous sentiment-based accumulation
              </p>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {!isConnected ? (
          // Not connected state
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="text-6xl mb-6">📊</div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Buy Fear, Sell Greed
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-md mb-8">
              Automatically DCA based on market sentiment. Accumulate when others panic, 
              take profits when others are euphoric.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mb-8">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                <div className="text-2xl mb-2">😱</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Extreme Fear</p>
                <p className="text-xs text-green-600 dark:text-green-400">Buy 2x amount</p>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                <div className="text-2xl mb-2">😐</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Neutral</p>
                <p className="text-xs text-gray-500">Hold position</p>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                <div className="text-2xl mb-2">🤑</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Extreme Greed</p>
                <p className="text-xs text-red-600 dark:text-red-400">Sell 2x amount</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Connect your wallet to get started →
            </p>
          </div>
        ) : (
          // Connected state - show dashboard
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column - Fear & Greed + Status */}
            <div className="lg:col-span-1 space-y-6">
              <FearGreedGauge />
              
              {/* Quick stats */}
              <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                  Strategy Logic
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">0-25: Extreme Fear</span>
                    <span className="text-green-600 font-medium">BUY 2x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">26-45: Fear</span>
                    <span className="text-green-600 font-medium">BUY 1x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">46-54: Neutral</span>
                    <span className="text-gray-500 font-medium">HOLD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">55-75: Greed</span>
                    <span className="text-red-600 font-medium">SELL 1x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">76-100: Extreme Greed</span>
                    <span className="text-red-600 font-medium">SELL 2x</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column - Account & Delegation */}
            <div className="lg:col-span-2 space-y-6">
              <SmartAccountCard />
              <DelegationSetup />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Built by{' '}
            <a 
              href="https://ember.engineer" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Ember 🐉
            </a>
            {' '}• 100% of fees go to EMBER stakers
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Data:{' '}
            <a 
              href="https://alternative.me/crypto/fear-and-greed-index/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:underline"
            >
              alternative.me/crypto/fear-and-greed-index
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
