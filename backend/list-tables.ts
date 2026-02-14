import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  // Try to query information_schema
  const { data, error } = await supabase.rpc('pg_catalog.pg_tables', {});
  
  if (error) {
    console.log('Error querying tables:', error);
    
    // Try alternative - just attempt to read from common table names
    console.log('\n🔍 Trying common table names...\n');
    
    const tableNames = [
      'delegations',
      'user_delegations',
      'wallet_delegations',
      'dca_users',
      'users',
      'accounts'
    ];
    
    for (const tableName of tableNames) {
      const { data, error, count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (!error) {
        console.log(`✅ Table '${tableName}' exists (${count || 0} rows)`);
      }
    }
  } else {
    console.log('Tables:', data);
  }
}

main().catch(console.error);
