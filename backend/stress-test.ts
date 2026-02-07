/**
 * DCA Executor Stress Test
 * Simulates 1000 wallets (100x the real 10 wallets) to test rate limits
 *
 * Tests:
 * - Alchemy RPC (balance checks)
 * - CoinGecko API (price fetch)
 * - Pimlico bundler (UserOp gas estimation - no submission)
 * - Uniswap Trading API (quote fetching - no execution)
 *
 * Usage: npx tsx stress-test.ts
 *
 * Configuration: 1000 wallets, batch size 50, 500ms delay between batches
 */

import { createPublicClient, http, formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { createBundlerClient, type UserOperation } from 'viem/account-abstraction';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { readFileSync } from 'fs';
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';

// ============================================
// LOAD ENV VARS FROM ~/.config/ember-treasury/.keys
// ============================================
function loadEnvVars() {
  try {
    const envContent = readFileSync(process.env.HOME + '/.config/ember-treasury/.keys', 'utf8');
    envContent.split('\n').forEach(line => {
      // Handle lines like: export KEY="value" or KEY=value
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith('#')) return;

      // Remove 'export ' prefix if present
      const withoutExport = cleanLine.replace(/^export\s+/, '');

      const [key, ...valueParts] = withoutExport.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=').trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key.trim()] = value;
      }
    });
  } catch (error) {
    console.error('Failed to load env vars from ~/.config/ember-treasury/.keys');
    process.exit(1);
  }
}

loadEnvVars();

// ============================================
// CONFIGURATION
// ============================================

const CHAIN_ID = 8453;
const TRADING_API = 'https://trade-api.gateway.uniswap.org/v1';
const ALCHEMY_RPC = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
const PIMLICO_BUNDLER_URL = `https://api.pimlico.io/v2/base/rpc?apikey=${PIMLICO_API_KEY}`;

const ADDRESSES = {
  ETH: '0x0000000000000000000000000000000000000000' as Address,
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  UNISWAP_ROUTER: '0x6fF5693b99212Da76ad316178A184AB56D299b43' as Address,
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address,
} as const;

const WALLETS_PER_SIMULATION = 100; // 100x multiplier = 1000 wallets (from 10 real)
const BATCH_SIZE = 50;              // Process 50 wallets at a time
const BATCH_DELAY_MS = 500;         // 500ms delay between batches

// ============================================
// CLIENTS
// ============================================

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const publicClient = createPublicClient({
  chain: base,
  transport: http(ALCHEMY_RPC),
});

// Pimlico client for UserOp simulation
const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_BUNDLER_URL),
});

// ============================================
// TYPES
// ============================================

interface WalletData {
  userAddress: Address;
  smartAccountAddress: Address;
  iteration: number;
}

interface BalanceCheckResult {
  wallet: string;
  iteration: number;
  usdcBalance: string;
  ethBalance: string;
  duration: number;
  error?: string;
}

interface QuoteFetchResult {
  wallet: string;
  iteration: number;
  quoteAmount: string;
  duration: number;
  error?: string;
}

interface UserOpEstimateResult {
  wallet: string;
  iteration: number;
  gasLimit: string;
  duration: number;
  error?: string;
}

interface PhaseResult {
  phase: string;
  totalTime: number;
  successCount: number;
  errorCount: number;
  avgTimePerCall: number;
  rateLimitHits: number;
  errors: Array<{ wallet: string; error: string }>;
}

interface StressTestReport {
  timestamp: string;
  totalSimulatedWallets: number;
  phases: PhaseResult[];
  summary: {
    totalTime: number;
    totalRateLimitHits: number;
    estimatedTimeFor1000RealWallets: number;
  };
}

// ============================================
// UTILITIES
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function isRateLimitError(error: any): boolean {
  const msg = String(error).toLowerCase();
  return msg.includes('rate limit') ||
         msg.includes('429') ||
         msg.includes('too many requests') ||
         msg.includes('throttled');
}

// Split array into batches
function createBatches<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

