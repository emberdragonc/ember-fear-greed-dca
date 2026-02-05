// FundWallet.tsx - Step 2: Fund the smart wallet
'use client';

import { useState, useEffect } from 'react';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { TOKEN_ADDRESSES } from '@/lib/wagmi';

const USDC_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const MIN_USDC_BALANCE = 10; // Minimum $10 USDC to activate DCA

interface FundWalletProps {
  onFunded: (isFunded: boolean) => void;
}

export function FundWallet({ onFunded }: FundWalletProps) {
  const { smartAccountAddress } = useSmartAccountContext();
  const publicClient = usePublicClient();
  
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const isFunded = parseFloat(usdcBalance) >= MIN_USDC_BALANCE;

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

        // Fetch USDC balance
        const usdcBal = await publicClient.readContract({
          address: TOKEN_ADDRESSES.USDC as `0x${string}`,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [smartAccountAddress as `0x${string}`],
        } as any);
        setUsdcBalance(formatUnits(usdcBal as bigint, 6));
      } catch (error) {
        console.error('Failed to fetch balances:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
    // Refresh every 10 seconds
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [smartAccountAddress, publicClient]);

  // Notify parent of funding status
  useEffect(() => {
    onFunded(isFunded);
  }, [isFunded, onFunded]);

  const handleCopy = async () => {
    if (!smartAccountAddress) return;
    try {
      await navigator.clipboard.writeText(smartAccountAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  if (!smartAccountAddress) {
    return null;
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
        {isFunded && (
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Ready
          </span>
        )}
      </div>

      {/* Wallet Address */}
      <div className="mb-4">
        <label className="text-sm text-gray-500 mb-2 block">Send funds to this address:</label>
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

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-black/20 rounded-xl border border-white/5">
          <p className="text-xs text-gray-500 mb-1">ETH Balance</p>
          <p className="text-lg font-semibold text-white">
            {loading ? '...' : `${parseFloat(ethBalance).toFixed(4)} ETH`}
          </p>
        </div>
        <div className="p-3 bg-black/20 rounded-xl border border-white/5">
          <p className="text-xs text-gray-500 mb-1">USDC Balance</p>
          <p className={`text-lg font-semibold ${isFunded ? 'text-emerald-400' : 'text-white'}`}>
            {loading ? '...' : `$${parseFloat(usdcBalance).toFixed(2)}`}
          </p>
        </div>
      </div>

      {/* Status Message */}
      {!isFunded ? (
        <div className="p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
          <p className="text-sm text-yellow-400">
            ⚠️ Minimum ${MIN_USDC_BALANCE} USDC required to activate DCA.
            Send USDC + some ETH (for gas) to your smart wallet address above.
          </p>
        </div>
      ) : (
        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <p className="text-sm text-emerald-400">
            ✓ Wallet funded! You can now activate DCA below.
          </p>
        </div>
      )}
    </div>
  );
}
