// Test swap to debug reverts

import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  formatUnits, 
  parseUnits,
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
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  UNISWAP_ROUTER: '0x6fF5693b99212Da76ad316178A184AB56D299b43' as Address,
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
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

async function getSwapData(amount: string, swapper: Address): Promise<{ to: Address; data: Hex; value: bigint } | null> {
  // Step 1: Get quote
  const quoteRes = await fetch('https://trade-api.gateway.uniswap.org/v1/quote', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.UNISWAP_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tokenIn: ADDRESSES.USDC,
      tokenOut: ADDRESSES.WETH,
      tokenInChainId: 8453,
      tokenOutChainId: 8453,
      amount,
      type: 'EXACT_INPUT',
      swapper,
      slippageTolerance: 1.0,
    }),
  });

  if (!quoteRes.ok) {
    const error = await quoteRes.text();
    console.error('Quote error:', error);
    return null;
  }

  const quoteData = await quoteRes.json();
  console.log('Quote amount out:', quoteData.quote?.output?.amount);

  // Step 2: Get swap transaction
  const { permitData, permitTransaction, ...cleanQuote } = quoteData;
  const swapRes = await fetch('https://trade-api.gateway.uniswap.org/v1/swap', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.UNISWAP_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cleanQuote),
  });

  if (!swapRes.ok) {
    const error = await swapRes.text();
    console.error('Swap error:', error);
    return null;
  }

  const swapData = await swapRes.json();
  
  if (!swapData.swap) {
    console.error('No swap data in response');
    console.log('Swap response:', JSON.stringify(swapData, null, 2));
    return null;
  }

  return {
    to: swapData.swap.to as Address,
    data: swapData.swap.data as Hex,
    value: BigInt(swapData.swap.value || '0'),
  };
}

async function main() {
  console.log('=== DCA Swap Debug Test ===\n');
  console.log('Backend:', backendAccount.address);
  
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
  console.log('Smart Account:', delegation.smart_account_address);
  console.log('Delegation hash:', delegation.delegation_hash);
  
  // Get swap data for 1 USDC
  console.log('\nGetting quote for 1 USDC -> WETH...');
  const swapData = await getSwapData('1000000', delegation.smart_account_address);
  
  if (!swapData) {
    console.error('Failed to get swap data');
    return;
  }

  console.log('Swap to:', swapData.to);
  console.log('Swap value:', swapData.value.toString());
  console.log('Swap data (first 100 chars):', swapData.data.slice(0, 100));

  // Parse delegation
  const signedDelegation = typeof delegation.delegation_data === 'string' 
    ? JSON.parse(delegation.delegation_data) 
    : delegation.delegation_data;

  console.log('\nDelegation delegate:', signedDelegation.delegate);
  console.log('Delegation delegator:', signedDelegation.delegator);
  console.log('Number of caveats:', signedDelegation.caveats?.length);

  // Create execution
  const execution = createExecution({
    target: swapData.to,
    value: swapData.value,
    callData: swapData.data,
  });

  console.log('\nExecution target:', execution.target);
  console.log('Execution value:', execution.value?.toString());

  // Encode redeem call
  const redeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[signedDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });

  // Try to simulate via eth_call
  console.log('\nSimulating via eth_call...');
  try {
    await publicClient.call({
      account: backendAccount,
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
    });
    console.log('Simulation success!');
  } catch (simError: any) {
    console.error('Simulation FAILED:');
    console.error('Error message:', simError.message?.slice(0, 500));
    if (simError.shortMessage) {
      console.error('Short message:', simError.shortMessage);
    }
    // Try to decode revert reason
    if (simError.details) {
      console.error('Details:', simError.details);
    }
  }

  // Check AllowedMethodsEnforcer
  console.log('\n=== Caveat Analysis ===');
  const swapMethodId = swapData.data.slice(0, 10);
  console.log('Swap method ID:', swapMethodId);
  
  const methodEnforcerTerms = signedDelegation.caveats?.find(
    (c: any) => c.enforcer.toLowerCase() === '0x2c21fd0cb9dc8445cb3fb0dc5e7bb0aca01842b5'
  )?.terms;
  console.log('AllowedMethods terms:', methodEnforcerTerms);
  
  if (methodEnforcerTerms) {
    const methodsAllowed = methodEnforcerTerms.slice(2).match(/.{8}/g) || [];
    console.log('Allowed method IDs:', methodsAllowed.map((m: string) => '0x' + m));
    console.log('Is swap method allowed?', methodsAllowed.includes(swapMethodId.slice(2)));
  }

  // Try real execution
  console.log('\n=== Attempting Real Swap ===');
  const shouldExecute = process.env.EXECUTE_SWAP === 'true';
  
  if (shouldExecute) {
    try {
      console.log('Sending transaction...');
      const txHash = await walletClient.sendTransaction({
        to: ADDRESSES.DELEGATION_MANAGER,
        data: redeemCalldata,
        gas: 500000n,
      });
      console.log('TX Hash:', txHash);
      
      console.log('Waiting for receipt...');
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash: txHash,
        timeout: 60000,
      });
      console.log('Status:', receipt.status);
      console.log('Gas used:', receipt.gasUsed.toString());
      
      if (receipt.status === 'reverted') {
        console.log('Transaction REVERTED!');
      } else {
        console.log('Transaction SUCCESS!');
      }
    } catch (txError: any) {
      console.error('Transaction error:', txError.message?.slice(0, 500));
      if (txError.shortMessage) {
        console.error('Short message:', txError.shortMessage);
      }
    }
  } else {
    console.log('Set EXECUTE_SWAP=true to actually execute');
  }

  console.log('\n=== End Test ===');
}

main().catch(console.error);