// Generic batch processor with delay
async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  processor: (batch: T[]) => Promise<R[]>,
  onBatchComplete?: (batchIndex: number, totalBatches: number, batchResults: R[]) => void
): Promise<R[]> {
  const batches = createBatches(items, batchSize);
  const allResults: R[] = [];

  console.log(`  Processing ${items.length} items in ${batches.length} batches of ${batchSize}...`);
  console.log(`  Delay between batches: ${delayMs}ms`);
  console.log('');

  for (let i = 0; i < batches.length; i++) {
    const batchStart = Date.now();
    const batch = batches[i];

    console.log(`  [Batch ${i + 1}/${batches.length}] Processing ${batch.length} items...`);

    const batchResults = await processor(batch);
    allResults.push(...batchResults);

    const batchDuration = Date.now() - batchStart;
    const successCount = batchResults.filter((r: any) => !r.error).length;

    console.log(`  [Batch ${i + 1}/${batches.length}] Complete: ${successCount}/${batch.length} success in ${formatDuration(batchDuration)}`);

    if (onBatchComplete) {
      onBatchComplete(i, batches.length, batchResults);
    }

    // Add delay between batches (but not after the last batch)
    if (i < batches.length - 1) {
      await sleep(delayMs);
    }
  }

  return allResults;
}

// ============================================
// WALLET GENERATION
// ============================================

async function getRealWallets(): Promise<{ userAddress: Address; smartAccountAddress: Address }[]> {
  const { data, error } = await supabase
    .from('delegations')
    .select('user_address, smart_account_address')
    .limit(10);

  if (error) {
    console.error('Database error:', error);
    return [];
  }

  return (data || []).map(d => ({
    userAddress: d.user_address as Address,
    smartAccountAddress: d.smart_account_address as Address,
  }));
}

function generateSimulatedWallets(realWallets: { userAddress: Address; smartAccountAddress: Address }[]): WalletData[] {
  const simulated: WalletData[] = [];

  for (let i = 0; i < WALLETS_PER_SIMULATION; i++) {
    for (const wallet of realWallets) {
      simulated.push({
        userAddress: wallet.userAddress,
        smartAccountAddress: wallet.smartAccountAddress,
        iteration: i + 1,
      });
    }
  }

  return simulated;
}

// ============================================
// PHASE 1: ALCHEMY RPC BALANCE CHECKS (BATCHED)
// ============================================

