// Test viem 2.21.0 and permissionless 0.3.4
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const { createPublicClient, http } = await import('npm:viem@2.21.0')
    const { base } = await import('npm:viem@2.21.0/chains')
    const { createSmartAccountClient, ENTRYPOINT_ADDRESS_V07 } = await import('npm:permissionless@0.3.4')
    const { encodeNonce } = await import('npm:permissionless@0.3.4/utils')

    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://base-mainnet.g.alchemy.com/v2/test'),
    })

    const testNonce = encodeNonce({ key: 12345n, sequence: 0n })

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'viem 2.21.0 + permissionless 0.3.4 work!',
        chainId: base.id,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        testNonce: testNonce.toString(),
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
