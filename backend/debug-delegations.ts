import { createPublicClient, http, getContract } from 'viem';
import { base } from 'viem/chains';

const DELEGATION_MANAGER = '0x000000000000D9ECebf3C23529de49815Dac1c4c';

// Minimal DelegationManager ABI for reading
const DELEGATION_MANAGER_ABI = [
  {
    inputs: [
      { internalType: 'bytes32', name: 'hash_', type: 'bytes32' }
    ],
    name: 'getDelegation',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'delegate', type: 'address' },
          { internalType: 'address', name: 'delegator', type: 'address' },
          { internalType: 'address', name: 'authority', type: 'address' },
          { internalType: 'bytes[]', name: 'caveats', type: 'bytes[]' },
          { internalType: 'uint256', name: 'salt', type: 'uint256' },
          { internalType: 'bytes', name: 'signature', type: 'bytes' }
        ],
        internalType: 'struct Delegation',
        name: 'delegation_',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'delegator_', type: 'address' }
    ],
    name: 'getDelegationsForDelegator',
    outputs: [
      { internalType: 'bytes32[]', name: 'hashes_', type: 'bytes32[]' }
    ],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.ALCHEMY_BASE_RPC || 'https://mainnet.base.org')
});

const delegationManager = getContract({
  address: DELEGATION_MANAGER,
  abi: DELEGATION_MANAGER_ABI,
  client: publicClient
});

const failedWallets = [
  '0xbbc4e353f6a45626a58e80cb6246d153d41d10ef',
  '0x63976999ca1ab568b8aff397abd336e073a80318'
];

async function main() {
  console.log('🔍 Investigating failed wallets...\n');
  
  for (const wallet of failedWallets) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Wallet: ${wallet}`);
    console.log('='.repeat(80));
    
    try {
      // Get all delegation hashes for this delegator
      const hashes = await delegationManager.read.getDelegationsForDelegator([wallet as `0x${string}`]);
      
      console.log(`\nTotal delegations on-chain: ${hashes.length}`);
      
      if (hashes.length === 0) {
        console.log('⚠️  NO DELEGATIONS FOUND ON-CHAIN');
        continue;
      }
      
      // Get details for each delegation
      for (let i = 0; i < hashes.length; i++) {
        const hash = hashes[i];
        console.log(`\n--- Delegation ${i + 1}/${hashes.length} ---`);
        console.log(`Hash: ${hash}`);
        
        try {
          const delegation = await delegationManager.read.getDelegation([hash]);
          console.log(`Delegate: ${delegation.delegate}`);
          console.log(`Delegator: ${delegation.delegator}`);
          console.log(`Authority: ${delegation.authority}`);
          console.log(`Salt: ${delegation.salt}`);
          console.log(`Caveats count: ${delegation.caveats.length}`);
          
          // Decode caveats
          delegation.caveats.forEach((caveat: `0x${string}`, idx: number) => {
            console.log(`  Caveat ${idx}: ${caveat.slice(0, 20)}... (${caveat.length} bytes)`);
          });
          
        } catch (err: any) {
          console.log(`❌ Failed to get delegation details: ${err.message}`);
        }
      }
      
    } catch (err: any) {
      console.log(`❌ Error querying delegations: ${err.message}`);
    }
  }
  
  console.log('\n\n🔍 Expected delegate: 0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1');
  console.log('(Backend smart account that should be executing these)');
}

main().catch(console.error);
