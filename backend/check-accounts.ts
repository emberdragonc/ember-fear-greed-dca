import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.ALCHEMY_BASE_RPC || 'https://mainnet.base.org')
});

const failedWallets = [
  '0xbbc4e353f6a45626a58e80cb6246d153d41d10ef',
  '0x63976999ca1ab568b8aff397abd336e073a80318'
];

const BACKEND_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1';

async function main() {
  console.log('🔍 Checking account types and delegation setup...\n');
  
  // Check backend delegate first
  console.log('Backend Delegate:');
  console.log(`Address: ${BACKEND_DELEGATE}`);
  const backendCode = await publicClient.getCode({ address: BACKEND_DELEGATE as `0x${string}` });
  console.log(`Code exists: ${backendCode && backendCode !== '0x' ? 'YES (Smart Account)' : 'NO (EOA)'}`);
  console.log('');
  
  for (const wallet of failedWallets) {
    console.log('='.repeat(80));
    console.log(`Wallet: ${wallet}`);
    console.log('='.repeat(80));
    
    // Check if it's a smart account
    const code = await publicClient.getCode({ address: wallet as `0x${string}` });
    const isSmartAccount = code && code !== '0x';
    
    console.log(`Code exists: ${isSmartAccount ? 'YES (Smart Account)' : 'NO (EOA)'}`);
    
    if (code && code !== '0x') {
      console.log(`Code length: ${code.length} characters`);
      console.log(`Code preview: ${code.slice(0, 66)}...`);
    }
    
    // Check balance
    const balance = await publicClient.getBalance({ address: wallet as `0x${string}` });
    console.log(`ETH Balance: ${balance.toString()} wei (${Number(balance) / 1e18} ETH)`);
    
    console.log('');
  }
  
  // Now let's check what's in the database about these delegations
  console.log('\n📋 Checking database records...\n');
}

main().catch(console.error);
