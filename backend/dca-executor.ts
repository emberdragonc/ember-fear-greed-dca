// DCA Executor Backend Service
// Runs daily to check F&G and execute swaps for delegated accounts
// Uses MetaMask Delegation Framework for secure execution
// Refactored to ERC-4337 architecture with parallel UserOperations

import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  formatUnits, 
  parseUnits,
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import { createExecution, ExecutionMode, toMetaMaskSmartAccount, Implementation } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import { createBundlerClient } from 'viem/account-abstraction';
import { encodeNonce } from 'permissionless/utils';

// ============ RETRY & ERROR HANDLING UTILITIES ============

// Sleep helper for delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Error types for classification
type ErrorType = 'network' | 'revert' | 'timeout' | 'rate_limit' | 'quote_expired' | 'unknown';

interface ClassifiedError {
  type: ErrorType;
  message: string;
  originalError: unknown;
  retryable: boolean;
}

function classifyError(error: unknown): ClassifiedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = errorMessage.toLowerCase();
  
  // Network errors (retryable)
  if (errorString.includes('fetch') || 
      errorString.includes('network') || 
      errorString.includes('econnrefused') ||
      errorString.includes('enotfound') ||
      errorString.includes('socket') ||
      errorString.includes('connection')) {
    return { type: 'network', message: errorMessage, originalError: error, retryable: true };
  }
  
  // Timeout errors (retryable)
  if (errorString.includes('timeout') || errorString.includes('timed out')) {
    return { type: 'timeout', message: errorMessage, originalError: error, retryable: true };
  }
  
  // Rate limit errors (retryable with longer backoff)
  if (errorString.includes('rate limit') || 
      errorString.includes('429') || 
      errorString.includes('too many requests')) {
    return { type: 'rate_limit', message: errorMessage, originalError: error, retryable: true };
  }
  
  // Quote expired (retryable - get fresh quote)
  if (errorString.includes('quote') && 
      (errorString.includes('expired') || errorString.includes('stale'))) {
    return { type: 'quote_expired', message: errorMessage, originalError: error, retryable: true };
  }
  
  // Revert errors (NOT retryable - will fail again)
  if (errorString.includes('revert') || 
      errorString.includes('execution reverted') ||
      errorString.includes('insufficient') ||
      errorString.includes('transfer amount exceeds')) {
    return { type: 'revert', message: errorMessage, originalError: error, retryable: false };
  }
  
  // Unknown errors - may be retryable
  return { type: 'unknown', message: errorMessage, originalError: error, retryable: true };
}

// Retry configuration
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  operation: string;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  operation: 'unknown',
};

// Generic retry wrapper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<{ result: T | null; error: ClassifiedError | null; attempts: number }> {
  const { maxAttempts, baseDelayMs, maxDelayMs, operation } = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  let lastError: ClassifiedError | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(`[${operation}] Succeeded on attempt ${attempt}`);
      }
      return { result, error: null, attempts: attempt };
    } catch (err) {
      lastError = classifyError(err);
      
      console.error(`[${operation}] Attempt ${attempt}/${maxAttempts} failed:`, {
        type: lastError.type,
        message: lastError.message,
        retryable: lastError.retryable,
      });
      
      // Don't retry non-retryable errors
      if (!lastError.retryable) {
        console.log(`[${operation}] Error is not retryable, giving up`);
        break;
      }
      
      // Don't sleep after the last attempt
      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s... capped at maxDelayMs
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        // Add jitter (±20%) to prevent thundering herd
        const jitter = delay * 0.2 * (Math.random() - 0.5);
        const actualDelay = Math.floor(delay + jitter);
        
        console.log(`[${operation}] Retrying in ${actualDelay}ms...`);
        await sleep(actualDelay);
      }
    }
  }
  
  return { result: null, error: lastError, attempts: maxAttempts };
}

// ============ CONFIG ============

const CHAIN_ID = 8453;
const TRADING_API = 'https://trade-api.gateway.uniswap.org/v1';

// Alchemy RPC for reliable read operations (balance checks, quote fetching)
const ALCHEMY_RPC = 'https://base-mainnet.g.alchemy.com/v2/NQlmwdn5GImg3XWpPUNp4';

// Pimlico bundler for ERC-4337 UserOperations
const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
const PIMLICO_BUNDLER_URL = `https://api.pimlico.io/v2/base/rpc?apikey=${PIMLICO_API_KEY}`;

const ADDRESSES = {
  // Tokens
  ETH: '0x0000000000000000000000000000000000000000' as Address,
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  // Uniswap V4 Universal Router (used by Trading API)
  UNISWAP_ROUTER: '0x6fF5693b99212Da76ad316178A184AB56D299b43' as Address,
  // Permit2 - Universal Router uses this for token transfers
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  // MetaMask Delegation
  DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address,
  // EMBER Staking (fee recipient)
  EMBER_STAKING: '0x434B2A0e38FB3E5D2ACFa2a7aE492C2A53E55Ec9' as Address,
} as const;

// Fee: 15 basis points = 0.15%
const FEE_BPS = 15;
const BPS_DENOMINATOR = 10000;

// F&G Thresholds
const FG_THRESHOLDS = {
  EXTREME_FEAR_MAX: 25,
  FEAR_MAX: 45,
  NEUTRAL_MAX: 54,
  GREED_MAX: 75,
};

// ============ TYPES ============

interface DCADecision {
  action: 'buy' | 'sell' | 'hold';
  percentage: number;
  reason: string;
}

interface DelegationRecord {
  id: string;
  user_address: string;
  smart_account_address: string; // The actual smart account holding funds
  delegation_hash: string;
  delegation_signature: string;
  delegation_data: string; // JSON stringified delegation
  max_amount_per_swap: string;
  expires_at: string;
  created_at: string;
}

interface ExecutionResult {
  success: boolean;
  txHash: string | null;
  error: string | null;
  errorType: ErrorType | null;
  amountIn: string;
  amountOut: string;
  feeCollected: string;
  retryCount: number;
  lastError: string | null;
}

// ============ CLIENTS ============

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const publicClient = createPublicClient({
  chain: base,
  transport: http(ALCHEMY_RPC),
});

