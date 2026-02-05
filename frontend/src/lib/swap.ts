// Uniswap Trading API Swap Service
// Uses the Trading API for optimized routing (mainnet only)
// Falls back to mock mode on testnet

import { isAddress, isHex } from 'viem';

const TRADING_API = 'https://trade-api.gateway.uniswap.org/v1';
const API_KEY = process.env.NEXT_PUBLIC_UNISWAP_API_KEY;

// Check if we're on testnet
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453');
const IS_TESTNET = CHAIN_ID !== 8453;

// Token addresses based on chain
export const TOKENS = CHAIN_ID === 8453 ? {
  ETH: '0x0000000000000000000000000000000000000000' as const,
  WETH: '0x4200000000000000000000000000000000000006' as const,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
} : {
  ETH: '0x0000000000000000000000000000000000000000' as const,
  WETH: '0x4200000000000000000000000000000000000006' as const,
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const, // Base Sepolia USDC
};

// Fee recipient (EMBER staking contract - mainnet only)
export const FEE_RECIPIENT = '0x434B2A0e38FB3E5D2ACFa2a7aE492C2A53E55Ec9';
export const FEE_BIPS = 15; // 0.15% = 15 basis points

export interface QuoteParams {
  swapper: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amount: string;
  type?: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  slippageTolerance?: number;
}

export interface QuoteResponse {
  routing: string;
  quote: {
    input: { token: string; amount: string };
    output: { token: string; amount: string };
    slippage: number;
    gasFee: string;
  };
  permitData?: object | null;
  permitTransaction?: object | null;
  [key: string]: unknown;
}

export interface SwapTransaction {
  to: `0x${string}`;
  from: `0x${string}`;
  data: `0x${string}`;
  value: string;
  chainId: number;
  gasLimit?: string;
}

export interface ApprovalResponse {
  approval: SwapTransaction | null;
}

// ============ MOCK MODE FOR TESTNET ============

function mockDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mockCheckApproval(): Promise<ApprovalResponse> {
  await mockDelay(500);
  // Simulate already approved
  return { approval: null };
}

async function mockGetQuote(params: QuoteParams): Promise<QuoteResponse> {
  await mockDelay(800);
  
  // Simulate a reasonable quote (1 ETH ≈ 2500 USDC)
  const isUsdcToEth = params.tokenIn === TOKENS.USDC;
  const inputAmount = params.amount;
  const outputAmount = isUsdcToEth 
    ? (BigInt(inputAmount) * 10n ** 12n / 2500n).toString() // USDC to ETH
    : (BigInt(inputAmount) * 2500n / 10n ** 12n).toString(); // ETH to USDC

  return {
    routing: 'MOCK',
    quote: {
      input: { token: params.tokenIn, amount: inputAmount },
      output: { token: params.tokenOut, amount: outputAmount },
      slippage: params.slippageTolerance ?? 0.5,
      gasFee: '500000000000000', // 0.0005 ETH
    },
  };
}

async function mockGetSwapTransaction(
  quoteResponse: QuoteResponse,
  swapper: `0x${string}`
): Promise<SwapTransaction> {
  await mockDelay(500);
  
  // Return a mock transaction (won't actually execute anything meaningful)
  return {
    to: '0x2626664c2603336E57B271c5C0b26F421741e481' as `0x${string}`, // Router address
    from: swapper,
    data: '0x' as `0x${string}`, // Empty data - tx will fail but UI flow works
    value: '0',
    chainId: CHAIN_ID,
    gasLimit: '200000',
  };
}

// ============ REAL API CALLS ============

async function realCheckApproval(
  walletAddress: `0x${string}`,
  token: `0x${string}`,
  amount: string
): Promise<ApprovalResponse> {
  if (token === TOKENS.ETH) {
    return { approval: null };
  }

  const response = await fetch(`${TRADING_API}/check_approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
    body: JSON.stringify({
      walletAddress,
      token,
      amount,
      chainId: CHAIN_ID,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Approval check failed');
  }

  return response.json();
}

async function realGetQuote(params: QuoteParams): Promise<QuoteResponse> {
  const response = await fetch(`${TRADING_API}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
    body: JSON.stringify({
      swapper: params.swapper,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      tokenInChainId: CHAIN_ID,
      tokenOutChainId: CHAIN_ID,
      amount: params.amount,
      type: params.type || 'EXACT_INPUT',
      slippageTolerance: params.slippageTolerance ?? 0.5,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Quote failed');
  }

  return response.json();
}

function prepareSwapRequest(
  quoteResponse: QuoteResponse,
  signature?: string
): Record<string, unknown> {
  const { permitData, permitTransaction, ...cleanQuote } = quoteResponse;
  const request: Record<string, unknown> = { ...cleanQuote };

  if (signature && permitData && typeof permitData === 'object') {
    request.signature = signature;
    request.permitData = permitData;
  }

  return request;
}

function validateSwapResponse(swap: SwapTransaction): void {
  if (!swap.data || swap.data === '' || swap.data === '0x') {
    throw new Error('swap.data is empty - quote may have expired. Please refresh.');
  }
  if (!isHex(swap.data)) {
    throw new Error('swap.data is not valid hex');
  }
  if (!isAddress(swap.to)) {
    throw new Error('swap.to is not a valid address');
  }
  if (!isAddress(swap.from)) {
    throw new Error('swap.from is not a valid address');
  }
}

async function realGetSwapTransaction(
  quoteResponse: QuoteResponse,
  permit2Signature?: string
): Promise<SwapTransaction> {
  const swapRequest = prepareSwapRequest(quoteResponse, permit2Signature);

  const response = await fetch(`${TRADING_API}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY!,
    },
    body: JSON.stringify(swapRequest),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Swap request failed');
  }

  const data = await response.json();
  validateSwapResponse(data.swap);
  return data.swap;
}

// ============ EXPORTED FUNCTIONS ============

/**
 * Check if token approval is needed
 */
export async function checkApproval(
  walletAddress: `0x${string}`,
  token: `0x${string}`,
  amount: string
): Promise<ApprovalResponse> {
  if (IS_TESTNET) {
    console.log('[MOCK MODE] checkApproval');
    return mockCheckApproval();
  }
  return realCheckApproval(walletAddress, token, amount);
}

/**
 * Get a quote for a swap
 */
export async function getQuote(params: QuoteParams): Promise<QuoteResponse> {
  if (IS_TESTNET) {
    console.log('[MOCK MODE] getQuote');
    return mockGetQuote(params);
  }
  return realGetQuote(params);
}

/**
 * Get executable swap transaction
 */
export async function getSwapTransaction(
  quoteResponse: QuoteResponse,
  permit2Signature?: string,
  swapper?: `0x${string}`
): Promise<SwapTransaction> {
  if (IS_TESTNET) {
    console.log('[MOCK MODE] getSwapTransaction');
    return mockGetSwapTransaction(quoteResponse, swapper || '0x0');
  }
  return realGetSwapTransaction(quoteResponse, permit2Signature);
}

/**
 * Calculate amount after fee (for display)
 */
export function calculateFee(amount: bigint): bigint {
  return (amount * BigInt(FEE_BIPS)) / 10000n;
}

/**
 * Calculate amount minus fee
 */
export function amountAfterFee(amount: bigint): bigint {
  return amount - calculateFee(amount);
}

/**
 * Check if running in testnet/mock mode
 */
export function isTestnet(): boolean {
  return IS_TESTNET;
}
