// Minimal version with all imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { 
  createPublicClient, 
  http, 
  parseUnits, 
  formatUnits, 
  type Address,
} from 'npm:viem@2.9.20'
import { base } from 'npm:viem@2.9.20/chains'
import { privateKeyToAccount } from 'npm:viem@2.9.20/accounts'
import { 
  createSmartAccountClient, 
  ENTRYPOINT_ADDRESS_V07,
} from 'npm:permissionless@0.1.16'
import { signerToSimpleSmartAccount } from 'npm:permissionless@0.1.16/accounts'
import { pimlicoBundlerActions, pimlicoPaymasterActions } from 'npm:permissionless@0.1.16/actions/pimlico'

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

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'Minimal DCA function works!',
        backendAccount: backendAccount.address,
        chainId: base.id,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
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
