// DCA Executor Backend Service
// Runs daily to check F&G and execute swaps for delegated accounts
// Uses MetaMask Delegation Framework for secure execution
// Refactored to ERC-4337 architecture with parallel UserOperations
//
// Usage:
//   npx tsx backend/dca-executor.ts           # Normal execution
//   npx tsx backend/dca-executor.ts --dry-run # Simulation only (pre-flight check)

// ============ CLI FLAGS ============
const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_WALLET = process.argv.find(a => a.startsWith('--wallet='))?.split('=')[1]?.toLowerCase();

import { formatUnits, parseUnits, type Address } from 'viem';
import {
  FG_THRESHOLDS,
  sleep,
  type DCADecision,
  type WalletData,
} from './config';
import { withRetry } from './error-handler';
import { backendAccount, getETHBalance, supabase } from './clients';
import { validateDelegationCaveats, getActiveDelegations } from './delegation-validator';
import { initBackendSmartAccount, deployUndeployedAccounts } from './smart-account';
import { processApprovals } from './approvals';
import { processSwapsParallel, retrySwapWithOriginalAmounts, runDryRunSimulation } from './swap-engine';
import { logExecution, updateProtocolStats } from './db-logger';
import type { ExecutionResult } from './config';

// ============ IDEMPOTENCY GUARD ============

async function hasAlreadyExecutedToday(): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('dca_executions')
    .select('id')
    .gte('created_at', `${today}T00:00:00`)
    .limit(1);
  
  if (error) {
    console.error('[Idempotency] Failed to check today\'s executions:', error.message);
    // Fail CLOSED - if we can't check, don't execute (safer than risking duplicates)
    return true;
  }
  
  return (data?.length ?? 0) > 0;
}

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

