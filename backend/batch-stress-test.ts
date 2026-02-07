/**
 * DCA Executor Batch Stress Test
 * Tests 100 wallets with different batch sizes to measure:
 * - Uniswap Trading API quote fetching time and success rate
 * - Total execution time
 * - Number of timeouts/errors
 * 
 * Test 1: 100 wallets in batches of 25 (4 batches, sequential)
 * Test 2: 100 wallets in batches of 50 (2 batches, sequential)
 */

import { createPublicClient, http, formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { readFileSync } from 'fs';

// ============================================
// LOAD ENV VARS FROM ~/.config/ember-treasury/.keys
// ============================================
function loadEnvVars() {
  try {
    const envContent = readFileSync(process.env.HOME + '/.config/ember-treasury/.keys', 'utf8');
    envContent.split('\n').forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine || cleanLine.startsWith('#')) return;
      
      const withoutExport = cleanLine.replace(/^export\s+/, '');
      
      const [key, ...valueParts] = withoutExport.split('=');
      if (key && valueParts.length > 0) {
        let value = valueParts.join('=').trim();
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
} as const;

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

// ============================================
// TYPES
// ============================================

interface WalletData {
  userAddress: Address;
  smartAccountAddress: Address;
  iteration: number;
}

interface QuoteResult {
  wallet: string;
  iteration: number;
  quoteAmount: string;
  ethPrice?: number;  // Derived ETH price from quote
  duration: number;
  error?: string;
}

interface BatchTestResult {
  batchSize: number;
  numBatches: number;
  totalWallets: number;
  phase: string;
  totalTime: number;
  batchTimes: number[];
  successCount: number;
  errorCount: number;
  avgTimePerCall: number;
  timeout504Count: number;
  otherErrors: number;
  errors: Array<{ wallet: string; error: string }>;
  ethPriceDerived?: number;  // Average ETH price from quotes
}

interface ComprehensiveReport {
  timestamp: string;
  uniswapTests: {
    batch25: BatchTestResult;
    batch50: BatchTestResult;
    parallel100: BatchTestResult;
  };
  coingeckoTest: {
    totalTime: number;
    successCount: number;
    errorCount: number;
    rateLimitHits: number;
  };
  priceComparison: {
    canEliminateCoinGecko: boolean;
    coingeckoPrice: number | null;
    uniswapDerivedPrice: number | null;
    priceDifference: number | null;
    recommendation: string;
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

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
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
  const WALLETS_PER_SIMULATION = 10;
  
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
// UNISWAP QUOTE FETCHING - BATCHED
// ============================================

async function fetchSwapQuotesBatched(
  wallets: WalletData[], 
  batchSize: number
): Promise<BatchTestResult> {
  const numBatches = Math.ceil(wallets.length / batchSize);
  
  console.log(`\n========================================`);
  console.log(`  UNISWAP QUOTES - BATCH SIZE ${batchSize}`);
  console.log(`  ${wallets.length} wallets in ${numBatches} batches`);
  console.log(`  Mode: Sequential batches`);
  console.log(`========================================\n`);
  
  const testAmount = '1000000'; // 1 USDC in 6 decimals
  const allResults: QuoteResult[] = [];
  const batchTimes: number[] = [];
  let timeout504Count = 0;
  let otherErrors = 0;
  const errors: Array<{ wallet: string; error: string }> = [];
  
  const chunks = chunkArray(wallets, batchSize);
  
  for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
    const batch = chunks[batchIndex];
    const batchStart = Date.now();
    
    console.log(`Batch ${batchIndex + 1}/${numBatches} (${batch.length} wallets)...`);
    
    // Process batch in parallel
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
        
        if (response.status === 504) {
          timeout504Count++;
          throw new Error(`HTTP 504: Gateway Timeout`);
        }
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown' }));
          throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        const quoteAmount = data.quote?.output?.amount || '0';
        
        // Derive ETH price from quote: 1 USDC / WETH received = ETH price in USD
        const wethReceived = parseFloat(formatUnits(BigInt(quoteAmount), 18));
        const ethPrice = wethReceived > 0 ? 1 / wethReceived : 0;
        
        return {
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          quoteAmount: formatUnits(BigInt(quoteAmount), 18),
          ethPrice,
          duration,
        };
      } catch (error: any) {
        const duration = Date.now() - callStart;
        const errorMsg = error?.message || String(error);
        
        if (!errorMsg.includes('504')) {
          otherErrors++;
        }
        
        errors.push({ wallet: wallet.smartAccountAddress, error: errorMsg });
        return {
          wallet: wallet.smartAccountAddress,
          iteration: wallet.iteration,
          quoteAmount: '0',
          duration,
          error: errorMsg,
        };
      }
    });
    
    const batchResults = await Promise.all(promises);
    allResults.push(...batchResults);
    
    const batchTime = Date.now() - batchStart;
    batchTimes.push(batchTime);
    
    const batchSuccesses = batchResults.filter(r => !r.error).length;
    const batch504s = batchResults.filter(r => r.error?.includes('504')).length;
    
    console.log(`  Batch ${batchIndex + 1} complete: ${batchSuccesses}/${batch.length} success, ${batch504s} timeouts, ${formatDuration(batchTime)}`);
    
    // Small delay between batches to be nice to the API
    if (batchIndex < chunks.length - 1) {
      await sleep(500);
    }
  }
  
  const totalTime = batchTimes.reduce((a, b) => a + b, 0);
  const successCount = allResults.filter(r => !r.error).length;
  const errorCount = allResults.filter(r => r.error).length;
  const avgTimePerCall = allResults.reduce((acc, r) => acc + r.duration, 0) / allResults.length;
  
  // Calculate average ETH price from successful quotes
  const successfulQuotes = allResults.filter(r => r.ethPrice && r.ethPrice > 0);
  const avgEthPrice = successfulQuotes.length > 0
    ? successfulQuotes.reduce((acc, r) => acc + (r.ethPrice || 0), 0) / successfulQuotes.length
    : 0;
  
  console.log(`\nSummary for Batch Size ${batchSize}:`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  console.log(`  Batch times: ${batchTimes.map(t => formatDuration(t)).join(', ')}`);
  console.log(`  Success: ${successCount}/${wallets.length}`);
  console.log(`  504 Timeouts: ${timeout504Count}`);
  console.log(`  Other errors: ${otherErrors}`);
  console.log(`  Avg time/call: ${avgTimePerCall.toFixed(0)}ms`);
  console.log(`  Derived ETH price (avg): $${avgEthPrice.toFixed(2)}`);
  
  return {
    batchSize,
    numBatches,
    totalWallets: wallets.length,
    phase: `Uniswap Quotes - Batch Size ${batchSize}`,
    totalTime,
    batchTimes,
    successCount,
    errorCount,
    avgTimePerCall,
    timeout504Count,
    otherErrors,
    errors: errors.slice(0, 10),
    ethPriceDerived: avgEthPrice,
  };
}

// ============================================
// UNISWAP QUOTE FETCHING - PARALLEL (BASELINE)
// ============================================

async function fetchSwapQuotesParallel(wallets: WalletData[]): Promise<BatchTestResult> {
  console.log(`\n========================================`);
  console.log(`  UNISWAP QUOTES - PARALLEL (ALL 100)`);
  console.log(`  ${wallets.length} wallets simultaneously`);
  console.log(`========================================\n`);
  
  const testAmount = '1000000'; // 1 USDC
  const startTime = Date.now();
  const results: QuoteResult[] = [];
  let timeout504Count = 0;
  let otherErrors = 0;
  const errors: Array<{ wallet: string; error: string }> = [];
  
  const promises = wallets.map(async (wallet) => {
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
      
      if (response.status === 504) {
        timeout504Count++;
        throw new Error(`HTTP 504: Gateway Timeout`);
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown' }));
        throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
      }
      
      const data = await response.json();
      const quoteAmount = data.quote?.output?.amount || '0';
      
      const wethReceived = parseFloat(formatUnits(BigInt(quoteAmount), 18));
      const ethPrice = wethReceived > 0 ? 1 / wethReceived : 0;
      
      return {
        wallet: wallet.smartAccountAddress,
        iteration: wallet.iteration,
        quoteAmount: formatUnits(BigInt(quoteAmount), 18),
        ethPrice,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - callStart;
      const errorMsg = error?.message || String(error);
      
      if (!errorMsg.includes('504')) {
        otherErrors++;
      }
      
      errors.push({ wallet: wallet.smartAccountAddress, error: errorMsg });
      return {
        wallet: wallet.smartAccountAddress,
        iteration: wallet.iteration,
        quoteAmount: '0',
        duration,
        error: errorMsg,
      };
    }
  });
  
  const allResults = await Promise.all(promises);
  results.push(...allResults);
  
  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  const avgTimePerCall = results.reduce((acc, r) => acc + r.duration, 0) / results.length;
  
  const successfulQuotes = results.filter(r => r.ethPrice && r.ethPrice > 0);
  const avgEthPrice = successfulQuotes.length > 0
    ? successfulQuotes.reduce((acc, r) => acc + (r.ethPrice || 0), 0) / successfulQuotes.length
    : 0;
  
  console.log(`\nSummary for Parallel (100):`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  console.log(`  Success: ${successCount}/${wallets.length}`);
  console.log(`  504 Timeouts: ${timeout504Count}`);
  console.log(`  Other errors: ${otherErrors}`);
  console.log(`  Avg time/call: ${avgTimePerCall.toFixed(0)}ms`);
  console.log(`  Derived ETH price (avg): $${avgEthPrice.toFixed(2)}`);
  
  return {
    batchSize: wallets.length,
    numBatches: 1,
    totalWallets: wallets.length,
    phase: `Uniswap Quotes - Parallel (All ${wallets.length})`,
    totalTime,
    batchTimes: [totalTime],
    successCount,
    errorCount,
    avgTimePerCall,
    timeout504Count,
    otherErrors,
    errors: errors.slice(0, 10),
    ethPriceDerived: avgEthPrice,
  };
}

// ============================================
// COINGECKO PRICE FETCH (FOR COMPARISON)
// ============================================

async function fetchCoingeckoPrice(): Promise<{ price: number | null; rateLimitHit: boolean }> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    
    if (response.status === 429) {
      return { price: null, rateLimitHit: true };
    }
    
    if (!response.ok) {
      return { price: null, rateLimitHit: false };
    }
    
    const data = await response.json();
    return { price: data.ethereum?.usd || null, rateLimitHit: false };
  } catch (error) {
    return { price: null, rateLimitHit: false };
  }
}

