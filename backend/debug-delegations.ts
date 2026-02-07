import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function debug() {
  const { data, error } = await supabase
    .from('delegations')
    .select('user_address, delegation_data')
    .limit(2);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  for (const row of data || []) {
    console.log(`\n=== ${row.user_address} ===`);
    const parsed = typeof row.delegation_data === 'string' 
      ? JSON.parse(row.delegation_data) 
      : row.delegation_data;
    console.log('Keys:', Object.keys(parsed));
    console.log('Structure:', JSON.stringify(parsed, null, 2).substring(0, 1000));
  }
}

debug();