const backendAccount = privateKeyToAccount((process.env.DCA_BACKEND_PRIVATE_KEY || process.env.BACKEND_PRIVATE_KEY) as Hex);

const walletClient = createWalletClient({
  account: backendAccount,
  chain: base,
  transport: http(ALCHEMY_RPC),
});

// Bundler client for ERC-4337 UserOperations
const bundlerClient = createBundlerClient({
  client: publicClient,
  transport: http(PIMLICO_BUNDLER_URL),
});

// Cached backend smart account (initialized on first use)
let _backendSmartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>> | null = null;

// ============ BACKEND SMART ACCOUNT INITIALIZATION ============

async function initBackendSmartAccount() {
  if (_backendSmartAccount) {
    return _backendSmartAccount;
  }

  console.log('[Setup] Initializing backend smart account...');
  console.log(`[Setup] Backend EOA: ${backendAccount.address}`);

  // Create MetaMask smart account with backend EOA as signer
  _backendSmartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [backendAccount.address, [], [], []],
    deploySalt: '0x0000000000000000000000000000000000000000000000000000000000000000', // Deterministic salt
    signer: { account: backendAccount },
  });

  console.log(`[Setup] Backend smart account: ${_backendSmartAccount.address}`);

  // Check if deployed
  const code = await publicClient.getCode({ address: _backendSmartAccount.address });
  if (!code || code === '0x') {
    console.log('[Setup] Smart account not yet deployed - first UserOp will deploy via factory');
  } else {
    console.log('[Setup] Smart account already deployed ✓');
  }

  return _backendSmartAccount;
}

// ============ DELEGATION MANAGER ABI ============

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
] as const;

// ============ EMBER STAKING ABI ============

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
] as const;

// ============ FEAR & GREED ============

async function fetchFearGreedInternal(): Promise<{ value: number; classification: string }> {
  const response = await fetch('https://api.alternative.me/fng/');
  if (!response.ok) {
    throw new Error(`F&G API returned ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.data?.[0]) {
    throw new Error('Invalid F&G API response structure');
  }
  return {
    value: parseInt(data.data[0].value),
    classification: data.data[0].value_classification,
  };
}

async function fetchFearGreed(): Promise<{ value: number; classification: string }> {
  const { result, error, attempts } = await withRetry(
    fetchFearGreedInternal,
    { operation: 'fetchFearGreed' }
  );
  
  if (!result) {
    console.error(`Failed to fetch Fear & Greed after ${attempts} attempts:`, error?.message);
    throw new Error(`Failed to fetch Fear & Greed: ${error?.message}`);
  }
  
  return result;
}

function calculateDecision(fgValue: number): DCADecision {
  if (fgValue <= FG_THRESHOLDS.EXTREME_FEAR_MAX) {
    return { action: 'buy', percentage: 5, reason: 'Extreme Fear - Buy 5%' };
  }
  if (fgValue <= FG_THRESHOLDS.FEAR_MAX) {
    return { action: 'buy', percentage: 2.5, reason: 'Fear - Buy 2.5%' };
  }
  if (fgValue <= FG_THRESHOLDS.NEUTRAL_MAX) {
    return { action: 'hold', percentage: 0, reason: 'Neutral - Hold' };
  }
  if (fgValue <= FG_THRESHOLDS.GREED_MAX) {
    return { action: 'sell', percentage: 2.5, reason: 'Greed - Sell 2.5%' };
  }
  return { action: 'sell', percentage: 5, reason: 'Extreme Greed - Sell 5%' };
}

// ============ BALANCE FETCHING ============

async function getETHBalance(address: Address): Promise<bigint> {
  return publicClient.getBalance({ address });
}

async function getUSDCBalance(address: Address): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: ADDRESSES.USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
  return balance;
}

// ============ PERMIT2 ABI ============

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
] as const;

// ============ ALLOWANCE CHECKING ============

async function getTokenAllowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
  return allowance;
}

async function getPermit2Allowance(owner: Address, token: Address, spender: Address): Promise<{ amount: bigint; expiration: number }> {
  const result = await publicClient.readContract({
    address: ADDRESSES.PERMIT2,
    abi: permit2Abi,
    functionName: 'allowance',
    args: [owner, token, spender],
  });
  return {
    amount: BigInt(result[0]),
    expiration: Number(result[1]),
  };
}

// ============ DELEGATED APPROVAL (via UserOp) ============

async function executeDelegatedERC20ApprovalViaUserOp(
  delegation: DelegationRecord,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint,
  nonceKey: bigint
): Promise<string | null> {
  try {
    const backendSmartAccount = await initBackendSmartAccount();
    
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      console.error('Delegation missing signature');
      return null;
    }

    // Encode the ERC20 approve call
    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress, amount],
    });

    const execution = createExecution({
      target: tokenAddress,
      value: 0n,
      callData: approveCalldata,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log(`[UserOp] ERC20 Approving ${tokenAddress} for ${spenderAddress}...`);

    const nonce = encodeNonce({ key: nonceKey, sequence: 0n });

    const userOpHash = await bundlerClient.sendUserOperation({
      account: backendSmartAccount,
      nonce,
      calls: [{
        to: ADDRESSES.DELEGATION_MANAGER,
        data: redeemCalldata,
        value: 0n,
      }],
    });

    console.log(`[UserOp] Submitted: ${userOpHash}`);

    const receipt = await bundlerClient.waitForUserOperationReceipt({ 
      hash: userOpHash,
      timeout: 60000,
    });

    if (receipt.success) {
      console.log(`[UserOp] ERC20 Approval successful: ${receipt.receipt.transactionHash}`);
      return receipt.receipt.transactionHash;
    } else {
      console.error(`[UserOp] ERC20 Approval transaction reverted`);
      return null;
    }
  } catch (error: any) {
    console.error('ERC20 approval error:', error?.message || error);
    if (error?.cause) console.error('Cause:', error.cause);
    return null;
  }
}

// Set Permit2 internal allowance via UserOp
async function executeDelegatedPermit2ApprovalViaUserOp(
  delegation: DelegationRecord,
  tokenAddress: Address,
  spenderAddress: Address,
  nonceKey: bigint
): Promise<string | null> {
  try {
    const backendSmartAccount = await initBackendSmartAccount();
    
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      console.error('Delegation missing signature');
      return null;
    }

    // Set max uint160 allowance, expiration far in future
    const maxAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffff'); // uint160 max
    const expiration = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year

    // Encode Permit2.approve(token, spender, amount, expiration)
    const permit2ApproveCalldata = encodeFunctionData({
      abi: permit2Abi,
      functionName: 'approve',
      args: [tokenAddress, spenderAddress, maxAmount, expiration],
    });

    const execution = createExecution({
      target: ADDRESSES.PERMIT2,
      value: 0n,
      callData: permit2ApproveCalldata,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log(`[UserOp] Permit2 Approving ${tokenAddress} for ${spenderAddress}...`);

    const nonce = encodeNonce({ key: nonceKey, sequence: 0n });

    const userOpHash = await bundlerClient.sendUserOperation({
      account: backendSmartAccount,
      nonce,
      calls: [{
        to: ADDRESSES.DELEGATION_MANAGER,
        data: redeemCalldata,
        value: 0n,
      }],
    });

    console.log(`[UserOp] Submitted: ${userOpHash}`);

    const receipt = await bundlerClient.waitForUserOperationReceipt({ 
      hash: userOpHash,
      timeout: 60000,
    });

    if (receipt.success) {
      console.log(`[UserOp] Permit2 Approval successful: ${receipt.receipt.transactionHash}`);
      return receipt.receipt.transactionHash;
    } else {
      console.error('[UserOp] Permit2 Approval transaction reverted');
      return null;
    }
  } catch (error) {
    console.error('Permit2 approval error:', error);
    return null;
  }
}

// Legacy EOA versions (kept for compatibility during migration)
async function executeDelegatedERC20Approval(
  delegation: DelegationRecord,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint
): Promise<string | null> {
  try {
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      console.error('Delegation missing signature');
      return null;
    }

    // Encode the ERC20 approve call
    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress, amount],
    });

    const execution = createExecution({
      target: tokenAddress,
      value: 0n,
      callData: approveCalldata,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log(`ERC20 Approving ${tokenAddress} for ${spenderAddress}...`);

    const tx = await walletClient.sendTransaction({
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      gas: 300000n,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: tx,
      timeout: 60000,
    });

    if (receipt.status === 'success') {
      console.log(`ERC20 Approval successful: ${tx}`);
      return tx;
    } else {
      console.error(`ERC20 Approval transaction reverted: ${tx}`);
      console.error(`Check: https://basescan.org/tx/${tx}`);
      return null;
    }
  } catch (error: any) {
    console.error('ERC20 approval error:', error?.message || error);
    if (error?.cause) console.error('Cause:', error.cause);
    return null;
  }
}