async function testCoingeckoWithRateLimit(): Promise<{ totalTime: number; successCount: number; errorCount: number; rateLimitHits: number; price: number | null }> {
  console.log(`\n========================================`);
  console.log(`  COINGECKO API TEST`);
  console.log(`  Fetching ETH price 10 times`);
  console.log(`========================================\n`);
  
  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;
  let rateLimitHits = 0;
  let lastPrice: number | null = null;
  
  // Only test 10 calls to not get completely rate limited
  for (let i = 0; i < 10; i++) {
    const result = await fetchCoingeckoPrice();
    
    if (result.rateLimitHit) {
      rateLimitHits++;
      errorCount++;
      console.log(`  Call ${i + 1}: RATE LIMITED (429)`);
    } else if (result.price) {
      successCount++;
      lastPrice = result.price;
      console.log(`  Call ${i + 1}: ETH = $${result.price}`);
    } else {
      errorCount++;
      console.log(`  Call ${i + 1}: ERROR`);
    }
    
    // Small delay between calls
    if (i < 9) await sleep(200);
  }
  
  const totalTime = Date.now() - startTime;
  
  console.log(`\nCoingecko Summary:`);
  console.log(`  Total time: ${formatDuration(totalTime)}`);
  console.log(`  Success: ${successCount}/10`);
  console.log(`  Rate limit hits: ${rateLimitHits}`);
  
  return { totalTime, successCount, errorCount, rateLimitHits, price: lastPrice };
}