async function checkBalancesBatched(wallets: WalletData[]): Promise<PhaseResult> {
  console.log('\n========================================');
  console.log(`  PHASE 1: Alchemy RPC Balance Checks`);
  console.log(`  Checking ${wallets.length} wallets with batching...`);
  console.log('========================================\n');

  const startTime = Date.now();
  let rateLimitHits = 0;
  const allErrors: Array<{ wallet: string; error: string }> = [];
  const allResults: BalanceCheckResult[] = [];

  // Process each batch
  const processBatch = async (batch: WalletData[]): Promise<BalanceCheckResult[]> => {
    const batchResults: BalanceCheckResult[] = [];

    const promises = batch.map(async (wallet) => {
      const callStart = Date.now();
      try {
        const [usdcBalance, ethBalance] = await Promise.all([
          publicClient.readContract({
            address: ADDRESSES.USDC,
            abi: [
              { name: 'balanceOf', type: 'function', stateMutability: 'view',
                inputs: [{ name: 'account', type: 'address' }],
                outputs: [{ name: '', type: 'uint256' }] }
            ],
            functionName: 'balanceOf',
            args: [wallet.smartAccountAddress],
          }),
          publicClient.getBalance({ address: wallet.smartAccountAddress }),
        ]);

        const duration = Date.now() - callStart;
        return {
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          usdcBalance: formatUnits(usdcBalance, 6),
          ethBalance: formatUnits(ethBalance, 18),
          duration,
        };
      } catch (error: any) {
        const duration = Date.now() - callStart;
        const errorMsg = error?.message || String(error);

        if (isRateLimitError(error)) {
          rateLimitHits++;
        }

        allErrors.push({ wallet: wallet.smartAccountAddress, error: errorMsg });
        return {
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          usdcBalance: '0',
          ethBalance: '0',
          duration,
          error: errorMsg,
        };
      }
    });

    const results = await Promise.all(promises);
    batchResults.push(...results);
    return batchResults;
  };

  // Process all batches with delay between them
  const batches = createBatches(wallets, BATCH_SIZE);
  console.log(`  Processing ${wallets.length} wallets in ${batches.length} batches of ${BATCH_SIZE}...`);
  console.log(`  Delay between batches: ${BATCH_DELAY_MS}ms`);
  console.log('');

  for (let i = 0; i < batches.length; i++) {
    const batchStart = Date.now();
    const batch = batches[i];

    console.log(`  [Batch ${i + 1}/${batches.length}] Processing ${batch.length} wallets...`);

    const batchResults = await processBatch(batch);
    allResults.push(...batchResults);

    const batchDuration = Date.now() - batchStart;
    const batchSuccessCount = batchResults.filter(r => !r.error).length;

    console.log(`  [Batch ${i + 1}/${batches.length}] Complete: ${batchSuccessCount}/${batch.length} success in ${formatDuration(batchDuration)}`);

    // Add delay between batches (but not after the last batch)
    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const totalTime = Date.now() - startTime;
  const successCount = allResults.filter(r => !r.error).length;
  const errorCount = allResults.filter(r => r.error).length;
  const avgTimePerCall = allResults.reduce((acc, r) => acc + r.duration, 0) / allResults.length;

  // Sample output
  console.log(`\nSample results (first 5):`);
  allResults.slice(0, 5).forEach(r => {
    if (r.error) {
      console.log(`  ${r.wallet.slice(0, 10)}... (iter ${r.iteration}): ERROR - ${r.error.slice(0, 50)}`);
    } else {
      console.log(`  ${r.wallet.slice(0, 10)}... (iter ${r.iteration}): USDC=${r.usdcBalance.slice(0, 8)} ETH=${r.ethBalance.slice(0, 8)} (${r.duration}ms)`);
    }
  });

  console.log(`\nPhase 1 Summary:`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  console.log(`  Success: ${successCount}/${wallets.length}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Rate limit hits: ${rateLimitHits}`);
  console.log(`  Avg time/call: ${avgTimePerCall.toFixed(0)}ms`);

  return {
    phase: 'Alchemy RPC Balance Checks',
    totalTime,
    successCount,
    errorCount,
    avgTimePerCall,
    rateLimitHits,
    errors: allErrors.slice(0, 10),
  };
}

// ============================================
// PHASE 2: COINGECKO API PRICE FETCH (BATCHED)
// ============================================

async function fetchPricesBatched(wallets: WalletData[]): Promise<PhaseResult> {
  console.log('\n========================================');
  console.log(`  PHASE 2: CoinGecko API Price Fetch`);
  console.log(`  Fetching ETH price ${wallets.length} times with batching...`);
  console.log('========================================\n');

  const startTime = Date.now();
  let rateLimitHits = 0;
  const allErrors: Array<{ wallet: string; error: string }> = [];
  const allResults: Array<{ wallet: string; iteration: number; price: number; duration: number; error?: string }> = [];

  const processBatch = async (batch: WalletData[]) => {
    const batchResults: Array<{ wallet: string; iteration: number; price: number; duration: number; error?: string }> = [];

    const promises = batch.map(async (wallet) => {
      const callStart = Date.now();
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const duration = Date.now() - callStart;

        if (response.status === 429) {
          rateLimitHits++;
          throw new Error(`Rate limited (429)`);
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const price = data.ethereum?.usd || 0;

        return {
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          price,
          duration,
        };
      } catch (error: any) {
        const duration = Date.now() - callStart;
        const errorMsg = error?.message || String(error);

        if (isRateLimitError(error) || errorMsg.includes('429')) {
          rateLimitHits++;
        }

        allErrors.push({ wallet: wallet.smartAccountAddress, error: errorMsg });
        return {
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          price: 0,
          duration,
          error: errorMsg,
        };
      }
    });

    const results = await Promise.all(promises);
    batchResults.push(...results);
    return batchResults;
  };

  // Process all batches with delay
  const batches = createBatches(wallets, BATCH_SIZE);
  console.log(`  Processing ${wallets.length} wallets in ${batches.length} batches of ${BATCH_SIZE}...`);
  console.log(`  Delay between batches: ${BATCH_DELAY_MS}ms`);
  console.log('');

  for (let i = 0; i < batches.length; i++) {
    const batchStart = Date.now();
    const batch = batches[i];

    console.log(`  [Batch ${i + 1}/${batches.length}] Processing ${batch.length} calls...`);

    const batchResults = await processBatch(batch);
    allResults.push(...batchResults);

    const batchDuration = Date.now() - batchStart;
    const batchSuccessCount = batchResults.filter(r => !r.error).length;

    console.log(`  [Batch ${i + 1}/${batches.length}] Complete: ${batchSuccessCount}/${batch.length} success in ${formatDuration(batchDuration)}`);

    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const totalTime = Date.now() - startTime;
  const successCount = allResults.filter(r => !r.error).length;
  const errorCount = allResults.filter(r => r.error).length;
  const avgTimePerCall = allResults.reduce((acc, r) => acc + r.duration, 0) / allResults.length;

  // Sample output
  console.log(`\nSample results (first 5):`);
  allResults.slice(0, 5).forEach(r => {
    if (r.error) {
      console.log(`  ${r.wallet.slice(0, 10)}... (iter ${r.iteration}): ERROR - ${r.error.slice(0, 50)}`);
    } else {
      console.log(`  ${r.wallet.slice(0, 10)}... (iter ${r.iteration}): ETH=$${r.price} (${r.duration}ms)`);
    }
  });

  console.log(`\nPhase 2 Summary:`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  console.log(`  Success: ${successCount}/${wallets.length}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Rate limit hits: ${rateLimitHits}`);
  console.log(`  Avg time/call: ${avgTimePerCall.toFixed(0)}ms`);

  return {
    phase: 'CoinGecko API Price Fetch',
    totalTime,
    successCount,
    errorCount,
    avgTimePerCall,
    rateLimitHits,
    errors: allErrors.slice(0, 10),
  };
}

// ============================================
// PHASE 3: UNISWAP TRADING API QUOTE FETCH (BATCHED)
// ============================================

async function fetchSwapQuotesBatched(wallets: WalletData[]): Promise<PhaseResult> {
  console.log('\n========================================');
  console.log(`  PHASE 3: Uniswap Trading API Quote Fetch`);
  console.log(`  Fetching swap quotes for ${wallets.length} wallets with batching...`);
  console.log('  NOTE: Quotes only, no execution');
  console.log('========================================\n');

  const startTime = Date.now();
  let rateLimitHits = 0;
  const allErrors: Array<{ wallet: string; error: string }> = [];
  const allResults: QuoteFetchResult[] = [];

  // Use a small test amount (1 USDC)
  const testAmount = '1000000'; // 1 USDC in 6 decimals

  const processBatch = async (batch: WalletData[]) => {
    const batchResults: QuoteFetchResult[] = [];

    const promises = batch.map(async (wallet) => {
      const callStart = Date.now();
      try {
        const response = await fetch(`${TRADING_API}/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.UNISWAP_API_KEY!,
          },
          body: JSON.stringify({
            swapper: wallet.smartAccountAddress,
            tokenIn: ADDRESSES.USDC,
            tokenOut: ADDRESSES.WETH,
            tokenInChainId: CHAIN_ID,
            tokenOutChainId: CHAIN_ID,
            amount: testAmount,
            type: 'EXACT_INPUT',
            slippageTolerance: 1,
          }),
        });

        const duration = Date.now() - callStart;

        if (response.status === 429) {
          rateLimitHits++;
          throw new Error(`Rate limited (429)`);
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown' }));
          throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
        }

        const data = await response.json();
        const quoteAmount = data.quote?.output?.amount || '0';

        return {
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          quoteAmount: formatUnits(BigInt(quoteAmount), 18),
          duration,
        };
      } catch (error: any) {
        const duration = Date.now() - callStart;
        const errorMsg = error?.message || String(error);

        if (isRateLimitError(error) || errorMsg.includes('429')) {
          rateLimitHits++;
        }

        allErrors.push({ wallet: wallet.smartAccountAddress, error: errorMsg });
        return {
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          quoteAmount: '0',
          duration,
          error: errorMsg,
        };
      }
    });

    const results = await Promise.all(promises);
    batchResults.push(...results);
    return batchResults;
  };

  // Process all batches with delay
  const batches = createBatches(wallets, BATCH_SIZE);
  console.log(`  Processing ${wallets.length} wallets in ${batches.length} batches of ${BATCH_SIZE}...`);
  console.log(`  Delay between batches: ${BATCH_DELAY_MS}ms`);
  console.log('');

  for (let i = 0; i < batches.length; i++) {
    const batchStart = Date.now();
    const batch = batches[i];

    console.log(`  [Batch ${i + 1}/${batches.length}] Processing ${batch.length} quotes...`);

    const batchResults = await processBatch(batch);
    allResults.push(...batchResults);

    const batchDuration = Date.now() - batchStart;
    const batchSuccessCount = batchResults.filter(r => !r.error).length;

    console.log(`  [Batch ${i + 1}/${batches.length}] Complete: ${batchSuccessCount}/${batch.length} success in ${formatDuration(batchDuration)}`);

    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const totalTime = Date.now() - startTime;
  const successCount = allResults.filter(r => !r.error).length;
  const errorCount = allResults.filter(r => r.error).length;
  const avgTimePerCall = allResults.reduce((acc, r) => acc + r.duration, 0) / allResults.length;

  // Sample output
  console.log(`\nSample results (first 5):`);
  allResults.slice(0, 5).forEach(r => {
    if (r.error) {
      console.log(`  ${r.wallet.slice(0, 10)}... (iter ${r.iteration}): ERROR - ${r.error.slice(0, 50)}`);
    } else {
      console.log(`  ${r.wallet.slice(0, 10)}... (iter ${r.iteration}): Quote=${r.quoteAmount.slice(0, 10)} WETH (${r.duration}ms)`);
    }
  });

  console.log(`\nPhase 3 Summary:`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  console.log(`  Success: ${successCount}/${wallets.length}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Rate limit hits: ${rateLimitHits}`);
  console.log(`  Avg time/call: ${avgTimePerCall.toFixed(0)}ms`);

  return {
    phase: 'Uniswap Trading API Quote Fetch',
    totalTime,
    successCount,
    errorCount,
    avgTimePerCall,
    rateLimitHits,
    errors: allErrors.slice(0, 10),
  };
}

// ============================================
// PHASE 4: PIMLICO BUNDLER API TEST (WITH JSON-RPC BATCHING)
// ============================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: any[];
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

async function testPimlicoBundlerBatched(wallets: WalletData[]): Promise<PhaseResult> {
  console.log('\n========================================');
  console.log(`  PHASE 4: Pimlico Bundler API Test (JSON-RPC Batched)`);
  console.log(`  Testing ${wallets.length} Pimlico API calls with batching...`);
  console.log('  NOTE: Testing gas price estimation (pimlico_getUserOperationGasPrice)');
  console.log('  Sending 50 calls per HTTP request using JSON-RPC batching');
  console.log('========================================\n');

  const startTime = Date.now();
  let rateLimitHits = 0;
  const allErrors: Array<{ wallet: string; error: string }> = [];
  const allResults: Array<{ wallet: string; iteration: number; gasPrice: string; duration: number; error?: string }> = [];

  // Process batches with JSON-RPC batching (50 calls per HTTP request)
  const batches = createBatches(wallets, BATCH_SIZE);
  console.log(`  Processing ${wallets.length} wallets in ${batches.length} batches of ${BATCH_SIZE}...`);
  console.log(`  Each batch = 1 HTTP request with ${BATCH_SIZE} JSON-RPC calls`);
  console.log(`  Delay between batches: ${BATCH_DELAY_MS}ms`);
  console.log('');

  for (let i = 0; i < batches.length; i++) {
    const batchStart = Date.now();
    const batch = batches[i];

    console.log(`  [Batch ${i + 1}/${batches.length}] Sending ${batch.length} JSON-RPC calls in single HTTP request...`);

    // Build JSON-RPC batch request (all calls in one HTTP request)
    const requests: JsonRpcRequest[] = batch.map((wallet, idx) => ({
      jsonrpc: '2.0',
      method: 'pimlico_getUserOperationGasPrice',
      params: [],
      id: i * BATCH_SIZE + idx + 1, // Unique ID for each request
    }));

    try {
      // Send SINGLE HTTP request with batched JSON-RPC calls
      const response = await fetch(PIMLICO_BUNDLER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
      });

      const requestDuration = Date.now() - batchStart;

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  [Batch ${i + 1}] HTTP error ${response.status}: ${errorText.slice(0, 100)}`);
        rateLimitHits++;

        // Mark all in batch as failed
        for (const wallet of batch) {
          allErrors.push({ wallet: wallet.smartAccountAddress, error: `HTTP ${response.status}` });
          allResults.push({
            wallet: wallet.smartAccountAddress,
            iteration: wallet.iteration,
            gasPrice: '0',
            duration: requestDuration,
            error: `HTTP ${response.status}`,
          });
        }
      } else {
        // Parse batched response
        const responses: JsonRpcResponse[] = await response.json();

        // Map responses back to wallets
        for (let j = 0; j < batch.length; j++) {
          const wallet = batch[j];
          const resp = responses.find(r => r.id === (i * BATCH_SIZE + j + 1));

          if (!resp) {
            allErrors.push({ wallet: wallet.smartAccountAddress, error: 'No response' });
            allResults.push({
              wallet: wallet.smartAccountAddress,
              iteration: wallet.iteration,
              gasPrice: '0',
              duration: requestDuration,
              error: 'No response',
            });
          } else if (resp.error) {
            const errorMsg = resp.error.message || `JSON-RPC error ${resp.error.code}`;
            if (errorMsg.toLowerCase().includes('rate limit') || resp.error.code === 429) {
              rateLimitHits++;
            }
            allErrors.push({ wallet: wallet.smartAccountAddress, error: errorMsg });
            allResults.push({
              wallet: wallet.smartAccountAddress,
              iteration: wallet.iteration,
              gasPrice: '0',
              duration: requestDuration,
              error: errorMsg,
            });
          } else {
            const gasPrice = resp.result?.fast?.maxFeePerGas || '0';
            allResults.push({
              wallet: wallet.smartAccountAddress,
              iteration: wallet.iteration,
              gasPrice: BigInt(gasPrice).toString(),
              duration: requestDuration,
            });
          }
        }
      }

      const batchDuration = Date.now() - batchStart;
      const batchSuccessCount = batch.filter((_, j) => {
        const resp = allResults[allResults.length - batch.length + j];
        return !resp.error;
      }).length;

      console.log(`  [Batch ${i + 1}/${batches.length}] Complete: ${batchSuccessCount}/${batch.length} success in ${formatDuration(batchDuration)} (${requestDuration}ms HTTP time)`);

    } catch (error: any) {
      const batchDuration = Date.now() - batchStart;
      const errorMsg = error?.message || 'Network error';
      console.error(`  [Batch ${i + 1}] Network error: ${errorMsg}`);

      // Mark all in batch as failed
      for (const wallet of batch) {
        allErrors.push({ wallet: wallet.smartAccountAddress, error: errorMsg });
        allResults.push({
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          gasPrice: '0',
          duration: batchDuration,
          error: errorMsg,
        });
      }
    }

    // Add delay between batches (but not after the last batch)
    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const totalTime = Date.now() - startTime;
  const successCount = allResults.filter(r => !r.error).length;
  const errorCount = allResults.filter(r => r.error).length;
  const avgTimePerCall = allResults.reduce((acc, r) => acc + r.duration, 0) / allResults.length;

  // Sample output
  console.log(`\nSample results (first 5):`);
  allResults.slice(0, 5).forEach(r => {
    if (r.error) {
      console.log(`  ${r.wallet.slice(0, 10)}... (iter ${r.iteration}): ERROR - ${r.error.slice(0, 50)}`);
    } else {
      const gwei = (BigInt(r.gasPrice) / BigInt(1e9)).toString();
      console.log(`  ${r.wallet.slice(0, 10)}... (iter ${r.iteration}): GasPrice=${gwei} gwei (${r.duration}ms)`);
    }
  });

  console.log(`\nPhase 4 Summary:`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  console.log(`  Success: ${successCount}/${wallets.length}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Rate limit hits: ${rateLimitHits}`);
  console.log(`  Avg time/call: ${avgTimePerCall.toFixed(0)}ms`);
  console.log(`  HTTP requests: ${batches.length} (vs ${wallets.length} individual calls)`);
  console.log(`  Efficiency gain: ${(wallets.length / batches.length).toFixed(0)}x fewer HTTP requests`);

  return {
    phase: 'Pimlico Bundler API Test (JSON-RPC Batched)',
    totalTime,
    successCount,
    errorCount,
    avgTimePerCall,
    rateLimitHits,
    errors: allErrors.slice(0, 10),
  };
}

// ============================================
// REPORT GENERATION
// ============================================

function generateReport(phases: PhaseResult[]): StressTestReport {
  const totalTime = phases.reduce((acc, p) => acc + p.totalTime, 0);
  const totalRateLimitHits = phases.reduce((acc, p) => acc + p.rateLimitHits, 0);

  // Estimate time for 1000 real wallets based on our findings
  // We ran 1000 simulated wallets (100x10) with batching
  // Add 20% overhead for real-world variance
  const estimatedTimeFor1000Real = Math.round(totalTime * 1.2);

  return {
    timestamp: new Date().toISOString(),
    totalSimulatedWallets: phases[0]?.successCount + phases[0]?.errorCount || 0,
    phases,
    summary: {
      totalTime,
      totalRateLimitHits,
      estimatedTimeFor1000RealWallets: estimatedTimeFor1000Real,
    },
  };
}

function printFinalReport(report: StressTestReport) {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           DCA EXECUTOR STRESS TEST - FINAL REPORT               ║');
  console.log('║           1000 Wallets | Batch Size: 50 | Delay: 500ms          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Total Simulated Wallets: ${report.totalSimulatedWallets}`);
  console.log('');

  console.log('┌──────────────────────────────────────────────────────────────────┐');
  console.log('│ PHASE RESULTS                                                    │');
  console.log('├──────────────────────────────────────────────────────────────────┤');

  report.phases.forEach((phase, idx) => {
    console.log(`│ ${idx + 1}. ${phase.phase.padEnd(61)} │`);
    console.log(`│    Time: ${formatDuration(phase.totalTime).padEnd(10)} | Success: ${phase.successCount.toString().padEnd(4)}/${(phase.successCount + phase.errorCount).toString().padEnd(4)} | Rate Limits: ${phase.rateLimitHits.toString().padEnd(3)} │`);
    console.log(`│    Avg/call: ${formatDuration(phase.avgTimePerCall).padEnd(8)}                                       │`);
    if (phase.errors.length > 0) {
      console.log(`│    ⚠️  Sample errors (first ${phase.errors.length.toString().padEnd(2)}):                               │`);
      phase.errors.slice(0, 3).forEach(e => {
        const shortError = e.error.slice(0, 45).padEnd(45);
        console.log(`│       ${e.wallet.slice(0, 10)}...: ${shortError} │`);
      });
    }
    console.log('├──────────────────────────────────────────────────────────────────┤');
  });

  console.log('│ SUMMARY                                                          │');
  console.log('├──────────────────────────────────────────────────────────────────┤');
  console.log(`│ Total Time: ${formatDuration(report.summary.totalTime).padEnd(48)} │`);
  console.log(`│ Total Rate Limit Hits: ${report.summary.totalRateLimitHits.toString().padEnd(36)} │`);
  console.log(`│                                                                  │`);
  console.log(`│ ⏱️  ESTIMATED TIME FOR 1000 REAL WALLETS: ${formatDuration(report.summary.estimatedTimeFor1000RealWallets).padEnd(24)} │`);
  console.log('└──────────────────────────────────────────────────────────────────┘');
  console.log('');

  // Recommendations
  console.log('RECOMMENDATIONS:');
  if (report.summary.totalRateLimitHits > 10) {
    console.log('  ⚠️  High rate limit hits detected. Consider adding delays between batches.');
  } else if (report.summary.totalRateLimitHits > 0) {
    console.log(`  ⚡ Some rate limits hit (${report.summary.totalRateLimitHits}). Batching is helping but consider increasing delay.`);
  }

  const avgQuoteTime = report.phases.find(p => p.phase.includes('Uniswap'))?.avgTimePerCall || 0;
  if (avgQuoteTime > 2000) {
    console.log('  ⚠️  Uniswap API responses are slow. Consider caching quotes or using batch API.');
  }

  const pimlicoTime = report.phases.find(p => p.phase.includes('Pimlico'))?.avgTimePerCall || 0;
  if (pimlicoTime > 1000) {
    console.log('  ⚠️  Pimlico bundler latency is high. Consider parallelizing with unique nonce keys.');
  }

  if (report.summary.totalRateLimitHits === 0) {
    console.log('  ✅ No rate limit issues detected! Batch size 50 with 500ms delay handles 1000 wallets.');
  }

  console.log('');
}

// ============================================
// MAIN EXECUTION
// ============================================

async function runStressTest() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           DCA EXECUTOR STRESS TEST                               ║');
  console.log('║           Simulating 1000 Wallets (100x real wallets)            ║');
  console.log('║           Batch Size: 50 | Delay: 500ms                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  // 1. Get real wallets
  console.log('Fetching real wallets from database...');
  const realWallets = await getRealWallets();

  if (realWallets.length === 0) {
    console.error('No wallets found in database. Aborting.');
    process.exit(1);
  }

  console.log(`Found ${realWallets.length} real wallets`);
  console.log('Real wallets:');
  realWallets.forEach((w, i) => {
    console.log(`  ${i + 1}. ${w.smartAccountAddress}`);
  });

  // 2. Generate simulated wallets (100x each = 1000 wallets)
  const simulatedWallets = generateSimulatedWallets(realWallets);
  console.log(`\nGenerated ${simulatedWallets.length} simulated wallets (${WALLETS_PER_SIMULATION}x multiplier)`);
  console.log(`Batch configuration: ${BATCH_SIZE} per batch, ${BATCH_DELAY_MS}ms delay`);
  console.log(`Total batches per phase: ${Math.ceil(simulatedWallets.length / BATCH_SIZE)}`);

  // 3. Run stress tests
  const phases: PhaseResult[] = [];

  // Phase 1: Alchemy RPC Balance Checks
  phases.push(await checkBalancesBatched(simulatedWallets));

  // Small delay between phases
  await sleep(2000);

  // Phase 2: CoinGecko API Price Fetch
  phases.push(await fetchPricesBatched(simulatedWallets));

  // Small delay between phases
  await sleep(2000);

  // Phase 3: Uniswap Trading API Quote Fetch
  phases.push(await fetchSwapQuotesBatched(simulatedWallets));

  // Small delay between phases
  await sleep(2000);

  // Phase 4: Pimlico Bundler API Test
  phases.push(await testPimlicoBundlerBatched(simulatedWallets));

  // 4. Generate and print report
  const report = generateReport(phases);
  printFinalReport(report);

  // 5. Save report to file
  const reportPath = './stress-test-report.json';
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Full report saved to: ${reportPath}`);

  return report;
}

// Run the stress test
runStressTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
