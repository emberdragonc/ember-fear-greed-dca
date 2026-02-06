'use client';

import { useState, useEffect } from 'react';
import { useAccount, useBalance, useReadContract, useSendTransaction, useWriteContract, usePublicClient, useWalletClient } from 'wagmi';
import { base } from 'wagmi/chains';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import { TOKENS } from '@/lib/swap';
import { formatUnits, parseUnits, parseEther, encodeFunctionData, http } from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';
import { createSmartAccountClient } from 'permissionless';
import { createPimlicoClient } from 'permissionless/clients/pimlico';

// WETH address on Base
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;

// Pimlico bundler URL
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || '';
const BUNDLER_URL = `https://api.pimlico.io/v2/8453/rpc?apikey=${PIMLICO_API_KEY}`;

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

interface EthPriceData {
  ethereum: {
    usd: number;
  };
}

export function TotalBalanceCard() {
  const { address: eoaAddress } = useAccount();
  const { smartAccountAddress, smartAccount } = useSmartAccountContext();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [priceError, setPriceError] = useState(false);
  
  // Deposit/Withdraw state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositToken, setDepositToken] = useState<'ETH' | 'USDC'>('USDC');
  const [showDeposit, setShowDeposit] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawToken, setWithdrawToken] = useState<'ETH' | 'USDC'>('USDC');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const { sendTransaction, isPending: isSendingEth } = useSendTransaction();
  const { writeContract, isPending: isSendingUsdc } = useWriteContract();
  const isPending = isSendingEth || isSendingUsdc;

  // Fetch ETH price from CoinGecko
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        setPriceLoading(true);
        setPriceError(false);
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
          { cache: 'no-store' }
        );
        if (!response.ok) throw new Error('Failed to fetch price');
        const data: EthPriceData = await response.json();
        setEthPrice(data.ethereum.usd);
      } catch (error) {
        console.error('Error fetching ETH price:', error);
        setPriceError(true);
        setEthPrice(2500);
      } finally {
        setPriceLoading(false);
      }
    };

    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Smart wallet ETH balance (native)
  const { data: ethBalance, isLoading: ethLoading, refetch: refetchEth } = useBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  });

  // Smart wallet WETH balance
  const { data: wethBalanceRaw, isLoading: wethLoading, refetch: refetchWeth } = useReadContract({
    address: WETH_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: smartAccountAddress ? [smartAccountAddress as `0x${string}`] : undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  } as any);

  // Smart wallet USDC balance
  const { data: usdcBalanceRaw, isLoading: usdcLoading, refetch: refetchUsdc } = useReadContract({
    address: TOKENS.USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: smartAccountAddress ? [smartAccountAddress as `0x${string}`] : undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  } as any);

  const isLoading = ethLoading || wethLoading || usdcLoading || priceLoading;

  // Calculate balances
  const nativeEth = ethBalance ? parseFloat(formatUnits(ethBalance.value, 18)) : 0;
  const weth = wethBalanceRaw ? parseFloat(formatUnits(wethBalanceRaw as bigint, 18)) : 0;
  const totalEth = nativeEth + weth;
  const usdc = usdcBalanceRaw ? parseFloat(formatUnits(usdcBalanceRaw as bigint, 6)) : 0;
  const usdcRaw = usdcBalanceRaw ? formatUnits(usdcBalanceRaw as bigint, 6) : '0';
  const ethRaw = ethBalance ? formatUnits(ethBalance.value, 18) : '0';

  // Calculate USD values
  const ethUsdValue = ethPrice ? totalEth * ethPrice : 0;
  const totalUsd = ethUsdValue + usdc;

  const formatUsd = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const refetchAll = () => {
    setTimeout(() => {
      refetchEth();
      refetchWeth();
      refetchUsdc();
    }, 3000);
  };

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
      refetchAll();
    } catch (error) {
      console.error('Deposit failed:', error);
    }
  };

  const handleWithdraw = async () => {
    if (!smartAccountAddress || !eoaAddress || !withdrawAmount || !smartAccount || !publicClient) return;
    setIsWithdrawing(true);
    try {
      const pimlicoClient = createPimlicoClient({
        transport: http(BUNDLER_URL),
        entryPoint: { address: entryPoint07Address, version: '0.7' },
      });

      const smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        chain: base,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: pimlicoClient,
        paymasterContext: { sponsorshipPolicyId: 'sp_glamorous_leopardon' },
        userOperation: {
          estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
        },
      });

      let txParams: { to: `0x${string}`; value: bigint; data: `0x${string}` };
      if (withdrawToken === 'ETH') {
        txParams = {
          to: eoaAddress as `0x${string}`,
          value: parseEther(withdrawAmount),
          data: '0x' as `0x${string}`,
        };
      } else {
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

      await smartAccountClient.sendTransaction(txParams as any);
      setWithdrawAmount('');
      setShowWithdraw(false);
      refetchAll();
      alert('Withdrawal successful!');
    } catch (error) {
      console.error('Withdraw failed:', error);
      alert('Withdrawal failed');
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (!smartAccountAddress) {
    return (
      <div className="p-6 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 rounded-2xl border border-emerald-500/20 backdrop-blur-sm">
        <h3 className="text-sm font-medium text-gray-400 mb-4">💰 Total Balance</h3>
        <p className="text-sm text-gray-500 text-center py-4">
          Create a smart account to view balance
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 rounded-2xl border border-emerald-500/20 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">💰 Total Balance</h3>
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
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs text-blue-400">Deposit from your EOA to Smart Wallet</p>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Base</span>
          </div>
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
              placeholder={withdrawToken === 'USDC' ? usdc.toFixed(2) : totalEth.toFixed(4)}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm"
            />
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setWithdrawAmount(withdrawToken === 'USDC' ? usdcRaw : ethRaw)}
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
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main Total */}
          <div className="text-center py-2">
            <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-400">
              {formatUsd(totalUsd)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Smart Wallet Value
              {ethPrice && !priceError && (
                <span className="ml-2">• ETH: {formatUsd(ethPrice)}</span>
              )}
            </p>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {/* ETH */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-blue-400 font-bold text-sm">Ξ</span>
                <span className="text-xs text-gray-400">ETH</span>
              </div>
              <p className="font-semibold text-white">{totalEth.toFixed(4)}</p>
              <p className="text-xs text-gray-500">{formatUsd(ethUsdValue)}</p>
            </div>

            {/* USDC */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-emerald-400 font-bold text-sm">$</span>
                <span className="text-xs text-gray-400">USDC</span>
              </div>
              <p className="font-semibold text-white">{usdc.toFixed(2)}</p>
              <p className="text-xs text-gray-500">Stablecoin</p>
            </div>
          </div>

          {/* Allocation bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>ETH: {totalUsd > 0 ? ((ethUsdValue / totalUsd) * 100).toFixed(0) : 0}%</span>
              <span>USDC: {totalUsd > 0 ? ((usdc / totalUsd) * 100).toFixed(0) : 0}%</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                style={{ width: totalUsd > 0 ? `${(ethUsdValue / totalUsd) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TotalBalanceCard;
