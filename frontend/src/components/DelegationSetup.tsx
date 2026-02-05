// DelegationSetup.tsx - UI for configuring and granting DCA delegation
'use client';

import { useState } from 'react';
import { useDelegation } from '@/hooks/useDelegation';
import { formatExpiryDate, DELEGATION_CONFIG, DELEGATION_ADDRESSES } from '@/lib/delegation';

export function DelegationSetup() {
  const {
    state,
    createAndSignDelegation,
    revokeDelegation,
    isExpired,
    daysUntilExpiry,
  } = useDelegation();

  const [basePercentage, setBasePercentage] = useState(5);
  const [targetAsset, setTargetAsset] = useState('ETH');
  const [showDetails, setShowDetails] = useState(false);

  const handleGrant = async () => {
    await createAndSignDelegation(basePercentage, targetAsset);
  };

  const handleRevoke = async () => {
    if (confirm('Are you sure you want to revoke the delegation? DCA will stop.')) {
      await revokeDelegation();
    }
  };

  // Loading state
  if (state.status === 'loading') {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-300">Processing...</span>
        </div>
      </div>
    );
  }

  // Active delegation view
  if (state.status === 'signed' && state.delegation && !isExpired) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            DCA Delegation Active ✓
          </h3>
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
            {daysUntilExpiry} days left
          </span>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Base Amount:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {state.delegation.basePercentage}% of balance
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Target Asset:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {state.delegation.targetAsset}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Expires:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {formatExpiryDate(state.delegation.caveats.expiry)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Max Executions:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {state.delegation.caveats.maxCalls} per day
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-3"
        >
          {showDetails ? 'Hide' : 'Show'} security details
        </button>

        {showDetails && (
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs font-mono mb-4 space-y-1">
            <p className="text-gray-600 dark:text-gray-400">
              <span className="text-gray-400">Allowed Target:</span>{' '}
              {DELEGATION_ADDRESSES.UNISWAP_ROUTER}
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              <span className="text-gray-400">Methods:</span> exactInputSingle, exactOutputSingle
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              <span className="text-gray-400">Hash:</span>{' '}
              {state.delegation.delegationHash.slice(0, 20)}...
            </p>
          </div>
        )}

        <button
          onClick={handleRevoke}
          className="w-full px-4 py-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 font-medium transition-colors"
        >
          Revoke Delegation
        </button>
      </div>
    );
  }

  // Setup form
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Configure DCA Delegation
      </h3>

      {state.error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        </div>
      )}

      {isExpired && state.delegation && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            Your previous delegation expired. Please create a new one.
          </p>
        </div>
      )}

      <div className="space-y-4 mb-6">
        {/* Base Percentage */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            DCA Amount (% of balance per execution)
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="10"
              value={basePercentage}
              onChange={(e) => setBasePercentage(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <span className="w-12 text-center font-semibold text-blue-600 dark:text-blue-400">
              {basePercentage}%
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            During extreme fear/greed, this doubles to {basePercentage * 2}%
          </p>
        </div>

        {/* Target Asset */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Target Asset
          </label>
          <select
            value={targetAsset}
            onChange={(e) => setTargetAsset(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="ETH">ETH (Ethereum)</option>
            {/* More assets can be added later */}
          </select>
        </div>
      </div>

      {/* Permissions Summary */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-6">
        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
          🔐 You are granting permission to:
        </h4>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <li>• Swap up to {basePercentage}% of your USDC/ETH balance daily</li>
          <li>• Execute maximum {DELEGATION_CONFIG.MAX_CALLS_PER_DAY} swap per day</li>
          <li>• Only interact with Uniswap V3 Router</li>
          <li>• Valid for {DELEGATION_CONFIG.VALIDITY_DAYS} days (then expires)</li>
        </ul>
        <p className="mt-3 text-xs text-blue-600 dark:text-blue-500">
          ⚡ You can revoke this anytime. Your funds stay in your smart account.
        </p>
      </div>

      <button
        onClick={handleGrant}
        className="w-full px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold transition-colors"
      >
        Sign & Activate DCA
      </button>
    </div>
  );
}
