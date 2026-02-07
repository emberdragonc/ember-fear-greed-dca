import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const { data, error } = await supabase.from('dca_delegations').select('*');
if (error) console.log('Error:', error);
console.log('Total rows:', data?.length);
data?.forEach((d: any) => console.log(`- ${d.user_address}: delegate=${d.delegate}, smart_account=${d.smart_account_address}`));
