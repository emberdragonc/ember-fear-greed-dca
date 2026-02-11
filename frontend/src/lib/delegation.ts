// delegation.ts - Delegation Framework constants and helpers
import { type Address, parseUnits, encodeFunctionData } from 'viem';
import { swapRouter02Abi } from '@/lib/abis';

// Contract addresses (Base Mainnet)
export const DELEGATION_ADDRESSES = {
  // Uniswap V3 SwapRouter02 (legacy)
  UNISWAP_ROUTER_V3: '0x2626664c2603336E57B271c5C0b26F421741e481' as Address,
  // Uniswap V4 Universal Router (used by Trading API)
  UNISWAP_ROUTER: '0x6fF5693b99212Da76ad316178A184AB56D299b43' as Address,
  // Permit2 - Universal Router uses this for token transfers
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  // USDC on Base
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  // WETH on Base
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  // cbBTC on Base (Coinbase Wrapped BTC)
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address,
  // Delegation Manager
  DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address,
  // EntryPoint v0.7
  ENTRY_POINT: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address,
} as const;

// Backend signer (placeholder - will be replaced with actual backend address)
export const BACKEND_SIGNER = (process.env.NEXT_PUBLIC_BACKEND_SIGNER || 
  '0x0000000000000000000000000000000000000001') as Address;

// Current delegate address (backend smart account)
// Delegations pointing to a different address are outdated
export const CURRENT_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1' as Address;

// Delegation caveats configuration
export const DELEGATION_CONFIG = {
  // Timestamp caveat: delegation valid for 1 year
  VALIDITY_DAYS: 365,
  // Limited calls caveat: max 1 call per day
  MAX_CALLS_PER_DAY: 1,
  // Value limits for swaps
  MAX_SWAP_AMOUNT_USDC: parseUnits('1000', 6), // 1000 USDC max per swap
  MIN_SWAP_AMOUNT_USDC: parseUnits('10', 6),   // 10 USDC min per swap
  // Gas limits
  MAX_GAS_LIMIT: 500000n,
} as const;

// Calculate expiry timestamp (1 year from now)
export function calculateExpiryTimestamp(): bigint {
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysInSeconds = DELEGATION_CONFIG.VALIDITY_DAYS * 24 * 60 * 60;
  return BigInt(now + thirtyDaysInSeconds);
}

// Calculate start timestamp (current time)
export function calculateStartTimestamp(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

// Encode swap data for Uniswap V3 exactInputSingle
export function encodeSwapExactInputSingle(
  tokenIn: Address,
  tokenOut: Address,
  fee: number,
  recipient: Address,
  amountIn: bigint,
  amountOutMinimum: bigint,
  sqrtPriceLimitX96: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn,
      tokenOut,
      fee,
      recipient,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96,
    }],
  });
}

// Encode swap data for Uniswap V3 exactOutputSingle
export function encodeSwapExactOutputSingle(
  tokenIn: Address,
  tokenOut: Address,
  fee: number,
  recipient: Address,
  amountOut: bigint,
  amountInMaximum: bigint,
  sqrtPriceLimitX96: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: 'exactOutputSingle',
    args: [{
      tokenIn,
      tokenOut,
      fee,
      recipient,
      amountOut,
      amountInMaximum,
      sqrtPriceLimitX96,
    }],
  });
}

// Delegation status types
export type DelegationStatus = 
  | 'none'
  | 'created'
  | 'signed'
  | 'active'
  | 'expired'
  | 'revoked';

// Stored delegation data interface
export interface StoredDelegation {
  delegationHash: string;
  delegate: Address;
  delegator: Address;
  createdAt: string;
  expiresAt: string;
  basePercentage: number;
  targetAsset: string;
  signature?: string;
  status: DelegationStatus;
  caveats: {
    allowedTargets: Address[];
    allowedMethods: string[];
    maxCalls: number;
    expiry: bigint;
  };
}

// Local storage key
export const DELEGATION_STORAGE_KEY = 'fear-greed-dca-delegation';

// Save delegation to localStorage
export function saveDelegation(delegation: StoredDelegation): void {
  if (typeof window === 'undefined') return;
  try {
    // Convert BigInt to string for JSON serialization
    const toStore = {
      ...delegation,
      caveats: {
        ...delegation.caveats,
        expiry: delegation.caveats.expiry.toString(),
      },
    };
    localStorage.setItem(DELEGATION_STORAGE_KEY, JSON.stringify(toStore));
  } catch (e) {
    console.error('Failed to save delegation:', e);
  }
}

// Load delegation from localStorage
export function loadDelegation(): StoredDelegation | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(DELEGATION_STORAGE_KEY);
    if (!stored) return null;
    const delegation: StoredDelegation = JSON.parse(stored);
    // Parse expiry back to BigInt
    delegation.caveats.expiry = BigInt(delegation.caveats.expiry);
    return delegation;
  } catch {
    return null;
  }
}

// Clear stored delegation
export function clearDelegation(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DELEGATION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// Check if delegation is expired
export function isDelegationExpired(expiry: bigint): boolean {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return now > expiry;
}

// Format expiry date for display
export function formatExpiryDate(expiry: bigint): string {
  const date = new Date(Number(expiry) * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Validate percentage is within allowed range (1-10%)
export function validateBasePercentage(percentage: number): boolean {
  return percentage >= 1 && percentage <= 10;
}
