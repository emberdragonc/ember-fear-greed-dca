import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const EXPECTED = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1'.toLowerCase();

async function debug() {
  const { data, error } = await supabase
    .from('delegations')
    .select('user_address, delegation_data');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Expected delegate: ${EXPECTED}`);
  console.log(`Total delegations: ${data?.length}\n`);
  
  for (const row of data || []) {
    const parsed = typeof row.delegation_data === 'string' 
      ? JSON.parse(row.delegation_data) 
      : row.delegation_data;
    const delegate = parsed.delegate;
    const match = delegate?.toLowerCase() === EXPECTED;
    console.log(`${row.user_address}: ${delegate} ${match ? '✓ MATCH' : '✗ NO MATCH'}`);
  }
}

debug();
