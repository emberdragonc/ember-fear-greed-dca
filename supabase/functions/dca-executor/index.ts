// Fear & Greed DCA Executor - Supabase Edge Function
// Runs daily via pg_cron to execute DCA swaps for delegated accounts
// Independent of OpenClaw - more reliable execution

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, type Address } from 'https://esm.sh/viem@2.21.45'
import { base } from 'https://esm.sh/viem@2.21.45/chains'
import { privateKeyToAccount } from 'https://esm.sh/viem@2.21.45/accounts'
import { createSmartAccountClient, ENTRYPOINT_ADDRESS_V07 } from 'https://esm.sh/permissionless@0.2.21'
import { signerToSimpleSmartAccount } from 'https://esm.sh/permissionless@0.2.21/accounts'
import {  pimlicoBundlerActions, pimlicoPaymasterActions } from 'https://esm.sh/permissionless@0.2.21/actions/pimlico'

// ============ CONFIGURATION ============

const FG_THRESHOLDS = {
  EXTREME_FEAR_MAX: 25,
  FEAR_MAX: 45,
  NEUTRAL_MAX: 54,
  GREED_MAX: 75,
}

const ADDRESSES = {
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address,
  UNISWAP_ROUTER: '0x6fF5693b99212Da76ad316178A184AB56D299b43' as Address,
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address,
  EMBER_STAKING: '0x434B2A0e38FB3E5D2ACFa2a7aE492C2A53E55Ec9' as Address,
}

const FEE_BPS = 20
const BPS_DENOMINATOR = 10000
const MIN_DELEGATION_VALUE_USD = 10
const SLIPPAGE_SMALL_BPS = 50
const SLIPPAGE_LARGE_BPS = 30
const SLIPPAGE_THRESHOLD_USD = 100

// ============ TYPES ============

interface DCADecision {
  action: 'buy' | 'sell' | 'hold'
  percentage: number
  reason: string
}

interface DelegationRecord {
  id: string
  user_address: string
  smart_account_address: string
  delegation_hash: string
  delegation_signature: string
  delegation_data: string
  max_amount_per_swap: string
  expires_at: string
  created_at: string
  target_asset?: string
}

interface ExecutionResult {
  success: boolean
  txHash: string | null
  error: string | null
  errorType: string | null
  amountIn: string
  amountOut: string
  feeCollected: string
  retryCount: number
  lastError: string | null
}

// ============ HELPERS ============

function calculateDecision(fgValue: number): DCADecision {
  if (fgValue <= FG_THRESHOLDS.EXTREME_FEAR_MAX) {
    return { action: 'buy', percentage: 5, reason: 'Extreme Fear - Buy 5%' }
  }
  if (fgValue <= FG_THRESHOLDS.FEAR_MAX) {
    return { action: 'buy', percentage: 2.5, reason: 'Fear - Buy 2.5%' }
  }
  if (fgValue <= FG_THRESHOLDS.NEUTRAL_MAX) {
    return { action: 'hold', percentage: 0, reason: 'Neutral - Hold' }
  }
  if (fgValue <= FG_THRESHOLDS.GREED_MAX) {
    return { action: 'sell', percentage: 2.5, reason: 'Greed - Sell 2.5%' }
  }
  return { action: 'sell', percentage: 5, reason: 'Extreme Greed - Sell 5%' }
}

function calculateFee(amount: bigint): bigint {
  return (amount * BigInt(FEE_BPS)) / BigInt(BPS_DENOMINATOR)
}

function calculateAmountAfterFee(amount: bigint): bigint {
  return amount - calculateFee(amount)
}

function getSlippageBpsForSwap(swapValueUsd: number): number {
  return swapValueUsd < SLIPPAGE_THRESHOLD_USD ? SLIPPAGE_SMALL_BPS : SLIPPAGE_LARGE_BPS
}

