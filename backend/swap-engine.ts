// ============ SWAP ENGINE ============

import {
  formatUnits,
  parseUnits,
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import { encodeNonce } from 'permissionless/utils';
import {
  CHAIN_ID,
  TRADING_API,
  ADDRESSES,
  SLIPPAGE_LARGE_BPS,
  MIN_DELEGATION_VALUE_USD,
  MIN_WALLET_VALUE_USD,
  QUOTE_VALIDITY_MS,
  MAX_QUOTES_PER_CYCLE,
  OPTIMAL_BATCH_SIZE,
  BATCH_DELAY_MS,
  MIN_SWAP_AMOUNT,
  sleep,
  validateSwapQuote,
  calculateFee,
  calculateSwapValueUsd,
  getSlippageBpsForSwap,
  calculateMinAmountOut,
  isPermanentFailure,
  type DelegationRecord,
  type DCADecision,
  type ExecutionResult,
  type SimulationResult,
  type WalletData,
  type QuoteWithTimestamp,
  type UserOpBatchItem,
  type BatchSendResult,
  type PreparedSwap,
  type ErrorType,
} from './config';
import { classifyError, type ClassifiedError, withRetry, decodeErrorSelector } from './error-handler';
import { publicClient, walletClient, bundlerClient, pimlicoPaymasterClient, getETHBalance, getUSDCBalance, getCBBTCBalance } from './clients';
import { initBackendSmartAccount } from './smart-account';

// ============ TARGET TOKEN HELPERS ============

/**
 * Get the target token address based on user's preference
 * cbBTC uses 8 decimals (not 18 like WETH/ETH)
 */
export function getTargetTokenAddress(targetAsset?: string): Address {
  if (targetAsset?.toLowerCase() === 'cbbtc') {
    return ADDRESSES.cbBTC;
  }
  // Default to WETH for backward compatibility
  return ADDRESSES.WETH;
}

/**
 * Get token decimals for the target asset
 * cbBTC uses 8 decimals, everything else uses 18
 */
export function getTargetTokenDecimals(targetAsset?: string): number {
  if (targetAsset?.toLowerCase() === 'cbbtc') {
    return 8;
  }
  return 18;
}

/**
 * Get the token symbol for display
 */
export function getTargetTokenSymbol(targetAsset?: string): string {
  if (targetAsset?.toLowerCase() === 'cbbtc') {
    return 'cbBTC';
  }
  return 'ETH';
}

// ============ ETH PRICE CACHE ============

// Cached ETH price derived from Uniswap quote
let _cachedEthPriceUsd: number | null = null;
let _ethPriceCacheTimestamp: number | null = null;
const ETH_PRICE_CACHE_TTL_MS = 60000; // 60 seconds cache TTL

// Rate limiting counter
let _quoteCounter = 0;

export function getCachedEthPrice(): number | null {
  return _cachedEthPriceUsd;
}

export async function getETHPriceFromUniswap(): Promise<number> {
  const now = Date.now();
  if (
    _cachedEthPriceUsd !== null &&
    _ethPriceCacheTimestamp !== null &&
    (now - _ethPriceCacheTimestamp) < ETH_PRICE_CACHE_TTL_MS
  ) {
    return _cachedEthPriceUsd;
  }

  try {
    const quoteRes = await fetch(`${TRADING_API}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.UNISWAP_API_KEY!,
      },
      body: JSON.stringify({
        swapper: '0x0000000000000000000000000000000000000000',
        tokenIn: ADDRESSES.USDC,
        tokenOut: ADDRESSES.WETH,
        tokenInChainId: CHAIN_ID,
        tokenOutChainId: CHAIN_ID,
        amount: '1000000',
        type: 'EXACT_INPUT',
        slippageTolerance: 0.5,
      }),
    });

    if (!quoteRes.ok) {
      throw new Error(`Quote API returned ${quoteRes.status}`);
    }

    const quoteData = await quoteRes.json();
    const wethReceived = BigInt(quoteData.quote?.output?.amount || '0');

    if (wethReceived === 0n) {
      throw new Error('Invalid quote response');
    }

    const ethPrice = Number(1e18) / Number(wethReceived);
    _cachedEthPriceUsd = ethPrice;
    _ethPriceCacheTimestamp = now;

    console.log(`[ETH Price] Derived from Uniswap: $${ethPrice.toFixed(2)}`);
    return ethPrice;
  } catch (error) {
    console.error('[ETH Price] Failed to get price from Uniswap:', error);
    if (_cachedEthPriceUsd !== null) {
      console.log(`[ETH Price] Using stale cached price: $${_cachedEthPriceUsd.toFixed(2)}`);
      return _cachedEthPriceUsd;
    }
    _cachedEthPriceUsd = 2500;
    _ethPriceCacheTimestamp = now;
    return 2500;
  }
}

// ============ SIMULATION ============

async function simulateSwap(
  userSmartAccount: Address,
  tokenIn: Address,
  amountIn: bigint,
  tokenOut: Address
): Promise<{ success: boolean; reason?: string }> {
  try {
    const ALCHEMY_RPC = 'https://base-mainnet.g.alchemy.com/v2/NQlmwdn5GImg3XWpPUNp4';
    const response = await fetch(ALCHEMY_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_simulateAssetChanges',
        params: [{
          from: userSmartAccount,
          to: tokenIn,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [ADDRESSES.UNISWAP_ROUTER, amountIn]
          })
        }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return { success: false, reason: data.error.message };
    }
    
    const changes = data.result?.changes || [];
    const hasTokenOut = changes.some((c: any) => 
      c.to?.toLowerCase() === userSmartAccount.toLowerCase()
    );
    
    return { success: true };
  } catch (err) {
    return { success: false, reason: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function runDryRunSimulation(
  delegations: DelegationRecord[],
  decision: DCADecision
): Promise<SimulationResult[]> {
  console.log('\n========================================');
  console.log('  DRY-RUN SIMULATION MODE');
  console.log('========================================');
  console.log('Simulating swaps without executing...\n');

  const ethPriceUsd = await getETHPriceFromUniswap();
  console.log(`ETH Price: $${ethPriceUsd.toFixed(2)} (derived from Uniswap)`);
  console.log(`Min wallet value: $${MIN_DELEGATION_VALUE_USD} (griefing protection)\n`);

  const results: SimulationResult[] = [];
  const isBuy = decision.action === 'buy';

  for (const delegation of delegations) {
    const userSmartAccount = delegation.smart_account_address as Address;
    
    const usdcBalance = await getUSDCBalance(userSmartAccount);
    const ethBalance = await getETHBalance(userSmartAccount);
    
    const usdcValueUsd = Number(formatUnits(usdcBalance, 6));
    const ethValueUsd = Number(formatUnits(ethBalance, 18)) * ethPriceUsd;
    const totalValueUsd = usdcValueUsd + ethValueUsd;
    
    if (totalValueUsd < MIN_DELEGATION_VALUE_USD) {
      results.push({
        wallet: userSmartAccount.slice(0, 10),
        totalValueUsd: totalValueUsd.toFixed(2),
        balance: isBuy ? formatUnits(usdcBalance, 6) : formatUnits(ethBalance, 18),
        amountToSwap: '0',
        status: 'SKIP',
        reason: `Total value $${totalValueUsd.toFixed(2)} < $${MIN_DELEGATION_VALUE_USD} min (griefing protection)`
      });
      continue;
    }
    
    const sourceBalance = isBuy ? usdcBalance : ethBalance;
    const sourceDecimals = isBuy ? 6 : 18;
    const sourceSymbol = isBuy ? 'USDC' : 'ETH';
    
    const percentage = decision.percentage;
    const amountToSwap = (sourceBalance * BigInt(Math.round(percentage * 100))) / 10000n;
    
    const minSwap = isBuy ? parseUnits('0.10', 6) : parseUnits('0.00005', 18);
    
    if (amountToSwap < minSwap) {
      results.push({
        wallet: userSmartAccount.slice(0, 10),
        totalValueUsd: totalValueUsd.toFixed(2),
        balance: formatUnits(sourceBalance, sourceDecimals),
        amountToSwap: formatUnits(amountToSwap, sourceDecimals),
        status: 'SKIP',
        reason: `Swap amt below min (${formatUnits(minSwap, sourceDecimals)} ${sourceSymbol})`
      });
      continue;
    }
    
    // Get target token based on user's preference (cbBTC or WETH)
    const targetToken = getTargetTokenAddress(delegation.target_asset);
    const targetSymbol = getTargetTokenSymbol(delegation.target_asset);
    const tokenIn = isBuy ? ADDRESSES.USDC : targetToken;
    const tokenOut = isBuy ? targetToken : ADDRESSES.USDC;
    
    const simulation = await simulateSwap(userSmartAccount, tokenIn, amountToSwap, tokenOut);
    
    results.push({
      wallet: userSmartAccount.slice(0, 10),
      totalValueUsd: totalValueUsd.toFixed(2),
      balance: formatUnits(sourceBalance, sourceDecimals),
      amountToSwap: formatUnits(amountToSwap, sourceDecimals),
      status: simulation.success ? 'PASS' : 'FAIL',
      reason: simulation.reason
    });
    
    await sleep(200);
  }

  // Print results table
  console.log('\nSIMULATION RESULTS:');
  console.log('------------------------------------------------------------');
  console.log('Wallet     | Total USD | Balance    | To Swap   | Status');
  console.log('------------------------------------------------------------');
  
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let totalToSwap = 0;
  
  for (const r of results) {
    const statusEmoji = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${r.wallet} | $${r.totalValueUsd.padStart(8)} | ${r.balance.padStart(10)} | ${r.amountToSwap.padStart(9)} | ${statusEmoji} ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
    
    if (r.status === 'PASS') {
      passCount++;
      totalToSwap += Number(r.amountToSwap);
    } else if (r.status === 'FAIL') failCount++;
    else skipCount++;
  }
  
  console.log('------------------------------------------------------------');
  const swapSymbol = decision.action === 'buy' ? 'USDC' : 'ETH';
  console.log(`\nSUMMARY: ${passCount} PASS | ${failCount} FAIL | ${skipCount} SKIP`);
  console.log(`Total to swap: ${totalToSwap.toFixed(6)} ${swapSymbol}`);
  
  if (failCount > 0) {
    console.log('\n⚠️ WARNING: Some wallets would FAIL - investigate before execution!');
  } else {
    console.log('\n✅ All wallets ready for execution');
  }
  
  return results;
}

// ============ SWAP QUOTE ============

async function getSwapQuoteInternal(
  swapper: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: string,
  slippageToleranceBps: number = SLIPPAGE_LARGE_BPS
): Promise<QuoteWithTimestamp> {
  _quoteCounter++;
  if (_quoteCounter > MAX_QUOTES_PER_CYCLE) {
    throw new Error(`Quote API rate limit exceeded: ${_quoteCounter}/${MAX_QUOTES_PER_CYCLE} quotes requested this cycle`);
  }

  const slippageTolerance = slippageToleranceBps / 100;

  console.log(`[Quote API] Calling ${TRADING_API}/quote with ${slippageTolerance}% slippage...`);
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
      slippageTolerance,
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
  const quoteTimestamp = Date.now();
  console.log(`[Quote API] Quote received successfully at ${quoteTimestamp}`);

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
  
  // H5 Fix: Validate router is in whitelist before returning
  validateSwapQuote({ swap: swapData.swap });
  console.log(`[Quote API] Router whitelist check passed: ${swapData.swap.to}`);
  
  console.log(`[Quote API] Swap data received successfully`);
  return { quote: quoteData, swap: swapData.swap, timestamp: quoteTimestamp };
}

export async function getSwapQuote(
  swapper: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: string,
  slippageToleranceBps?: number
): Promise<{ quote: any; swap: any; timestamp: number; retryInfo: { attempts: number; lastError: string | null } } | null> {
  const { result, error, attempts } = await withRetry(
    () => getSwapQuoteInternal(swapper, tokenIn, tokenOut, amount, slippageToleranceBps),
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

  console.log(`[UserOp] Preparing swap via bundler...`);
  console.log(`[UserOp]   Target: ${swapTo}`);
  console.log(`[UserOp]   Value: ${swapValue.toString()}`);
  console.log(`[UserOp]   Direction: ${direction}`);
  console.log(`[UserOp]   Nonce Key: ${nonceKey.toString()}`);
  console.log(`[UserOp]   Smart Account: ${backendSmartAccount.address}`);

  const nonce = encodeNonce({ key: nonceKey, sequence: 0n });

  const startTime = Date.now();
  const userOpHash = await bundlerClient.sendUserOperation({
    account: backendSmartAccount,
    nonce,
    calls: [{
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      value: 0n,
    }],
    paymaster: pimlicoPaymasterClient,
  });
  const submitTime = Date.now() - startTime;

  console.log(`[UserOp] Gas sponsored by Pimlico paymaster`);
  console.log(`[UserOp] Submitted in ${submitTime}ms: ${userOpHash}`);
  console.log(`[UserOp] Waiting for confirmation...`);

  const confirmStartTime = Date.now();
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 120000,
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

export async function executeDelegatedSwapWithRetry(
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
    const errorMsg = error?.message || '';
    const selectorMatch = errorMsg.match(/0x[a-fA-F0-9]{8}/);
    const decodedError = selectorMatch ? decodeErrorSelector(selectorMatch[0]) : errorMsg;
    const isPermanent = isPermanentFailure(errorMsg);
    
    console.error(`[Swap Failed] After ${attempts} attempts for ${delegation.user_address}:`);
    console.error(`  Decoded: ${decodedError}`);
    console.error(`  Permanent: ${isPermanent}`);
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

export async function executeDelegatedSwap(
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
    const errorMsg = error?.message || '';
    const selectorMatch = errorMsg.match(/0x[a-fA-F0-9]{8}/);
    const decodedError = selectorMatch ? decodeErrorSelector(selectorMatch[0]) : errorMsg;
    const isPermanent = isPermanentFailure(errorMsg);
    
    console.error(`[Swap Failed] After ${attempts} attempts for ${delegation.user_address}:`);
    console.error(`  Decoded: ${decodedError}`);
    console.error(`  Permanent: ${isPermanent}`);
  }

  return { txHash: result, retryInfo: { attempts, lastError: error } };
}

// ============ PARALLEL USEROP BATCHING ============

export async function sendBatchedUserOps(
  batchItems: UserOpBatchItem[],
  backendSmartAccount: any
): Promise<BatchSendResult[]> {
  if (batchItems.length === 0) {
    return [];
  }

  const startTime = Date.now();
  console.log(`[Batch] Sending ${batchItems.length} UserOps in parallel via bundlerClient...`);

  const sendPromises = batchItems.map(async (item) => {
    try {
      const signature = await backendSmartAccount.signUserOperation({
        ...item.userOp,
        chainId: base.id,
      });

      const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
      const userOpHash = await bundlerClient.sendUserOperation({
        sender: item.userOp.sender,
        nonce: item.userOp.nonce,
        factory: item.userOp.factory,
        factoryData: item.userOp.factoryData,
        callData: item.userOp.callData,
        callGasLimit: item.userOp.callGasLimit,
        verificationGasLimit: item.userOp.verificationGasLimit,
        preVerificationGas: item.userOp.preVerificationGas,
        maxFeePerGas: item.userOp.maxFeePerGas,
        maxPriorityFeePerGas: item.userOp.maxPriorityFeePerGas,
        paymaster: item.userOp.paymaster,
        paymasterData: item.userOp.paymasterData,
        paymasterVerificationGasLimit: item.userOp.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit: item.userOp.paymasterPostOpGasLimit,
        signature,
        entryPointAddress: ENTRY_POINT_V07,
      });

      return {
        success: true,
        userOpHash,
        error: null,
        walletAddress: item.walletData.smartAccountAddress,
      };
    } catch (error: any) {
      console.error(`[Batch] UserOp ${item.id} failed: ${error?.message}`);
      return {
        success: false,
        userOpHash: null,
        error: error?.message || 'Unknown error',
        walletAddress: item.walletData.smartAccountAddress,
      };
    }
  });

  const results = await Promise.all(sendPromises);
  const duration = Date.now() - startTime;

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.length - successCount;

  console.log(`[Batch] Completed in ${duration}ms: ${successCount} success, ${errorCount} errors`);

  return results;
}

export async function waitForBatchedUserOpReceipts(
  results: BatchSendResult[]
): Promise<Map<string, { success: boolean; txHash: string | null; error: string | null }>> {
  const receiptMap = new Map<string, { success: boolean; txHash: string | null; error: string | null }>();

  const successfulResults = results.filter(r => r.success && r.userOpHash);

  if (successfulResults.length === 0) {
    for (const result of results) {
      receiptMap.set(result.walletAddress, {
        success: false,
        txHash: null,
        error: result.error || 'Submission failed',
      });
    }
    return receiptMap;
  }

  console.log(`[Batch] Waiting for ${successfulResults.length} UserOp receipts...`);

  const receiptPromises = successfulResults.map(async (result) => {
    try {
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: result.userOpHash as `0x${string}`,
        timeout: 120000,
      });

      if (receipt.success) {
        receiptMap.set(result.walletAddress, {
          success: true,
          txHash: receipt.receipt.transactionHash,
          error: null,
        });
      } else {
        receiptMap.set(result.walletAddress, {
          success: false,
          txHash: null,
          error: 'UserOperation reverted on-chain',
        });
      }
    } catch (error: any) {
      receiptMap.set(result.walletAddress, {
        success: false,
        txHash: null,
        error: `Receipt timeout: ${error?.message || 'Unknown error'}`,
      });
    }
  });

  await Promise.all(receiptPromises);

  for (const result of results) {
    if (!result.success) {
      receiptMap.set(result.walletAddress, {
        success: false,
        txHash: null,
        error: result.error || 'Unknown error',
      });
    }
  }

  const successCount = Array.from(receiptMap.values()).filter(r => r.success).length;
  console.log(`[Batch] Receipts: ${successCount}/${results.length} confirmed on-chain`);

  return receiptMap;
}

// ============ PHASE 2: PARALLEL SWAPS ============

export interface PrepareSwapError {
  stage: 'quote_fetch' | 'quote_validation';
  reason: string;
  apiError?: string;
  tokenPair: string;
  walletAddress: string;
}

async function prepareSwap(
  walletData: WalletData,
  decision: DCADecision,
  nonceKey: bigint,
  ethPriceUsd: number
): Promise<PreparedSwap | null> {
  const { smartAccountAddress, swapAmountAfterFee, delegation } = walletData;

  const isBuy = decision.action === 'buy';
  // Get target token based on user's preference (cbBTC or WETH)
  const targetToken = getTargetTokenAddress(delegation.target_asset);
  const targetDecimals = getTargetTokenDecimals(delegation.target_asset);
  const targetSymbol = getTargetTokenSymbol(delegation.target_asset);
  const tokenIn = isBuy ? ADDRESSES.USDC : targetToken;
  const tokenOut = isBuy ? targetToken : ADDRESSES.USDC;
  const tokenPair = `${isBuy ? 'USDC' : targetSymbol}→${isBuy ? targetSymbol : 'USDC'}`;

  const swapValueUsd = calculateSwapValueUsd(swapAmountAfterFee, isBuy, ethPriceUsd);
  const slippageBps = getSlippageBpsForSwap(swapValueUsd);

  console.log(`[Prepare] ${smartAccountAddress}: Swap value $${swapValueUsd.toFixed(2)} -> slippage ${slippageBps/100}%`);

  let swapQuote;
  try {
    swapQuote = await getSwapQuote(
      smartAccountAddress,
      tokenIn,
      tokenOut,
      swapAmountAfterFee.toString(),
      slippageBps
    );
  } catch (error: any) {
    const errorInfo: PrepareSwapError = {
      stage: 'quote_fetch',
      reason: `Quote API threw exception: ${error?.message || 'Unknown error'}`,
      apiError: error?.message || 'Unknown error',
      tokenPair,
      walletAddress: smartAccountAddress,
    };
    console.error(`[Prepare] ❌ ${smartAccountAddress}: Quote fetch failed - ${errorInfo.reason}`);
    // Attach error info to walletData for downstream logging
    (walletData as any).__prepareError = errorInfo;
    return null;
  }

  if (!swapQuote) {
    const errorInfo: PrepareSwapError = {
      stage: 'quote_fetch',
      reason: 'Quote API returned null after retries',
      tokenPair,
      walletAddress: smartAccountAddress,
    };
    console.error(`[Prepare] ❌ ${smartAccountAddress}: ${errorInfo.reason}`);
    (walletData as any).__prepareError = errorInfo;
    return null;
  }

  // Validate quote has required fields
  const expectedOutput = BigInt(swapQuote.quote.quote?.output?.amount || '0');
  if (expectedOutput === 0n) {
    const errorInfo: PrepareSwapError = {
      stage: 'quote_validation',
      reason: 'Quote returned zero output amount',
      tokenPair,
      walletAddress: smartAccountAddress,
    };
    console.error(`[Prepare] ❌ ${smartAccountAddress}: ${errorInfo.reason}`);
    (walletData as any).__prepareError = errorInfo;
    return null;
  }

  const minAmountOut = calculateMinAmountOut(expectedOutput, slippageBps);

  console.log(`[Prepare] ${smartAccountAddress}: Expected output ${formatUnits(expectedOutput, isBuy ? targetDecimals : 6)}, Min with slippage ${formatUnits(minAmountOut, isBuy ? targetDecimals : 6)}`);

  return {
    walletData,
    swapQuote,
    nonceKey,
  };
}

export interface BuildUserOpError {
  stage: 'delegation_parse' | 'execution_create' | 'calldata_encode' | 'userop_prepare';
  reason: string;
  originalError?: string;
  tokenPair: string;
  walletAddress: string;
}

async function buildUserOpForSwap(
  backendSmartAccount: any,
  preparedSwap: PreparedSwap,
  decision: DCADecision
): Promise<UserOpBatchItem | null> {
  const { walletData, swapQuote, nonceKey } = preparedSwap;
  const { delegation, smartAccountAddress, swapAmountAfterFee, fee } = walletData;

  const isBuy = decision.action === 'buy';
  const targetToken = getTargetTokenAddress(delegation.target_asset);
  const targetSymbol = getTargetTokenSymbol(delegation.target_asset);
  const tokenIn = isBuy ? ADDRESSES.USDC : targetToken;
  const tokenOut = isBuy ? targetToken : ADDRESSES.USDC;
  const tokenPair = `${isBuy ? 'USDC' : targetSymbol}→${isBuy ? targetSymbol : 'USDC'}`;

  try {
    const signedDelegation = typeof delegation.delegation_data === 'string'
      ? JSON.parse(delegation.delegation_data)
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      const errorInfo: BuildUserOpError = {
        stage: 'delegation_parse',
        reason: 'Delegation missing signature',
        tokenPair,
        walletAddress: smartAccountAddress,
      };
      console.error(`[BuildUserOp] ❌ ${smartAccountAddress}: ${errorInfo.reason}`);
      (walletData as any).__buildError = errorInfo;
      return null;
    }

    const execution = createExecution({
      target: swapQuote.swap.to as Address,
      value: BigInt(swapQuote.swap.value || '0'),
      callData: swapQuote.swap.data as Hex,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    const nonce = encodeNonce({ key: nonceKey, sequence: 0n });

    const calls = [{
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      value: 0n,
    }];

    const userOp = await bundlerClient.prepareUserOperation({
      account: backendSmartAccount,
      nonce,
      calls,
      paymaster: pimlicoPaymasterClient,
    });

    return {
      id: Number(nonceKey),
      walletData,
      swapQuote,
      userOp,
    };
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    let stage: BuildUserOpError['stage'] = 'userop_prepare';
    
    if (errorMsg.includes('delegation') || errorMsg.includes('signature')) {
      stage = 'delegation_parse';
    } else if (errorMsg.includes('execution') || errorMsg.includes('target')) {
      stage = 'execution_create';
    } else if (errorMsg.includes('calldata') || errorMsg.includes('encode')) {
      stage = 'calldata_encode';
    }

    const errorInfo: BuildUserOpError = {
      stage,
      reason: `UserOp build failed at ${stage}: ${errorMsg}`,
      originalError: errorMsg,
      tokenPair,
      walletAddress: smartAccountAddress,
    };
    console.error(`[BuildUserOp] ❌ ${smartAccountAddress}: ${errorInfo.reason}`);
    (walletData as any).__buildError = errorInfo;
    return null;
  }
}

async function executeSwapWithUserOp(
  walletData: WalletData,
  decision: DCADecision,
  nonceKey: bigint,
  ethPriceUsd?: number
): Promise<ExecutionResult> {
  const { delegation, smartAccountAddress, swapAmountAfterFee, fee } = walletData;

  const isBuy = decision.action === 'buy';
  // Get target token based on user's preference (cbBTC or WETH)
  const targetToken = getTargetTokenAddress(delegation.target_asset);
  const targetDecimals = getTargetTokenDecimals(delegation.target_asset);
  const targetSymbol = getTargetTokenSymbol(delegation.target_asset);
  const tokenIn = isBuy ? ADDRESSES.USDC : targetToken;
  const tokenOut = isBuy ? targetToken : ADDRESSES.USDC;
  const tokenDecimals = isBuy ? 6 : targetDecimals;
  const tokenSymbol = isBuy ? 'USDC' : targetSymbol;

  const price = ethPriceUsd ?? _cachedEthPriceUsd ?? 2500;
  const swapValueUsd = calculateSwapValueUsd(swapAmountAfterFee, isBuy, price);
  const slippageBps = getSlippageBpsForSwap(swapValueUsd);

  console.log(`[Swap] ${smartAccountAddress}: Swap value $${swapValueUsd.toFixed(2)} -> slippage ${slippageBps/100}%`);

  let totalRetries = 0;

  const swapQuote = await getSwapQuote(
    smartAccountAddress,
    tokenIn,
    tokenOut,
    swapAmountAfterFee.toString(),
    slippageBps
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

  console.log(`[Swap] ✅ ${smartAccountAddress}: ${formatUnits(swapAmountAfterFee, tokenDecimals)} ${tokenSymbol} -> ${formatUnits(BigInt(swapQuote.quote.quote.output.amount), isBuy ? targetDecimals : 6)} ${isBuy ? targetSymbol : 'USDC'}`);

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

export async function processSwapsParallel(
  delegations: DelegationRecord[],
  decision: DCADecision,
  fgValue: number
): Promise<{ results: ExecutionResult[]; walletDataMap: Map<string, WalletData> }> {
  const isBuy = decision.action === 'buy';
  const tokenDecimals = isBuy ? 6 : 18;
  const tokenSymbol = isBuy ? 'USDC' : 'ETH';

  console.log(`\n[Phase 2] Preparing ${delegations.length} wallets for batched swaps via JSON-RPC batching...`);

  const backendSmartAccount = await initBackendSmartAccount();
  console.log(`[Phase 2] Using backend smart account: ${backendSmartAccount.address}`);

  const walletDataList: WalletData[] = [];
  const walletDataMap = new Map<string, WalletData>();

  const ethPriceUsd = await getETHPriceFromUniswap();
  console.log(`[Phase 2] ETH Price: $${ethPriceUsd.toFixed(2)} | Min wallet value: $${MIN_WALLET_VALUE_USD}`);

  await Promise.all(delegations.map(async (delegation) => {
    const smartAccountAddress = delegation.smart_account_address as Address;

    try {
      const usdcBalance = await getUSDCBalance(smartAccountAddress);
      const ethBalance = await getETHBalance(smartAccountAddress);

      const usdcValueUsd = Number(formatUnits(usdcBalance, 6));
      const ethValueUsd = Number(formatUnits(ethBalance, 18)) * ethPriceUsd;
      const totalValueUsd = usdcValueUsd + ethValueUsd;

      if (totalValueUsd < MIN_DELEGATION_VALUE_USD) {
        console.log(`[Phase 2] ${smartAccountAddress}: Total value $${totalValueUsd.toFixed(2)} < $${MIN_DELEGATION_VALUE_USD} minimum - skipping (griefing protection)`);
        return;
      }

      const balance = isBuy ? usdcBalance : ethBalance;

      if (balance < MIN_SWAP_AMOUNT) {
        console.log(`[Phase 2] ${smartAccountAddress}: Insufficient ${tokenSymbol} balance (${formatUnits(balance, tokenDecimals)} ${tokenSymbol})`);
        return;
      }

      const percentage = BigInt(Math.round(decision.percentage * 100));
      let swapAmount = (balance * percentage) / 10000n;

      const maxAmount = BigInt(delegation.max_amount_per_swap);
      if (swapAmount > maxAmount) {
        swapAmount = maxAmount;
      }

      const fee = calculateFee(swapAmount);
      const swapAmountAfterFee = swapAmount - fee;

      if (balance < swapAmount) {
        console.log(`[Phase 2] ${smartAccountAddress}: Skipping - balance (${formatUnits(balance, tokenDecimals)} ${tokenSymbol}) < swapAmount after fee adjustment (${formatUnits(swapAmount, tokenDecimals)} ${tokenSymbol})`);
        return;
      }

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

  const allResults: ExecutionResult[] = [];
  const PHASE2_TIMESTAMP = BigInt(Date.now());
  console.log(`[Phase 2] Timestamp base: ${PHASE2_TIMESTAMP}`);
  console.log(`[Phase 2] Processing in batches of ${OPTIMAL_BATCH_SIZE} with ${BATCH_DELAY_MS}ms delay between batches`);
  console.log(`[Phase 2] Using JSON-RPC batching: 1 HTTP request per ${OPTIMAL_BATCH_SIZE} UserOps`);

  for (let batchIndex = 0; batchIndex < walletDataList.length; batchIndex += OPTIMAL_BATCH_SIZE) {
    const batch = walletDataList.slice(batchIndex, batchIndex + OPTIMAL_BATCH_SIZE);
    const isLastBatch = batchIndex + OPTIMAL_BATCH_SIZE >= walletDataList.length;
    const batchNum = Math.floor(batchIndex / OPTIMAL_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(walletDataList.length / OPTIMAL_BATCH_SIZE);

    console.log(`\n[Phase 2] Batch ${batchNum}/${totalBatches}: Processing ${batch.length} wallets with JSON-RPC batching...`);

    // Step 1: Prepare swaps (get quotes)
    console.log(`[Phase 2]   Step 1: Fetching ${batch.length} swap quotes...`);
    const preparedSwaps: (PreparedSwap | null)[] = await Promise.all(
      batch.map((walletData, index) => {
        const globalIndex = batchIndex + index;
        const nonceKey = PHASE2_TIMESTAMP * 1000000n + BigInt(globalIndex);
        return prepareSwap(walletData, decision, nonceKey, ethPriceUsd);
      })
    );

    const validPreparedSwaps = preparedSwaps.filter((s): s is PreparedSwap => s !== null);
    console.log(`[Phase 2]   Quotes received: ${validPreparedSwaps.length}/${batch.length}`);

    if (validPreparedSwaps.length === 0) {
      for (const walletData of batch) {
        const prepareError = (walletData as any).__prepareError as PrepareSwapError | undefined;
        const errorDetail = prepareError 
          ? `[${prepareError.stage}] ${prepareError.reason} | Pair: ${prepareError.tokenPair}`
          : 'Failed to get swap quote (all quotes failed)';
        
        allResults.push({
          success: false,
          txHash: null,
          error: errorDetail,
          errorType: 'network',
          amountIn: walletData.swapAmountAfterFee.toString(),
          amountOut: '0',
          feeCollected: '0',
          retryCount: 1,
          lastError: errorDetail,
          walletAddress: walletData.smartAccountAddress,
          errorDetail,
        });
      }
      if (!isLastBatch) await sleep(BATCH_DELAY_MS);
      continue;
    }

    // Step 2: Build UserOperations
    console.log(`[Phase 2]   Step 2: Building ${validPreparedSwaps.length} UserOperations...`);
    const batchItems: (UserOpBatchItem | null)[] = await Promise.all(
      validPreparedSwaps.map(preparedSwap =>
        buildUserOpForSwap(backendSmartAccount, preparedSwap, decision)
      )
    );

    const validBatchItems = batchItems.filter((b): b is UserOpBatchItem => b !== null);
    console.log(`[Phase 2]   UserOps built: ${validBatchItems.length}/${validPreparedSwaps.length}`);

    if (validBatchItems.length === 0) {
      for (const preparedSwap of validPreparedSwaps) {
        const buildError = (preparedSwap.walletData as any).__buildError as BuildUserOpError | undefined;
        const errorDetail = buildError
          ? `[${buildError.stage}] ${buildError.reason} | Pair: ${buildError.tokenPair}`
          : 'Failed to build UserOperation (all builds failed)';
        
        allResults.push({
          success: false,
          txHash: null,
          error: errorDetail,
          errorType: 'unknown',
          amountIn: preparedSwap.walletData.swapAmountAfterFee.toString(),
          amountOut: '0',
          feeCollected: '0',
          retryCount: 0,
          lastError: errorDetail,
          walletAddress: preparedSwap.walletData.smartAccountAddress,
          errorDetail,
        });
      }
      if (!isLastBatch) await sleep(BATCH_DELAY_MS);
      continue;
    }

    // Step 2.5: Pre-send quote expiration check
    const freshBatchItems: UserOpBatchItem[] = [];
    const batchExecutionResults: ExecutionResult[] = [];
    const processedWallets = new Set<string>();

    for (const batchItem of validBatchItems) {
      const now = Date.now();
      const quoteAge = now - batchItem.swapQuote.timestamp;
      if (quoteAge > QUOTE_VALIDITY_MS) {
        const errorMsg = `Quote expired before send: ${quoteAge}ms old (max ${QUOTE_VALIDITY_MS}ms)`;
        console.warn(`[Phase 2] ⚠️ ${batchItem.walletData.smartAccountAddress}: ${errorMsg} - skipping`);
        processedWallets.add(batchItem.walletData.smartAccountAddress);
        batchExecutionResults.push({
          success: false,
          txHash: null,
          error: errorMsg,
          errorType: 'quote_expired',
          amountIn: batchItem.walletData.swapAmountAfterFee.toString(),
          amountOut: '0',
          feeCollected: '0',
          retryCount: 0,
          lastError: errorMsg,
          walletAddress: batchItem.walletData.smartAccountAddress,
          errorDetail: `[quote_expired] ${errorMsg}`,
        });
      } else {
        freshBatchItems.push(batchItem);
      }
    }

    // Step 3: Send batched UserOperations
    console.log(`[Phase 2]   Step 3: Sending ${freshBatchItems.length} UserOps in parallel via bundlerClient...`);
    const batchResults = await sendBatchedUserOps(freshBatchItems, backendSmartAccount);

    // Step 4: Wait for receipts
    console.log(`[Phase 2]   Step 4: Waiting for on-chain confirmation...`);
    const receiptMap = await waitForBatchedUserOpReceipts(batchResults);

    // Step 5: Build ExecutionResults
    for (const batchItem of freshBatchItems) {
      const { walletData, swapQuote } = batchItem;
      const receipt = receiptMap.get(walletData.smartAccountAddress);
      processedWallets.add(walletData.smartAccountAddress);

      if (receipt?.success && receipt.txHash) {
        console.log(`[Phase 2] ✅ ${walletData.smartAccountAddress}: Confirmed on-chain`);
        batchExecutionResults.push({
          success: true,
          txHash: receipt.txHash,
          error: null,
          errorType: null,
          amountIn: walletData.swapAmountAfterFee.toString(),
          amountOut: swapQuote.quote.quote.output.amount,
          feeCollected: walletData.fee.toString(),
          retryCount: 0,
          lastError: null,
          walletAddress: walletData.smartAccountAddress,
        });
      } else {
        const errorMsg = receipt?.error || 'Unknown error';
        console.log(`[Phase 2] ❌ ${walletData.smartAccountAddress}: ${errorMsg}`);
        batchExecutionResults.push({
          success: false,
          txHash: null,
          error: errorMsg,
          errorType: 'unknown',
          amountIn: walletData.swapAmountAfterFee.toString(),
          amountOut: swapQuote.quote.quote.output.amount,
          feeCollected: '0',
          retryCount: 0,
          lastError: errorMsg,
          walletAddress: walletData.smartAccountAddress,
        });
      }
    }

    // Add results for wallets that failed at quote/build stage
    for (const walletData of batch) {
      if (!processedWallets.has(walletData.smartAccountAddress)) {
        // Extract detailed error info if available
        const prepareError = (walletData as any).__prepareError as PrepareSwapError | undefined;
        const buildError = (walletData as any).__buildError as BuildUserOpError | undefined;
        
        let errorDetail: string;
        let errorType: 'network' | 'quote_expired' | 'unknown' = 'network';
        
        if (prepareError) {
          errorDetail = `[${prepareError.stage}] ${prepareError.reason} | Pair: ${prepareError.tokenPair}`;
          errorType = prepareError.stage === 'quote_fetch' ? 'network' : 'unknown';
          console.error(`[Phase 2] ❌ ${walletData.smartAccountAddress}: Quote stage failed - ${prepareError.reason} (${prepareError.tokenPair})`);
        } else if (buildError) {
          errorDetail = `[${buildError.stage}] ${buildError.reason} | Pair: ${buildError.tokenPair}`;
          errorType = 'unknown';
          console.error(`[Phase 2] ❌ ${walletData.smartAccountAddress}: UserOp build failed - ${buildError.reason} (${buildError.tokenPair})`);
        } else {
          errorDetail = 'Quote or UserOp build failed (unknown reason)';
          console.error(`[Phase 2] ❌ ${walletData.smartAccountAddress}: Failed at quote/build stage (no error details captured)`);
        }
        
        batchExecutionResults.push({
          success: false,
          txHash: null,
          error: errorDetail,
          errorType,
          amountIn: walletData.swapAmountAfterFee.toString(),
          amountOut: '0',
          feeCollected: '0',
          retryCount: 1,
          lastError: errorDetail,
          walletAddress: walletData.smartAccountAddress,
          errorDetail, // Include granular error for daily reports
        });
      }
    }

    allResults.push(...batchExecutionResults);

    const successCount = batchExecutionResults.filter(r => r.success).length;
    console.log(`[Phase 2] Batch ${batchNum} complete: ${successCount}/${batch.length} success`);

    if (!isLastBatch) {
      console.log(`[Phase 2] Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\n[Phase 2] All ${walletDataList.length} swaps processed`);

  return { results: allResults, walletDataMap };
}

// Retry with original amounts (no recalculation) - uses legacy EOA path
export async function retrySwapWithOriginalAmounts(
  walletData: WalletData,
  decision: DCADecision,
  fgValue: number
): Promise<ExecutionResult> {
  const { delegation, smartAccountAddress, swapAmountAfterFee, fee } = walletData;
  const isBuy = decision.action === 'buy';
  // Get target token based on user's preference (cbBTC or WETH)
  const targetToken = getTargetTokenAddress(delegation.target_asset);
  const targetDecimals = getTargetTokenDecimals(delegation.target_asset);
  const targetSymbol = getTargetTokenSymbol(delegation.target_asset);
  const tokenIn = isBuy ? ADDRESSES.USDC : targetToken;
  const tokenOut = isBuy ? targetToken : ADDRESSES.USDC;
  const tokenDecimals = isBuy ? 6 : targetDecimals;
  const tokenSymbol = isBuy ? 'USDC' : targetSymbol;

  console.log(`[RETRY] Using original amount: ${formatUnits(swapAmountAfterFee, tokenDecimals)} ${tokenSymbol}`);

  // Get balance based on the operation type and target token
  let balance: bigint;
  if (isBuy) {
    balance = await getUSDCBalance(smartAccountAddress as Address);
  } else {
    // For sell operations, check the target token balance (WETH or cbBTC)
    balance = delegation.target_asset?.toLowerCase() === 'cbbtc'
      ? await getCBBTCBalance(smartAccountAddress as Address)
      : await getETHBalance(smartAccountAddress as Address);
  }
  
  if (balance < walletData.swapAmount) {
    return {
      success: false,
      txHash: null,
      error: `Insufficient balance for retry: ${formatUnits(balance, tokenDecimals)} ${tokenSymbol} < ${formatUnits(walletData.swapAmount, tokenDecimals)} needed`,
      errorType: 'revert',
      amountIn: '0',
      amountOut: '0',
      feeCollected: '0',
      retryCount: 0,
      lastError: 'Insufficient balance for retry',
    };
  }

  const ethPriceUsd = _cachedEthPriceUsd ?? 2500;
  const swapValueUsd = calculateSwapValueUsd(swapAmountAfterFee, isBuy, ethPriceUsd);
  const slippageBps = getSlippageBpsForSwap(swapValueUsd);

  const swapQuote = await getSwapQuote(
    smartAccountAddress as Address,
    tokenIn,
    tokenOut,
    swapAmountAfterFee.toString(),
    slippageBps
  );

  if (!swapQuote) {
    return {
      success: false,
      txHash: null,
      error: 'Failed to get swap quote on retry',
      errorType: 'network',
      amountIn: swapAmountAfterFee.toString(),
      amountOut: '0',
      feeCollected: '0',
      retryCount: 1,
      lastError: 'Quote fetch failed on retry',
    };
  }

  const swapResult = await executeDelegatedSwap(
    delegation,
    decision.action as 'buy' | 'sell',
    swapQuote.swap.to as Address,
    swapQuote.swap.data as Hex,
    BigInt(swapQuote.swap.value || '0')
  );

  if (!swapResult.txHash) {
    return {
      success: false,
      txHash: null,
      error: swapResult.retryInfo.lastError?.message ?? 'Retry swap execution failed',
      errorType: swapResult.retryInfo.lastError?.type ?? 'unknown',
      amountIn: swapAmountAfterFee.toString(),
      amountOut: swapQuote.quote.quote.output.amount,
      feeCollected: '0',
      retryCount: swapResult.retryInfo.attempts,
      lastError: swapResult.retryInfo.lastError?.message ?? null,
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
    retryCount: swapResult.retryInfo.attempts,
    lastError: null,
  };
}

// Legacy function for compatibility (retries)
export async function processUserDCA(
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

  // Ensure user's smart account is deployed before proceeding
  const { ensureUserSmartAccountDeployed } = await import('./smart-account');
  const isDeployed = await ensureUserSmartAccountDeployed(smartAccountAddress, userAddress);
  if (!isDeployed) {
    return {
      success: false,
      txHash: null,
      error: 'Failed to deploy user smart account',
      errorType: 'revert',
      amountIn: '0',
      amountOut: '0',
      feeCollected: '0',
      retryCount: 0,
      lastError: 'Smart account deployment failed - check user EOA address matches delegation',
    };
  }

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

  const percentage = BigInt(Math.round(decision.percentage * 100));
  let swapAmount = (balance * percentage) / 10000n;
  const maxAmount = BigInt(delegation.max_amount_per_swap);
  if (swapAmount > maxAmount) {
    swapAmount = maxAmount;
  }

  const fee = calculateFee(swapAmount);
  const swapAmountAfterFee = swapAmount - fee;

  if (balance < swapAmount) {
    return {
      success: false,
      txHash: null,
      error: `Insufficient balance: ${formatUnits(balance, tokenDecimals)} ${tokenSymbol} < ${formatUnits(swapAmount, tokenDecimals)} ${tokenSymbol}`,
      errorType: 'revert',
      amountIn: '0',
      amountOut: '0',
      feeCollected: '0',
      retryCount: 0,
      lastError: `Insufficient balance: ${formatUnits(balance, tokenDecimals)} ${tokenSymbol}`,
    };
  }

  const price = _cachedEthPriceUsd ?? 2500;
  const swapValueUsd = calculateSwapValueUsd(swapAmountAfterFee, isBuy, price);
  const slippageBps = getSlippageBpsForSwap(swapValueUsd);

  console.log(`[Retry] ${smartAccountAddress}: Swap value $${swapValueUsd.toFixed(2)} -> slippage ${slippageBps/100}%`);

  const swapQuote = await getSwapQuote(
    smartAccountAddress,
    tokenIn,
    tokenOut,
    swapAmountAfterFee.toString(),
    slippageBps
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
