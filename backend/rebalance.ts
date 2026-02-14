/**
 * REBALANCE SCRIPT
 * 
 * Swaps excess ETH (WETH) back to USDC for wallets that were over-swapped
 * due to the cron duplicate execution bug on Feb 14, 2026.
 * 
 * Usage:
 *   npx tsx backend/rebalance.ts --dry-run    # Preview only
 *   npx tsx backend/rebalance.ts              # Execute rebalance
 */

import { formatUnits, parseUnits, erc20Abi, type Address, type Hex } from 'viem';
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import { encodeNonce } from 'permissionless/utils';
import {
  ADDRESSES,
  SLIPPAGE_LARGE_BPS,
  OPTIMAL_BATCH_SIZE,
  BATCH_DELAY_MS,
  sleep,
  validateSwapQuote,
  permit2Abi,
  type DelegationRecord,
} from './config';
import { withRetry } from './error-handler';
import {
  publicClient,
  backendAccount,
  bundlerClient,
  pimlicoPaymasterClient,
  supabase,
  getETHBalance,
  getUSDCBalance,
} from './clients';
import { validateDelegationCaveats, getActiveDelegations } from './delegation-validator';
import { initBackendSmartAccount } from './smart-account';
import { getSwapQuote, getETHPriceFromUniswap } from './swap-engine';
import {
  executeDelegatedERC20ApprovalViaUserOp,
  executeDelegatedPermit2ApprovalViaUserOp,
} from './approvals';

const DRY_RUN = process.argv.includes('--dry-run');

// ============ WETH BALANCE ============

