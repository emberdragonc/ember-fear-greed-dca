// ETH Price API - derives price from Uniswap WETH/USDC pool (no CoinGecko dependency)
import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const UNISWAP_QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const quoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

// Cache: refresh every 60s
let cachedPrice: { price: number; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

async function getEthPriceFromUniswap(): Promise<number> {
  // Return cache if fresh
  if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_TTL) {
    return cachedPrice.price;
  }

  const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org', { timeout: 10_000 }),
  });

  // Quote 1 ETH → USDC
  const oneEth = BigInt('1000000000000000000');

  const result = await client.simulateContract({
    address: UNISWAP_QUOTER_V2,
    abi: quoterAbi,
    functionName: 'quoteExactInputSingle',
    args: [{
      tokenIn: WETH,
      tokenOut: USDC,
      amountIn: oneEth,
      fee: 500, // 0.05% pool
      sqrtPriceLimitX96: BigInt(0),
    }],
  });

  const usdcOut = Number(result.result[0]) / 1e6;

  cachedPrice = { price: usdcOut, timestamp: Date.now() };
  return usdcOut;
}

export async function GET() {
  try {
    const price = await getEthPriceFromUniswap();
    return NextResponse.json({ price, source: 'uniswap' }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('ETH price error:', error);
    // If Uniswap fails, try cache even if stale
    if (cachedPrice) {
      return NextResponse.json({ price: cachedPrice.price, source: 'cache' });
    }
    return NextResponse.json({ price: 2000, source: 'fallback' });
  }
}