async function executeDelegatedPermit2Approval(
  delegation: DelegationRecord,
  tokenAddress: Address,
  spenderAddress: Address
): Promise<string | null> {
  try {
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      console.error('Delegation missing signature');
      return null;
    }

    const maxAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffff');
    const expiration = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);

    const permit2ApproveCalldata = encodeFunctionData({
      abi: permit2Abi,
      functionName: 'approve',
      args: [tokenAddress, spenderAddress, maxAmount, expiration],
    });

    const execution = createExecution({
      target: ADDRESSES.PERMIT2,
      value: 0n,
      callData: permit2ApproveCalldata,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log(`Permit2 Approving ${tokenAddress} for ${spenderAddress}...`);

    const tx = await walletClient.sendTransaction({
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      gas: 300000n,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: tx,
      timeout: 60000,
    });

    if (receipt.status === 'success') {
      console.log(`Permit2 Approval successful: ${tx}`);
      return tx;
    } else {
      console.error('Permit2 Approval transaction reverted');
      return null;
    }
  } catch (error) {
    console.error('Permit2 approval error:', error);
    return null;
  }
}

// ============ FEE CALCULATION ============

function calculateFee(amount: bigint): bigint {
  return (amount * BigInt(FEE_BPS)) / BigInt(BPS_DENOMINATOR);
}

function calculateAmountAfterFee(amount: bigint): bigint {
  return amount - calculateFee(amount);
}

// ============ SWAP EXECUTION VIA USEROP ============

async function getSwapQuoteInternal(
  swapper: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: string
): Promise<{ quote: any; swap: any }> {
  // Get quote
  console.log(`[Quote API] Calling ${TRADING_API}/quote...`);
  const quoteRes = await fetch(`${TRADING_API}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.UNISWAP_API_KEY!,
    },
    body: JSON.stringify({
      swapper,
      tokenIn,
      tokenOut,
      tokenInChainId: CHAIN_ID,
      tokenOutChainId: CHAIN_ID,
      amount,
      type: 'EXACT_INPUT',
      slippageTolerance: 1,
    }),
  });

  if (!quoteRes.ok) {
    const error = await quoteRes.json().catch(() => ({ error: 'Unknown error' }));
    const errorMsg = error.errorCode || error.error || error.message || `HTTP ${quoteRes.status}`;
    console.error(`[Quote API] FAILED: HTTP ${quoteRes.status} - ${errorMsg}`);
    console.error(`[Quote API] Full error response:`, JSON.stringify(error, null, 2));
    throw new Error(`Quote API failed: ${errorMsg}`);
  }

  const quoteData = await quoteRes.json();
  console.log(`[Quote API] Quote received successfully`);

  // Get swap transaction
  const { permitData, permitTransaction, ...cleanQuote } = quoteData;
  console.log(`[Quote API] Calling ${TRADING_API}/swap...`);
  const swapRes = await fetch(`${TRADING_API}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.UNISWAP_API_KEY!,
    },
    body: JSON.stringify(cleanQuote),
  });

  if (!swapRes.ok) {
    const error = await swapRes.json().catch(() => ({ error: 'Unknown error' }));
    const errorMsg = error.errorCode || error.error || error.message || `HTTP ${swapRes.status}`;
    console.error(`[Quote API] Swap endpoint FAILED: HTTP ${swapRes.status} - ${errorMsg}`);
    console.error(`[Quote API] Full error response:`, JSON.stringify(error, null, 2));
    throw new Error(`Swap API failed: ${errorMsg}`);
  }

  const swapData = await swapRes.json();
  console.log(`[Quote API] Swap data received successfully`);
  return { quote: quoteData, swap: swapData.swap };
}

