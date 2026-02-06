// DelegationSetup.tsx - UI for configuring and granting DCA delegation
'use client';

import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useDelegation } from '@/hooks/useDelegation';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { useCountdown } from '@/hooks/useCountdown';
import { formatExpiryDate, DELEGATION_CONFIG, DELEGATION_ADDRESSES, CURRENT_DELEGATE } from '@/lib/delegation';

interface DelegationSetupProps {
  isFunded?: boolean;
}

export function DelegationSetup({ isFunded = false }: DelegationSetupProps) {
  const {
    state,
    createAndSignDelegation,
    revokeDelegation,
    isExpired,
    daysUntilExpiry,
  } = useDelegation();
  
  const { state: smartAccountState, smartAccountAddress } = useSmartAccountContext();
  const hasSmartAccount = smartAccountState.status === 'created' && !!smartAccountAddress;
  const canActivate = hasSmartAccount && isFunded;
  
  const countdown = useCountdown();

  const [basePercentage, setBasePercentage] = useState(2.5);
  const [targetAsset, setTargetAsset] = useState('ETH');
  const [showDetails, setShowDetails] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [previousStatus, setPreviousStatus] = useState<string | null>(null);

  // Detect when delegation becomes signed (success) and trigger celebration
  useEffect(() => {
    if (previousStatus === 'loading' && state.status === 'signed') {
      // Just succeeded! Trigger celebration
      setShowCelebration(true);
      triggerConfetti();
      
      // Hide celebration after 10 seconds
      const timeout = setTimeout(() => {
        setShowCelebration(false);
      }, 10000);
      
      return () => clearTimeout(timeout);
    }
    setPreviousStatus(state.status);
  }, [state.status, previousStatus]);

  const triggerConfetti = () => {
    // Fire confetti from both sides
    const defaults = {
      spread: 60,
      ticks: 100,
      gravity: 0.8,
      decay: 0.94,
      startVelocity: 30,
      colors: ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444'],
    };

    // Left side
    confetti({
      ...defaults,
      particleCount: 50,
      origin: { x: 0.2, y: 0.6 },
      angle: 60,
    });

    // Right side
    confetti({
      ...defaults,
      particleCount: 50,
      origin: { x: 0.8, y: 0.6 },
      angle: 120,
    });

    // Center burst after a small delay
    setTimeout(() => {
      confetti({
        ...defaults,
        particleCount: 100,
        spread: 100,
        origin: { x: 0.5, y: 0.5 },
      });
    }, 250);
  };

  const handleGrant = async () => {
    await createAndSignDelegation(basePercentage, targetAsset, smartAccountAddress || undefined);
  };

  const handleRevoke = async () => {
    if (confirm('Are you sure you want to revoke the delegation? DCA will stop.')) {
      await revokeDelegation();
    }
  };

  // Loading state
  if (state.status === 'loading') {
    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          <span className="ml-3 text-gray-400">Processing...</span>
        </div>
      </div>
    );
  }

  // Check if delegation points to an outdated delegate address
  const isOutdatedDelegation = state.status === 'signed' && state.delegation && 
    state.delegation.delegate.toLowerCase() !== CURRENT_DELEGATE.toLowerCase();

  // Active delegation view with celebration
  if (state.status === 'signed' && state.delegation && !isExpired) {
    return (
      <div className="space-y-4">
        {/* Outdated Delegation Warning */}
        {isOutdatedDelegation && (
          <div className="p-4 bg-yellow-500/20 rounded-2xl border border-yellow-500/30 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-yellow-400 font-medium mb-2">
              <span className="text-xl">⚠️</span>
              <span>Outdated Delegation</span>
            </div>
            <p className="text-yellow-200/80 text-sm mb-3">
              Your delegation is pointing to an old backend address and won&apos;t be included in daily DCA sweeps. 
              Please renew your delegation to continue receiving automated swaps.
            </p>
            <button
              onClick={handleRevoke}
              className="w-full py-2.5 px-4 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-xl transition-all"
            >
              Renew Delegation
            </button>
          </div>
        )}

        {/* Celebration Message */}
        {showCelebration && (
          <div className="p-6 bg-gradient-to-br from-emerald-500/20 via-green-500/20 to-teal-500/20 rounded-2xl border border-emerald-500/30 backdrop-blur-sm animate-pulse">
            <div className="text-center">
              <span className="text-4xl mb-3 block">🎉</span>
              <h3 className="text-xl font-bold text-white mb-2">
                Strategy Activated!
              </h3>
              <p className="text-emerald-300 mb-4">
                Your first DCA swap will happen in
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/30 border border-emerald-500/30">
                <span className="text-2xl font-bold text-emerald-400 font-mono">
                  {countdown.mounted ? countdown.formatted : '--:--:--'}
                </span>
              </div>
              <p className="text-xs text-emerald-400/70 mt-3">
                at 12:00 UTC • Based on Fear & Greed Index
              </p>
            </div>
          </div>
        )}

        {/* Normal Active State */}
        <div className="p-6 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold bg-emerald-500 text-white">
                ✓
              </span>
              DCA Delegation Active
            </h3>
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {daysUntilExpiry} days left
            </span>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Base Amount:</span>
              <span className="font-medium text-white">
                {state.delegation.basePercentage}% of balance
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Target Asset:</span>
              <span className="font-medium text-white">
                {state.delegation.targetAsset}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Expires:</span>
              <span className="font-medium text-white">
                {formatExpiryDate(state.delegation.caveats.expiry)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Max Executions:</span>
              <span className="font-medium text-white">
                {state.delegation.caveats.maxCalls} total (1 year)
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-blue-400 hover:text-blue-300 mb-3"
          >
            {showDetails ? 'Hide' : 'Show'} security details
          </button>

          {showDetails && (
            <div className="p-3 bg-black/30 rounded-xl text-xs font-mono mb-4 space-y-1 border border-white/5">
              <p className="text-gray-400">
                <span className="text-gray-500">Allowed Target:</span>{' '}
                {DELEGATION_ADDRESSES.UNISWAP_ROUTER}
              </p>
              <p className="text-gray-400">
                <span className="text-gray-500">Methods:</span> execute, approve
              </p>
              <p className="text-gray-400">
                <span className="text-gray-500">Hash:</span>{' '}
                {state.delegation.delegationHash.slice(0, 20)}...
              </p>
            </div>
          )}

          <button
            onClick={handleRevoke}
            className="w-full px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 font-medium transition-colors"
          >
            Revoke Delegation
          </button>
        </div>
      </div>
    );
  }

  // Setup form
  return (
    <div className={`p-6 rounded-2xl border backdrop-blur-sm transition-all ${
      canActivate 
        ? 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30 ring-2 ring-blue-500/20' 
        : 'bg-white/[0.02] border-white/5'
    }`}>
      {/* Prominent nudge when wallet is funded but not yet delegated */}
      {canActivate && (
        <div className="mb-4 p-4 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-xl border border-orange-500/30 animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👇</span>
            <div>
              <p className="font-bold text-orange-300">Almost there! Activate your strategy</p>
              <p className="text-sm text-orange-400/80">Your wallet is funded. Complete this last step to start automated DCA.</p>
            </div>
          </div>
        </div>
      )}
      
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
          canActivate 
            ? 'bg-blue-500 text-white animate-bounce' 
            : 'bg-gray-500/20 text-gray-500 border border-gray-500/30'
        }`}>
          3
        </span>
        Configure DCA Delegation
      </h3>

      {state.error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-sm text-red-400">{state.error}</p>
        </div>
      )}

      {isExpired && state.delegation && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <p className="text-sm text-yellow-400">
            Your previous delegation expired. Please create a new one.
          </p>
        </div>
      )}

      <div className="space-y-4 mb-6">
        {/* Base Percentage */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Base DCA Amount
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={basePercentage}
              onChange={(e) => setBasePercentage(Number(e.target.value))}
              className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <span className="w-12 text-center font-bold text-blue-400 bg-blue-500/20 px-2 py-1 rounded-lg">
              {basePercentage}%
            </span>
          </div>
          
          {/* Strategy Preview Table */}
          <div className="mt-4 p-3 bg-black/30 rounded-xl border border-white/5">
            <p className="text-xs font-medium text-gray-400 mb-2">📊 How your strategy will work:</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center py-1 px-2 rounded bg-red-500/10">
                <span className="text-red-400">😱 Extreme Fear (0-25)</span>
                <span className="font-bold text-emerald-400">BUY {basePercentage * 2}%</span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 rounded bg-orange-500/10">
                <span className="text-orange-400">😰 Fear (26-45)</span>
                <span className="font-bold text-emerald-400">BUY {basePercentage}%</span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 rounded bg-gray-500/10">
                <span className="text-gray-400">😐 Neutral (46-54)</span>
                <span className="font-medium text-gray-500">HOLD</span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 rounded bg-lime-500/10">
                <span className="text-lime-400">😊 Greed (55-75)</span>
                <span className="font-bold text-red-400">SELL {basePercentage}%</span>
              </div>
              <div className="flex justify-between items-center py-1 px-2 rounded bg-green-500/10">
                <span className="text-green-400">🤑 Extreme Greed (76-100)</span>
                <span className="font-bold text-red-400">SELL {basePercentage * 2}%</span>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-gray-500 italic">
              Extreme conditions = 2× the base amount (buy more dips, sell more tops)
            </p>
          </div>
        </div>

        {/* Target Asset */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Target Asset
          </label>
          <select
            value={targetAsset}
            onChange={(e) => setTargetAsset(e.target.value)}
            className="w-full px-3 py-2.5 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white"
          >
            <option value="ETH">ETH (Ethereum)</option>
          </select>
        </div>
      </div>

      {/* Permissions Summary */}
      <div className="p-4 bg-blue-500/10 rounded-xl mb-6 border border-blue-500/20">
        <h4 className="text-sm font-semibold text-blue-300 mb-3">
          🔐 You are granting permission to:
        </h4>
        <ul className="text-sm text-blue-400/80 space-y-1.5">
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
            Swap up to {basePercentage * 2}% of your balance daily (max in extreme conditions)
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
            Execute maximum {DELEGATION_CONFIG.MAX_CALLS_PER_DAY} swap per day
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
            Only interact with Uniswap Router + token approvals
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
            Valid for {DELEGATION_CONFIG.VALIDITY_DAYS} days (then expires)
          </li>
        </ul>
        <p className="mt-4 text-xs text-blue-400/60">
          ⚡ You can revoke this anytime. Your funds stay in your smart account.
        </p>
      </div>

      <button
        onClick={handleGrant}
        disabled={!canActivate}
        className={`w-full px-4 py-3 rounded-xl font-semibold transition-all ${
          canActivate
            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20'
            : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
        }`}
      >
        Sign & Activate DCA
      </button>
      
      {!canActivate && (
        <p className="mt-3 text-center text-sm text-gray-500">
          {!hasSmartAccount 
            ? '↑ Complete steps 1 & 2 first'
            : '↑ Fund your wallet first (Step 2)'}
        </p>
      )}
    </div>
  );
}
