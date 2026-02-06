import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.ALCHEMY_BASE_RPC || 'https://mainnet.base.org'),
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  const { data } = await supabase
    .from('delegations')
    .select('user_address, smart_account_address');

  console.log('Checking smart account deployment status:\n');
  
  for (const d of data || []) {
    if (!d.smart_account_address) continue;
    
    try {
      const code = await publicClient.getCode({ 
        address: d.smart_account_address as Address
      });
      
      const isDeployed = code && code !== '0x' && code.length > 2;
      console.log(d.smart_account_address);
      console.log('  User:', d.user_address);
      console.log('  Deployed:', isDeployed ? '✅' : '❌ NOT DEPLOYED');
      console.log('');
    } catch (e) {
      console.log(d.smart_account_address + ': Error - ' + e);
    }
  }
}

main();