async function getSwapQuote(
  swapper: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: string
): Promise<{ quote: any; swap: any; retryInfo: { attempts: number; lastError: string | null } } | null> {
  const { result, error, attempts } = await withRetry(
    () => getSwapQuoteInternal(swapper, tokenIn, tokenOut, amount),
    { operation: 'getSwapQuote' }
  );
  
  if (!result) {
    console.error(`Failed to get swap quote after ${attempts} attempts:`, error?.message);
    return null;
  }
  
  return { ...result, retryInfo: { attempts, lastError: error?.message ?? null } };
}

// ============ DELEGATION EXECUTION VIA USEROP ============

async function executeDelegatedSwapViaUserOp(
  delegation: DelegationRecord,
  direction: 'buy' | 'sell',
  swapTo: Address,
  swapData: Hex,
  swapValue: bigint,
  nonceKey: bigint
): Promise<string> {
  const backendSmartAccount = await initBackendSmartAccount();
  
  // Parse the stored delegation data
  const signedDelegation = typeof delegation.delegation_data === 'string' 
    ? JSON.parse(delegation.delegation_data) 
    : delegation.delegation_data;
  
  if (!signedDelegation.signature) {
    throw new Error('Delegation missing signature');
  }

  // Create the execution struct
  const execution = createExecution({
    target: swapTo,
    value: swapValue,
    callData: swapData,
  });

  // Encode the redeemDelegations call
  const redeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[signedDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });

  console.log(`[UserOp] Preparing swap via bundler...`);
  console.log(`[UserOp]   Target: ${swapTo}`);
  console.log(`[UserOp]   Value: ${swapValue.toString()}`);
  console.log(`[UserOp]   Direction: ${direction}`);
  console.log(`[UserOp]   Nonce Key: ${nonceKey.toString()}`);
  console.log(`[UserOp]   Smart Account: ${backendSmartAccount.address}`);

  // Encode nonce with parallel key
  const nonce = encodeNonce({ key: nonceKey, sequence: 0n });

  // Submit UserOperation
  const startTime = Date.now();
  const userOpHash = await bundlerClient.sendUserOperation({
    account: backendSmartAccount,
    nonce,
    calls: [{
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      value: 0n,
    }],
  });
  const submitTime = Date.now() - startTime;

  console.log(`[UserOp] Submitted in ${submitTime}ms: ${userOpHash}`);
  console.log(`[UserOp] Waiting for confirmation...`);

  // Wait for confirmation
  const confirmStartTime = Date.now();
  const receipt = await bundlerClient.waitForUserOperationReceipt({ 
    hash: userOpHash,
    timeout: 120000, // 2 minutes for bundler
  });
  const confirmTime = Date.now() - confirmStartTime;

  if (receipt.success) {
    console.log(`[UserOp] Confirmed in ${confirmTime}ms, block ${receipt.receipt.blockNumber}`);
    console.log(`[UserOp] Tx: ${receipt.receipt.transactionHash}`);
    return receipt.receipt.transactionHash;
  } else {
    console.error(`[UserOp] UserOperation REVERTED`);
    throw new Error(`UserOperation reverted`);
  }
}

async function executeDelegatedSwapWithRetry(
  delegation: DelegationRecord,
  direction: 'buy' | 'sell',
  swapTo: Address,
  swapData: Hex,
  swapValue: bigint,
  nonceKey: bigint
): Promise<{ txHash: string | null; retryInfo: { attempts: number; lastError: ClassifiedError | null } }> {
  const { result, error, attempts } = await withRetry(
    () => executeDelegatedSwapViaUserOp(delegation, direction, swapTo, swapData, swapValue, nonceKey),
    { operation: 'executeDelegatedSwapViaUserOp', maxAttempts: 3, baseDelayMs: 2000 }
  );
  
  if (!result) {
    console.error(`Failed to execute delegated swap after ${attempts} attempts:`, error?.message);
  }
  
  return { txHash: result, retryInfo: { attempts, lastError: error } };
}

// Legacy EOA version (kept for migration fallback)
async function executeDelegatedSwapInternal(
  delegation: DelegationRecord,
  direction: 'buy' | 'sell',
  swapTo: Address,
  swapData: Hex,
  swapValue: bigint
): Promise<string> {
  const signedDelegation = typeof delegation.delegation_data === 'string' 
    ? JSON.parse(delegation.delegation_data) 
    : delegation.delegation_data;
  
  if (!signedDelegation.signature) {
    throw new Error('Delegation missing signature');
  }

  const execution = createExecution({
    target: swapTo,
    value: swapValue,
    callData: swapData,
  });

  const redeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[signedDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });

  console.log(`[Legacy] Preparing transaction to DelegationManager...`);

  const redeemTx = await walletClient.sendTransaction({
    to: ADDRESSES.DELEGATION_MANAGER,
    data: redeemCalldata,
    gas: 500000n,
  });

  console.log(`[Legacy] Transaction submitted: ${redeemTx}`);

  const receipt = await publicClient.waitForTransactionReceipt({ 
    hash: redeemTx,
    timeout: 60000,
  });

  if (receipt.status === 'success') {
    console.log(`[Legacy] Transaction confirmed in block ${receipt.blockNumber}`);
    return redeemTx;
  } else {
    throw new Error(`Transaction reverted: ${redeemTx}`);
  }
}

async function executeDelegatedSwap(
  delegation: DelegationRecord,
  direction: 'buy' | 'sell',
  swapTo: Address,
  swapData: Hex,
  swapValue: bigint
): Promise<{ txHash: string | null; retryInfo: { attempts: number; lastError: ClassifiedError | null } }> {
  const { result, error, attempts } = await withRetry(
    () => executeDelegatedSwapInternal(delegation, direction, swapTo, swapData, swapValue),
    { operation: 'executeDelegatedSwap', maxAttempts: 3, baseDelayMs: 2000 }
  );
  
  if (!result) {
    console.error(`Failed to execute delegated swap after ${attempts} attempts:`, error?.message);
  }
  
  return { txHash: result, retryInfo: { attempts, lastError: error } };
}

