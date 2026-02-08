// ============ SMART ACCOUNT SETUP & DEPLOYMENT ============

import { type Address, type Hex } from 'viem';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/smart-accounts-kit';
import { getCounterfactualAccountData } from '@metamask/smart-accounts-kit/utils';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { sleep } from './config';
import type { DelegationRecord } from './config';
import { publicClient, walletClient, backendAccount } from './clients';

// Get Base v1.3.0 contracts
const BASE_CONTRACTS_V1_3 = (DELEGATOR_CONTRACTS as any)['1.3.0']?.['8453'];
const SIMPLE_FACTORY = (BASE_CONTRACTS_V1_3?.SimpleFactory || '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c') as Address;
const BASE_IMPLEMENTATIONS = {
  HybridDeleGatorImpl: (BASE_CONTRACTS_V1_3?.HybridDeleGatorImpl || '0x48dBe696A4D990079e039489bA2053B36E8FFEC4') as Address,
  MultiSigDeleGatorImpl: (BASE_CONTRACTS_V1_3?.MultiSigDeleGatorImpl || '0x0000000000000000000000000000000000000000') as Address,
};

// Cached backend smart account (initialized on first use)
let _backendSmartAccount: Awaited<ReturnType<typeof toMetaMaskSmartAccount>> | null = null;

export async function initBackendSmartAccount() {
  if (_backendSmartAccount) {
    return _backendSmartAccount;
  }

  console.log('[Setup] Initializing backend smart account...');
  console.log(`[Setup] Backend EOA: ${backendAccount.address}`);

  _backendSmartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [backendAccount.address, [], [], []],
    deploySalt: '0x0000000000000000000000000000000000000000000000000000000000000000',
    signer: { account: backendAccount },
  });

  console.log(`[Setup] Backend smart account: ${_backendSmartAccount.address}`);

  const code = await publicClient.getCode({ address: _backendSmartAccount.address });
  if (!code || code === '0x') {
    console.log('[Setup] Smart account not yet deployed - first UserOp will deploy via factory');
  } else {
    console.log('[Setup] Smart account already deployed ✓');
  }

  return _backendSmartAccount;
}

export async function ensureUserSmartAccountDeployed(
  smartAccountAddress: Address,
  userEOA: Address
): Promise<boolean> {
  try {
    const code = await publicClient.getCode({ address: smartAccountAddress });
    if (code && code.length > 2) {
      console.log(`[Deploy] Smart account ${smartAccountAddress} already deployed ✓`);
      return true;
    }

    console.log(`[Deploy] Smart account ${smartAccountAddress} not deployed, deploying via factory...`);
    console.log(`[Deploy] User EOA: ${userEOA}`);

    const accountData = await getCounterfactualAccountData({
      factory: SIMPLE_FACTORY,
      implementations: BASE_IMPLEMENTATIONS,
      implementation: Implementation.Hybrid,
      deployParams: [userEOA, [], [], []],
      deploySalt: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
    });

    if (accountData.address.toLowerCase() !== smartAccountAddress.toLowerCase()) {
      console.error(`[Deploy] Address mismatch! Expected ${smartAccountAddress}, got ${accountData.address}`);
      console.error(`[Deploy] This may indicate different deploy params were used during delegation signing`);
      return false;
    }

    console.log(`[Deploy] Calling factory at ${SIMPLE_FACTORY}`);
    console.log(`[Deploy] Factory data: ${accountData.factoryData.slice(0, 66)}...`);

    const txHash = await walletClient.sendTransaction({
      to: SIMPLE_FACTORY,
      data: accountData.factoryData,
      gas: 500000n,
    });

    console.log(`[Deploy] Transaction submitted: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });

    if (receipt.status === 'success') {
      const deployedCode = await publicClient.getCode({ address: smartAccountAddress });
      if (deployedCode && deployedCode.length > 2) {
        console.log(`[Deploy] ✅ Smart account deployed successfully at ${smartAccountAddress}`);
        return true;
      } else {
        console.error(`[Deploy] ❌ Deployment succeeded but account not found at expected address`);
        return false;
      }
    } else {
      console.error('[Deploy] ❌ Transaction reverted');
      return false;
    }
  } catch (error: any) {
    console.error('[Deploy] Error deploying smart account:', error?.message || error);
    if (error?.cause) console.error('[Deploy] Cause:', error.cause);
    return false;
  }
}

export async function deployUndeployedAccounts(delegations: DelegationRecord[]): Promise<void> {
  console.log(`\n[Phase 0] Checking ${delegations.length} smart accounts for deployment status...`);

  const undeployed: DelegationRecord[] = [];

  for (const delegation of delegations) {
    const smartAccountAddress = delegation.smart_account_address as Address;
    try {
      const code = await publicClient.getCode({ address: smartAccountAddress });
      if (!code || code.length <= 2) {
        undeployed.push(delegation);
        console.log(`[Phase 0] ${smartAccountAddress} - NOT DEPLOYED`);
      } else {
        console.log(`[Phase 0] ${smartAccountAddress} - deployed ✓`);
      }
    } catch (error: any) {
      console.error(`[Phase 0] Error checking ${smartAccountAddress}:`, error?.message);
    }
  }

  if (undeployed.length === 0) {
    console.log(`[Phase 0] All ${delegations.length} accounts already deployed ✓`);
    return;
  }

  console.log(`\n[Phase 0] Deploying ${undeployed.length} accounts via factory...`);

  for (const delegation of undeployed) {
    const smartAccountAddress = delegation.smart_account_address as Address;
    const userEOA = delegation.user_address as Address;

    const deployed = await ensureUserSmartAccountDeployed(smartAccountAddress, userEOA);
    if (deployed) {
      console.log(`[Phase 0] ✅ ${smartAccountAddress} deployed successfully`);
    } else {
      console.error(`[Phase 0] ❌ Failed to deploy ${smartAccountAddress}`);
    }

    await sleep(1000);
  }

  console.log(`[Phase 0] Deployment phase complete`);
}