// ============================================
// REPORT GENERATION
// ============================================

function generateReport(
  batch25: BatchTestResult,
  batch50: BatchTestResult,
  parallel100: BatchTestResult,
  coingecko: { totalTime: number; successCount: number; errorCount: number; rateLimitHits: number; price: number | null }
): ComprehensiveReport {
  // Determine if we can eliminate CoinGecko
  const uniswapPrice = batch25.ethPriceDerived || batch50.ethPriceDerived;
  const coingeckoPrice = coingecko.price;
  
  let canEliminateCoinGecko = false;
  let priceDifference: number | null = null;
  let recommendation = '';
  
  if (uniswapPrice && coingeckoPrice) {
    priceDifference = Math.abs(uniswapPrice - coingeckoPrice);
    const percentDiff = (priceDifference / coingeckoPrice) * 100;
    
    if (percentDiff < 1) { // Less than 1% difference
      canEliminateCoinGecko = true;
      recommendation = `Uniswap quotes can replace CoinGecko. Price difference is only ${percentDiff.toFixed(2)}% (< 1% threshold)`;
    } else {
      recommendation = `Price difference is ${percentDiff.toFixed(2)}%. Consider impact before eliminating CoinGecko.`;
    }
  } else {
    recommendation = 'Unable to compare prices. Insufficient data from either source.';
  }
  
  return {
    timestamp: new Date().toISOString(),
    uniswapTests: { batch25, batch50, parallel100 },
    coingeckoTest: coingecko,
    priceComparison: {
      canEliminateCoinGecko,
      coingeckoPrice,
      uniswapDerivedPrice: uniswapPrice || null,
      priceDifference,
      recommendation,
    },
  };
}