// ============ FEE COLLECTION ============

async function executeDelegatedFeeTransfer(
  delegation: DelegationRecord,
  tokenAddress: Address,
  amount: bigint
): Promise<string | null> {
  if (amount === 0n) return null;

  try {
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      console.error('Delegation missing signature for fee transfer');
      return null;
    }

    const transferCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [backendAccount.address, amount],
    });

    const execution = createExecution({
      target: tokenAddress,
      value: 0n,
      callData: transferCalldata,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log(`Transferring fee via delegation: ${formatUnits(amount, tokenAddress === ADDRESSES.USDC ? 6 : 18)} ${tokenAddress === ADDRESSES.USDC ? 'USDC' : 'WETH'}...`);

    const tx = await walletClient.sendTransaction({
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      gas: 300000n,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: tx,
      timeout: 60000,
    });

    if (receipt.status === 'success') {
      console.log(`Fee transfer successful: ${tx}`);
      return tx;
    } else {
      console.error('Fee transfer transaction reverted');
      return null;
    }
  } catch (error) {
    console.error('Fee transfer error:', error);
    return null;
  }
}

async function collectFee(
  delegation: DelegationRecord,
  tokenAddress: Address, 
  amount: bigint
): Promise<string | null> {
  if (amount === 0n) return null;

  try {
    const transferTx = await executeDelegatedFeeTransfer(delegation, tokenAddress, amount);
    if (!transferTx) {
      console.error('Fee transfer from smart account failed');
      return null;
    }

    const approveTx = await walletClient.writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [ADDRESSES.EMBER_STAKING, amount],
    });
    
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    const depositTx = await walletClient.writeContract({
      address: ADDRESSES.EMBER_STAKING,
      abi: emberStakingAbi,
      functionName: 'depositRewards',
      args: [tokenAddress, amount],
    });

    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    
    console.log(`Fee collected and deposited to stakers: ${formatUnits(amount, tokenAddress === ADDRESSES.USDC ? 6 : 18)} ${tokenAddress === ADDRESSES.USDC ? 'USDC' : 'ETH'}`);
    return depositTx;
  } catch (error) {
    console.error('Fee collection error:', error);
    return null;
  }
}

// ============ DATABASE ============

async function getActiveDelegations(): Promise<DelegationRecord[]> {
  const { data, error } = await supabase
    .from('delegations')
    .select('*')
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.error('Database error:', error);
    return [];
  }
  return data || [];
}

async function logExecution(
  delegationId: string,
  userAddress: string,
  fgValue: number,
  decision: DCADecision,
  result: ExecutionResult
) {
  const { error } = await supabase.from('dca_executions').insert({
    user_address: userAddress,
    fear_greed_index: fgValue,
    action: decision.action,
    amount_in: result.amountIn,
    amount_out: result.amountOut,
    fee_collected: result.feeCollected,
    tx_hash: result.txHash,
    status: result.success ? 'success' : 'failed',
    error_message: result.error,
    error_type: result.errorType,
    retry_count: result.retryCount,
    last_error: result.lastError,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to log execution:', error);
    console.log('Execution details for manual debugging:', JSON.stringify({
      delegationId,
      userAddress,
      fgValue,
      decision,
      result,
    }, null, 2));
  }
}

async function logFailedAttempt(
  delegationId: string,
  userAddress: string,
  stage: string,
  errorInfo: ClassifiedError,
  context: Record<string, unknown>
) {
  console.error(`[FAILED] ${stage} for ${userAddress}:`, {
    errorType: errorInfo.type,
    message: errorInfo.message,
    retryable: errorInfo.retryable,
    context,
  });

  try {
    const { error } = await supabase.from('dca_failed_attempts').insert({
      delegation_id: delegationId,
      user_address: userAddress,
      stage,
      error_type: errorInfo.type,
      error_message: errorInfo.message,
      retryable: errorInfo.retryable,
      context: JSON.stringify(context),
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.log('Note: dca_failed_attempts table may need to be created');
    }
  } catch {
    console.log('Note: Failed to insert into dca_failed_attempts table');
  }
}

async function updateProtocolStats(volume: bigint, fees: bigint) {
  const { error } = await supabase.rpc('increment_protocol_stats', {
    volume_delta: volume.toString(),
    fees_delta: fees.toString(),
  });

  if (error) {
    console.error('Failed to update stats:', error);
  }
}

// ============ WALLET DATA ============

interface WalletData {
  delegation: DelegationRecord;
  smartAccountAddress: Address;
  balance: bigint;
  swapAmount: bigint;
  swapAmountAfterFee: bigint;
  fee: bigint;
}

const MIN_SWAP_AMOUNT = parseUnits('0.10', 6);

// ============ APPROVAL CHECKING ============

async function checkUSDCApproval(smartAccountAddress: Address): Promise<boolean> {
  try {
    const allowance = await publicClient.readContract({
      address: ADDRESSES.USDC,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [smartAccountAddress, ADDRESSES.PERMIT2],
    });
    return allowance > 0n;
  } catch (error) {
    console.error(`[Approval Check] Error for ${smartAccountAddress}:`, error);
    return false;
  }
}

async function checkPermit2Allowance(smartAccountAddress: Address): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: ADDRESSES.PERMIT2,
      abi: permit2Abi,
      functionName: 'allowance',
      args: [smartAccountAddress, ADDRESSES.USDC, ADDRESSES.UNISWAP_ROUTER],
    });
    const amount = BigInt(result[0]);
    const expiration = Number(result[1]);
    const now = Math.floor(Date.now() / 1000);
    return amount > 0n && expiration > now;
  } catch (error) {
    console.error(`[Permit2 Check] Error for ${smartAccountAddress}:`, error);
    return false;
  }
}

// ============ PHASE 1: APPROVALS (Sequential - nonce sensitive) ============

