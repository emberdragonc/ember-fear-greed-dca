// Test fee transfer via delegation

import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  formatUnits,
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';

const ADDRESSES = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address,
} as const;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://base.drpc.org'),
});

const backendAccount = privateKeyToAccount(process.env.BACKEND_PRIVATE_KEY as Hex);

const walletClient = createWalletClient({
  account: backendAccount,
  chain: base,
  transport: http('https://base.drpc.org'),
});

async function main() {
  console.log('=== Fee Transfer Test ===\n');
  console.log('Backend wallet:', backendAccount.address);
  
  // Get delegation
  const { data: delegations, error } = await supabase
    .from('delegations')
    .select('*')
    .limit(1);

  if (error || !delegations?.length) {
    console.error('No delegations found:', error);
    return;
  }

  const delegation = delegations[0];
  const smartAccount = delegation.smart_account_address as Address;
  console.log('Smart Account:', smartAccount);
  
  // Check current balances
  const smartAccountUsdc = await publicClient.readContract({
    address: ADDRESSES.USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [smartAccount],
  });
  
  const backendUsdc = await publicClient.readContract({
    address: ADDRESSES.USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [backendAccount.address],
  });
  
  console.log('\nBefore transfer:');
  console.log('  Smart Account USDC:', formatUnits(smartAccountUsdc, 6));
  console.log('  Backend USDC:', formatUnits(backendUsdc, 6));
  
  // Test transfer: 0.01 USDC (10000 units)
  const testAmount = 10000n; // 0.01 USDC
  console.log(`\nAttempting to transfer ${formatUnits(testAmount, 6)} USDC from Smart Account to Backend...`);
  
  // Parse delegation
  const signedDelegation = typeof delegation.delegation_data === 'string' 
    ? JSON.parse(delegation.delegation_data) 
    : delegation.delegation_data;

  // Encode ERC20 transfer
  const transferCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [backendAccount.address, testAmount],
  });

  console.log('Transfer calldata:', transferCalldata.slice(0, 20) + '...');
  console.log('Method selector (should be a9059cbb):', transferCalldata.slice(0, 10));

  const execution = createExecution({
    target: ADDRESSES.USDC,
    value: 0n,
    callData: transferCalldata,
  });

  // Encode redeem call
  const redeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[signedDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });

  // Simulate first
  console.log('\nSimulating...');
  try {
    await publicClient.call({
      account: backendAccount,
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
    });
    console.log('Simulation SUCCESS ✓');
  } catch (simError: any) {
    console.error('Simulation FAILED:', simError.message?.slice(0, 200));
    return;
  }

  // Execute if simulation passed
  const shouldExecute = process.env.EXECUTE_FEE === 'true';
  
  if (shouldExecute) {
    console.log('\nExecuting transfer...');
    try {
      const txHash = await walletClient.sendTransaction({
        to: ADDRESSES.DELEGATION_MANAGER,
        data: redeemCalldata,
        gas: 300000n,
      });
      console.log('TX Hash:', txHash);
      
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash: txHash,
        timeout: 60000,
      });
      console.log('Status:', receipt.status);
      
      if (receipt.status === 'success') {
        // Check balances after
        const smartAccountUsdcAfter = await publicClient.readContract({
          address: ADDRESSES.USDC,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [smartAccount],
        });
        
        const backendUsdcAfter = await publicClient.readContract({
          address: ADDRESSES.USDC,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [backendAccount.address],
        });
        
        console.log('\nAfter transfer:');
        console.log('  Smart Account USDC:', formatUnits(smartAccountUsdcAfter, 6));
        console.log('  Backend USDC:', formatUnits(backendUsdcAfter, 6));
        console.log('\n✓ Fee transfer SUCCESS!');
      } else {
        console.log('Transaction REVERTED');
      }
    } catch (txError: any) {
      console.error('Transaction error:', txError.message?.slice(0, 300));
    }
  } else {
    console.log('\nSet EXECUTE_FEE=true to actually execute the transfer');
  }

  console.log('\n=== End Test ===');
}

main().catch(console.error);
