// Test npm: imports (Deno native)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    // Dynamic import to test npm: support
    const { createPublicClient, http } = await import('npm:viem@2.9.20')
    const { base } = await import('npm:viem@2.9.20/chains')

    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://base-mainnet.g.alchemy.com/v2/test'),
    })

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'npm: imports work!',
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
        stack: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
