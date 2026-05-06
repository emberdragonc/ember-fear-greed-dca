// Strategy Performance API
// Returns live return metrics based on the inception wallet's execution history.
// Wallet 0x4F38DDE0bE7d92ABDE9F3D4ba29a92E02bD71Bd7 (smart account)
// EOA: 0xe3c938c71273bfff7dee21bdd3a8ee1e453bdd1b — running since inception (Feb 6 2026)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const INCEPTION_WALLET = '0xe3c938c71273bfff7dee21bdd3a8ee1e453bdd1b';
const INCEPTION_DATE = new Date('2026-02-06T00:00:00Z');

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
      { next: { revalidate: 60 } }
    );
    const json = await res.json();
    return json?.ethereum?.usd ?? 2000;
  } catch {
    return 2000;
  }
}

export async function GET() {
  try {
    // Serve from cache if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const supabase = getSupabase();

    const { data: executions, error } = await supabase
      .from('dca_executions')
      .select('action, amount_in, amount_out, status, created_at')
      .eq('user_address', INCEPTION_WALLET)
      .eq('status', 'success')
      .in('action', ['buy', 'sell']);

    if (error) throw error;

    // Accumulate cost basis (USDC, 6 decimals) and ETH (18 decimals)
    let totalUSDCSpent = 0n;
    let totalUSDCReceived = 0n;
    let totalETHAccumulated = 0n;
    let totalETHSold = 0n;

    for (const ex of executions || []) {
      if (ex.action === 'buy') {
        totalUSDCSpent += BigInt(ex.amount_in || 0);
        totalETHAccumulated += BigInt(ex.amount_out || 0);
      } else if (ex.action === 'sell') {
        totalETHSold += BigInt(ex.amount_in || 0);
        totalUSDCReceived += BigInt(ex.amount_out || 0);
      }
    }

    const netUSDCSpent = Number(totalUSDCSpent - totalUSDCReceived) / 1e6;
    const netETHHeld = Number(totalETHAccumulated - totalETHSold) / 1e18;

    const ethPrice = await getEthPrice();
    const currentValue = netETHHeld * ethPrice;

    // Guard against division by zero
    if (netUSDCSpent <= 0) {
      return NextResponse.json({ error: 'Insufficient data' }, { status: 503 });
    }

    const returnPct = ((currentValue / netUSDCSpent) - 1) * 100;

    const now = new Date();
    const daysRunning = (now.getTime() - INCEPTION_DATE.getTime()) / (1000 * 60 * 60 * 24);
    const years = daysRunning / 365;
    const annualizedReturn = (Math.pow(1 + returnPct / 100, 1 / years) - 1) * 100;

    const result = {
      returnSinceInception: parseFloat(returnPct.toFixed(1)),
      annualizedReturn: parseFloat(annualizedReturn.toFixed(1)),
      inceptionDate: INCEPTION_DATE.toISOString().split('T')[0],
      daysRunning: Math.floor(daysRunning),
      ethPrice,
      netETHHeld: parseFloat(netETHHeld.toFixed(6)),
      netUSDCSpent: parseFloat(netUSDCSpent.toFixed(2)),
    };

    cache = { data: result, ts: Date.now() };
    return NextResponse.json(result);
  } catch (err) {
    console.error('strategy-performance error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
