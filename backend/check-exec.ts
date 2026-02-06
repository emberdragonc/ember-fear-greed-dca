import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('dca_executions')
    .select('user_address, status, tx_hash, amount_in, amount_out, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent executions:\n');
  data?.forEach(d => {
    console.log(`User: ${d.user_address}`);
    console.log(`  Status: ${d.status}`);
    console.log(`  Amount: ${d.amount_in} -> ${d.amount_out}`);
    console.log(`  Tx: ${d.tx_hash}`);
    console.log(`  Time: ${d.created_at}`);
    console.log('');
  });
}

main();
