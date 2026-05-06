// Strategy Performance API
// Returns live return metrics matching the wallet dashboard calculation.
// Uses smart account 0x4F38DDE0bE7d92ABDE9F3D4ba29a92E02bD71Bd7 (inception wallet).
// EOA: 0xe3c938c71273bfff7dee21bdd3a8ee1e453bdd1b

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


const SMART_ACCOUNT = '0x4f38dde0be7d92abde9f3d4ba29a92e02bd71bd7' as const;
const EOA = '0xe3c938c71273bfff7dee21bdd3a8ee1e453bdd1b';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const WETH = '0x4200000000000000000000000000000000000006' as const;
const INCEPTION_DATE = new Date('2026-02-06T00:00:00Z');
const BASE_RPCS = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
  'https://1rpc.io/base',
];

async function ethCall(to: string, data: string): Promise<string> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] });
  for (const rpc of BASE_RPCS) {
    try {
      const res = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const json = await res.json();
      if (json.result && json.result !== '0x') return json.result;
    } catch { /* try next */ }
  }
  throw new Error('All Base RPCs failed');
}

// Cache for 10 minutes
let cache: { data: object; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials not found');
  return createClient(url, key);
}

async function getEthPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { cache: 'no-store' }
    );
    const json = await res.json();
    return json?.ethereum?.usd ?? 2000;
  } catch {
    return 2000;
  }
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const supabase = getSupabase();
      // Fetch executions + on-chain balances in parallel
    const balanceOfData = (addr: string) => '0x70a08231' + addr.slice(2).padStart(64, '0');
    const [{ data: executions, error }, usdcHex, wethHex, ethPrice] = await Promise.all([
      supabase
        .from('dca_executions')
        .select('action, amount_in, amount_out, status, created_at')
        .eq('user_address', EOA)
        .eq('status', 'success')
        .in('action', ['buy', 'sell']),
      ethCall(USDC, balanceOfData(SMART_ACCOUNT)),
      ethCall(WETH, balanceOfData(SMART_ACCOUNT)), // smart account holds WETH not native ETH
      getEthPrice(),
    ]);
    const usdcRaw = BigInt(usdcHex);
    const ethRaw = BigInt(wethHex);

    if (error) throw error;

    // Reconstruct cumulative balances from execution history
    let totalUsdcSpent = 0;   // USDC deployed buying ETH (6 dec)
    let ethAccumulated = 0;   // ETH received from buys (18 dec)
    let totalUsdcReceived = 0; // USDC from sells

    for (const ex of executions || []) {
      if (ex.action === 'buy') {
        totalUsdcSpent += parseFloat(ex.amount_in) / 1e6;
        ethAccumulated += ex.amount_out ? parseFloat(ex.amount_out) / 1e18 : 0;
      } else if (ex.action === 'sell') {
        ethAccumulated -= parseFloat(ex.amount_in) / 1e18;
        totalUsdcReceived += ex.amount_out ? parseFloat(ex.amount_out) / 1e6 : 0;
      }
    }

    const currentOnChainUsdc = Number(usdcRaw) / 1e6;
    const currentOnChainEth = Number(ethRaw) / 1e18;

    // Same formula as usePortfolioHistory
    // totalDeposited = all USDC ever spent + USDC still in account = original deposit
    const totalDeposited = totalUsdcSpent + currentOnChainUsdc;
    const currentValue = currentOnChainEth * ethPrice + currentOnChainUsdc + totalUsdcReceived;

    if (totalDeposited <= 0) {
      return NextResponse.json({ error: 'Insufficient data' }, { status: 503 });
    }

    const profitLossPercent = ((currentValue - totalDeposited) / totalDeposited) * 100;

    const now = new Date();
    const daysRunning = Math.max(1, Math.floor((now.getTime() - INCEPTION_DATE.getTime()) / (1000 * 60 * 60 * 24)));
    const yearsActive = daysRunning / 365;
    const annualizedReturn = totalDeposited > 0 && currentValue > 0
      ? (Math.pow(currentValue / totalDeposited, 1 / yearsActive) - 1) * 100
      : 0;

    const result = {
      returnSinceInception: parseFloat(profitLossPercent.toFixed(2)),
      annualizedReturn: parseFloat(annualizedReturn.toFixed(2)),
      inceptionDate: INCEPTION_DATE.toISOString().split('T')[0],
      daysRunning,
      ethPrice,
      currentValue: parseFloat(currentValue.toFixed(2)),
      totalDeposited: parseFloat(totalDeposited.toFixed(2)),
    };

    cache = { data: result, ts: Date.now() };
    return NextResponse.json(result);
  } catch (err) {
    console.error('strategy-performance error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
