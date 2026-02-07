/**
 * DCA Simulation Script
 * Uses Alchemy's alchemy_simulateAssetChanges to test swap transactions
 * without actually submitting them
 */

import { createPublicClient, http, formatUnits, Address, Hex, encodeFunctionData, erc20Abi } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;
const ALCHEMY_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

const ADDRESSES = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  UNISWAP_ROUTER: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD' as Address,
};

const publicClient = createPublicClient({
  chain: base,
  transport: http(ALCHEMY_URL),
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function simulateAssetChanges(params: {
  from: Address;
  to: Address;
  data: Hex;
  value?: string;
}): Promise<{ success: boolean; changes: any[]; error?: string }> {
  try {
    const response = await fetch(ALCHEMY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_simulateAssetChanges',
        params: [{
          from: params.from,
          to: params.to,
          data: params.data,
          value: params.value || '0x0',
        }],
      }),
    });
    
    const result = await response.json();
    if (result.error) {
      return { success: false, changes: [], error: result.error.message };
    }
    return { success: true, changes: result.result?.changes || [] };
  } catch (error: any) {
    return { success: false, changes: [], error: error.message };
  }
}

async function getActiveDelegations() {
  const { data, error } = await supabase
    .from('delegations')
    .select('*')
    
    .gte('expires_at', new Date().toISOString());
  
  if (error) throw error;
  return data || [];
}

async function simulateDCA() {
  console.log('========================================');
  console.log('  DCA SIMULATION (No Real Transactions)');
  console.log('  Using Alchemy alchemy_simulateAssetChanges');
  console.log('========================================\n');

  // Get Fear & Greed
  const fgRes = await fetch('https://api.alternative.me/fng/');
  const fgData = await fgRes.json();
  const fgValue = parseInt(fgData.data[0].value);
  const fgClass = fgData.data[0].value_classification;
  
  console.log(`Fear & Greed: ${fgValue} (${fgClass})`);
  
  let action: 'buy' | 'sell' | 'hold';
  let percentage: number;
  
  if (fgValue <= 25) {
    action = 'buy'; percentage = 5;
    console.log('Decision: Extreme Fear - Would BUY 5%');
  } else if (fgValue <= 45) {
    action = 'buy'; percentage = 2.5;
    console.log('Decision: Fear - Would BUY 2.5%');
  } else if (fgValue <= 54) {
    action = 'hold'; percentage = 0;
    console.log('Decision: Neutral - Would HOLD');
  } else if (fgValue <= 75) {
    action = 'sell'; percentage = 2.5;
    console.log('Decision: Greed - Would SELL 2.5%');
  } else {
    action = 'sell'; percentage = 5;
    console.log('Decision: Extreme Greed - Would SELL 5%');
  }
  
  if (action === 'hold') {
    console.log('\n✓ Market neutral - No simulations needed');
    return;
  }

  // Get active delegations
  const delegations = await getActiveDelegations();
  console.log(`\nActive delegations: ${delegations.length}`);
  
  const results: { address: string; wouldSwap: string; simulation: string; details: any }[] = [];
  
  for (const d of delegations.slice(0, 5)) { // Limit to 5 for simulation
    const smartAccount = d.smart_account_address as Address;
    
    // Get balances
    const usdcBalance = await publicClient.readContract({
      address: ADDRESSES.USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [smartAccount],
    });
    
    const wethBalance = await publicClient.readContract({
      address: ADDRESSES.WETH,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [smartAccount],
    });
    
    const tokenBalance = action === 'buy' ? usdcBalance : wethBalance;
    const tokenDecimals = action === 'buy' ? 6 : 18;
    const tokenSymbol = action === 'buy' ? 'USDC' : 'WETH';
    
    if (tokenBalance === 0n) {
      results.push({
        address: smartAccount,
        wouldSwap: '0',
        simulation: 'SKIP',
        details: { reason: `No ${tokenSymbol} balance` }
      });
      continue;
    }
    
    // Calculate swap amount (percentage of balance, minus 0.2% fee)
    const swapAmount = (tokenBalance * BigInt(Math.floor(percentage * 10))) / 1000n;
    const feeAmount = (swapAmount * 20n) / 10000n; // 0.2% fee
    const swapAmountAfterFee = swapAmount - feeAmount;
    
    if (swapAmountAfterFee <= 0n) {
      results.push({
        address: smartAccount,
        wouldSwap: '0',
        simulation: 'SKIP',
        details: { reason: 'Amount too small after fee' }
      });
      continue;
    }
    
    // Simulate an ERC20 transfer (simplified - actual swap would use Uniswap)
    // For simulation, we'll test if the wallet can transfer the token
    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [ADDRESSES.UNISWAP_ROUTER, swapAmountAfterFee],
    });
    
    const tokenAddress = action === 'buy' ? ADDRESSES.USDC : ADDRESSES.WETH;
    
    const simResult = await simulateAssetChanges({
      from: smartAccount,
      to: tokenAddress,
      data: transferData,
    });
    
    results.push({
      address: smartAccount,
      wouldSwap: `${formatUnits(swapAmountAfterFee, tokenDecimals)} ${tokenSymbol}`,
      simulation: simResult.success ? 'PASS ✅' : 'FAIL ❌',
      details: simResult.success ? { changes: simResult.changes.length } : { error: simResult.error }
    });
  }
  
  console.log('\n========================================');
  console.log('  SIMULATION RESULTS');
  console.log('========================================\n');
  
  let passed = 0, failed = 0, skipped = 0;
  
  for (const r of results) {
    console.log(`${r.address.slice(0, 10)}...:`);
    console.log(`  Would swap: ${r.wouldSwap}`);
    console.log(`  Simulation: ${r.simulation}`);
    if (r.details.error) console.log(`  Error: ${r.details.error}`);
    if (r.details.reason) console.log(`  Reason: ${r.details.reason}`);
    if (r.details.changes) console.log(`  Asset changes: ${r.details.changes}`);
    console.log('');
    
    if (r.simulation.includes('PASS')) passed++;
    else if (r.simulation.includes('FAIL')) failed++;
    else skipped++;
  }
  
  console.log('========================================');
  console.log(`  SUMMARY: ${passed} PASS | ${failed} FAIL | ${skipped} SKIP`);
  console.log('========================================');
}

simulateDCA().catch(console.error);