function printFinalReport(report: ComprehensiveReport) {
  const { uniswapTests, coingeckoTest, priceComparison } = report;
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           DCA EXECUTOR BATCH STRESS TEST - FINAL REPORT                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Timestamp: ${report.timestamp}`);
  console.log('');
  
  // Uniswap Comparison Table
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ UNISWAP TRADING API COMPARISON                                              │');
  console.log('├─────────────────┬───────────────┬───────────────┬───────────────────────────┤');
  console.log('│ Metric          │ Batch 25      │ Batch 50      │ Parallel 100              │');
  console.log('├─────────────────┼───────────────┼───────────────┼───────────────────────────┤');
  console.log(`│ Total Time      │ ${formatDuration(uniswapTests.batch25.totalTime).padEnd(13)} │ ${formatDuration(uniswapTests.batch50.totalTime).padEnd(13)} │ ${formatDuration(uniswapTests.parallel100.totalTime).padEnd(25)} │`);
  console.log(`│ Success Rate    │ ${(uniswapTests.batch25.successCount + '/' + uniswapTests.batch25.totalWallets).padEnd(13)} │ ${(uniswapTests.batch50.successCount + '/' + uniswapTests.batch50.totalWallets).padEnd(13)} │ ${(uniswapTests.parallel100.successCount + '/' + uniswapTests.parallel100.totalWallets).padEnd(25)} │`);
  console.log(`│ 504 Timeouts    │ ${String(uniswapTests.batch25.timeout504Count).padEnd(13)} │ ${String(uniswapTests.batch50.timeout504Count).padEnd(13)} │ ${String(uniswapTests.parallel100.timeout504Count).padEnd(25)} │`);
  console.log(`│ Other Errors    │ ${String(uniswapTests.batch25.otherErrors).padEnd(13)} │ ${String(uniswapTests.batch50.otherErrors).padEnd(13)} │ ${String(uniswapTests.parallel100.otherErrors).padEnd(25)} │`);
  console.log(`│ Avg Time/Call   │ ${formatDuration(uniswapTests.batch25.avgTimePerCall).padEnd(13)} │ ${formatDuration(uniswapTests.batch50.avgTimePerCall).padEnd(13)} │ ${formatDuration(uniswapTests.parallel100.avgTimePerCall).padEnd(25)} │`);
  console.log(`│ Derived ETH $   │ ${(uniswapTests.batch25.ethPriceDerived?.toFixed(2) || 'N/A').padEnd(13)} │ ${(uniswapTests.batch50.ethPriceDerived?.toFixed(2) || 'N/A').padEnd(13)} │ ${(uniswapTests.parallel100.ethPriceDerived?.toFixed(2) || 'N/A').padEnd(25)} │`);
  console.log('└─────────────────┴───────────────┴───────────────┴───────────────────────────┘');
  console.log('');
  
  // Recommendation
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ RECOMMENDATION                                                              │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  
  // Determine optimal batch size
  const batch25Score = uniswapTests.batch25.successCount - (uniswapTests.batch25.timeout504Count * 2);
  const batch50Score = uniswapTests.batch50.successCount - (uniswapTests.batch50.timeout504Count * 2);
  const parallelScore = uniswapTests.parallel100.successCount - (uniswapTests.parallel100.timeout504Count * 2);
  
  let optimal = 'batch25';
  if (batch50Score > batch25Score) optimal = 'batch50';
  if (parallelScore > batch50Score) optimal = 'parallel100';
  
  switch (optimal) {
    case 'batch25':
      console.log('│ ✅ OPTIMAL: Batch size 25                                                    │');
      console.log('│    Best balance of success rate and minimal 504 timeouts                     │');
      console.log('│    Trade-off: Takes longer but most reliable                                 │');
      break;
    case 'batch50':
      console.log('│ ✅ OPTIMAL: Batch size 50                                                    │');
      console.log('│    Good balance between speed and reliability                                │');
      console.log('│    Recommended for production use                                            │');
      break;
    case 'parallel100':
      console.log('│ ✅ OPTIMAL: Parallel (100)                                                   │');
      console.log('│    Fastest execution when API is responsive                                  │');
      console.log('│    Acceptable if occasional 504s are handled with retry logic                │');
      break;
  }
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  console.log('');
  
  // CoinGecko Analysis
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ COINGECKO ELIMINATION ANALYSIS                                              │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ CoinGecko Price:     $${(priceComparison.coingeckoPrice?.toFixed(2) || 'N/A').padEnd(66)}│`);
  console.log(`│ Uniswap Price:       $${(priceComparison.uniswapDerivedPrice?.toFixed(2) || 'N/A').padEnd(66)}│`);
  console.log(`│ Difference:          $${(priceComparison.priceDifference?.toFixed(2) || 'N/A').padEnd(66)}│`);
  console.log(`│ Can Eliminate?       ${(priceComparison.canEliminateCoinGecko ? 'YES ✅' : 'NO ❌').padEnd(69)}│`);
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ ${priceComparison.recommendation.slice(0, 75).padEnd(75)}│`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  console.log('');
  
  // Summary
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ SUMMARY                                                                     │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ • Batch processing ${uniswapTests.parallel100.timeout504Count > 0 ? 'REDUCES' : 'does not affect'} 504 timeouts vs parallel          │`);
  console.log(`│ • CoinGecko rate limits: ${coingeckoTest.rateLimitHits}/10 calls hit 429 errors                      │`);
  console.log(`│ • Uniswap API reliability: ${(100 - (uniswapTests.batch25.errorCount / uniswapTests.batch25.totalWallets * 100)).toFixed(0)}% success with batch 25      │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  console.log('');
}

// ============================================
// MAIN EXECUTION
// ============================================

async function runBatchStressTest() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           DCA EXECUTOR BATCH STRESS TEST                                     ║');
  console.log('║           Testing 100 Wallets with Different Batch Sizes                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // 1. Get real wallets
  console.log('Fetching real wallets from database...');
  const realWallets = await getRealWallets();
  
  if (realWallets.length === 0) {
    console.error('No wallets found in database. Aborting.');
    process.exit(1);
  }
  
  console.log(`Found ${realWallets.length} real wallets`);
  
  // 2. Generate simulated wallets (10x each = 100 wallets)
  const simulatedWallets = generateSimulatedWallets(realWallets);
  console.log(`Generated ${simulatedWallets.length} simulated wallets\n`);
  
  // 3. Run Test 1: Batch size 25 (4 batches)
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('  TEST 1: 100 Wallets in Batches of 25 (4 batches, sequential)');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  const batch25Result = await fetchSwapQuotesBatched(simulatedWallets, 25);
  
  // Cool down between tests
  await sleep(3000);
  
  // 4. Run Test 2: Batch size 50 (2 batches)
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('  TEST 2: 100 Wallets in Batches of 50 (2 batches, sequential)');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  const batch50Result = await fetchSwapQuotesBatched(simulatedWallets, 50);
  
  // Cool down between tests
  await sleep(3000);
  
  // 5. Run Baseline: All 100 in parallel (for comparison)
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('  BASELINE: 100 Wallets in Parallel (for comparison)');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  const parallelResult = await fetchSwapQuotesParallel(simulatedWallets);
  
  // Cool down
  await sleep(3000);
  
  // 6. Test CoinGecko
  const coingeckoResult = await testCoingeckoWithRateLimit();
  
  // 7. Generate and print report
  const report = generateReport(batch25Result, batch50Result, parallelResult, coingeckoResult);
  printFinalReport(report);
  
  // 8. Save report to file
  const reportPath = './batch-stress-test-report.json';
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved to: ${reportPath}`);
  
  return report;
}

// Run the stress test
runBatchStressTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
