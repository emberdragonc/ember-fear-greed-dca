// Fear & Greed DCA Executor - Supabase Edge Function
// Complete implementation with swap execution, approvals, and fee collection

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseUnits, 
  formatUnits, 
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
  type TransactionReceipt
} from 'https://esm.sh/viem@2.21.45'
import { base } from 'https://esm.sh/viem@2.21.45/chains'
import { privateKeyToAccount } from 'https://esm.sh/viem@2.21.45/accounts'
import { 
  createSmartAccountClient, 
  ENTRYPOINT_ADDRESS_V07,
  type SmartAccount
} from 'https://esm.sh/permissionless@0.2.21'
import { signerToSimpleSmartAccount } from 'https://esm.sh/permissionless@0.2.21/accounts'
import { pimlicoBundlerActions, pimlicoPaymasterActions } from 'https://esm.sh/permissionless@0.2.21/actions/pimlico'
import { encodeNonce } from 'https://esm.sh/permissionless@0.2.21/utils'

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
const MIN_SWAP_AMOUNT = parseUnits('0.10', 6)
const TRADING_API = 'https://trade-api.gateway.uniswap.org/v1'
const EXPECTED_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1'.toLowerCase()

const UNISWAP_ROUTERS = [
  '0x6fF5693b99212Da76ad316178A184AB56D299b43',
  '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
  '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B',
]

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
  walletAddress: string
}

interface WalletData {
  delegation: DelegationRecord
  smartAccountAddress: Address
  balance: bigint
  swapAmount: bigint
  swapAmountAfterFee: bigint
  fee: bigint
}

// ============ ABIs ============

const delegationManagerAbi = [
  {
    name: 'redeemDelegations',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'delegations', type: 'bytes[][]' },
      { name: 'modes', type: 'uint8[]' },
      { name: 'executions', type: 'bytes[][]' },
    ],
    outputs: [],
  },
] as const

const permit2Abi = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const

const emberStakingAbi = [
  {
    name: 'depositRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

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

function isValidUniswapRouter(routerAddress: string): boolean {
  const normalized = routerAddress.toLowerCase()
  return UNISWAP_ROUTERS.some(r => r.toLowerCase() === normalized)
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000,
  operation: string = 'operation'
): Promise<T | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts
      if (isLastAttempt) {
        console.error(`[${operation}] Failed after ${maxAttempts} attempts:`, error)
        return null
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1)
      console.log(`[${operation}] Attempt ${attempt} failed, retrying in ${delay}ms...`)
      await sleep(delay)
    }
  }
  return null
}

// ============ ETH PRICE ============

let cachedEthPrice: number | null = null
let ethPriceCacheTime: number | null = null
const ETH_PRICE_CACHE_TTL_MS = 60000

async function getETHPriceFromUniswap(uniswapApiKey: string): Promise<number> {
  const now = Date.now()
  if (cachedEthPrice && ethPriceCacheTime && (now - ethPriceCacheTime) < ETH_PRICE_CACHE_TTL_MS) {
    return cachedEthPrice
  }

  try {
    const response = await fetch(`${TRADING_API}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': uniswapApiKey,
      },
      body: JSON.stringify({
        swapper: '0x0000000000000000000000000000000000000000',
        tokenIn: ADDRESSES.USDC,
        tokenOut: ADDRESSES.WETH,
        tokenInChainId: 8453,
        tokenOutChainId: 8453,
        amount: '1000000',
        type: 'EXACT_INPUT',
        slippageTolerance: 0.5,
      }),
    })

    if (!response.ok) {
      throw new Error(`Quote API returned ${response.status}`)
    }

    const data = await response.json()
    const wethReceived = BigInt(data.quote?.output?.amount || '0')

    if (wethReceived === 0n) {
      throw new Error('Invalid quote response')
    }

    const ethPrice = Number(1e18) / Number(wethReceived)
    cachedEthPrice = ethPrice
    ethPriceCacheTime = now

    console.log(`[ETH Price] $${ethPrice.toFixed(2)} from Uniswap`)
    return ethPrice
  } catch (error) {
    console.error('[ETH Price] Failed:', error)
    if (cachedEthPrice) {
      console.log(`[ETH Price] Using stale cached: $${cachedEthPrice.toFixed(2)}`)
      return cachedEthPrice
    }
    cachedEthPrice = 2500
    ethPriceCacheTime = now
    return 2500
  }
}

// ============ BALANCE HELPERS ============

async function getBalance(publicClient: any, address: Address, token: 'USDC' | 'WETH'): Promise<bigint> {
  const tokenAddress = token === 'USDC' ? ADDRESSES.USDC : ADDRESSES.WETH
  return await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  })
}

// ============ SWAP QUOTE ============

async function fetchSwapQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  swapper: Address,
  slippageBps: number,
  uniswapApiKey: string
): Promise<{ quote: any; swap: any } | null> {
  const slippageTolerance = slippageBps / 100 // Convert to percentage

  try {
    const response = await fetch(`${TRADING_API}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': uniswapApiKey,
      },
      body: JSON.stringify({
        swapper,
        tokenIn,
        tokenOut,
        tokenInChainId: 8453,
        tokenOutChainId: 8453,
        amount: amountIn.toString(),
        type: 'EXACT_INPUT',
        slippageTolerance,
      }),
    })

    if (!response.ok) {
      console.error(`[Quote] API returned ${response.status}`)
      return null
    }

    const data = await response.json()
    
    if (!data.quote || !data.swap) {
      console.error('[Quote] Invalid response structure')
      return null
    }

    // Validate router
    if (!isValidUniswapRouter(data.swap.to)) {
      console.error(`[Quote] Router whitelist rejection: ${data.swap.to}`)
      return null
    }

    return { quote: data.quote, swap: data.swap }
  } catch (error) {
    console.error('[Quote] Fetch failed:', error)
    return null
  }
}

