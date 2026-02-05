// DelegationSetup.tsx - UI for configuring and granting DCA delegation
'use client';

import { useState } from 'react';
import { useDelegation } from '@/hooks/useDelegation';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { formatExpiryDate, DELEGATION_CONFIG, DELEGATION_ADDRESSES } from '@/lib/delegation';

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

  const [basePercentage, setBasePercentage] = useState(2.5);
  const [targetAsset, setTargetAsset] = useState('ETH');
  const [showDetails, setShowDetails] = useState(false);

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

  // Active delegation view
  if (state.status === 'signed' && state.delegation && !isExpired) {
    return (
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
              {state.delegation.caveats.maxCalls} per day
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
              <span className="text-gray-500">Methods:</span> exactInputSingle, exactOutputSingle
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
    );
  }

  // Setup form
  return (
    <div className={`p-6 rounded-2xl border backdrop-blur-sm ${
      canActivate ? 'bg-white/5 border-white/10' : 'bg-white/[0.02] border-white/5'
    }`}>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
          canActivate 
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
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
            DCA Amount (% of balance per execution)
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
          <p className="mt-2 text-xs text-gray-500">
            During extreme fear/greed, this doubles to {basePercentage * 2}%
          </p>
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
            Swap up to {basePercentage}% of your USDC/ETH balance daily
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
            Execute maximum {DELEGATION_CONFIG.MAX_CALLS_PER_DAY} swap per day
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
            Only interact with Uniswap V3 Router
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
