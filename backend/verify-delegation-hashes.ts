import { createPublicClient, http, getContract } from 'viem';
import { base } from 'viem/chains';

const DELEGATION_MANAGER = '0x000000000000D9ECebf3C23529de49815Dac1c4c';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.ALCHEMY_BASE_RPC || 'https://mainnet.base.org')
});

// Try reading the delegation directly using the hash as a storage slot
const delegationHashes = [
  {
    wallet: '0xbbc4e353f6a45626a58e80cb6246d153d41d10ef',
    hash: '0x1af63c19a71a6ebbb438bda40990129a0b1bfbed21af0d595dffb06f018780a9'
  },
  {
    wallet: '0x63976999ca1ab568b8aff397abd336e073a80318',
    hash: '0x01b065ccb8a7a21c05dc40d89f6f59711985417a62350ac254975de612f25a81'
  }
];

async function main() {
  console.log('🔍 Verifying delegation hashes on-chain...\n');
  console.log(`DelegationManager: ${DELEGATION_MANAGER}\n`);
  
  for (const { wallet, hash } of delegationHashes) {
    console.log('='.repeat(80));
    console.log(`Wallet: ${wallet}`);
    console.log(`Hash: ${hash}`);
    console.log('='.repeat(80));
    
    try {
      // Try to read storage at the hash location
      // In many delegation managers, delegations are stored in a mapping
      // mapping(bytes32 => Delegation) delegations
      
      const storageSlot = hash;
      const storageValue = await publicClient.getStorageAt({
        address: DELEGATION_MANAGER as `0x${string}`,
        slot: storageSlot as `0x${string}`
      });
      
      console.log(`Storage at hash: ${storageValue}`);
      
      if (storageValue && storageValue !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        console.log('✅ Non-zero storage found (delegation might exist)');
      } else {
        console.log('❌ Zero storage (delegation NOT registered on-chain)');
      }
      
    } catch (err: any) {
      console.log(`❌ Error: ${err.message}`);
    }
    
    console.log('');
  }
  
  // Also check if we can decode the error 0x155ff427
  console.log('\n📋 Error Code Analysis:');
  console.log('Error: 0x155ff427');
  console.log('This is a 4-byte error selector.');
  console.log('Common delegation errors:');
  console.log('  - DelegationNotFound: typically when hash not registered');
  console.log('  - InvalidDelegation: when delegation data is malformed');
  console.log('  - ExpiredDelegation: when delegation has expired');
}

main().catch(console.error);
