// Transpiled simple version for constrained environments
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { formatUnits, parseUnits } = require('viem');
const { createClient } = require('@supabase/supabase-js');

// Load env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchFearGreed() {
  try {
    const response = await fetch('https://api.alternative.me/fng/');
    const data = await response.json();
    return {
      value: parseInt(data.data[0].value),
      classification: data.data[0].value_classification,
    };
  } catch (e) {
    console.error('Failed to fetch F&G:', e.message);
    return null;
  }
}

function calculateDecision(fgValue) {
  if (fgValue <= 24) return { action: 'buy', percentage: 5, reason: 'Extreme Fear - Buy 5%' };
  if (fgValue <= 44) return { action: 'buy', percentage: 2.5, reason: 'Fear - Buy 2.5%' };
  if (fgValue <= 55) return { action: 'hold', percentage: 0, reason: 'Neutral - Hold' };
  if (fgValue <= 74) return { action: 'sell', percentage: 2.5, reason: 'Greed - Sell 2.5%' };
  return { action: 'sell', percentage: 5, reason: 'Extreme Greed - Sell 5%' };
}

async function getActiveDelegations() {
  const { data, error } = await supabase
    .from('delegations')
    .select('id, user_address, smart_account_address, delegation_data')
    .eq('is_active', true)
    .is('revoked_at', null);
  
  if (error) {
    console.error('Failed to fetch delegations:', error.message);
    return [];
  }
  return data || [];
}

async function hasAlreadyExecutedToday() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('dca_executions')
    .select('id')
    .gte('created_at', `${today}T00:00:00`)
    .limit(1);
  
  if (error) return true; // Fail closed
  return (data?.length ?? 0) > 0;
}

async function main() {
  console.log('========================================');
  console.log('  Fear & Greed DCA Executor (Lightweight)');
  console.log('========================================');
  console.log(`Time: ${new Date().toISOString()}`);

  // Check if already ran today
  const alreadyRan = await hasAlreadyExecutedToday();
  if (alreadyRan) {
    console.log('\n⚠️  Already executed today. Skipping.');
    return;
  }

  // Fetch F&G
  const fg = await fetchFearGreed();
  if (!fg) {
    console.error('\n❌ Could not fetch Fear & Greed index');
    return;
  }

  console.log(`\nFear & Greed: ${fg.value} (${fg.classification})`);

  // Calculate decision
  const decision = calculateDecision(fg.value);
  console.log(`Decision: ${decision.reason}`);

  if (decision.action === 'hold') {
    console.log('\n✓ Market neutral - No action needed');
    // Still log the execution with hold decision
    await supabase.from('dca_executions').insert({
      fear_greed_value: fg.value,
      decision: decision.action,
      percentage: decision.percentage,
      wallets_processed: 0,
      success_count: 0,
      fail_count: 0,
      total_volume: '0',
      status: 'hold'
    });
    return;
  }

  // Get delegations
  const delegations = await getActiveDelegations();
  console.log(`\nActive delegations: ${delegations.length}`);

  if (delegations.length === 0) {
    console.log('No active delegations to process');
    return;
  }

  // Validate delegations
  const EXPECTED_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1'.toLowerCase();
  const validDelegations = delegations.filter(d => {
    try {
      const signedDelegation = typeof d.delegation_data === 'string' 
        ? JSON.parse(d.delegation_data) 
        : d.delegation_data;
      const delegate = signedDelegation?.delegate;
      return delegate && delegate.toLowerCase() === EXPECTED_DELEGATE;
    } catch {
      return false;
    }
  });

  console.log(`Valid delegations: ${validDelegations.length}`);

  if (validDelegations.length === 0) {
    console.log('No valid delegations to process');
    return;
  }

  // Note: Full execution requires the full dca-executor.ts
  // This lightweight version just reports status
  console.log('\n⚠️  Full execution requires the complete DCA executor.');
  console.log('   This lightweight version reports status only.');
  console.log('\n📊 Summary:');
  console.log(`   - Fear & Greed: ${fg.value} (${fg.classification})`);
  console.log(`   - Decision: ${decision.reason}`);
  console.log(`   - Wallets to process: ${validDelegations.length}`);
  
  // Log execution
  const { error: insertError } = await supabase.from('dca_executions').insert({
    fear_greed_value: fg.value,
    decision: decision.action,
    percentage: decision.percentage,
    wallets_processed: validDelegations.length,
    success_count: 0,
    fail_count: validDelegations.length,
    total_volume: '0',
    status: 'lightweight_mode'
  });

  if (insertError) {
    console.error('Failed to log execution:', insertError.message);
  }

  console.log('\n⚠️  NOTE: Full swap execution could not run due to resource constraints.');
  console.log('   Please run the full executor on a system with more resources.');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
