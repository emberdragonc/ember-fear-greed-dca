import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';

const DELEGATION_MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address;

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const publicClient = createPublicClient({ chain: base, transport: http() });
const backendAccount = privateKeyToAccount(process.env.BACKEND_PRIVATE_KEY as Hex);

async function debug() {
  const { data } = await supabase.from('delegations').select('*').single();
  if (!data) { console.log('No delegation'); return; }
  
  const signedDelegation = data.delegation_data;
  
  // Simple balanceOf call as test
  const execution = createExecution({
    target: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
    value: 0n,
    callData: '0x70a08231000000000000000000000000' + data.smart_account_address.slice(2),
  });

  try {
    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });
    
    console.log('Simulating call to DelegationManager...');
    
    // Use eth_call to simulate
    const result = await publicClient.call({
      account: backendAccount,
      to: DELEGATION_MANAGER,
      data: redeemCalldata,
    });
    console.log('Simulation SUCCESS! Result:', result);
  } catch (err: any) {
    console.log('Simulation FAILED');
    console.log('Error:', err.shortMessage || err.message);
    if (err.cause?.data) {
      console.log('Revert data:', err.cause.data);
    }
  }
}

debug();
