// ============ PHASE 1: APPROVALS ============

import {
  encodeFunctionData,
  erc20Abi,
  type Address,
} from 'viem';
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import { encodeNonce } from 'permissionless/utils';
import {
  ADDRESSES,
  permit2Abi,
  type DelegationRecord,
  type ApprovalTask,
  type ApprovalResult,
} from './config';
import { publicClient, walletClient, bundlerClient, pimlicoPaymasterClient } from './clients';
import { initBackendSmartAccount } from './smart-account';

// ============ APPROVAL CHECKING ============

export async function checkUSDCApproval(smartAccountAddress: Address): Promise<boolean> {
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

export async function checkPermit2Allowance(smartAccountAddress: Address): Promise<boolean> {
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

// ============ DELEGATED APPROVAL (via UserOp) ============

export async function executeDelegatedERC20ApprovalViaUserOp(
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
      paymaster: pimlicoPaymasterClient,
    });

    console.log(`[UserOp] Gas sponsored by Pimlico paymaster`);
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

export async function executeDelegatedPermit2ApprovalViaUserOp(
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
      paymaster: pimlicoPaymasterClient,
    });

    console.log(`[UserOp] Submitted with Pimlico paymaster: ${userOpHash}`);

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
export async function executeDelegatedERC20Approval(
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

export async function executeDelegatedPermit2Approval(
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

// ============ SUBMIT APPROVAL USEROPS ============

export async function submitApprovalUserOps(
  task: ApprovalTask,
  tokenIn: Address,
  nonceKeyBase: bigint
): Promise<ApprovalResult> {
  const { delegation, smartAccountAddress, needsERC20, needsPermit2 } = task;

  try {
    let erc20TxHash: string | null = null;
    let permit2TxHash: string | null = null;

    if (needsERC20) {
      const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      const erc20NonceKey = nonceKeyBase;

      console.log(`[Approval] Submitting ERC20 approval for ${smartAccountAddress} (nonce key: ${erc20NonceKey})`);

      erc20TxHash = await executeDelegatedERC20ApprovalViaUserOp(
        delegation,
        tokenIn,
        ADDRESSES.PERMIT2,
        maxApproval,
        erc20NonceKey
      );

      if (!erc20TxHash) {
        return {
          wallet: smartAccountAddress,
          success: false,
          erc20TxHash: null,
          permit2TxHash: null,
          error: 'ERC20 approval failed',
        };
      }

      console.log(`[Approval] ✅ ERC20 approval success for ${smartAccountAddress}: ${erc20TxHash}`);
    }

    if (needsPermit2) {
      const permit2NonceKey = nonceKeyBase + 1n;

      console.log(`[Approval] Submitting Permit2 approval for ${smartAccountAddress} (nonce key: ${permit2NonceKey})`);

      permit2TxHash = await executeDelegatedPermit2ApprovalViaUserOp(
        delegation,
        tokenIn,
        ADDRESSES.UNISWAP_ROUTER,
        permit2NonceKey
      );

      if (!permit2TxHash) {
        return {
          wallet: smartAccountAddress,
          success: false,
          erc20TxHash,
          permit2TxHash: null,
          error: 'Permit2 approval failed',
        };
      }

      console.log(`[Approval] ✅ Permit2 approval success for ${smartAccountAddress}: ${permit2TxHash}`);
    }

    return {
      wallet: smartAccountAddress,
      success: true,
      erc20TxHash,
      permit2TxHash,
    };
  } catch (error: any) {
    console.error(`[Approval] ❌ Failed for ${smartAccountAddress}:`, error?.message || error);
    return {
      wallet: smartAccountAddress,
      success: false,
      erc20TxHash: null,
      permit2TxHash: null,
      error: error?.message || 'Unknown error',
    };
  }
}

// ============ PHASE 1: PROCESS APPROVALS ============

export async function processApprovals(delegations: DelegationRecord[], isBuy: boolean): Promise<void> {
  const tokenIn = isBuy ? ADDRESSES.USDC : ADDRESSES.WETH;
  const tokenSymbol = isBuy ? 'USDC' : 'WETH';

  console.log(`\n[Phase 1] Scanning ${delegations.length} wallets for approval needs...`);

  await initBackendSmartAccount();

  const needsApproval: ApprovalTask[] = [];

  const approvalChecks = await Promise.all(
    delegations.map(async (delegation) => {
      const smartAccountAddress = delegation.smart_account_address as Address;

      try {
        const [hasERC20Approval, hasPermit2Approval] = await Promise.all([
          checkUSDCApproval(smartAccountAddress),
          checkPermit2Allowance(smartAccountAddress),
        ]);

        return {
          delegation,
          smartAccountAddress,
          needsERC20: !hasERC20Approval,
          needsPermit2: !hasPermit2Approval,
        };
      } catch (error) {
        console.error(`[Phase 1] Error checking ${smartAccountAddress}:`, error);
        return {
          delegation,
          smartAccountAddress,
          needsERC20: true,
          needsPermit2: true,
        };
      }
    })
  );

  for (const check of approvalChecks) {
    if (check.needsERC20 || check.needsPermit2) {
      needsApproval.push(check);
    }
  }

  console.log(`[Phase 1] ${needsApproval.length} wallets need approvals`);

  if (needsApproval.length === 0) {
    console.log(`[Phase 1] All wallets already approved ✓`);
    return;
  }

  const PHASE1_TIMESTAMP = BigInt(Date.now());

  console.log(`[Phase 1] Submitting ${needsApproval.length} approval UserOps in parallel...`);

  const approvalResults = await Promise.all(
    needsApproval.map((task, index) => {
      const nonceKeyBase = PHASE1_TIMESTAMP * 1000000n + BigInt(index * 2);
      return submitApprovalUserOps(task, tokenIn, nonceKeyBase);
    })
  );

  const successful = approvalResults.filter(r => r.success).length;
  const failed = approvalResults.filter(r => !r.success);

  console.log(`[Phase 1 Complete] ${successful}/${needsApproval.length} approvals succeeded`);

  if (failed.length > 0) {
    console.log(`[Phase 1] Failed approvals:`);
    for (const f of failed) {
      console.log(`  - ${f.wallet}: ${f.error}`);
    }
  }
}
