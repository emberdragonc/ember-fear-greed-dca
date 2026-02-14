import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const failedWallets = [
  '0xbbc4e353f6a45626a58e80cb6246d153d41d10ef',
  '0x63976999ca1ab568b8aff397abd336e073a80318'
];

async function main() {
  console.log('🔍 Checking delegations for failed wallets...\n');
  
  for (const wallet of failedWallets) {
    console.log('='.repeat(80));
    console.log(`Wallet: ${wallet}`);
    console.log('='.repeat(80));
    
    const { data, error } = await supabase
      .from('delegations')
      .select('*')
      .eq('smart_account_address', wallet.toLowerCase());
    
    if (error) {
      console.log(`❌ Error: ${error.message}`);
      continue;
    }
    
    if (!data || data.length === 0) {
      console.log('⚠️  No delegation record in database');
      continue;
    }
    
    console.log(`\n✅ Found delegation record:\n`);
    
    const record = data[0];
    console.log(`ID: ${record.id}`);
    console.log(`User Address: ${record.user_address}`);
    console.log(`Smart Account: ${record.smart_account_address}`);
    console.log(`Delegation Hash: ${record.delegation_hash}`);
    console.log(`Max Amount Per Swap: ${record.max_amount_per_swap}`);
    console.log(`Expires At: ${record.expires_at}`);
    console.log(`Created At: ${record.created_at}`);
    
    console.log(`\nDelegation Data:`);
    if (record.delegation_data) {
      const delegationData = typeof record.delegation_data === 'string' 
        ? JSON.parse(record.delegation_data)
        : record.delegation_data;
      console.log(JSON.stringify(delegationData, null, 2));
    }
    
    console.log(`\nDelegation Signature:`);
    console.log(record.delegation_signature);
    
    console.log('\n');
  }
}

main().catch(console.error);
