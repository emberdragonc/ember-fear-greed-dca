// FundWallet.tsx - Step 2: Fund the smart wallet with deposit buttons
'use client';

import { useState, useEffect } from 'react';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { usePublicClient, useSendTransaction, useWriteContract } from 'wagmi';
import { useEthPrice } from '@/hooks/useEthPrice';
import { formatUnits, parseUnits, parseEther } from 'viem';
import { TOKEN_ADDRESSES } from '@/lib/wagmi';

// WETH address on Base
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const MIN_INITIAL_USDC = 10; // Minimum $10 USDC to activate DCA for first time
const MIN_TOTAL_BALANCE = 5; // Minimum $5 total (USDC + WETH value) to stay included

interface FundWalletProps {
  onFunded: (isFunded: boolean) => void;
  hasDelegation?: boolean; // Whether user already has an active delegation
  isCollapsible?: boolean; // When funded, show collapsed view
}

export function FundWallet({ onFunded, hasDelegation = false, isCollapsible = true }: FundWalletProps) {
  const { smartAccountAddress } = useSmartAccountContext();
  const publicClient = usePublicClient();
  
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [wethBalance, setWethBalance] = useState<string>('0');
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const { price: ethPrice } = useEthPrice();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositToken, setDepositToken] = useState<'USDC' | 'ETH'>('USDC');
  const [isExpanded, setIsExpanded] = useState(false);

  const { sendTransaction, isPending: isSendingEth } = useSendTransaction();
  const { writeContract, isPending: isSendingUsdc } = useWriteContract();
  
  const isPending = isSendingEth || isSendingUsdc;
  
  // Calculate total balance in USD (USDC + WETH value)
  const wethValueUsd = parseFloat(wethBalance) * (ethPrice || 0);
  const totalBalanceUsd = parseFloat(usdcBalance) + wethValueUsd;
  
  // Two-tier funding check:
  // - New users (no delegation): need $10 USDC to activate
  // - Existing users (has delegation): need $5 total balance to stay included
  const isFunded = hasDelegation 
    ? totalBalanceUsd >= MIN_TOTAL_BALANCE
    : parseFloat(usdcBalance) >= MIN_INITIAL_USDC;
  
  // Show collapsed view when funded but no delegation yet (to emphasize next step)
  const showCollapsed = isCollapsible && isFunded && !hasDelegation && !isExpanded;

  // Fetch balances
  useEffect(() => {
    if (!smartAccountAddress || !publicClient) return;

    const fetchBalances = async () => {
      setLoading(true);
      try {
        // Fetch ETH balance
        const ethBal = await publicClient.getBalance({
          address: smartAccountAddress as `0x${string}`,
        });
        setEthBalance(formatUnits(ethBal, 18));

        // Fetch WETH balance (from DCA swaps)
        const wethBal = await publicClient.readContract({
          address: WETH_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [smartAccountAddress as `0x${string}`],
        } as any);
        setWethBalance(formatUnits(wethBal as bigint, 18));

        // Fetch USDC balance
        const usdcBal = await publicClient.readContract({
          address: TOKEN_ADDRESSES.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [smartAccountAddress as `0x${string}`],
        } as any);
        setUsdcBalance(formatUnits(usdcBal as bigint, 6));
      } catch (error) {
        console.error('Failed to fetch balances:', error);
      } finally {
        setLoading(false);
        setInitialLoadDone(true);
      }
    };

    fetchBalances();
    // Refresh every 10 seconds
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [smartAccountAddress, publicClient]);

  // Notify parent of funding status (only after initial load completes)
  useEffect(() => {
    if (initialLoadDone) {
      onFunded(isFunded);
    }
  }, [isFunded, onFunded, initialLoadDone]);

  const handleDeposit = async () => {
    if (!smartAccountAddress || !depositAmount) return;

    try {
      if (depositToken === 'ETH') {
        await sendTransaction({
          to: smartAccountAddress as `0x${string}`,
          value: parseEther(depositAmount),
        });
      } else {
        await writeContract({
          address: TOKEN_ADDRESSES.USDC as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [smartAccountAddress as `0x${string}`, parseUnits(depositAmount, 6)],
        } as any);
      }
      
      setDepositAmount('');
    } catch (error) {
      console.error('Deposit failed:', error);
    }
  };

  if (!smartAccountAddress) {
    return null;
  }

  // Collapsed view - shows when funded but waiting for delegation
  if (showCollapsed) {
    return (
      <div className="p-4 rounded-2xl border backdrop-blur-sm bg-emerald-500/10 border-emerald-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold bg-emerald-500 text-white">
              ✓
            </span>
            <div>
              <span className="text-sm font-medium text-emerald-400">Wallet Funded</span>
              <span className="text-sm text-gray-400 ml-2">
                ${parseFloat(usdcBalance).toFixed(2)} USDC
                {parseFloat(wethBalance) > 0 && ` + ${parseFloat(wethBalance).toFixed(4)} ETH`}
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="text-xs text-gray-400 hover:text-white transition"
          >
            Add more ↓
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 rounded-2xl border backdrop-blur-sm ${
      isFunded 
        ? 'bg-emerald-500/10 border-emerald-500/20' 
        : 'bg-white/5 border-white/10'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
            isFunded 
              ? 'bg-emerald-500 text-white' 
              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>
            {isFunded ? '✓' : '2'}
          </span>
          Fund Your Wallet
        </h3>
        <div className="flex items-center gap-2">
          {isFunded && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Ready
            </span>
          )}
          {isFunded && !hasDelegation && isExpanded && (
            <button
              onClick={() => setIsExpanded(false)}
              className="text-xs text-gray-400 hover:text-white transition"
            >
              Collapse ↑
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 mb-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
          <span className="text-sm text-gray-400">Checking balance...</span>
        </div>
      )}

      {/* Current Balances */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-black/20 rounded-xl border border-white/5">
            <p className="text-xs text-gray-500 mb-1">ETH Balance</p>
            <p className="text-lg font-semibold text-white">
              {`${(parseFloat(ethBalance) + parseFloat(wethBalance)).toFixed(4)} ETH`}
            </p>
            <p className="text-xs text-gray-400">≈ ${((parseFloat(ethBalance) + parseFloat(wethBalance)) * ethPrice).toFixed(2)}</p>
          </div>
          <div className="p-3 bg-black/20 rounded-xl border border-white/5">
            <p className="text-xs text-gray-500 mb-1">USDC Balance</p>
            <p className={`text-lg font-semibold ${isFunded ? 'text-emerald-400' : 'text-white'}`}>
              {`$${parseFloat(usdcBalance).toFixed(2)}`}
            </p>
          </div>
        </div>
      )}

      {/* Deposit Form */}
      {!isFunded && (
        <div className="mb-4 p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-sm text-blue-300 font-medium">Deposit from your wallet</p>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Base</span>
          </div>
          <div className="flex gap-2 mb-3">
            <select
              value={depositToken}
              onChange={(e) => setDepositToken(e.target.value as 'USDC' | 'ETH')}
              className="px-3 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="USDC">USDC</option>
              <option value="ETH">ETH</option>
            </select>
            <input
              type="number"
              placeholder={depositToken === 'USDC' ? '100' : '0.01'}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="flex-1 px-3 py-2.5 bg-black/30 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleDeposit}
              disabled={isPending || !depositAmount}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {isPending ? 'Sending...' : 'Deposit'}
            </button>
          </div>
          <p className="text-xs text-blue-400/70">
            ⚠️ Make sure you're on <span className="font-semibold text-blue-300">Base network</span>. Deposits ETH or USDC from your wallet to your smart wallet.
          </p>
        </div>
      )}

      {/* Status Message */}
      {!isFunded ? (
        <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
          <p className="text-sm text-yellow-400">
            {hasDelegation 
              ? `⚠️ Total balance below $${MIN_TOTAL_BALANCE}. Add funds to continue DCA.`
              : `⚠️ Minimum $${MIN_INITIAL_USDC} USDC required to start DCA buying.`
            }
          </p>
        </div>
      ) : (
        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <p className="text-sm text-emerald-400">
            {hasDelegation 
              ? '✓ Balance sufficient for DCA swaps!'
              : '✓ Wallet funded! You can now activate DCA below.'
            }
          </p>
        </div>
      )}
    </div>
  );
}