async function processApprovals(delegations: DelegationRecord[], isBuy: boolean): Promise<void> {
  const tokenIn = isBuy ? ADDRESSES.USDC : ADDRESSES.WETH;
  const tokenSymbol = isBuy ? 'USDC' : 'WETH';
  
  console.log(`\n[Phase 1] Scanning ${delegations.length} wallets for approval needs...`);
  
  interface ApprovalNeeds {
    delegation: DelegationRecord;
    smartAccountAddress: Address;
    needsERC20: boolean;
    needsPermit2: boolean;
  }
  
  const needsApproval: ApprovalNeeds[] = [];
  
  // Parallel check for approval status (read-only)
  await Promise.all(delegations.map(async (delegation) => {
    const smartAccountAddress = delegation.smart_account_address as Address;
    
    const [hasERC20Approval, hasPermit2Approval] = await Promise.all([
      checkUSDCApproval(smartAccountAddress),
      checkPermit2Allowance(smartAccountAddress),
    ]);
    
    if (!hasERC20Approval || !hasPermit2Approval) {
      needsApproval.push({
        delegation,
        smartAccountAddress,
        needsERC20: !hasERC20Approval,
        needsPermit2: !hasPermit2Approval,
      });
    }
  }));
  
  console.log(`[Phase 1] ${needsApproval.length} wallets need approvals`);
  
  if (needsApproval.length === 0) {
    console.log(`[Phase 1] All wallets already approved ✓`);
    return;
  }
  
  // Sequential approval submission (one at a time - still using EOA for approvals)
  for (const { delegation, smartAccountAddress, needsERC20, needsPermit2 } of needsApproval) {
    console.log(`[Approval] Processing ${smartAccountAddress}...`);
    
    try {
      if (needsERC20) {
        console.log(`[Approval] Setting ERC20 approval for ${tokenSymbol} to Permit2...`);
        const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        const erc20ApproveTx = await executeDelegatedERC20Approval(
          delegation,
          tokenIn,
          ADDRESSES.PERMIT2,
          maxApproval
        );
        
        if (!erc20ApproveTx) {
          console.error(`[Approval] ❌ ERC20 approval failed for ${smartAccountAddress}`);
          continue;
        }
        console.log(`[Approval] ✅ ERC20 approval success: ${erc20ApproveTx}`);
        await sleep(1000);
      }
      
      if (needsPermit2) {
        console.log(`[Approval] Setting Permit2 allowance to Universal Router...`);
        const permit2ApproveTx = await executeDelegatedPermit2Approval(
          delegation,
          tokenIn,
          ADDRESSES.UNISWAP_ROUTER
        );
        
        if (!permit2ApproveTx) {
          console.error(`[Approval] ❌ Permit2 approval failed for ${smartAccountAddress}`);
          continue;
        }
        console.log(`[Approval] ✅ Permit2 approval success: ${permit2ApproveTx}`);
        await sleep(1000);
      }
      
      console.log(`[Approval] ✅ All approvals complete for ${smartAccountAddress}`);
    } catch (error: any) {
      console.error(`[Approval] ❌ Failed for ${smartAccountAddress}:`, error?.message || error);
    }
  }
  
  console.log(`[Phase 1] Approval phase complete`);
}

// ============ PHASE 2: PARALLEL SWAPS VIA USEROPS ============

async function executeSwapWithUserOp(
  walletData: WalletData,
  decision: DCADecision,
  nonceKey: bigint
): Promise<ExecutionResult> {
  const { delegation, smartAccountAddress, swapAmountAfterFee, fee } = walletData;
  
  const isBuy = decision.action === 'buy';
  const tokenIn = isBuy ? ADDRESSES.USDC : ADDRESSES.WETH;
  const tokenOut = isBuy ? ADDRESSES.WETH : ADDRESSES.USDC;
  const tokenDecimals = isBuy ? 6 : 18;
  const tokenSymbol = isBuy ? 'USDC' : 'ETH';
  
  let totalRetries = 0;
  
  // Get swap quote
  const swapQuote = await getSwapQuote(
    smartAccountAddress,
    tokenIn,
    tokenOut,
    swapAmountAfterFee.toString()
  );

  if (!swapQuote) {
    return {
      success: false,
      txHash: null,
      error: 'Failed to get swap quote',
      errorType: 'network',
      amountIn: swapAmountAfterFee.toString(),
      amountOut: '0',
      feeCollected: '0',
      retryCount: 3,
      lastError: 'Failed to get swap quote',
    };
  }

  totalRetries += swapQuote.retryInfo.attempts - 1;

  // Execute via UserOp with parallel nonce
  const swapResult = await executeDelegatedSwapWithRetry(
    delegation,
    decision.action as 'buy' | 'sell',
    swapQuote.swap.to as Address,
    swapQuote.swap.data as Hex,
    BigInt(swapQuote.swap.value || '0'),
    nonceKey
  );

  totalRetries += swapResult.retryInfo.attempts - 1;

  if (!swapResult.txHash) {
    return {
      success: false,
      txHash: null,
      error: swapResult.retryInfo.lastError?.message ?? 'Swap execution failed',
      errorType: swapResult.retryInfo.lastError?.type ?? 'unknown',
      amountIn: swapAmountAfterFee.toString(),
      amountOut: swapQuote.quote.quote.output.amount,
      feeCollected: '0',
      retryCount: totalRetries,
      lastError: swapResult.retryInfo.lastError?.message ?? null,
    };
  }

  console.log(`[Swap] ✅ ${smartAccountAddress}: ${formatUnits(swapAmountAfterFee, tokenDecimals)} ${tokenSymbol} -> ${formatUnits(BigInt(swapQuote.quote.quote.output.amount), isBuy ? 18 : 6)} ${isBuy ? 'ETH' : 'USDC'}`);

  return {
    success: true,
    txHash: swapResult.txHash,
    error: null,
    errorType: null,
    amountIn: swapAmountAfterFee.toString(),
    amountOut: swapQuote.quote.quote.output.amount,
    feeCollected: fee.toString(),
    retryCount: totalRetries,
    lastError: null,
  };
}

