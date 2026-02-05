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
    <div className="min-h-screen bg-[#0a0b0d]">
      {/* Gradient Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-950/30 via-transparent to-purple-950/20 pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Testnet Warning */}
      <TestnetBanner />
      
      {/* Header */}
      <header className="relative border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <span className="text-xl">🐉</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                Fear & Greed DCA
              </h1>
              <p className="text-xs text-gray-500">
                by Ember
              </p>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-6xl mx-auto px-4 py-8">
        {!isConnected ? (
          // Not connected state - Landing page
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
            {/* Hero */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                Autonomous DCA on Base
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
                Buy the Fear.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">Sell the Greed.</span>
              </h2>
              <p className="text-lg text-gray-400 max-w-lg mx-auto">
                Automated DCA based on the Crypto Fear & Greed Index. 
                Accumulate when others panic, take profits when they're euphoric.
              </p>
            </div>
            
            {/* Strategy Cards */}
            <div className="grid grid-cols-5 gap-2 md:gap-3 max-w-2xl mb-10 w-full">
              {[
                { range: '0-25', emoji: '😱', label: 'Extreme Fear', action: 'BUY 5%', color: 'red', actionColor: 'emerald' },
                { range: '26-45', emoji: '😰', label: 'Fear', action: 'BUY 2.5%', color: 'orange', actionColor: 'emerald' },
                { range: '46-54', emoji: '😐', label: 'Neutral', action: 'HOLD', color: 'gray', actionColor: 'gray' },
                { range: '55-75', emoji: '😊', label: 'Greed', action: 'SELL 2.5%', color: 'lime', actionColor: 'red' },
                { range: '76-100', emoji: '🤑', label: 'Extreme Greed', action: 'SELL 5%', color: 'green', actionColor: 'red' },
              ].map((item, i) => (
                <div 
                  key={i} 
                  className={`p-3 md:p-4 rounded-xl bg-${item.color}-500/10 border border-${item.color}-500/20 backdrop-blur-sm transition-all hover:scale-105 hover:border-${item.color}-500/40`}
                  style={{
                    background: `rgba(${item.color === 'red' ? '239,68,68' : item.color === 'orange' ? '249,115,22' : item.color === 'gray' ? '107,114,128' : item.color === 'lime' ? '132,204,22' : '34,197,94'}, 0.1)`,
                    borderColor: `rgba(${item.color === 'red' ? '239,68,68' : item.color === 'orange' ? '249,115,22' : item.color === 'gray' ? '107,114,128' : item.color === 'lime' ? '132,204,22' : '34,197,94'}, 0.2)`,
                  }}
                >
                  <div className="text-2xl mb-1">{item.emoji}</div>
                  <p className="text-xs text-gray-400 mb-1 hidden md:block">{item.label}</p>
                  <p className="text-sm font-semibold text-white">{item.range}</p>
                  <p className={`text-xs font-bold mt-1 ${item.actionColor === 'emerald' ? 'text-emerald-400' : item.actionColor === 'red' ? 'text-red-400' : 'text-gray-500'}`}>
                    {item.action}
                  </p>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mb-10 w-full">
              {[
                { icon: '🔐', title: 'Non-Custodial', desc: 'Your keys, your crypto. Always.' },
                { icon: '⚡', title: 'Fully Automated', desc: 'Set it and forget it.' },
                { icon: '🐉', title: '0.15% Fee', desc: '100% to EMBER stakers.' },
              ].map((feature, i) => (
                <div key={i} className="p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/[0.07] hover:border-white/20 transition-all">
                  <div className="text-2xl mb-3">{feature.icon}</div>
                  <p className="font-semibold text-white mb-1">{feature.title}</p>
                  <p className="text-sm text-gray-500">{feature.desc}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col items-center gap-4">
              <WalletConnect />
              <p className="text-sm text-gray-500">
                Connect wallet to get started
              </p>
            </div>

            {/* Backtest Results */}
            <div className="mt-16 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 max-w-md">
              <p className="text-xs text-emerald-400 font-medium mb-2">📊 Full Cycle Backtest (2022-2024)</p>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-400">+175%</span>
                <span className="text-sm text-gray-400">F&G DCA</span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-xl text-gray-500">+82%</span>
                <span className="text-sm text-gray-500">HODL ETH</span>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Buy fear, sell greed — 2x better than holding
              </p>
            </div>
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
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-4">
                  How It Works
                </h3>
                <div className="space-y-4">
                  {[
                    { step: 1, title: 'Connect & Fund', desc: 'Deposit ETH + USDC to your smart account' },
                    { step: 2, title: 'Set Delegation', desc: 'Grant limited swap permission (revocable anytime)' },
                    { step: 3, title: 'Automated DCA', desc: 'System checks F&G daily and executes within your limits' },
                  ].map((item) => (
                    <div key={item.step} className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold shrink-0 border border-blue-500/30">
                        {item.step}
                      </div>
                      <div>
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="text-sm text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative border-t border-white/5 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            Built by{' '}
            <a 
              href="https://ember.engineer" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Ember 🐉
            </a>
            {' '}• 100% of fees go to EMBER stakers
          </p>
          <p className="text-xs text-gray-600">
            Data:{' '}
            <a 
              href="https://alternative.me/crypto/fear-and-greed-index/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-gray-400 transition-colors"
            >
              Alternative.me Fear & Greed Index
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
