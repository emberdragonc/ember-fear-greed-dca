// Minimal test version
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    // Test environment variables
    const BACKEND_PRIVATE_KEY = Deno.env.get('BACKEND_PRIVATE_KEY')
    const PIMLICO_API_KEY = Deno.env.get('PIMLICO_API_KEY')
    const UNISWAP_API_KEY = Deno.env.get('UNISWAP_API_KEY')
    const ALCHEMY_API_KEY = Deno.env.get('ALCHEMY_API_KEY')

    const envStatus = {
      BACKEND_PRIVATE_KEY: BACKEND_PRIVATE_KEY ? '✓ Set' : '✗ Missing',
      PIMLICO_API_KEY: PIMLICO_API_KEY ? '✓ Set' : '✗ Missing',
      UNISWAP_API_KEY: UNISWAP_API_KEY ? '✓ Set' : '✗ Missing',
      ALCHEMY_API_KEY: ALCHEMY_API_KEY ? '✓ Set' : '✗ Missing',
    }

    console.log('Environment variables:', envStatus)

    return new Response(
      JSON.stringify({
        status: 'ok',
        message: 'Test function works!',
        env: envStatus,
        timestamp: new Date().toISOString(),
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
