// ============ FEE COLLECTION ============

import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  type Address,
} from 'viem';
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import { ADDRESSES, emberStakingAbi, type DelegationRecord } from './config';
import { publicClient, walletClient, backendAccount } from './clients';

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

export async function collectFee(
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
