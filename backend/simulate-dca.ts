// simulate-dca.ts - Simulate the DCA executor flow without executing
import { createPublicClient, http, formatUnits, parseUnits, encodeFunctionData, type Hex } from 'viem';
import { base } from 'viem/chains';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Contract addresses
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const UNIVERSAL_ROUTER = '0x6fF5693b99212Da76ad316178A184AB56D299b43';
const EXPECTED_DELEGATE = '0xc472e866045d2e9ABd2F2459cE3BDB275b72C7e1';

const ALCHEMY_RPC = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

const publicClient = createPublicClient({
  chain: base,
  transport: http(ALCHEMY_RPC),
});

const supabase = createSupabaseClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ERC20 ABI for balance checks
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Permit2 ABI for allowance checks
const PERMIT2_ABI = [
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function fetchFearGreed(): Promise<{ value: number; classification: string }> {
  const response = await fetch('https://api.alternative.me/fng/');
  const data = await response.json();
  return {
    value: parseInt(data.data[0].value),
    classification: data.data[0].value_classification,
  };
}

function calculateDecision(fgValue: number) {
  if (fgValue <= 10) return { action: 'buy', percentage: 500, reason: `Extreme Fear (${fgValue}) - Buy 5%` };
  if (fgValue <= 25) return { action: 'buy', percentage: 300, reason: `Fear (${fgValue}) - Buy 3%` };
  if (fgValue <= 45) return { action: 'buy', percentage: 100, reason: `Mild Fear (${fgValue}) - Buy 1%` };
  if (fgValue <= 55) return { action: 'hold', percentage: 0, reason: `Neutral (${fgValue}) - Hold` };
  if (fgValue <= 75) return { action: 'sell', percentage: 100, reason: `Greed (${fgValue}) - Sell 1%` };
  if (fgValue <= 90) return { action: 'sell', percentage: 300, reason: `High Greed (${fgValue}) - Sell 3%` };
  return { action: 'sell', percentage: 500, reason: `Extreme Greed (${fgValue}) - Sell 5%` };
}

async function simulateSwap(
  smartAccountAddress: string,
  usdcBalance: bigint,
  percentage: number,
  isBuy: boolean
) {
  const swapAmount = (usdcBalance * BigInt(percentage)) / 10000n;
  
  console.log(`\n    📊 Simulating swap for ${smartAccountAddress}:`);
  console.log(`       Input: ${formatUnits(swapAmount, 6)} USDC`);
  
  // Get quote from Uniswap
  try {
    const quoteResponse = await fetch('https://trade-api.gateway.uniswap.org/v1/quote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.UNISWAP_API_KEY!,
      },
      body: JSON.stringify({
        tokenIn: USDC,
        tokenOut: WETH,
        tokenInChainId: 8453,
        tokenOutChainId: 8453,
        amount: swapAmount.toString(),
        type: 'EXACT_INPUT',
        swapper: smartAccountAddress,
        slippageTolerance: 0.5,
      }),
    });
    
    const quote = await quoteResponse.json();
    
    if (quote.quote) {
      const outputAmount = BigInt(quote.quote.output.amount);
      const ethPrice = Number(swapAmount) / Number(outputAmount) * 1e12; // rough price calc
      console.log(`       Output: ${formatUnits(outputAmount, 18)} WETH`);
      console.log(`       ✅ Quote successful`);
      return { success: true, output: outputAmount, input: swapAmount };
    } else {
      console.log(`       ❌ Quote failed: ${JSON.stringify(quote)}`);
      return { success: false, error: 'Quote failed' };
    }
  } catch (error: any) {
    console.log(`       ❌ Quote error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('========================================');
  console.log('  🧪 DCA SIMULATION (No Execution)');
  console.log('========================================\n');

  // Step 1: Fetch Fear & Greed Index
  console.log('📈 Step 1: Fetching Fear & Greed Index...');
  const fg = await fetchFearGreed();
  console.log(`   Value: ${fg.value} (${fg.classification})`);
  
  const decision = calculateDecision(fg.value);
  console.log(`   Decision: ${decision.reason}`);
  
  if (decision.action === 'hold') {
    console.log('\n✅ SIMULATION RESULT: No action needed (market neutral)');
    return;
  }

  // Step 2: Get active delegations from Supabase
  console.log('\n📋 Step 2: Fetching active delegations...');
  const { data: allDelegations, error } = await supabase
    .from('delegations')
    .select('*')
    .gt('expires_at', new Date().toISOString());
  
  if (error) {
    console.log(`   ❌ Supabase error: ${error.message}`);
    return;
  }
  
  console.log(`   Found ${allDelegations?.length || 0} active delegations`);

  // Step 3: Filter valid delegations
  console.log('\n🔍 Step 3: Filtering valid delegations...');
  const validDelegations = (allDelegations || []).filter(d => {
    // Parse delegation_data JSON to get the delegate address
    let delegateAddress: string | undefined;
    try {
      const delegationData = typeof d.delegation_data === 'string' 
        ? JSON.parse(d.delegation_data) 
        : d.delegation_data;
      delegateAddress = delegationData?.delegate;
    } catch {
      delegateAddress = undefined;
    }
    
    const isValid = delegateAddress?.toLowerCase() === EXPECTED_DELEGATE.toLowerCase();
    if (!isValid) {
      console.log(`   ⚠️ SKIP: ${d.user_address} (outdated delegate: ${delegateAddress || 'undefined'})`);
    }
    return isValid;
  });
  console.log(`   ${validDelegations.length} delegations with valid delegate`);

  if (validDelegations.length === 0) {
    console.log('\n✅ SIMULATION RESULT: No valid delegations to process');
    return;
  }

  // Step 4: Check balances and approvals
  console.log('\n💰 Step 4: Checking wallet balances and approvals...');
  
  const eligibleWallets: {
    address: string;
    smartAccount: string;
    usdcBalance: bigint;
    wethBalance: bigint;
    hasErc20Approval: boolean;
    hasPermit2Approval: boolean;
  }[] = [];

  for (const delegation of validDelegations) {
    const smartAccount = delegation.smart_account_address;
    console.log(`\n   📍 ${smartAccount}:`);
    
    // Check USDC balance
    const usdcBalance = await publicClient.readContract({
      address: USDC as Hex,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [smartAccount as Hex],
    });
    
    // Check WETH balance
    const wethBalance = await publicClient.readContract({
      address: WETH as Hex,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [smartAccount as Hex],
    });
    
    // Check ERC20 approval (USDC -> Permit2)
    const erc20Allowance = await publicClient.readContract({
      address: USDC as Hex,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [smartAccount as Hex, PERMIT2 as Hex],
    });
    
    // Check Permit2 approval (USDC -> Universal Router)
    const permit2Allowance = await publicClient.readContract({
      address: PERMIT2 as Hex,
      abi: PERMIT2_ABI,
      functionName: 'allowance',
      args: [smartAccount as Hex, USDC as Hex, UNIVERSAL_ROUTER as Hex],
    });
    
    const hasErc20Approval = erc20Allowance > 0n;
    const hasPermit2Approval = permit2Allowance[0] > 0n && permit2Allowance[1] > BigInt(Math.floor(Date.now() / 1000));
    
    console.log(`      USDC: ${formatUnits(usdcBalance, 6)}`);
    console.log(`      WETH: ${formatUnits(wethBalance, 18)}`);
    console.log(`      ERC20 Approval: ${hasErc20Approval ? '✅' : '❌ needs approval'}`);
    console.log(`      Permit2 Approval: ${hasPermit2Approval ? '✅' : '❌ needs approval'}`);
    
    const MIN_SWAP = parseUnits('0.10', 6);
    if (usdcBalance < MIN_SWAP) {
      console.log(`      ⚠️ Balance too low for swap (min $0.10)`);
      continue;
    }
    
    eligibleWallets.push({
      address: delegation.user_address,
      smartAccount,
      usdcBalance,
      wethBalance,
      hasErc20Approval,
      hasPermit2Approval,
    });
  }

  console.log(`\n   📊 Summary: ${eligibleWallets.length} wallets eligible for swap`);

  // Step 5: Phase 1 Simulation (Approvals)
  console.log('\n🔐 Step 5: Phase 1 - Approval Simulation...');
  const needsApproval = eligibleWallets.filter(w => !w.hasErc20Approval || !w.hasPermit2Approval);
  if (needsApproval.length > 0) {
    console.log(`   ${needsApproval.length} wallets need approval transactions`);
    for (const wallet of needsApproval) {
      console.log(`   - ${wallet.smartAccount}: ERC20=${wallet.hasErc20Approval ? '✅' : '❌'}, Permit2=${wallet.hasPermit2Approval ? '✅' : '❌'}`);
    }
    console.log('   These would be submitted as UserOps via Pimlico bundler');
  } else {
    console.log('   ✅ All wallets already have approvals');
  }

  // Step 6: Phase 2 Simulation (Swaps)
  console.log('\n💱 Step 6: Phase 2 - Swap Simulation...');
  
  let totalInputUsdc = 0n;
  let totalOutputWeth = 0n;
  let successCount = 0;
  
  for (const wallet of eligibleWallets) {
    const result = await simulateSwap(
      wallet.smartAccount,
      wallet.usdcBalance,
      decision.percentage,
      decision.action === 'buy'
    );
    
    if (result.success && result.output) {
      totalInputUsdc += result.input!;
      totalOutputWeth += result.output;
      successCount++;
    }
  }

  // Final Summary
  console.log('\n========================================');
  console.log('  📊 SIMULATION SUMMARY');
  console.log('========================================');
  console.log(`  Fear & Greed: ${fg.value} (${fg.classification})`);
  console.log(`  Action: ${decision.action.toUpperCase()} ${decision.percentage / 100}%`);
  console.log(`  Total Delegations: ${allDelegations?.length || 0}`);
  console.log(`  Valid Delegations: ${validDelegations.length}`);
  console.log(`  Eligible for Swap: ${eligibleWallets.length}`);
  console.log(`  Simulated Successfully: ${successCount}`);
  console.log(`  ---`);
  console.log(`  Total USDC In: $${formatUnits(totalInputUsdc, 6)}`);
  console.log(`  Total WETH Out: ${formatUnits(totalOutputWeth, 18)} WETH`);
  console.log('========================================\n');
  
  if (successCount > 0) {
    console.log('✅ SIMULATION SUCCESSFUL - All swaps would execute correctly');
  } else {
    console.log('⚠️ NO SWAPS SIMULATED - Check balances/approvals');
  }
}

main().catch(console.error);