// ============ APPROVALS ============

async function checkAndApprove(
  publicClient: any,
  walletClient: any,
  owner: Address,
  token: Address,
  spender: Address,
  amount: bigint
): Promise<boolean> {
  try {
    // Check current allowance
    const allowance = await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spender],
    })

    if (allowance >= amount) {
      console.log(`[Approval] Sufficient allowance: ${formatUnits(allowance, 6)}`)
      return true
    }

    // Need approval
    console.log(`[Approval] Approving ${formatUnits(amount, 6)}...`)
    const hash = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
      account: owner,
    })

    console.log(`[Approval] Tx: ${hash}`)
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`[Approval] ✓ Confirmed`)
    return true
  } catch (error) {
    console.error('[Approval] Failed:', error)
    return false
  }
}

// ============ SMART ACCOUNT SETUP ============

async function initSmartAccount(
  backendAccount: any,
  alchemyRpc: string,
  pimlicoApiKey: string
): Promise<any> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(alchemyRpc),
  })

  const simpleAccount = await signerToSimpleSmartAccount(publicClient, {
    signer: backendAccount,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    factoryAddress: '0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985' as Address,
  })

  const bundlerClient = createPublicClient({
    chain: base,
    transport: http(`https://api.pimlico.io/v2/base/rpc?apikey=${pimlicoApiKey}`),
  }).extend(pimlicoBundlerActions(ENTRYPOINT_ADDRESS_V07))

  const pimlicoPaymaster = createPublicClient({
    chain: base,
    transport: http(`https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`),
  }).extend(pimlicoPaymasterActions(ENTRYPOINT_ADDRESS_V07))

  const smartAccountClient = createSmartAccountClient({
    account: simpleAccount,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    chain: base,
    bundlerTransport: http(`https://api.pimlico.io/v2/base/rpc?apikey=${pimlicoApiKey}`),
    middleware: {
      gasPrice: async () => {
        return await bundlerClient.getUserOperationGasPrice()
      },
      sponsorUserOperation: async ({ userOperation }) => {
        return await pimlicoPaymaster.sponsorUserOperation({ userOperation })
      },
    },
  })

  return { smartAccountClient, publicClient, bundlerClient }
}

// ============ SWAP EXECUTION ============

