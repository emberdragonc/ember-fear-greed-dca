import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  // Get a successful wallet vs failing wallet
  const { data } = await supabase
    .from('delegations')
    .select('user_address, delegation_data')
    .in('user_address', [
      '0xe3c938c71273bfff7dee21bdd3a8ee1e453bdd1b', // succeeded
      '0x320c338bcf70baaae26e96201c33b48105bc62c2', // failed but correct delegate
    ]);

  data?.forEach(d => {
    console.log('='.repeat(60));
    console.log('User:', d.user_address);
    console.log('Delegation data:');
    console.log(JSON.stringify(d.delegation_data, null, 2));
    console.log('');
  });
}

main();
