// BalanceDisplay - Shows Smart Wallet ETH and USDC balances with deposit/withdraw
'use client';

import { useState } from 'react';
import { useAccount, useBalance, useReadContract, useSendTransaction, useWriteContract, usePublicClient, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { TOKENS } from '@/lib/swap';

// WETH address on Base
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;
import { formatUnits, parseUnits, parseEther, encodeFunctionData, http } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';
import { createSmartAccountClient } from 'permissionless';
import { createPimlicoClient } from 'permissionless/clients/pimlico';

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

// Pimlico bundler URL for Base (with API key for paymaster sponsorship)
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || '';
const BUNDLER_URL = `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`;

export function BalanceDisplay() {
  const { address: eoaAddress } = useAccount();
  const { smartAccountAddress, smartAccount } = useSmartAccountContext();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [depositAmount, setDepositAmount] = useState('');
  const [depositToken, setDepositToken] = useState<'WETH' | 'USDC'>('USDC');
  const [showDeposit, setShowDeposit] = useState(false);
  
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawToken, setWithdrawToken] = useState<'WETH' | 'USDC'>('USDC');
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

  // Smart wallet WETH balance (from swaps)
  const { data: wethBalanceRaw, isLoading: wethLoading, refetch: refetchWeth } = useReadContract({
    address: WETH_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: smartAccountAddress ? [smartAccountAddress as `0x${string}`] : undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  } as any);

  const isLoading = ethLoading || usdcLoading || wethLoading;
  const isPending = isSendingEth || isSendingUsdc;

  // Raw balances for max button (full precision)
  const ethRaw = ethBalance ? formatUnits(ethBalance.value, 18) : '0';
  const wethRaw = wethBalanceRaw ? formatUnits(wethBalanceRaw as bigint, 18) : '0';
  const usdcRaw = usdcBalanceRaw ? formatUnits(usdcBalanceRaw as bigint, 6) : '0';
  
  // Format for display (rounded)
  const ethFormatted = ethBalance ? parseFloat(formatUnits(ethBalance.value, 18)).toFixed(4) : '0';
  const wethFormatted = wethBalanceRaw ? parseFloat(formatUnits(wethBalanceRaw as bigint, 18)).toFixed(4) : '0';
  const usdcFormatted = usdcBalanceRaw ? parseFloat(formatUnits(usdcBalanceRaw as bigint, 6)).toFixed(2) : '0';
  
  // Combined ETH value (native + wrapped) for display
  const totalEthValue = parseFloat(ethFormatted) + parseFloat(wethFormatted);

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
        refetchWeth();
        refetchUsdc();
      }, 3000);
    } catch (error) {
      console.error('Deposit failed:', error);
    }
  };

  const handleWithdraw = async () => {
    if (!smartAccountAddress || !eoaAddress || !withdrawAmount || !smartAccount || !publicClient) return;

    setIsWithdrawing(true);
  // Check if smart account has enough ETH for gas (in case paymaster fails)
  const smartAccountEthBalance = await publicClient.getBalance({ address: smartAccountAddress });
  if (smartAccountEthBalance < parseEther('0.0001')) {
  alert('Your smart account needs a small amount of ETH for gas fees. Please deposit at least 0.0001 ETH to your smart account first.');
  setIsWithdrawing(false);
  return;
  }

  // Check sufficient balance for the token
  const withdrawAmountBigInt = withdrawToken === 'WETH' ? parseEther(withdrawAmount) : parseUnits(withdrawAmount, 6);
  const currentBalance = withdrawToken === 'WETH' ? (wethBalanceRaw as bigint) : (usdcBalanceRaw as bigint);
  if (withdrawAmountBigInt > currentBalance) {
  alert(`Insufficient ${withdrawToken === 'WETH' ? 'WETH' : withdrawToken} balance in smart account.`);
  setIsWithdrawing(false);
  return;
  }

    try {
      console.log(`[${withdrawToken}] Starting withdrawal...`);
      
      // Create Pimlico client for gas sponsorship
      const pimlicoClient = createPimlicoClient({
        transport: http(BUNDLER_URL),
      });
      console.log(`[${withdrawToken}] Pimlico client created`);

      // Create smart account client with Pimlico paymaster (uses pm_sponsorUserOperation)
      const smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        chain: base,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      });
      console.log(`[${withdrawToken}] Smart account client created`);

      // Build the withdrawal transaction
      let txParams: { to: `0x${string}`; value: bigint; data: `0x${string}` };
      
      if (withdrawToken === 'WETH') {
        // ETH: Transfer WETH to EOA (DCA buys WETH, not native ETH)
        const transferData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [eoaAddress as `0x${string}`, parseEther(withdrawAmount)],
        });
        txParams = {
          to: WETH_ADDRESS as `0x${string}`,
          value: 0n,
          data: transferData,
        };
      } else {
        // USDC: Call transfer on USDC contract
        const transferData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [eoaAddress as `0x${string}`, parseUnits(withdrawAmount, 6)],
        });
        txParams = {
          to: TOKENS.USDC as `0x${string}`,
          value: 0n,
          data: transferData,
        };
      }

      console.log(`[${withdrawToken}] TX Params:`, JSON.stringify({
        to: txParams.to,
        value: txParams.value.toString(),
        dataLength: txParams.data.length,
        data: txParams.data.substring(0, 50) + '...',
      }, null, 2));

      // Send transaction through smart account client (handles sponsorship automatically)
      const txHash = await smartAccountClient.sendTransaction(txParams as any);
      
      console.log('Withdrawal tx:', txHash);
      
      setWithdrawAmount('');
      setShowWithdraw(false);
      // Refetch balances after a delay
      setTimeout(() => {
        refetchEth();
        refetchWeth();
        refetchUsdc();
      }, 5000);
      
      alert('Withdrawal successful!');
    } catch (error) {
      console.error('Withdraw failed - FULL ERROR:', error);
  console.error('Error details:', {
  message: error instanceof Error ? error.message : 'Unknown',
  stack: error instanceof Error ? error.stack : 'No stack',
  raw: error
  });
      // Sanitize error message - don't expose URLs or API keys
      let errorMsg = 'Withdrawal failed';
      if (error instanceof Error) {
        // Remove any URLs from error message
        errorMsg = error.message.replace(/https?:\/\/[^\s]+/g, '[URL]');
        // Common errors
        if (error.message.includes('insufficient funds')) {
          errorMsg = 'Insufficient ETH in smart account for gas. Deposit some ETH first.';
        } else if (error.message.includes('User rejected')) {
        } else if (error.message.includes('User rejected')) {
          errorMsg = 'Transaction rejected';
  errorMsg = `Paymaster error: ${error.message.split('paymaster')[1] || 'Unknown paymaster issue'}`;
  } else if (error.message.includes('bundler')) {
  errorMsg = `Bundler error: ${error.message.split('bundler')[1] || 'Unknown bundler issue'}`;
  } else {
  // For debugging - show more of the actual error
  errorMsg = `Withdrawal failed: ${error.message.substring(0, 100)}`;

        }
      }
      alert(errorMsg);
    } finally {
      setIsWithdrawing(false);
  // Check sufficient balance for the token
  }
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
              onChange={(e) => setDepositToken(e.target.value as 'WETH' | 'USDC')}
              className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
            >
              <option value="USDC">USDC</option>
              <option value="WETH">WETH</option>
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
              onChange={(e) => setWithdrawToken(e.target.value as 'WETH' | 'USDC')}
              className="px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
            >
              <option value="USDC">USDC</option>
              <option value="WETH">WETH</option>
            </select>
            <input
              type="number"
              placeholder={withdrawToken === 'USDC' ? usdcFormatted : wethFormatted}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
            />
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setWithdrawAmount(withdrawToken === 'USDC' ? usdcRaw : wethRaw)}
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
          {/* ETH Balance (Native + WETH combined) */}
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
              <p className="font-bold text-white">{totalEthValue.toFixed(4)}</p>
              <p className="text-xs text-gray-500">
                ≈ ${(totalEthValue * 2500).toFixed(2)}
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
