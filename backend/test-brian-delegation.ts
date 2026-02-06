// Quick test for Brian's delegation only
import { createPublicClient, createWalletClient, http, formatUnits, encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import { createExecution, ExecutionMode, toMetaMaskSmartAccount, Implementation } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';
import { createBundlerClient } from 'viem/account-abstraction';
import { encodeNonce } from 'permissionless/utils';
import { createPimlicoClient } from 'permissionless/clients/pimlico';

const ALCHEMY_RPC = 'https://base-mainnet.g.alchemy.com/v2/NQlmwdn5GImg3XWpPUNp4';
const PIMLICO_URL = 'https://api.pimlico.io/v2/8453/rpc?apikey=pim_UQJHzByj343893oNtPGJfq';

const ADDRESSES = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address,
};

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const publicClient = createPublicClient({ chain: base, transport: http(ALCHEMY_RPC) });
const backendAccount = privateKeyToAccount(process.env.DCA_BACKEND_PRIVATE_KEY as Hex);
const bundlerClient = createBundlerClient({ client: publicClient, transport: http(PIMLICO_URL) });
const pimlicoClient = createPimlicoClient({ transport: http(PIMLICO_URL) });

async function main() {
  console.log('Testing Brian\'s delegation only...\n');
  
  // Get Brian's delegation (most recent one)
  const { data: delegations } = await supabase
    .from('delegations')
    .select('*')
    .eq('smart_account_address', '0x4f38dde0be7d92abde9f3d4ba29a92e02bd71bd7')
    .single();
  
  if (!delegations) {
    console.log('No delegation found for Brian');
    return;
  }
  
  console.log('Found delegation:', delegations.id);
  console.log('Smart account:', delegations.smart_account_address);
  
  // Check USDC balance
  const balance = await publicClient.readContract({
    address: ADDRESSES.USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [delegations.smart_account_address as Address],
  });
  console.log('USDC Balance:', formatUnits(balance, 6));
  
  // Initialize backend smart account
  const backendSmartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [backendAccount.address, [], [], []],
    deploySalt: '0x0000000000000000000000000000000000000000000000000000000000000000',
    signer: { account: backendAccount },
  });
  console.log('Backend smart account:', backendSmartAccount.address);
  
  // Parse delegation - handle both string and object
  const signedDelegation = typeof delegations.delegation_data === 'string' 
    ? JSON.parse(delegations.delegation_data) 
    : delegations.delegation_data;
  console.log('Delegate in delegation:', signedDelegation.delegate);
  
  // Verify delegate matches our smart account
  if (signedDelegation.delegate.toLowerCase() !== backendSmartAccount.address.toLowerCase()) {
    console.log('❌ ERROR: Delegate mismatch!');
    console.log('  Expected:', backendSmartAccount.address);
    console.log('  Got:', signedDelegation.delegate);
    return;
  }
  console.log('✅ Delegate matches backend smart account');
  
  // Create approval call
  const approveCalldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [ADDRESSES.PERMIT2, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
  });
  
  const execution = createExecution({
    target: ADDRESSES.USDC,
    value: 0n,
    callData: approveCalldata,
  });
  
  const redeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[signedDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });
  
  console.log('\nSubmitting UserOp with Pimlico paymaster...');
  
  const nonce = encodeNonce({ key: BigInt(Date.now()), sequence: 0n });
  
  const userOpHash = await bundlerClient.sendUserOperation({
    account: backendSmartAccount,
    nonce,
    calls: [{
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      value: 0n,
    }],
    paymaster: pimlicoClient,
  });
  
  console.log('UserOp submitted:', userOpHash);
  
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 120000,
  });
  
  if (receipt.success) {
    console.log('✅ SUCCESS! Tx:', receipt.receipt.transactionHash);
  } else {
    console.log('❌ UserOp reverted');
  }
}

main().catch(console.error);