async function processSwapsParallel(
  delegations: DelegationRecord[],
  decision: DCADecision,
  fgValue: number
): Promise<{ results: ExecutionResult[]; walletDataMap: Map<string, WalletData> }> {
  const isBuy = decision.action === 'buy';
  const tokenDecimals = isBuy ? 6 : 18;
  const tokenSymbol = isBuy ? 'USDC' : 'ETH';
  
  console.log(`\n[Phase 2] Preparing ${delegations.length} wallets for parallel swaps via UserOps...`);
  
  // Initialize backend smart account
  const backendSmartAccount = await initBackendSmartAccount();
  console.log(`[Phase 2] Using backend smart account: ${backendSmartAccount.address}`);
  
  // Gather balance info for all wallets (parallel reads)
  const walletDataList: WalletData[] = [];
  const walletDataMap = new Map<string, WalletData>();
  
  await Promise.all(delegations.map(async (delegation) => {
    const smartAccountAddress = delegation.smart_account_address as Address;
    
    try {
      const balance = isBuy 
        ? await getUSDCBalance(smartAccountAddress)
        : await getETHBalance(smartAccountAddress);
      
      if (balance < MIN_SWAP_AMOUNT) {
        console.log(`[Phase 2] ${smartAccountAddress}: Insufficient balance (${formatUnits(balance, tokenDecimals)} ${tokenSymbol})`);
        return;
      }
      
      const percentage = BigInt(Math.floor(decision.percentage * 100));
      let swapAmount = (balance * percentage) / 10000n;
      
      const maxAmount = BigInt(delegation.max_amount_per_swap);
      if (swapAmount > maxAmount) {
        swapAmount = maxAmount;
      }
      
      const fee = calculateFee(swapAmount);
      const swapAmountAfterFee = swapAmount - fee;
      
      const walletData: WalletData = {
        delegation,
        smartAccountAddress,
        balance,
        swapAmount,
        swapAmountAfterFee,
        fee,
      };
      
      walletDataList.push(walletData);
      walletDataMap.set(smartAccountAddress, walletData);
    } catch (error) {
      console.error(`[Phase 2] Error getting balance for ${smartAccountAddress}:`, error);
    }
  }));
  
  console.log(`[Phase 2] ${walletDataList.length} wallets eligible for swaps`);
  
  if (walletDataList.length === 0) {
    return { results: [], walletDataMap };
  }
  
  // Generate base nonce key from timestamp
  const baseNonceKey = BigInt(Date.now());
  console.log(`[Phase 2] Base nonce key: ${baseNonceKey}`);
  
  // Process ALL swaps in parallel with unique nonce keys
  console.log(`[Phase 2] Submitting ${walletDataList.length} UserOps in parallel...`);
  
  const results = await Promise.all(
    walletDataList.map((walletData, index) => {
      const nonceKey = baseNonceKey + BigInt(index);
      console.log(`[Phase 2] Wallet ${index + 1}/${walletDataList.length} (${walletData.smartAccountAddress}) → nonce key ${nonceKey}`);
      
      return executeSwapWithUserOp(walletData, decision, nonceKey)
        .then(result => result)
        .catch(error => ({
          success: false,
          txHash: null,
          error: error.message,
          errorType: 'unknown' as ErrorType,
          amountIn: walletData.swapAmountAfterFee.toString(),
          amountOut: '0',
          feeCollected: '0',
          retryCount: 0,
          lastError: error.message,
        }));
    })
  );
  
  return { results, walletDataMap };
}

// Legacy function for compatibility (retries)
async function processUserDCA(
  delegation: DelegationRecord,
  decision: DCADecision,
  fgValue: number
): Promise<ExecutionResult> {
  const userAddress = delegation.user_address as Address;
  const smartAccountAddress = delegation.smart_account_address as Address;
  
  let totalRetries = 0;
  let lastErrorMessage: string | null = null;
  let lastErrorType: ErrorType | null = null;

  const isBuy = decision.action === 'buy';
  const tokenIn = isBuy ? ADDRESSES.USDC : ADDRESSES.WETH;
  const tokenOut = isBuy ? ADDRESSES.WETH : ADDRESSES.USDC;
  const tokenDecimals = isBuy ? 6 : 18;
  const tokenSymbol = isBuy ? 'USDC' : 'ETH';
  
  let balance: bigint;
  try {
    const { result: balanceResult, error: balanceError, attempts } = await withRetry(
      async () => isBuy 
        ? await getUSDCBalance(smartAccountAddress)
        : await getETHBalance(smartAccountAddress),
      { operation: 'getBalance' }
    );
    totalRetries += attempts - 1;
    
    if (balanceResult === null) {
      lastErrorMessage = balanceError?.message ?? 'Failed to fetch balance';
      lastErrorType = balanceError?.type ?? 'unknown';
      return {
        success: false,
        txHash: null,
        error: lastErrorMessage,
        errorType: lastErrorType,
        amountIn: '0',
        amountOut: '0',
        feeCollected: '0',
        retryCount: totalRetries,
        lastError: lastErrorMessage,
      };
    }
    balance = balanceResult;
  } catch (err) {
    const classified = classifyError(err);
    return {
      success: false,
      txHash: null,
      error: classified.message,
      errorType: classified.type,
      amountIn: '0',
      amountOut: '0',
      feeCollected: '0',
      retryCount: totalRetries,
      lastError: classified.message,
    };
  }

  if (balance === 0n) {
    return {
      success: false,
      txHash: null,
      error: 'Insufficient balance',
      errorType: null,
      amountIn: '0',
      amountOut: '0',
      feeCollected: '0',
      retryCount: 0,
      lastError: null,
    };
  }

  const percentage = BigInt(Math.floor(decision.percentage * 100));
  let swapAmount = (balance * percentage) / 10000n;
  const maxAmount = BigInt(delegation.max_amount_per_swap);
  if (swapAmount > maxAmount) {
    swapAmount = maxAmount;
  }

  const fee = calculateFee(swapAmount);
  const swapAmountAfterFee = swapAmount - fee;

  const swapQuote = await getSwapQuote(
    smartAccountAddress,
    tokenIn,
    tokenOut,
    swapAmountAfterFee.toString()
  );

  if (!swapQuote) {
    lastErrorMessage = 'Failed to get swap quote after retries';
    lastErrorType = 'network';
    return {
      success: false,
      txHash: null,
      error: lastErrorMessage,
      errorType: lastErrorType,
      amountIn: swapAmountAfterFee.toString(),
      amountOut: '0',
      feeCollected: '0',
      retryCount: totalRetries + 3,
      lastError: lastErrorMessage,
    };
  }

  totalRetries += swapQuote.retryInfo.attempts - 1;

  // Use legacy EOA execution for retries (sequential, safer)
  const swapResult = await executeDelegatedSwap(
    delegation,
    decision.action as 'buy' | 'sell',
    swapQuote.swap.to as Address,
    swapQuote.swap.data as Hex,
    BigInt(swapQuote.swap.value || '0')
  );

  totalRetries += swapResult.retryInfo.attempts - 1;

  if (!swapResult.txHash) {
    lastErrorMessage = swapResult.retryInfo.lastError?.message ?? 'Swap execution failed';
    lastErrorType = swapResult.retryInfo.lastError?.type ?? 'unknown';
    return {
      success: false,
      txHash: null,
      error: lastErrorMessage,
      errorType: lastErrorType,
      amountIn: swapAmountAfterFee.toString(),
      amountOut: swapQuote.quote.quote.output.amount,
      feeCollected: '0',
      retryCount: totalRetries,
      lastError: lastErrorMessage,
    };
  }

  return {
    success: true,
    txHash: swapResult.txHash,
    error: null,
    errorType: null,
    amountIn: swapAmountAfterFee.toString(),
    amountOut: swapQuote.quote.quote.output.amount,
    feeCollected: fee.toString(),
    retryCount: totalRetries,
    lastError: null,
  };
}

