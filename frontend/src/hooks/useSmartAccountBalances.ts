// useSmartAccountBalances.ts
// Single source of truth for on-chain ETH + WETH + USDC balances.
// Used by both APYDisplay and BalanceHistoryChart so they always agree.
import { useReadContract, useBalance } from 'wagmi';
import { base } from 'wagmi/chains';
import { formatUnits } from 'viem';
import { useEthPrice } from '@/hooks/useEthPrice';
import { TOKENS } from '@/lib/swap';

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const;

const erc20BalanceAbi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

export function useSmartAccountBalances(smartAccountAddress: string | null) {
  const { price: ethPrice } = useEthPrice();

  const { data: ethBalance } = useBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  });

  const { data: wethRaw } = useReadContract({
    address: WETH_ADDRESS,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: smartAccountAddress ? [smartAccountAddress as `0x${string}`] : undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  } as any);

  const { data: usdcRaw } = useReadContract({
    address: TOKENS.USDC,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: smartAccountAddress ? [smartAccountAddress as `0x${string}`] : undefined,
    chainId: base.id,
    query: { enabled: !!smartAccountAddress },
  } as any);

  const nativeEth = ethBalance ? parseFloat(formatUnits(ethBalance.value, 18)) : 0;
  const weth = wethRaw ? parseFloat(formatUnits(wethRaw as bigint, 18)) : 0;
  const usdc = usdcRaw ? parseFloat(formatUnits(usdcRaw as bigint, 6)) : 0;
  const totalEth = nativeEth + weth;
  const ethUsd = ethPrice ? totalEth * ethPrice : 0;
  const totalUsd = ethUsd + usdc;

  return { totalEth, usdc, ethUsd, totalUsd, ethPrice: ethPrice ?? 0 };
}
