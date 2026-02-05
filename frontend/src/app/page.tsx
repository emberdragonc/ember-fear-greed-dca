'use client';

import { useAccount } from 'wagmi';
import { WalletConnect } from '@/components/WalletConnect';
import { SmartAccountCard } from '@/components/SmartAccountCard';
import { DelegationSetup } from '@/components/DelegationSetup';
import { BalanceDisplay } from '@/components/BalanceDisplay';
import { DCAExecutor } from '@/components/DCAExecutor';
import { TestnetBanner } from '@/components/TestnetBanner';
import FearGreedGauge from '@/components/FearGreedGauge';

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black">
      {/* Testnet Warning */}
      <TestnetBanner />
      
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
          // Not connected state - Landing page
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="text-6xl mb-6">📊</div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Buy Fear, Sell Greed
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-md mb-8">
              Automatically DCA based on market sentiment. Accumulate when others panic, 
              take profits when others are euphoric.
            </p>
            
            {/* Strategy cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 max-w-3xl mb-8">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                <div className="text-2xl mb-2">😱</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">0-25</p>
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">BUY 5%</p>
              </div>
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800">
                <div className="text-2xl mb-2">😰</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">26-45</p>
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">BUY 2.5%</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-2xl mb-2">😐</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">46-54</p>
                <p className="text-xs text-gray-500 font-medium">HOLD</p>
              </div>
              <div className="p-4 bg-lime-50 dark:bg-lime-900/20 rounded-xl border border-lime-200 dark:border-lime-800">
                <div className="text-2xl mb-2">😊</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">55-75</p>
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">SELL 2.5%</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <div className="text-2xl mb-2">🤑</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">76-100</p>
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">SELL 5%</p>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mb-8">
              <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                <div className="text-xl mb-2">🔐</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Smart Account</p>
                <p className="text-xs text-gray-500">Non-custodial, you control</p>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                <div className="text-xl mb-2">⚡</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Automated</p>
                <p className="text-xs text-gray-500">Executes while you sleep</p>
              </div>
              <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                <div className="text-xl mb-2">🐉</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">0.15% Fee</p>
                <p className="text-xs text-gray-500">100% to EMBER stakers</p>
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400">
              Connect your wallet to get started →
            </p>
          </div>
        ) : (
          // Connected state - Full Dashboard
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column - Fear & Greed + Balances */}
            <div className="lg:col-span-1 space-y-6">
              <FearGreedGauge />
              <BalanceDisplay />
              <DCAExecutor />
            </div>

            {/* Right column - Account & Delegation */}
            <div className="lg:col-span-2 space-y-6">
              <SmartAccountCard />
              <DelegationSetup />
              
              {/* How it works */}
              <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  How It Works
                </h3>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Connect & Fund</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Connect wallet and deposit ETH + USDC
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Set Delegation</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Grant limited swap permission (revocable anytime)
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Automated DCA</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        System checks F&G daily and executes within your limits
                      </p>
                    </div>
                  </div>
                </div>
              </div>
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
              Alternative.me Fear & Greed Index
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
