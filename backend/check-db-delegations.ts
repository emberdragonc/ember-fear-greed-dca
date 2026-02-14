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
  console.log('🔍 Checking database delegation records...\n');
  
  for (const wallet of failedWallets) {
    console.log('='.repeat(80));
    console.log(`Wallet: ${wallet}`);
    console.log('='.repeat(80));
    
    const { data, error } = await supabase
      .from('dca_delegations')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase());
    
    if (error) {
      console.log(`❌ Error: ${error.message}`);
      continue;
    }
    
    if (!data || data.length === 0) {
      console.log('⚠️  No delegation records in database');
      continue;
    }
    
    console.log(`\nFound ${data.length} delegation record(s):\n`);
    
    data.forEach((record, idx) => {
      console.log(`--- Record ${idx + 1} ---`);
      console.log(`ID: ${record.id}`);
      console.log(`Delegate: ${record.delegate_address}`);
      console.log(`Created: ${record.created_at}`);
      console.log(`Delegation Hash: ${record.delegation_hash || 'N/A'}`);
      console.log(`Status: ${record.status || 'N/A'}`);
      
      if (record.delegation_data) {
        console.log(`\nDelegation Data:`);
        const delegationData = typeof record.delegation_data === 'string' 
          ? JSON.parse(record.delegation_data)
          : record.delegation_data;
        console.log(`  Salt: ${delegationData.salt}`);
        console.log(`  Caveats: ${delegationData.caveats?.length || 0}`);
        
        if (delegationData.caveats) {
          delegationData.caveats.forEach((caveat: any, cidx: number) => {
            console.log(`    Caveat ${cidx}:`, JSON.stringify(caveat).slice(0, 100));
          });
        }
      }
      
      console.log('');
    });
  }
}

main().catch(console.error);