async function fetchFearGreed(): Promise<{ value: number; classification: string; source?: string }> {
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

export function calculateDecision(fgValue: number): DCADecision {
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

// ============ MAIN EXECUTION ============

async function runDCA() {
  console.log('========================================');
  console.log('  Fear & Greed DCA Executor');
  console.log('  ERC-4337 Architecture with Parallel UserOps');
  if (DRY_RUN) {
    console.log('  🔍 DRY-RUN MODE (simulation only)');
  }
  console.log('========================================');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Backend EOA: ${backendAccount.address}`);

  // ============ IDEMPOTENCY CHECK ============
  // Prevents duplicate executions if cron fires multiple times
  if (!DRY_RUN) {
    const alreadyRan = await hasAlreadyExecutedToday();
    if (alreadyRan) {
      console.log('\n⚠️  IDEMPOTENCY GUARD: DCA already executed today. Skipping.');
      console.log('    This prevents duplicate swaps if the cron job fires multiple times.');
      console.log('    To force execution, use: npx tsx backend/dca-executor.ts --force');
      if (!process.argv.includes('--force')) {
        return;
      }
      console.log('    --force flag detected, proceeding anyway...');
    }
  }

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

  // 1. Fetch Fear & Greed (C5: With redundancy and staleness check)
  const fg = await fetchFearGreed();

  if (fg) {
    const sourceLabel = (fg as any).source === 'backup' ? ' [BACKUP ORACLE]' : '';
    console.log(`\nFear & Greed: ${fg.value} (${fg.classification})${sourceLabel}`);
  } else {
    console.log('\nFear & Greed: UNAVAILABLE - Both primary and backup sources failed');
  }

  // 2. Calculate decision
  const decision = calculateDecision(fg.value);
  console.log(`Decision: ${decision.reason}`);

  if (decision.action === 'hold') {
    console.log('\n✓ Market neutral - No action needed');
    return;
  }

  // 3. Get active delegations
  const allDelegations = await getActiveDelegations(TARGET_WALLET);
  console.log(`\nActive delegations: ${allDelegations.length}`);

  if (allDelegations.length === 0) {
    console.log('No active delegations to process');
    return;
  }

  // Filter out delegations with outdated delegate addresses or invalid caveats
  const EXPECTED_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1'.toLowerCase();
  const delegations = allDelegations.filter(d => {
    const signedDelegation = typeof d.delegation_data === 'string'
      ? JSON.parse(d.delegation_data)
      : d.delegation_data;
    const delegate = signedDelegation?.delegate;
    
    console.log(`\n[Validate] Checking ${d.user_address}...`);
    
    if (!delegate) {
      console.log(`  [Skip] No delegate in delegation_data`);
      return false;
    }
    
    const delegateMatch = delegate.toLowerCase() === EXPECTED_DELEGATE;
    if (!delegateMatch) {
      console.log(`  [Skip] Outdated delegation (delegate: ${delegate})`);
      return false;
    }
    
    const caveatValidation = validateDelegationCaveats(signedDelegation);
    if (!caveatValidation.valid) {
      console.log(`  [Skip] Caveat validation failed: ${caveatValidation.reason}`);
      return false;
    }
    
    console.log(`  ✓ Delegation valid`);
    return true;
  });

  console.log(`Valid delegations after filtering: ${delegations.length}`);

  if (delegations.length === 0) {
    console.log('No valid delegations to process (all have outdated delegates)');
    return;
  }

  const isBuy = decision.action === 'buy';

  // ========================================
  // DRY-RUN MODE: Simulate only, don't execute
  // ========================================
  if (DRY_RUN) {
    await runDryRunSimulation(delegations, decision);
    console.log('\n✅ Dry-run complete. No transactions were executed.');
    return;
  }

  // ========================================
  // PHASE 0: Deploy any undeployed user smart accounts
  // ========================================
  await deployUndeployedAccounts(delegations);

  // ========================================
  // PHASE 1: Process approvals sequentially (still EOA - rare, one-time)
  // ========================================
  await processApprovals(delegations, isBuy);

  // ========================================
  // PHASE 2: Process swaps via PARALLEL UserOps
  // ========================================
  const { results, walletDataMap } = await processSwapsParallel(delegations, decision, fg?.value ?? 50);

  // Log results to database
  let totalVolume = 0n;
  let totalFees = 0n;
  let successCount = 0;
  const failedDelegations: { delegation: typeof delegations[0]; error: string; originalWalletData?: WalletData }[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const walletData = result.walletAddress ? walletDataMap.get(result.walletAddress) : undefined;

    if (walletData) {
      await logExecution(
        walletData.delegation.id,
        walletData.delegation.user_address,
        fg?.value ?? 50,
        decision,
        result
      );

      if (result.success) {
        successCount++;
        totalVolume += BigInt(result.amountIn);
        totalFees += BigInt(result.feeCollected);
      } else if (result.errorType && ['network', 'timeout', 'rate_limit', 'quote_expired'].includes(result.errorType)) {
        failedDelegations.push({ delegation: walletData.delegation, error: result.error || 'Unknown error', originalWalletData: walletData });
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

    for (const { delegation, error, originalWalletData } of failedDelegations) {
      console.log(`\n[RETRY] ${delegation.smart_account_address} (previous error: ${error})`);

      try {
        let result: ExecutionResult;

        if (originalWalletData) {
          result = await retrySwapWithOriginalAmounts(originalWalletData, decision, fg?.value ?? 50);
        } else {
          console.warn(`[RETRY] ⚠️ ${delegation.smart_account_address}: No original wallet data - skipping retry to avoid amount recalculation`);
          result = {
            success: false,
            txHash: null,
            error: 'Retry skipped: no original wallet data available',
            errorType: 'unknown',
            amountIn: '0',
            amountOut: '0',
            feeCollected: '0',
            retryCount: 0,
            lastError: 'No original wallet data for safe retry',
          };
        }

        result.retryCount = (result.retryCount || 0) + 1;
        result.lastError = result.lastError || `Retry after: ${error}`;

        await logExecution(delegation.id, delegation.user_address, fg?.value ?? 50, decision, result, true);

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
