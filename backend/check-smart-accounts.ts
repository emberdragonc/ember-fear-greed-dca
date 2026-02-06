import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('delegations')
    .select('user_address, smart_account_address, delegation_data');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Smart account mapping:\n');
  data?.forEach(d => {
    const dd = d.delegation_data as any;
    console.log(`User (EOA): ${d.user_address}`);
    console.log(`  Smart Account (DB): ${d.smart_account_address || 'NOT STORED'}`);
    console.log(`  Delegator (in delegation): ${dd?.delegator}`);
    console.log(`  Delegate (target): ${dd?.delegate}`);
    console.log(`  Match: ${d.smart_account_address?.toLowerCase() === dd?.delegator?.toLowerCase() ? '✅' : '❌'}`);
    console.log('');
  });
}

main();