async function runDCA() {
  console.log('========================================');
  console.log('  Fear & Greed DCA Executor');
  console.log('  ERC-4337 Architecture with Parallel UserOps');
  console.log('========================================');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Backend EOA: ${backendAccount.address}`);

  // Initialize backend smart account
  const backendSmartAccount = await initBackendSmartAccount();
  console.log(`Backend Smart Account: ${backendSmartAccount.address}`);

  // Check backend EOA has gas (needed for paymaster sponsorship or self-pay)
  const backendBalance = await getETHBalance(backendAccount.address);
  console.log(`Backend ETH: ${formatUnits(backendBalance, 18)} ETH`);
  
  if (backendBalance < parseUnits('0.001', 18)) {
    console.error('Backend wallet needs more ETH for gas!');
    return;
  }

  // Also check smart account balance (for non-sponsored ops)
  const smartAccountBalance = await getETHBalance(backendSmartAccount.address);
  console.log(`Smart Account ETH: ${formatUnits(smartAccountBalance, 18)} ETH`);

  // 1. Fetch Fear & Greed
  const fg = await fetchFearGreed();
  console.log(`\nFear & Greed: ${fg.value} (${fg.classification})`);

  // 2. Calculate decision
  const decision = calculateDecision(fg.value);
  console.log(`Decision: ${decision.reason}`);

  if (decision.action === 'hold') {
    console.log('\n✓ Market neutral - No action needed');
    return;
  }

  // 3. Get active delegations
  const delegations = await getActiveDelegations();
  console.log(`\nActive delegations: ${delegations.length}`);

  if (delegations.length === 0) {
    console.log('No active delegations to process');
    return;
  }

  const isBuy = decision.action === 'buy';
  
  // ========================================
  // PHASE 1: Process approvals sequentially (still EOA - rare, one-time)
  // ========================================
  await processApprovals(delegations, isBuy);
  
  // ========================================
  // PHASE 2: Process swaps via PARALLEL UserOps
  // ========================================
  const { results, walletDataMap } = await processSwapsParallel(delegations, decision, fg.value);
  
  // Log results to database
  let totalVolume = 0n;
  let totalFees = 0n;
  let successCount = 0;
  const failedDelegations: { delegation: DelegationRecord; error: string }[] = [];
  
  const walletDataArray = Array.from(walletDataMap.values());
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const walletData = walletDataArray[i];
    
    if (walletData) {
      await logExecution(
        walletData.delegation.id, 
        walletData.delegation.user_address, 
        fg.value, 
        decision, 
        result
      );
      
      if (result.success) {
        successCount++;
        totalVolume += BigInt(result.amountIn);
        totalFees += BigInt(result.feeCollected);
      } else if (result.errorType && ['network', 'timeout', 'rate_limit', 'quote_expired'].includes(result.errorType)) {
        failedDelegations.push({ delegation: walletData.delegation, error: result.error || 'Unknown error' });
      }
    }
  }

  // End-of-run retry for failed wallets (using legacy EOA method - sequential, safer)
  const MAX_RETRY_WALLETS = 20;
  if (failedDelegations.length > 0 && failedDelegations.length <= MAX_RETRY_WALLETS) {
    console.log(`\n========================================`);
    console.log(`  Retrying ${failedDelegations.length} failed wallets (legacy mode)...`);
    console.log(`========================================`);
    
    console.log('Waiting 30s before retry...');
    await sleep(30000);
    
    for (const { delegation, error } of failedDelegations) {
      console.log(`\n[RETRY] ${delegation.smart_account_address} (previous error: ${error})`);
      
      try {
        const result = await processUserDCA(delegation, decision, fg.value);
        await logExecution(delegation.id, delegation.user_address, fg.value, decision, result);
        
        if (result.success) {
          successCount++;
          totalVolume += BigInt(result.amountIn);
          totalFees += BigInt(result.feeCollected);
          console.log(`[RETRY] ✓ Success!`);
        } else {
          console.log(`[RETRY] ✗ Failed again: ${result.error}`);
        }
      } catch (err) {
        console.error(`[RETRY] ✗ Exception:`, err);
      }
      
      await sleep(2000);
    }
  } else if (failedDelegations.length > MAX_RETRY_WALLETS) {
    console.log(`\n⚠️ ${failedDelegations.length} wallets failed - too many to retry`);
  }

  // Update protocol stats
  if (totalVolume > 0n) {
    await updateProtocolStats(totalVolume, totalFees);
  }

  // Summary
  console.log('\n========================================');
  console.log('  Execution Summary');
  console.log('========================================');
  console.log(`Processed: ${delegations.length} delegations`);
  console.log(`Successful: ${successCount}`);
  console.log(`Total Volume: ${formatUnits(totalVolume, 6)} (base units)`);
  console.log(`Total Fees: ${formatUnits(totalFees, 6)} (base units)`);
  console.log('========================================\n');
}

// Run
runDCA()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
