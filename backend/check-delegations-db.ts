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
  console.log('🔍 Checking delegations table...\n');
  
  // First, let's see the schema
  const { data: allData } = await supabase
    .from('delegations')
    .select('*')
    .limit(1);
  
  if (allData && allData.length > 0) {
    console.log('Schema (first record keys):', Object.keys(allData[0]));
    console.log('');
  }
  
  for (const wallet of failedWallets) {
    console.log('='.repeat(80));
    console.log(`Wallet: ${wallet}`);
    console.log('='.repeat(80));
    
    // Try both lowercase and original case
    const { data, error } = await supabase
      .from('delegations')
      .select('*')
      .or(`wallet_address.eq.${wallet.toLowerCase()},wallet_address.eq.${wallet},smart_account.eq.${wallet.toLowerCase()},smart_account.eq.${wallet},delegator.eq.${wallet.toLowerCase()},delegator.eq.${wallet}`);
    
    if (error) {
      console.log(`❌ Error: ${error.message}`);
      continue;
    }
    
    if (!data || data.length === 0) {
      console.log('⚠️  No delegation records found');
      continue;
    }
    
    console.log(`\nFound ${data.length} record(s):\n`);
    
    data.forEach((record, idx) => {
      console.log(`--- Record ${idx + 1} ---`);
      console.log(JSON.stringify(record, null, 2));
      console.log('');
    });
  }
}

main().catch(console.error);
