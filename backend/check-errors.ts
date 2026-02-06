import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('dca_executions')
    .select('user_address, status, error_message, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Recent failures:\n');
  data?.forEach(d => {
    console.log(`User: ${d.user_address}`);
    console.log(`  Error: ${d.error_message?.substring(0, 200)}...`);
    console.log('');
  });
}

main();
