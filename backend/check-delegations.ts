import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  // Get ALL delegations (not just active)
  const { data, error } = await supabase
    .from('delegations')
    .select('user_address, delegation_data, expires_at, created_at');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('All delegations in database:\n');
  data?.forEach(d => {
    const delegateAddr = (d.delegation_data as any)?.delegate;
    const isCorrectDelegate = delegateAddr?.toLowerCase() === '0xc472e866045d2e9abd2f2459ce3bdb275b72c7e1';
    console.log(`User: ${d.user_address}`);
    console.log(`  Delegate in data: ${delegateAddr}`);
    console.log(`  Correct delegate: ${isCorrectDelegate ? '✅' : '❌'}`);
    console.log(`  Expires: ${d.expires_at}`);
    console.log(`  Created: ${d.created_at}`);
    console.log('');
  });
}

main();
