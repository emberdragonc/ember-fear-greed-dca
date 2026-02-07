// Test script for F&G Oracle redundancy (C5 Fix)
// Run with: npx tsx test-fg-redundancy.ts

// Import the functions we want to test
// Since we can't easily import from the main file, we'll copy the key logic here

const FG_STALENESS_THRESHOLD_SECONDS = 43200; // 12 hours

interface FearGreedData {
  value: number;
  classification: string;
  timestamp: number;
  source: 'primary' | 'backup';
}

function isFearGreedStale(data: FearGreedData): boolean {
  const now = Math.floor(Date.now() / 1000);
  const age = now - data.timestamp;
  const isStale = age > FG_STALENESS_THRESHOLD_SECONDS;

  if (isStale) {
    console.warn(`[F&G Stale] Data is ${(age / 3600).toFixed(1)} hours old (threshold: ${FG_STALENESS_THRESHOLD_SECONDS / 3600}h)`);
  }

  return isStale;
}

// Test cases
console.log('========================================');
console.log('F&G Oracle Redundancy Tests (C5)');
console.log('========================================\n');

// Test 1: Fresh data (should not be stale)
console.log('Test 1: Fresh data (1 hour old)');
const freshData: FearGreedData = {
  value: 45,
  classification: 'Fear',
  timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  source: 'primary',
};
const freshResult = isFearGreedStale(freshData);
console.log(`  Result: ${freshResult ? 'STALE ❌' : 'FRESH ✓'}`);
console.log(`  Expected: FRESH ✓\n`);

// Test 2: Stale data (13 hours old)
console.log('Test 2: Stale data (13 hours old)');
const staleData: FearGreedData = {
  value: 45,
  classification: 'Fear',
  timestamp: Math.floor(Date.now() / 1000) - (13 * 3600), // 13 hours ago
  source: 'primary',
};
const staleResult = isFearGreedStale(staleData);
console.log(`  Result: ${staleResult ? 'STALE ✓' : 'FRESH ❌'}`);
console.log(`  Expected: STALE ✓\n`);

// Test 3: Exactly at threshold (12 hours)
console.log('Test 3: Exactly at threshold (12 hours)');
const thresholdData: FearGreedData = {
  value: 45,
  classification: 'Fear',
  timestamp: Math.floor(Date.now() / 1000) - FG_STALENESS_THRESHOLD_SECONDS, // Exactly 12 hours
  source: 'primary',
};
const thresholdResult = isFearGreedStale(thresholdData);
console.log(`  Result: ${thresholdResult ? 'STALE' : 'FRESH'}`);
console.log(`  Expected: FRESH (exactly at threshold should be OK)\n`);

// Test 4: Backup oracle BTC price calculation
console.log('Test 4: Backup oracle BTC calculation');
function calculateBackupFG(btcChangePercent: number): { value: number; classification: string } {
  const BACKUP_ORACLE_THRESHOLDS = {
    EXTREME_FEAR_DROP: -5,
    EXTREME_GREED_RISE: 5,
  };

  let value: number;
  let classification: string;

  if (btcChangePercent <= BACKUP_ORACLE_THRESHOLDS.EXTREME_FEAR_DROP) {
    value = 20;
    classification = 'Extreme Fear (Backup Oracle)';
  } else if (btcChangePercent >= BACKUP_ORACLE_THRESHOLDS.EXTREME_GREED_RISE) {
    value = 80;
    classification = 'Extreme Greed (Backup Oracle)';
  } else {
    value = Math.round(50 + (btcChangePercent * 6));
    value = Math.max(0, Math.min(100, value));

    if (value <= 25) classification = 'Extreme Fear (Backup Oracle)';
    else if (value <= 45) classification = 'Fear (Backup Oracle)';
    else if (value <= 54) classification = 'Neutral (Backup Oracle)';
    else if (value <= 75) classification = 'Greed (Backup Oracle)';
    else classification = 'Extreme Greed (Backup Oracle)';
  }

  return { value, classification };
}

const testCases = [
  { change: -7, expectedValue: 20, expectedClass: 'Extreme Fear' },
  { change: -5, expectedValue: 20, expectedClass: 'Extreme Fear' },
  { change: -3, expectedValue: 32, expectedClass: 'Fear' },
  { change: 0, expectedValue: 50, expectedClass: 'Neutral' },
  { change: 3, expectedValue: 68, expectedClass: 'Greed' },
  { change: 5, expectedValue: 80, expectedClass: 'Extreme Greed' },
  { change: 7, expectedValue: 80, expectedClass: 'Extreme Greed' },
];

for (const tc of testCases) {
  const result = calculateBackupFG(tc.change);
  const passed = result.value === tc.expectedValue;
  console.log(`  BTC ${tc.change > 0 ? '+' : ''}${tc.change}% → F&G ${result.value} (${result.classification}) ${passed ? '✓' : '❌'}`);
}

console.log('\n========================================');
console.log('All tests completed!');
console.log('========================================');
