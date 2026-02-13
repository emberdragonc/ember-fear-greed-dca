// Half the main function - find where it breaks
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseUnits, 
  formatUnits, 
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  erc20Abi,
  type Address,
  type Hex,
} from 'npm:viem@2.21.0'
import { base } from 'npm:viem@2.21.0/chains'
import { privateKeyToAccount } from 'npm:viem@2.21.0/accounts'
import { 
  createSmartAccountClient, 
  ENTRYPOINT_ADDRESS_V07,
} from 'npm:permissionless@0.3.4'
import { signerToSimpleSmartAccount } from 'npm:permissionless@0.3.4/accounts'
import { pimlicoBundlerActions, pimlicoPaymasterActions } from 'npm:permissionless@0.3.4/actions/pimlico'
import { encodeNonce } from 'npm:permissionless@0.3.4/utils'

// Configuration
const FG_THRESHOLDS = {
  EXTREME_FEAR_MAX: 25,
  FEAR_MAX: 45,
  NEUTRAL_MAX: 54,
  GREED_MAX: 75,
}

const ADDRESSES = {
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  USDC: '0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913' as Address,
  DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address,
  SIMPLE_ACCOUNT_FACTORY: '0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985' as Address,
}

// Helper functions
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
  return { action: 'sell', percentage: 2.5, reason: 'Greed - Sell 2.5%' }
}

function calculateFee(amount: bigint): bigint {
  return (amount * 20n) / 10000n
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Main handler
serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const BACKEND_PRIVATE_KEY = Deno.env.get('BACKEND_PRIVATE_KEY')!
    const ALCHEMY_API_KEY = Deno.env.get('ALCHEMY_API_KEY')!
    const PIMLICO_API_KEY = Deno.env.get('PIMLICO_API_KEY')!

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const alchemyRpc = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(alchemyRpc),
    })

    const backendAccount = privateKeyToAccount(`0x${BACKEND_PRIVATE_KEY}`)
    
    console.log('Backend account:', backendAccount.address)

    // Fetch F&G
    const fgResponse = await fetch('https://api.alternative.me/fng/')
    const fgData = await fgResponse.json()
    const fgValue = parseInt(fgData.data[0].value)
    
    const decision = calculateDecision(fgValue)
    
    console.log(`F&G: ${fgValue}, Decision: ${decision.action}`)

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'Half function works!',
        backendAccount: backendAccount.address,
        fgValue,
        decision: decision.action,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