function calculateMinAmountOut(expectedOutput: bigint, slippageBps: number): bigint {
  const slippageFactor = BigInt(BPS_DENOMINATOR - slippageBps)
  return (expectedOutput * slippageFactor) / BigInt(BPS_DENOMINATOR)
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============ MAIN HANDLER ============

serve(async (req) => {
  try {
    // Environment variables
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const BACKEND_PRIVATE_KEY = Deno.env.get('BACKEND_PRIVATE_KEY')!
    const PIMLICO_API_KEY = Deno.env.get('PIMLICO_API_KEY')!
    const UNISWAP_API_KEY = Deno.env.get('UNISWAP_API_KEY')!
    const ALCHEMY_API_KEY = Deno.env.get('ALCHEMY_API_KEY')!

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    console.log('========================================')
    console.log('  Fear & Greed DCA Executor')
    console.log('  Running from Supabase Edge Function')
    console.log('========================================')
    console.log(`Time: ${new Date().toISOString()}`)

    // 1. Fetch Fear & Greed Index
    const fgResponse = await fetch('https://api.alternative.me/fng/')
    if (!fgResponse.ok) {
      throw new Error(`F&G API returned ${fgResponse.status}`)
    }
    const fgData = await fgResponse.json()
    const fgValue = parseInt(fgData.data[0].value)
    const fgClassification = fgData.data[0].value_classification

    console.log(`\nFear & Greed: ${fgValue} (${fgClassification})`)

    // 2. Calculate decision
    const decision = calculateDecision(fgValue)
    console.log(`Decision: ${decision.reason}`)

    if (decision.action === 'hold') {
      console.log('\n✓ Market neutral - No action needed')
      
      // Log the hold decision
      await supabase.from('dca_daily_executions').insert({
        execution_date: new Date().toISOString().split('T')[0],
        fear_greed_index: fgValue,
        decision: decision.action,
        decision_reason: decision.reason,
        total_swaps: 0,
        successful_swaps: 0,
        total_volume_usd: '0',
        total_fees_usd: '0',
      })

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'hold',
          fgValue,
          message: 'Market neutral - no swaps executed' 
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 3. Get active delegations
    const { data: delegations, error: delegationsError } = await supabase
      .from('delegations')
      .select('*')
      .eq('is_active', true)

    if (delegationsError) {
      throw new Error(`Failed to fetch delegations: ${delegationsError.message}`)
    }

    console.log(`\nActive delegations: ${delegations?.length || 0}`)

    if (!delegations || delegations.length === 0) {
      console.log('No active delegations to process')
      return new Response(
        JSON.stringify({ success: true, action: decision.action, swaps: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 4. Filter valid delegations
    const EXPECTED_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1'.toLowerCase()
    const validDelegations = delegations.filter(d => {
      const delegationData = typeof d.delegation_data === 'string' 
        ? JSON.parse(d.delegation_data) 
        : d.delegation_data
      const delegate = delegationData?.delegate
      
      if (!delegate || delegate.toLowerCase() !== EXPECTED_DELEGATE) {
        return false
      }
      
      // Basic expiration check
      if (new Date(d.expires_at) < new Date()) {
        return false
      }
      
      return true
    })

    console.log(`Valid delegations after filtering: ${validDelegations.length}`)

    if (validDelegations.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: decision.action, 
          swaps: 0,
          message: 'No valid delegations after filtering'
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize viem clients
    const alchemyRpc = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    const publicClient = createPublicClient({
      chain: base,
      transport: http(alchemyRpc),
    })

    const backendAccount = privateKeyToAccount(`0x${BACKEND_PRIVATE_KEY}`)
    
    console.log(`\nBackend EOA: ${backendAccount.address}`)

    // Check backend balance
    const backendBalance = await publicClient.getBalance({ address: backendAccount.address })
    console.log(`Backend ETH: ${formatUnits(backendBalance, 18)} ETH`)

    if (backendBalance < parseUnits('0.001', 18)) {
      throw new Error('Backend wallet needs more ETH for gas!')
    }

    // 5. Process swaps
    // NOTE: This is a simplified version - the full implementation would include:
    // - Smart account deployment check
    // - Approval checks (ERC20 + Permit2)
    // - Parallel UserOp batching
    // - Uniswap quote fetching
    // - Fee collection
    // - Full error handling and retries

    const results: ExecutionResult[] = []
    let successCount = 0
    let totalVolume = 0n
    let totalFees = 0n

    console.log('\n========================================')
    console.log('  Processing Swaps (Simplified)')
    console.log('========================================')
    console.log('⚠️  Full swap logic needs to be ported')
    console.log('This is a skeleton showing the structure')

    // For each valid delegation, we would:
    // 1. Check smart account balance
    // 2. Calculate swap amount based on decision percentage
    // 3. Fetch Uniswap quote
    // 4. Prepare UserOperation
    // 5. Submit to bundler with paymaster
    // 6. Wait for receipt
    // 7. Collect fees
    // 8. Log to database

    // Placeholder for now
    for (const delegation of validDelegations) {
      console.log(`\n[TODO] Process swap for ${delegation.smart_account_address}`)
      // TODO: Implement full swap logic
    }

    // 6. Log summary
    await supabase.from('dca_daily_executions').insert({
      execution_date: new Date().toISOString().split('T')[0],
      fear_greed_index: fgValue,
      decision: decision.action,
      decision_reason: decision.reason,
      total_swaps: validDelegations.length,
      successful_swaps: successCount,
      total_volume_usd: formatUnits(totalVolume, 6),
      total_fees_usd: formatUnits(totalFees, 6),
    })

    console.log('\n========================================')
    console.log('  Execution Summary')
    console.log('========================================')
    console.log(`Processed: ${validDelegations.length} delegations`)
    console.log(`Successful: ${successCount}`)
    console.log(`Total Volume: ${formatUnits(totalVolume, 6)} USD`)
    console.log(`Total Fees: ${formatUnits(totalFees, 6)} USD`)
    console.log('========================================\n')

    return new Response(
      JSON.stringify({ 
        success: true, 
        action: decision.action,
        fgValue,
        delegations: validDelegations.length,
        successfulSwaps: successCount,
        totalVolume: formatUnits(totalVolume, 6),
        totalFees: formatUnits(totalFees, 6),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Fatal error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
