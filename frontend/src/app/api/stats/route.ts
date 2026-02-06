// Stats API - fetch protocol stats (wallets, TVL, executions, volume)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const ETH_PRICE_USD = 2500; // TODO: fetch from oracle

// ERC20 balanceOf
const erc20Abi = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const;

// Lazy-loaded clients
let _supabase: any = null;
let _publicClient: any = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      throw new Error('Supabase credentials not found');
    }
    
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });
  }
  return _publicClient;
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const publicClient = getPublicClient();

    // Get all active delegations (try with smart_account_address, fall back if column doesn't exist)
    let delegations: any[] | null = null;
    let error: any = null;
    
    // Try with smart_account_address first
    const result = await supabase
      .from('delegations')
      .select('user_address, smart_account_address')
      .gt('expires_at', new Date().toISOString());
    
    if (result.error?.code === '42703') {
      // Column doesn't exist, try without it
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
      return NextResponse.json({ wallets: 0, tvl: 0 });
    }

    const wallets = delegations?.length || 0;

    // Calculate TVL by summing balances of smart accounts (fall back to EOA if no smart account)
    let tvl = 0;
    
    if (delegations && delegations.length > 0) {
      for (const d of delegations) {
        try {
          // Prefer smart_account_address, fall back to user_address (EOA)
          const address = (d.smart_account_address || d.user_address) as `0x${string}`;
          
          // Get native ETH balance
          const ethBalance = await publicClient.getBalance({ address });
          const ethValue = parseFloat(formatUnits(ethBalance, 18)) * ETH_PRICE_USD;
          
          // Get WETH balance (from DCA swaps)
          const wethBalance = await publicClient.readContract({
            address: WETH as `0x${string}`,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          });
          const wethValue = parseFloat(formatUnits(wethBalance, 18)) * ETH_PRICE_USD;
          
          // Get USDC balance
          const usdcBalance = await publicClient.readContract({
            address: USDC as `0x${string}`,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          });
          const usdcValue = parseFloat(formatUnits(usdcBalance, 6));
          
          tvl += ethValue + wethValue + usdcValue;
        } catch (err) {
          console.error(`Failed to fetch balance for ${d.user_address}:`, err);
        }
      }
    }

    // Fetch execution stats from dca_executions table
    let executions = 0;
    let volume = 0;
    
    try {
      // Get execution count
      const { count: executionCount } = await supabase
        .from('dca_executions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'success');
      
      executions = executionCount || 0;
      
      // Get total volume (sum of amount_in for successful trades)
      const { data: volumeData } = await supabase
        .from('dca_executions')
        .select('amount_in, action')
        .eq('status', 'success');
      
      if (volumeData && volumeData.length > 0) {
        for (const exec of volumeData) {
          // amount_in is in USDC (6 decimals) for buys, ETH (18 decimals) for sells
          const isBuy = exec.action === 'buy';
          const decimals = isBuy ? 6 : 18;
          const amount = parseFloat(exec.amount_in) / Math.pow(10, decimals);
          // Convert ETH to USD for sells
          const usdAmount = isBuy ? amount : amount * ETH_PRICE_USD;
          volume += usdAmount;
        }
      }
    } catch (err) {
      console.error('Failed to fetch execution stats:', err);
    }

    return NextResponse.json({
      wallets,
      tvl: Math.round(tvl * 100) / 100, // Round to 2 decimals
      executions,
      volume: Math.round(volume * 100) / 100,
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ wallets: 0, tvl: 0, executions: 0, volume: 0 });
  }
}
