// Uniswap Trading API Swap Service
// Uses the Trading API for optimized routing

import { isAddress, isHex } from 'viem';

const TRADING_API = 'https://trade-api.gateway.uniswap.org/v1';
const API_KEY = process.env.NEXT_PUBLIC_UNISWAP_API_KEY;

// Base chain
const BASE_CHAIN_ID = 8453;

// Token addresses on Base
export const TOKENS = {
  ETH: '0x0000000000000000000000000000000000000000', // Native ETH
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
} as const;

// Fee recipient (EMBER staking contract)
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

/**
 * Check if token approval is needed
 */
export async function checkApproval(
  walletAddress: `0x${string}`,
  token: `0x${string}`,
  amount: string
): Promise<ApprovalResponse> {
  // Native ETH doesn't need approval
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
      chainId: BASE_CHAIN_ID,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Approval check failed');
  }

  return response.json();
}

/**
 * Get a quote for a swap
 */
export async function getQuote(params: QuoteParams): Promise<QuoteResponse> {
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
      tokenInChainId: BASE_CHAIN_ID,
      tokenOutChainId: BASE_CHAIN_ID,
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

/**
 * Prepare swap request - strips null fields and validates
 */
function prepareSwapRequest(
  quoteResponse: QuoteResponse,
  signature?: string
): Record<string, unknown> {
  // Strip null values that the API rejects
  const { permitData, permitTransaction, ...cleanQuote } = quoteResponse;

  const request: Record<string, unknown> = { ...cleanQuote };

  // Only include permitData if we have BOTH signature and valid permitData
  if (signature && permitData && typeof permitData === 'object') {
    request.signature = signature;
    request.permitData = permitData;
  }

  return request;
}

/**
 * Validate swap response before broadcasting
 */
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

/**
 * Get executable swap transaction
 */
export async function getSwapTransaction(
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
  
  // Validate before returning
  validateSwapResponse(data.swap);
  
  return data.swap;
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
