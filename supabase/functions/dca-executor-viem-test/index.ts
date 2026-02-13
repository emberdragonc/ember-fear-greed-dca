// Test viem imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { 
  createPublicClient, 
  http, 
  parseUnits, 
  formatUnits,
  type Address,
} from 'https://esm.sh/viem@2.21.45?target=deno'
import { base } from 'https://esm.sh/viem@2.21.45?target=deno/chains'

serve(async (req) => {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://base-mainnet.g.alchemy.com/v2/test'),
    })

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'Viem imports work!',
        chainId: base.id,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
