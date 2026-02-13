// Test permissionless imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    // Test importing permissionless modules one by one
    const { createSmartAccountClient, ENTRYPOINT_ADDRESS_V07 } = await import('npm:permissionless@0.1.16')
    
    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'permissionless imports work!',
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
