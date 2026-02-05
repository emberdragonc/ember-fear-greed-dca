// DCA Executor Backend Service
// Runs daily to check F&G and execute swaps for delegated accounts

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

// Config
const CHAIN_ID = 8453;
const TRADING_API = 'https://trade-api.gateway.uniswap.org/v1';

const TOKENS = {
  ETH: '0x0000000000000000000000000000000000000000',
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
} as const;

// Thresholds
const FG_THRESHOLDS = {
  EXTREME_FEAR_MAX: 25,
  FEAR_MAX: 45,
  NEUTRAL_MAX: 54,
  GREED_MAX: 75,
};

interface DCADecision {
  action: 'buy' | 'sell' | 'hold';
  percentage: number;
  reason: string;
}

interface DelegationRecord {
  id: string;
  user_address: string;
  smart_account_address: string;
  base_percentage: number;
  target_asset: string;
  delegation_hash: string;
  status: 'active' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
}

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const backendAccount = privateKeyToAccount(process.env.BACKEND_PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account: backendAccount,
  chain: base,
  transport: http(),
});

/**
 * Fetch current Fear & Greed Index
 */
async function fetchFearGreed(): Promise<{ value: number; classification: string }> {
  const response = await fetch('https://api.alternative.me/fng/');
  const data = await response.json();
  return {
    value: parseInt(data.data[0].value),
    classification: data.data[0].value_classification,
  };
}

/**
 * Calculate DCA decision based on F&G value
 */
function calculateDecision(fgValue: number): DCADecision {
  if (fgValue <= FG_THRESHOLDS.EXTREME_FEAR_MAX) {
    return { action: 'buy', percentage: 5, reason: 'Extreme Fear - Buy 5%' };
  }
  if (fgValue <= FG_THRESHOLDS.FEAR_MAX) {
    return { action: 'buy', percentage: 2.5, reason: 'Fear - Buy 2.5%' };
  }
  if (fgValue <= FG_THRESHOLDS.NEUTRAL_MAX) {
    return { action: 'hold', percentage: 0, reason: 'Neutral - Hold' };
  }
  if (fgValue <= FG_THRESHOLDS.GREED_MAX) {
    return { action: 'sell', percentage: 2.5, reason: 'Greed - Sell 2.5%' };
  }
  return { action: 'sell', percentage: 5, reason: 'Extreme Greed - Sell 5%' };
}

/**
 * Get active delegations from Supabase
 */
async function getActiveDelegations(): Promise<DelegationRecord[]> {
  const { data, error } = await supabase
    .from('delegations')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString());

  if (error) throw error;
  return data || [];
}

/**
 * Execute swap via Uniswap Trading API
 */
async function executeSwap(
  smartAccountAddress: `0x${string}`,
  direction: 'buy' | 'sell',
  amount: string
): Promise<string | null> {
  const tokenIn = direction === 'buy' ? TOKENS.USDC : TOKENS.ETH;
  const tokenOut = direction === 'buy' ? TOKENS.ETH : TOKENS.USDC;

  try {
    // 1. Check approval
    if (tokenIn !== TOKENS.ETH) {
      const approvalRes = await fetch(`${TRADING_API}/check_approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.UNISWAP_API_KEY!,
        },
        body: JSON.stringify({
          walletAddress: smartAccountAddress,
          token: tokenIn,
          amount,
          chainId: CHAIN_ID,
        }),
      });
      const approvalData = await approvalRes.json();
      
      if (approvalData.approval) {
        // TODO: Execute approval via delegation
        console.log(`[${smartAccountAddress}] Needs approval`);
      }
    }

    // 2. Get quote
    const quoteRes = await fetch(`${TRADING_API}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.UNISWAP_API_KEY!,
      },
      body: JSON.stringify({
        swapper: smartAccountAddress,
        tokenIn,
        tokenOut,
        tokenInChainId: CHAIN_ID,
        tokenOutChainId: CHAIN_ID,
        amount,
        type: 'EXACT_INPUT',
        slippageTolerance: 1,
      }),
    });
    const quoteData = await quoteRes.json();

    if (!quoteRes.ok) {
      throw new Error(quoteData.detail || 'Quote failed');
    }

    // 3. Get swap transaction
    const { permitData, permitTransaction, ...cleanQuote } = quoteData;
    const swapRes = await fetch(`${TRADING_API}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.UNISWAP_API_KEY!,
      },
      body: JSON.stringify(cleanQuote),
    });
    const swapData = await swapRes.json();

    if (!swapRes.ok || !swapData.swap?.data) {
      throw new Error(swapData.detail || 'Swap failed');
    }

    // 4. Execute via delegation (TODO: implement delegation execution)
    console.log(`[${smartAccountAddress}] Would execute swap:`, swapData.swap);
    
    // For now, return null - actual execution needs delegation framework
    return null;
  } catch (error) {
    console.error(`[${smartAccountAddress}] Swap error:`, error);
    return null;
  }
}

/**
 * Log execution to Supabase
 */
async function logExecution(
  delegationId: string,
  fgValue: number,
  decision: DCADecision,
  txHash: string | null
) {
  await supabase.from('executions').insert({
    delegation_id: delegationId,
    fg_value: fgValue,
    action: decision.action,
    percentage: decision.percentage,
    tx_hash: txHash,
    status: txHash ? 'success' : 'skipped',
    executed_at: new Date().toISOString(),
  });
}

/**
 * Main execution loop
 */
async function runDCA() {
  console.log('=== DCA Executor Starting ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // 1. Fetch Fear & Greed
  const fg = await fetchFearGreed();
  console.log(`Fear & Greed: ${fg.value} (${fg.classification})`);

  // 2. Calculate decision
  const decision = calculateDecision(fg.value);
  console.log(`Decision: ${decision.reason}`);

  if (decision.action === 'hold') {
    console.log('No action needed. Exiting.');
    return;
  }

  // 3. Get active delegations
  const delegations = await getActiveDelegations();
  console.log(`Active delegations: ${delegations.length}`);

  // 4. Execute for each delegation
  for (const delegation of delegations) {
    console.log(`\nProcessing: ${delegation.smart_account_address}`);
    
    // Calculate amount based on percentage
    // TODO: Fetch actual balance and calculate
    const amount = '1000000'; // Placeholder 1 USDC
    
    const txHash = await executeSwap(
      delegation.smart_account_address as `0x${string}`,
      decision.action,
      amount
    );

    await logExecution(delegation.id, fg.value, decision, txHash);
  }

  console.log('\n=== DCA Executor Complete ===');
}

// Run
runDCA().catch(console.error);
