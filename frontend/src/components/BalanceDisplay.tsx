// BalanceDisplay - Shows Smart Wallet ETH and USDC balances with deposit/withdraw
'use client';

import { useState } from 'react';
import { useAccount, useBalance, useReadContract, useSendTransaction, useWriteContract, usePublicClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { TOKENS } from '@/lib/swap';
import { formatUnits, parseUnits, parseEther, encodeFunctionData, http } from 'viem';
import { createBundlerClient } from 'viem/account-abstraction';

// ERC20 ABI
const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// Bundler URL for Base (using public Pimlico endpoint)
const BUNDLER_URL = 'https://public.pimlico.io/v2/8453/rpc';

export function BalanceDisplay() {
  const { address: eoaAddress } = useAccount();
  const { smartAccountAddress, smartAccount } = useSmartAccountContext();
  const publicClient = usePublicClient();
  
  const [depositAmount, setDepositAmount] = useState('');
  const [depositToken, setDepositToken] = useState<'ETH' | 'USDC'>('USDC');
  const [showDeposit, setShowDeposit] = useState(false);
  
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawToken, setWithdrawToken] = useState<'ETH' | 'USDC'>('USDC');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const { sendTransaction, isPending: isSendingEth } = useSendTransaction();
  const { writeContract, isPending: isSendingUsdc } = useWriteContract();

  // Smart wallet ETH balance
  const { data: ethBalance, isLoading: ethLoading, refetch: refetchEth } = useBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  });

  // Smart wallet USDC balance
  const { data: usdcBalanceRaw, isLoading: usdcLoading, refetch: refetchUsdc } = useReadContract({
    address: TOKENS.USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: smartAccountAddress ? [smartAccountAddress as `0x${string}`] : undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  } as any);

  const isLoading = ethLoading || usdcLoading;
  const isPending = isSendingEth || isSendingUsdc;

  // Format for display
  const ethFormatted = ethBalance ? parseFloat(formatUnits(ethBalance.value, 18)).toFixed(4) : '0';
  const usdcFormatted = usdcBalanceRaw ? parseFloat(formatUnits(usdcBalanceRaw as bigint, 6)).toFixed(2) : '0';

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
          address: TOKENS.USDC,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [smartAccountAddress as `0x${string}`, parseUnits(depositAmount, 6)],
        } as any);
      }
      
      setDepositAmount('');
      setShowDeposit(false);
      // Refetch balances after a delay
      setTimeout(() => {
        refetchEth();
        refetchUsdc();
      }, 3000);
    } catch (error) {
      console.error('Deposit failed:', error);
    }
  };

  const handleWithdraw = async () => {
    if (!smartAccountAddress || !smartAccount || !eoaAddress || !withdrawAmount || !publicClient) return;

    setIsWithdrawing(true);
    try {
      // Create bundler client
      const bundlerClient = createBundlerClient({
        client: publicClient as any,
        transport: http(BUNDLER_URL),
      });

      let calls;
      if (withdrawToken === 'ETH') {
        // Send ETH to EOA
        calls = [{
          to: eoaAddress as `0x${string}`,
          value: parseEther(withdrawAmount),
        }];
      } else {
        // Transfer USDC to EOA
        calls = [{
          to: TOKENS.USDC,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [eoaAddress as `0x${string}`, parseUnits(withdrawAmount, 6)],
          }),
        }];
      }

      // Send user operation from smart account
      const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls,
      });

      // Wait for receipt
      await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });

      setWithdrawAmount('');
      setShowWithdraw(false);
      // Refetch balances after a delay
      setTimeout(() => {
        refetchEth();
        refetchUsdc();
      }, 3000);
    } catch (error) {
      console.error('Withdraw failed:', error);
      alert('Withdrawal failed. Make sure you have enough balance.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!smartAccountAddress) {
    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Smart Wallet Balances</h3>
        <p className="text-sm text-gray-500 text-center py-4">
          Create a smart account to view balances
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">Smart Wallet Balances</h3>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowDeposit(!showDeposit); setShowWithdraw(false); }}
            className={`text-xs font-medium ${showDeposit ? 'text-gray-400' : 'text-blue-400 hover:text-blue-300'}`}
          >
            {showDeposit ? 'Cancel' : '+ Deposit'}
          </button>
          <button
            onClick={() => { setShowWithdraw(!showWithdraw); setShowDeposit(false); }}
            className={`text-xs font-medium ${showWithdraw ? 'text-gray-400' : 'text-orange-400 hover:text-orange-300'}`}
          >
            {showWithdraw ? 'Cancel' : '↑ Withdraw'}
          </button>
        </div>
      </div>
      
      {/* Deposit Form */}
      {showDeposit && (
        <div className="mb-4 p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
          <p className="text-xs text-blue-400 mb-2">Deposit from your EOA to Smart Wallet</p>
          <div className="flex gap-2 mb-2">
            <select
              value={depositToken}
              onChange={(e) => setDepositToken(e.target.value as 'ETH' | 'USDC')}
              className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
            >
              <option value="USDC">USDC</option>
              <option value="ETH">ETH</option>
            </select>
            <input
              type="number"
              placeholder={depositToken === 'USDC' ? '100.00' : '0.01'}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
            />
          </div>
          <button
            onClick={handleDeposit}
            disabled={isPending || !depositAmount}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPending ? 'Processing...' : `Deposit ${depositToken}`}
          </button>
        </div>
      )}
      
      {/* Withdraw Form */}
      {showWithdraw && (
        <div className="mb-4 p-3 bg-orange-500/10 rounded-xl border border-orange-500/20">
          <p className="text-xs text-orange-400 mb-2">Withdraw from Smart Wallet to your EOA</p>
          <div className="flex gap-2 mb-2">
            <select
              value={withdrawToken}
              onChange={(e) => setWithdrawToken(e.target.value as 'ETH' | 'USDC')}
              className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
            >
              <option value="USDC">USDC</option>
              <option value="ETH">ETH</option>
            </select>
            <input
              type="number"
              placeholder={withdrawToken === 'USDC' ? usdcFormatted : ethFormatted}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
            />
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setWithdrawAmount(withdrawToken === 'USDC' ? usdcFormatted : ethFormatted)}
              className="text-xs text-orange-400 hover:text-orange-300"
            >
              Max
            </button>
          </div>
          <button
            onClick={handleWithdraw}
            disabled={isWithdrawing || !withdrawAmount}
            className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isWithdrawing ? 'Processing...' : `Withdraw ${withdrawToken}`}
          </button>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex items-center justify-center h-20">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* ETH Balance */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center border border-blue-500/20">
                <span className="text-blue-400 font-bold">Ξ</span>
              </div>
              <div>
                <p className="font-medium text-white">ETH</p>
                <p className="text-xs text-gray-500">Sells during greed</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-white">{ethFormatted}</p>
              <p className="text-xs text-gray-500">
                ≈ ${(parseFloat(ethFormatted) * 2500).toFixed(2)}
              </p>
            </div>
          </div>

          {/* USDC Balance */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center border border-emerald-500/20">
                <span className="text-emerald-400 font-bold">$</span>
              </div>
              <div>
                <p className="font-medium text-white">USDC</p>
                <p className="text-xs text-gray-500">DCA capital</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-white">${usdcFormatted}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BalanceDisplay;
