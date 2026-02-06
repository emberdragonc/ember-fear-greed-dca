import { createPublicClient, createWalletClient, http, formatUnits, type Address, type Hex } from 'viem';
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
  // Get delegation
  const { data } = await supabase.from('delegations').select('*').single();
  if (!data) { console.log('No delegation'); return; }
  
  const signedDelegation = data.delegation_data;
  console.log('Delegation:', JSON.stringify(signedDelegation, null, 2));
  
  // Create a simple test execution (just checking if delegation works)
  const execution = createExecution({
    target: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, // USDC
    value: 0n,
    callData: '0x70a08231000000000000000000000000' + data.smart_account_address.slice(2), // balanceOf
  });

  console.log('\nExecution:', execution);

  try {
    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });
    console.log('\nRedeem calldata length:', redeemCalldata.length);
    
    // Simulate
    const result = await publicClient.simulateContract({
      address: DELEGATION_MANAGER,
      abi: [{
        name: 'redeemDelegations',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'delegations', type: 'bytes[][]' },
          { name: 'modes', type: 'uint8[]' },
          { name: 'executions', type: 'bytes[][]' },
        ],
        outputs: [],
      }],
      functionName: 'redeemDelegations',
      args: [[[signedDelegation]], [ExecutionMode.SingleDefault], [[execution]]],
      account: backendAccount,
    });
    console.log('\nSimulation success!', result);
  } catch (err: any) {
    console.log('\nSimulation error:', err.message);
    if (err.cause) console.log('Cause:', err.cause);
  }
}

debug();