async function getWETHBalance(address: Address): Promise<bigint> {
  return publicClient.readContract({
    address: ADDRESSES.WETH,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

// ============ REBALANCE DATA ============

// Excess ETH per wallet from the Feb 14 duplicate execution bug
// Source: Supabase dca_executions query - sum of all executions beyond the first one per wallet
interface RebalanceTarget {
  excessEth: bigint;
  excessUsdcSwapped: number;
  excessSwapCount: number;
}

const REBALANCE_TARGETS: Record<string, RebalanceTarget> = {
  '0x4f38dde0be7d92abde9f3d4ba29a92e02bd71bd7': {
    excessEth: parseUnits('0.15256059', 18),
    excessUsdcSwapped: 317.52,
    excessSwapCount: 49,
  },
  '0xaba389bb9d865152886d70d274d1225c42502e1f': {
    excessEth: parseUnits('0.31275504', 18),
    excessUsdcSwapped: 650.94,
    excessSwapCount: 49,
  },
  '0x80557e2aee6feca4b16dc1a6219eadc9e83b616f': {
    excessEth: parseUnits('0.05568377', 18),
    excessUsdcSwapped: 115.90,
    excessSwapCount: 49,
  },
  '0xcc481198c131738b59c36bc51858ba87bd7254ea': {
    excessEth: parseUnits('0.02930284', 18),
    excessUsdcSwapped: 60.99,
    excessSwapCount: 49,
  },
  '0x55768509c571f241625351b49ac84d820fa3d2f0': {
    excessEth: parseUnits('0.01465102', 18),
    excessUsdcSwapped: 30.50,
    excessSwapCount: 49,
  },
  '0xc0e447631a09d9918cbbb270b69adfbc78444d3d': {
    excessEth: parseUnits('0.00389068', 18),
    excessUsdcSwapped: 8.10,
    excessSwapCount: 49,
  },
  '0xc90208db726057da170e30add18ef08dcdcb2498': {
    excessEth: parseUnits('0.00307159', 18),
    excessUsdcSwapped: 6.39,
    excessSwapCount: 49,
  },
  '0x059e6d7885147f26e60ae885773b267e412f5e63': {
    excessEth: parseUnits('0.00024464', 18),
    excessUsdcSwapped: 0.51,
    excessSwapCount: 1,
  },
  '0xba72f8c922e9b56b52f8a71ec79b8565a16d548f': {
    excessEth: parseUnits('0.00024944', 18),
    excessUsdcSwapped: 0.52,
    excessSwapCount: 1,
  },
};

// ============ MAIN ============

async function runRebalance() {
  console.log('========================================');
  console.log('  REBALANCE: Excess ETH → USDC');
  console.log('  Fixing Feb 14 duplicate execution bug');
  if (DRY_RUN) {
    console.log('  🔍 DRY-RUN MODE (preview only)');
  }
  console.log('========================================');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Backend EOA: ${backendAccount.address}`);
  console.log(`Wallets to rebalance: ${Object.keys(REBALANCE_TARGETS).length}`);
  console.log('');

  const backendSmartAccount = await initBackendSmartAccount();
  console.log(`Backend Smart Account: ${backendSmartAccount.address}`);

  // Check backend has gas
  const backendBalance = await getETHBalance(backendAccount.address);
  console.log(`Backend ETH: ${formatUnits(backendBalance, 18)} ETH`);
  if (backendBalance < parseUnits('0.001', 18)) {
    console.error('Backend wallet needs more ETH for gas!');
    return;
  }

  const ethPrice = await getETHPriceFromUniswap();
  console.log(`ETH Price: $${ethPrice.toFixed(2)}`);

  // Get delegations
  const EXPECTED_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1'.toLowerCase();
  const allDelegations = await getActiveDelegations(undefined);
  const delegationsByWallet = new Map<string, DelegationRecord>();
  
  for (const d of allDelegations) {
    const signedDelegation = typeof d.delegation_data === 'string'
      ? JSON.parse(d.delegation_data)
      : d.delegation_data;
    const delegate = signedDelegation?.delegate;
    
    if (delegate?.toLowerCase() === EXPECTED_DELEGATE) {
      const caveatValidation = validateDelegationCaveats(signedDelegation);
      if (caveatValidation.valid) {
        delegationsByWallet.set(d.smart_account_address.toLowerCase(), d);
      }
    }
  }

  console.log(`\nValid delegations found: ${delegationsByWallet.size}`);

  // ============ PHASE 1: ASSESS ============
  console.log('\n--- PHASE 1: ASSESS WALLETS ---');

  interface RebalanceItem {
    wallet: Address;
    delegation: DelegationRecord;
    wethBalance: bigint;
    swapAmount: bigint; // min(excessEth, wethBalance) 
    excessUsdcSwapped: number;
    excessSwapCount: number;
  }

  const items: RebalanceItem[] = [];

  for (const [wallet, target] of Object.entries(REBALANCE_TARGETS)) {
    const walletLower = wallet.toLowerCase();
    const delegation = delegationsByWallet.get(walletLower);
    
    if (!delegation) {
      console.log(`❌ ${wallet}: No valid delegation found - SKIPPING`);
      continue;
    }

    const wethBalance = await getWETHBalance(wallet as Address);
    const nativeEthBalance = await getETHBalance(wallet as Address);
    const usdcBalance = await getUSDCBalance(wallet as Address);

    // Swap the minimum of excess ETH and actual WETH balance
    const swapAmount = wethBalance < target.excessEth ? wethBalance : target.excessEth;

    console.log(`\n${wallet}:`);
    console.log(`  WETH balance:  ${formatUnits(wethBalance, 18)} ($${(Number(formatUnits(wethBalance, 18)) * ethPrice).toFixed(2)})`);
    console.log(`  Native ETH:   ${formatUnits(nativeEthBalance, 18)}`);
    console.log(`  USDC balance:  ${formatUnits(usdcBalance, 6)}`);
    console.log(`  Excess to fix: ${formatUnits(target.excessEth, 18)} ETH (~$${target.excessUsdcSwapped.toFixed(2)})`);
    console.log(`  Will swap:     ${formatUnits(swapAmount, 18)} WETH → USDC`);

    if (swapAmount === 0n) {
      console.log(`  ⚠️ No WETH to swap back - wallet may have unwrapped`);
      continue;
    }

    items.push({
      wallet: wallet as Address,
      delegation,
      wethBalance,
      swapAmount,
      excessUsdcSwapped: target.excessUsdcSwapped,
      excessSwapCount: target.excessSwapCount,
    });
  }

  console.log(`\n--- SUMMARY ---`);
  console.log(`Wallets to rebalance: ${items.length}`);
  const totalSwapEth = items.reduce((s, i) => s + i.swapAmount, 0n);
  console.log(`Total WETH to swap: ${formatUnits(totalSwapEth, 18)} (~$${(Number(formatUnits(totalSwapEth, 18)) * ethPrice).toFixed(2)})`);

  if (items.length === 0) {
    console.log('No wallets to rebalance.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n🔍 DRY-RUN: Would execute the above swaps. Run without --dry-run to execute.');
    return;
  }

  // ============ PHASE 1.5: APPROVALS (WETH → Permit2 → Router) ============
  console.log('\n--- PHASE 1.5: CHECK & FIX APPROVALS ---');

  const APPROVAL_TIMESTAMP = BigInt(Date.now());

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const wallet = item.wallet;

    // Check ERC20 approval: WETH → Permit2
    const wethAllowance = await publicClient.readContract({
      address: ADDRESSES.WETH,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [wallet, ADDRESSES.PERMIT2],
    });
    const needsERC20 = wethAllowance === 0n;

    // Check Permit2 allowance: WETH via Permit2 → Router (with expiry)
    let needsPermit2 = false;
    try {
      const result = await publicClient.readContract({
        address: ADDRESSES.PERMIT2,
        abi: permit2Abi,
        functionName: 'allowance',
        args: [wallet, ADDRESSES.WETH, ADDRESSES.UNISWAP_ROUTER],
      });
      const amount = BigInt(result[0]);
      const expiration = Number(result[1]);
      const now = Math.floor(Date.now() / 1000);
      needsPermit2 = amount === 0n || expiration <= now;
      if (needsPermit2) {
        console.log(`  [${wallet.slice(0, 10)}] Permit2 expired (exp: ${expiration}, now: ${now})`);
      }
    } catch {
      needsPermit2 = true;
    }

    if (!needsERC20 && !needsPermit2) {
      console.log(`  [${wallet.slice(0, 10)}] Approvals OK ✓`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [${wallet.slice(0, 10)}] Would fix: ERC20=${needsERC20}, Permit2=${needsPermit2}`);
      continue;
    }

    const nonceKeyBase = APPROVAL_TIMESTAMP * 1000000n + BigInt(idx * 2);

    if (needsERC20) {
      console.log(`  [${wallet.slice(0, 10)}] Submitting WETH→Permit2 ERC20 approval...`);
      const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      const txHash = await executeDelegatedERC20ApprovalViaUserOp(
        item.delegation,
        ADDRESSES.WETH,
        ADDRESSES.PERMIT2,
        maxApproval,
        nonceKeyBase,
      );
      if (txHash) {
        console.log(`  [${wallet.slice(0, 10)}] ✅ ERC20 approval: ${txHash}`);
      } else {
        console.error(`  [${wallet.slice(0, 10)}] ❌ ERC20 approval failed — wallet will likely fail swap`);
      }
    }

    if (needsPermit2) {
      console.log(`  [${wallet.slice(0, 10)}] Submitting Permit2 WETH→Router approval...`);
      const txHash = await executeDelegatedPermit2ApprovalViaUserOp(
        item.delegation,
        ADDRESSES.WETH,
        ADDRESSES.UNISWAP_ROUTER,
        nonceKeyBase + 1n,
      );
      if (txHash) {
        console.log(`  [${wallet.slice(0, 10)}] ✅ Permit2 approval: ${txHash}`);
      } else {
        console.error(`  [${wallet.slice(0, 10)}] ❌ Permit2 approval failed — wallet will likely fail swap`);
      }
    }
  }

  console.log('[Phase 1.5] Approvals complete\n');

  // ============ PHASE 2: EXECUTE ============
  console.log('\n--- PHASE 2: EXECUTE REBALANCE ---');

  const TIMESTAMP = BigInt(Date.now());
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i += OPTIMAL_BATCH_SIZE) {
    const batch = items.slice(i, i + OPTIMAL_BATCH_SIZE);
    const batchNum = Math.floor(i / OPTIMAL_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / OPTIMAL_BATCH_SIZE);

    console.log(`\n[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} wallets...`);

    // Get quotes for each wallet
    const quotedItems: Array<{
      item: RebalanceItem;
      swapQuote: any;
      nonceKey: bigint;
    }> = [];

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const nonceKey = TIMESTAMP * 1000000n + BigInt(i + j);

      console.log(`[Quote] ${item.wallet}: ${formatUnits(item.swapAmount, 18)} WETH → USDC`);

      const swapQuote = await getSwapQuote(
        item.wallet,
        ADDRESSES.WETH,    // tokenIn: WETH
        ADDRESSES.USDC,    // tokenOut: USDC
        item.swapAmount.toString(),
        SLIPPAGE_LARGE_BPS
      );

      if (!swapQuote) {
        console.error(`[Quote] ❌ ${item.wallet}: Failed to get quote - SKIPPING`);
        failCount++;
        continue;
      }

      const expectedUsdc = BigInt(swapQuote.quote.quote?.output?.amount || '0');
      console.log(`[Quote] ✅ ${item.wallet}: Expected ~${formatUnits(expectedUsdc, 6)} USDC`);

      quotedItems.push({ item, swapQuote, nonceKey });
    }

    if (quotedItems.length === 0) {
      console.log(`[Batch ${batchNum}] No valid quotes - skipping batch`);
      continue;
    }

    // Submit UserOperations (send directly — handles signing internally)
    console.log(`[Submit] Sending ${quotedItems.length} swaps to bundler...`);

    for (const { item, swapQuote, nonceKey } of quotedItems) {
      try {
        const signedDelegation = typeof item.delegation.delegation_data === 'string'
          ? JSON.parse(item.delegation.delegation_data)
          : item.delegation.delegation_data;

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

        const hash = await bundlerClient.sendUserOperation({
          account: backendSmartAccount,
          nonce,
          calls: [{
            to: ADDRESSES.DELEGATION_MANAGER as Address,
            data: redeemCalldata,
            value: 0n,
          }],
          paymaster: pimlicoPaymasterClient,
        });
        console.log(`[Submit] ✅ ${item.wallet}: UserOp hash ${hash}`);

        // Wait for receipt
        const receipt = await bundlerClient.waitForUserOperationReceipt({
          hash,
          timeout: 120_000,
        });

        if (receipt.success) {
          console.log(`[Receipt] ✅ ${item.wallet}: Tx ${receipt.receipt.transactionHash}`);
          successCount++;

          // Log to database
          await supabase.from('dca_executions').insert({
            user_address: item.delegation.user_address,
            fear_greed_index: 0,
            action: 'rebalance',
            amount_in: item.swapAmount.toString(),
            amount_out: (swapQuote.quote.quote?.output?.amount || '0'),
            tx_hash: receipt.receipt.transactionHash,
            status: 'success',
            fee_collected: '0',
            wallet_address: item.wallet,
            error_message: `Manual correction: ${item.excessSwapCount} duplicate swap${item.excessSwapCount > 1 ? 's' : ''} reversed. No fee charged.`,
          });
        } else {
          console.error(`[Receipt] ❌ ${item.wallet}: UserOp reverted`);
          failCount++;
        }
      } catch (error: any) {
        console.error(`[Submit] ❌ ${item.wallet}: ${error.message}`);
        failCount++;
      }

      // Small delay between submissions
      await sleep(500);
    }

    if (i + OPTIMAL_BATCH_SIZE < items.length) {
      console.log(`[Batch] Waiting ${BATCH_DELAY_MS}ms before next batch...`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  // ============ SUMMARY ============
  console.log('\n========================================');
  console.log('  REBALANCE COMPLETE');
  console.log('========================================');
  console.log(`Success: ${successCount}/${items.length}`);
  console.log(`Failed:  ${failCount}/${items.length}`);
  console.log(`Total WETH swapped back: ${formatUnits(totalSwapEth, 18)}`);
  console.log('');
}

runRebalance().catch(error => {
  console.error('Rebalance failed:', error);
  process.exit(1);
});
