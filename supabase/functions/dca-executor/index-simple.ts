// Simplified DCA executor for debugging
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { 
  createPublicClient, 
  http, 
  formatUnits, 
  type Address,
} from 'npm:viem@2.21.0'
import { base } from 'npm:viem@2.21.0/chains'
import { privateKeyToAccount } from 'npm:viem@2.21.0/accounts'

const FG_THRESHOLDS = {
  EXTREME_FEAR_MAX: 25,
  FEAR_MAX: 45,
  NEUTRAL_MAX: 54,
  GREED_MAX: 75,
}

function calculateDecision(fgValue: number) {
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

serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const BACKEND_PRIVATE_KEY = Deno.env.get('BACKEND_PRIVATE_KEY')!
    const ALCHEMY_API_KEY = Deno.env.get('ALCHEMY_API_KEY')!

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const alchemyRpc = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(alchemyRpc),
    })

    const backendAccount = privateKeyToAccount(`0x${BACKEND_PRIVATE_KEY}`)

    console.log('========================================')
    console.log('  Fear & Greed DCA Executor')
    console.log('  Supabase Edge Function (Simplified)')
    console.log('========================================')
    console.log(`Backend EOA: ${backendAccount.address}`)

    const backendBalance = await publicClient.getBalance({ address: backendAccount.address })
    console.log(`Backend ETH: ${formatUnits(backendBalance, 18)} ETH`)

    // Fetch Fear & Greed
    const fgResponse = await fetch('https://api.alternative.me/fng/')
    if (!fgResponse.ok) {
      throw new Error(`F&G API returned ${fgResponse.status}`)
    }
    const fgData = await fgResponse.json()
    const fgValue = parseInt(fgData.data[0].value)
    const fgClassification = fgData.data[0].value_classification

    console.log(`Fear & Greed: ${fgValue} (${fgClassification})`)

    const decision = calculateDecision(fgValue)
    console.log(`Decision: ${decision.reason}`)

    if (decision.action === 'hold') {
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

    // For now, just return the decision without executing swaps
    return new Response(
      JSON.stringify({ 
        success: true, 
        action: decision.action,
        fgValue,
        reason: decision.reason,
        message: 'Simplified version - swap execution not implemented yet',
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
