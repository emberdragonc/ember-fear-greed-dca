// Stats API - fetch protocol stats (wallets, TVL, executions, volume)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { base } from 'viem/chains';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const UNISWAP_QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';

// Simple in-memory cache for TVL
let tvlCache: { value: number; timestamp: number } | null = null;
const TVL_CACHE_TTL = 30000; // 30 seconds

// Cache ETH price
let ethPriceCache: { price: number; timestamp: number } | null = null;
const ETH_PRICE_CACHE_TTL = 60000;

const quoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

// Fetch ETH price from Uniswap (no CoinGecko)
async function getEthPrice(): Promise<number> {
  if (ethPriceCache && Date.now() - ethPriceCache.timestamp < ETH_PRICE_CACHE_TTL) {
    return ethPriceCache.price;
  }
  try {
    const client = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org', { timeout: 10_000 }),
    });
    const result = await client.simulateContract({
      address: UNISWAP_QUOTER_V2,
      abi: quoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn: WETH,
        tokenOut: USDC,
        amountIn: BigInt('1000000000000000000'),
        fee: 500,
        sqrtPriceLimitX96: BigInt(0),
      }],
    });
    const price = Number(result.result[0]) / 1e6;
    ethPriceCache = { price, timestamp: Date.now() };
    return price;
  } catch (e) {
    console.error('Failed to fetch ETH price from Uniswap:', e);
    return ethPriceCache?.price || 2000;
  }
}

// ERC20 balanceOf
const erc20Abi = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const;

// RPC Configuration - Alchemy primary, public fallback
const ALCHEMY_RPC = 'https://base-mainnet.g.alchemy.com/v2/NQlmwdn5GImg3XWpPUNp4';
const FALLBACK_RPC = 'https://mainnet.base.org';

// Lazy-loaded clients
let _supabase: any = null;
let _alchemyClient: any = null;
let _fallbackClient: any = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase credentials not found');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function getAlchemyClient() {
  if (!_alchemyClient) {
    _alchemyClient = createPublicClient({
      chain: base,
      transport: http(ALCHEMY_RPC, {
        timeout: 8000,
        retryCount: 2,
        retryDelay: 500,
      }),
    });
  }
  return _alchemyClient;
}

function getFallbackClient() {
  if (!_fallbackClient) {
    _fallbackClient = createPublicClient({
      chain: base,
      transport: http(FALLBACK_RPC, {
        timeout: 8000,
        retryCount: 2,
        retryDelay: 500,
      }),
    });
  }
  return _fallbackClient;
}

// Get public client with fallback support
function getPublicClient() {
  return getAlchemyClient();
}

// Fetch balance for a single wallet with fallback RPC support
async function fetchWalletBalance(
  primaryClient: any,
  address: `0x${string}`,
  ethPrice: number
): Promise<number> {
  async function tryFetchBalances(client: any): Promise<number> {
    const [ethResult, wethResult, usdcResult] = await Promise.allSettled([
      client.getBalance({ address }),
      client.readContract({
        address: WETH as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }),
      client.readContract({
        address: USDC as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }),
    ]);

    let total = 0;
    let allFailed = true;

    if (ethResult.status === 'fulfilled') {
      total += parseFloat(formatUnits(ethResult.value, 18)) * ethPrice;
      allFailed = false;
    }
    if (wethResult.status === 'fulfilled') {
      total += parseFloat(formatUnits(wethResult.value as bigint, 18)) * ethPrice;
      allFailed = false;
    }
    if (usdcResult.status === 'fulfilled') {
      total += parseFloat(formatUnits(usdcResult.value as bigint, 6));
      allFailed = false;
    }

    // If all calls failed, throw to trigger fallback
    if (allFailed) {
      throw new Error('All RPC calls failed');
    }

    return total;
  }

  // Try Alchemy first
  try {
    return await tryFetchBalances(primaryClient);
  } catch (primaryError) {
    // Fallback to public RPC
    console.warn(`Alchemy RPC failed for ${address}, trying fallback:`, (primaryError as Error).message);
    try {
      const fallbackClient = getFallbackClient();
      return await tryFetchBalances(fallbackClient);
    } catch (fallbackError) {
      console.error(`Fallback RPC also failed for ${address}:`, (fallbackError as Error).message);
      return 0;
    }
  }
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const publicClient = getPublicClient();
    const ETH_PRICE_USD = await getEthPrice();

    // Get all active delegations
    let delegations: any[] | null = null;
    let error: any = null;

    const result = await supabase
      .from('delegations')
      .select('user_address, smart_account_address')
      .gt('expires_at', new Date().toISOString());

    if (result.error?.code === '42703') {
      const fallbackResult = await supabase
        .from('delegations')
        .select('user_address')
        .gt('expires_at', new Date().toISOString());
      delegations = fallbackResult.data;
      error = fallbackResult.error;
    } else {
      delegations = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Failed to fetch delegations:', error);
      return NextResponse.json({ wallets: 0, tvl: tvlCache?.value || 0 });
    }

    const wallets = delegations?.length || 0;

    // Calculate TVL - use cache if fresh
    let tvl = 0;
    const now = Date.now();
    
    if (tvlCache && (now - tvlCache.timestamp) < TVL_CACHE_TTL) {
      tvl = tvlCache.value;
    } else if (delegations && delegations.length > 0) {
      // Fetch all wallet balances in parallel
      const balancePromises = delegations.map((d) => {
        const address = (d.smart_account_address || d.user_address) as `0x${string}`;
        return fetchWalletBalance(publicClient, address, ETH_PRICE_USD)
          .catch((err) => {
            console.error(`Failed to fetch balance for ${address}:`, err.message);
            return 0;
          });
      });

      const balances = await Promise.all(balancePromises);
      tvl = balances.reduce((sum, bal) => sum + bal, 0);
      
      // Only cache if we got a reasonable value
      if (tvl > 0) {
        tvlCache = { value: tvl, timestamp: now };
      } else if (tvlCache) {
        // Use stale cache if current fetch failed
        tvl = tvlCache.value;
      }
    }

    // Fetch execution stats
    let executions = 0;
    let volume = 0;

    try {
      const { count: executionCount } = await supabase
        .from('dca_executions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'success');

      executions = executionCount || 0;

      const { data: volumeData } = await supabase
        .from('dca_executions')
        .select('amount_in, action')
        .eq('status', 'success');

      if (volumeData && volumeData.length > 0) {
        for (const exec of volumeData) {
          const isBuy = exec.action === 'buy';
          const decimals = isBuy ? 6 : 18;
          const amount = parseFloat(exec.amount_in) / Math.pow(10, decimals);
          const usdAmount = isBuy ? amount : amount * ETH_PRICE_USD;
          volume += usdAmount;
        }
      }
    } catch (err) {
      console.error('Failed to fetch execution stats:', err);
    }

    return NextResponse.json({
      wallets,
      tvl: Math.round(tvl * 100) / 100,
      executions,
      volume: Math.round(volume * 100) / 100,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({
      wallets: 0,
      tvl: tvlCache?.value || 0,
      executions: 0,
      volume: 0,
    });
  }
}