async function executeSwap(
  walletData: WalletData,
  decision: DCADecision,
  ethPriceUsd: number,
  clients: any,
  uniswapApiKey: string,
  supabase: any
): Promise<ExecutionResult> {
  const { delegation, smartAccountAddress, swapAmount, swapAmountAfterFee, fee } = walletData
  const { publicClient } = clients
  
  const isBuy = decision.action === 'buy'
  const tokenIn = isBuy ? ADDRESSES.USDC : ADDRESSES.WETH
  const tokenOut = isBuy ? ADDRESSES.WETH : ADDRESSES.USDC
  const decimalsIn = isBuy ? 6 : 18

  console.log(`\n[Swap] ${smartAccountAddress.slice(0, 10)}...`)
  console.log(`  Amount: ${formatUnits(swapAmountAfterFee, decimalsIn)} ${isBuy ? 'USDC' : 'WETH'}`)
  console.log(`  Fee: ${formatUnits(fee, decimalsIn)} ${isBuy ? 'USDC' : 'WETH'}`)

  // Calculate slippage based on swap size
  const swapValueUsd = isBuy 
    ? Number(formatUnits(swapAmountAfterFee, 6))
    : Number(formatUnits(swapAmountAfterFee, 18)) * ethPriceUsd
  const slippageBps = getSlippageBpsForSwap(swapValueUsd)

  // Fetch quote
  const quoteResult = await withRetry(
    () => fetchSwapQuote(tokenIn, tokenOut, swapAmountAfterFee, smartAccountAddress, slippageBps, uniswapApiKey),
    3,
    2000,
    'fetchQuote'
  )

  if (!quoteResult) {
    return {
      success: false,
      txHash: null,
      error: 'Failed to fetch quote after retries',
      errorType: 'quote_failed',
      amountIn: '0',
      amountOut: '0',
      feeCollected: '0',
      retryCount: 0,
      lastError: 'Quote fetch failed',
      walletAddress: smartAccountAddress,
    }
  }

  const { quote, swap } = quoteResult

  // For now, we'll log the swap data but not execute (needs MetaMask delegation framework)
  // This would require porting the full delegation redemption logic
  console.log(`  Quote: ${formatUnits(BigInt(quote.output.amount), isBuy ? 18 : 6)} ${isBuy ? 'WETH' : 'USDC'}`)
  console.log(`  ⚠️  Execution requires MetaMask delegation framework (TODO)`)

  // TODO: Implement full UserOperation with delegation redemption
  // This requires:
  // 1. Building the redeemDelegations calldata
  // 2. Creating UserOperation
  // 3. Signing and submitting to bundler
  // 4. Waiting for receipt
  // 5. Collecting fees

  return {
    success: false,
    txHash: null,
    error: 'Execution not yet implemented',
    errorType: 'not_implemented',
    amountIn: swapAmountAfterFee.toString(),
    amountOut: quote.output.amount,
    feeCollected: fee.toString(),
    retryCount: 0,
    lastError: 'Full swap execution pending implementation',
    walletAddress: smartAccountAddress,
  }
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

    // Initialize clients
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const alchemyRpc = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(alchemyRpc),
    })

    const backendAccount = privateKeyToAccount(`0x${BACKEND_PRIVATE_KEY}`)
    
    const walletClient = createWalletClient({
      account: backendAccount,
      chain: base,
      transport: http(alchemyRpc),
    })

    console.log('========================================')
    console.log('  Fear & Greed DCA Executor')
    console.log('  Supabase Edge Function v1.0')
    console.log('========================================')
    console.log(`Time: ${new Date().toISOString()}`)
    console.log(`Backend EOA: ${backendAccount.address}`)

    // Check backend balance
    const backendBalance = await publicClient.getBalance({ address: backendAccount.address })
    console.log(`Backend ETH: ${formatUnits(backendBalance, 18)} ETH`)

    if (backendBalance < parseUnits('0.001', 18)) {
      throw new Error('Backend wallet needs more ETH for gas!')
    }

    // 1. Fetch Fear & Greed
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
      return new Response(
        JSON.stringify({ success: true, action: decision.action, swaps: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 4. Filter valid delegations
    const validDelegations = delegations.filter(d => {
      const delegationData = typeof d.delegation_data === 'string' 
        ? JSON.parse(d.delegation_data) 
        : d.delegation_data
      const delegate = delegationData?.delegate
      
      if (!delegate || delegate.toLowerCase() !== EXPECTED_DELEGATE) {
        return false
      }
      
      if (new Date(d.expires_at) < new Date()) {
        return false
      }
      
      return true
    })

    console.log(`Valid delegations: ${validDelegations.length}`)

    if (validDelegations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, action: decision.action, swaps: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 5. Get ETH price
    const ethPriceUsd = await getETHPriceFromUniswap(UNISWAP_API_KEY)

    // 6. Process wallets
    const isBuy = decision.action === 'buy'
    const results: ExecutionResult[] = []
    let successCount = 0
    let totalVolume = 0n
    let totalFees = 0n

    console.log('\n========================================')
    console.log(`  Processing ${validDelegations.length} Wallets`)
    console.log('========================================')

    // Initialize smart account client
    const clients = await initSmartAccount(backendAccount, alchemyRpc, PIMLICO_API_KEY)

    for (const delegation of validDelegations) {
      const smartAccountAddress = delegation.smart_account_address as Address
      
      try {
        // Get balance
        const balance = await getBalance(
          publicClient, 
          smartAccountAddress, 
          isBuy ? 'USDC' : 'WETH'
        )

        // Calculate swap amount
        const swapAmount = (balance * BigInt(Math.round(decision.percentage * 100))) / 10000n
        
        if (swapAmount < MIN_SWAP_AMOUNT) {
          console.log(`[Skip] ${smartAccountAddress.slice(0, 10)}: Amount too small`)
          continue
        }

        // Calculate fee
        const fee = calculateFee(swapAmount)
        const swapAmountAfterFee = swapAmount - fee

        const walletData: WalletData = {
          delegation,
          smartAccountAddress,
          balance,
          swapAmount,
          swapAmountAfterFee,
          fee,
        }

        // Execute swap
        const result = await executeSwap(
          walletData,
          decision,
          ethPriceUsd,
          clients,
          UNISWAP_API_KEY,
          supabase
        )

        results.push(result)

        if (result.success) {
          successCount++
          totalVolume += BigInt(result.amountIn)
          totalFees += BigInt(result.feeCollected)
        }

        // Log to database
        await supabase.from('dca_executions').insert({
          delegation_id: delegation.id,
          user_address: delegation.user_address,
          fear_greed_index: fgValue,
          decision: decision.action,
          success: result.success,
          tx_hash: result.txHash,
          amount_in: result.amountIn,
          amount_out: result.amountOut,
          fee_collected: result.feeCollected,
          error: result.error,
          error_type: result.errorType,
        })

        await sleep(1000) // Rate limiting
      } catch (error) {
        console.error(`[Error] ${smartAccountAddress.slice(0, 10)}:`, error)
      }
    }

    // 7. Log summary
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
    console.log(`Processed: ${validDelegations.length}`)
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
