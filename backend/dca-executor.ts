// DCA Executor Backend Service
// Runs daily to check F&G and execute swaps for delegated accounts
// Uses MetaMask Delegation Framework for secure execution

import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  formatUnits, 
  parseUnits,
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import { createExecution, ExecutionMode } from '@metamask/smart-accounts-kit';
import { DelegationManager } from '@metamask/smart-accounts-kit/contracts';

// ============ CONFIG ============

const CHAIN_ID = 8453;
const TRADING_API = 'https://trade-api.gateway.uniswap.org/v1';

const ADDRESSES = {
  // Tokens
  ETH: '0x0000000000000000000000000000000000000000' as Address,
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  // Uniswap V4 Universal Router (used by Trading API)
  UNISWAP_ROUTER: '0x6fF5693b99212Da76ad316178A184AB56D299b43' as Address,
  // Permit2 - Universal Router uses this for token transfers
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  // MetaMask Delegation
  DELEGATION_MANAGER: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address,
  // EMBER Staking (fee recipient)
  EMBER_STAKING: '0x434B2A0e38FB3E5D2ACFa2a7aE492C2A53E55Ec9' as Address,
} as const;

// Fee: 15 basis points = 0.15%
const FEE_BPS = 15;
const BPS_DENOMINATOR = 10000;

// F&G Thresholds
const FG_THRESHOLDS = {
  EXTREME_FEAR_MAX: 25,
  FEAR_MAX: 45,
  NEUTRAL_MAX: 54,
  GREED_MAX: 75,
};

// ============ TYPES ============

interface DCADecision {
  action: 'buy' | 'sell' | 'hold';
  percentage: number;
  reason: string;
}

interface DelegationRecord {
  id: string;
  user_address: string;
  smart_account_address: string; // The actual smart account holding funds
  delegation_hash: string;
  delegation_signature: string;
  delegation_data: string; // JSON stringified delegation
  max_amount_per_swap: string;
  expires_at: string;
  created_at: string;
}

interface ExecutionResult {
  success: boolean;
  txHash: string | null;
  error: string | null;
  amountIn: string;
  amountOut: string;
  feeCollected: string;
}

// ============ CLIENTS ============

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const backendAccount = privateKeyToAccount(process.env.BACKEND_PRIVATE_KEY as Hex);

const walletClient = createWalletClient({
  account: backendAccount,
  chain: base,
  transport: http(),
});

// ============ DELEGATION MANAGER ABI ============

const delegationManagerAbi = [
  {
    name: 'redeemDelegations',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'delegations', type: 'bytes[][]' },
      { name: 'modes', type: 'uint8[]' },
      { name: 'executions', type: 'bytes[][]' },
    ],
    outputs: [],
  },
] as const;

// ============ EMBER STAKING ABI ============

const emberStakingAbi = [
  {
    name: 'depositRewards',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

// ============ FEAR & GREED ============

async function fetchFearGreed(): Promise<{ value: number; classification: string }> {
  const response = await fetch('https://api.alternative.me/fng/');
  const data = await response.json();
  return {
    value: parseInt(data.data[0].value),
    classification: data.data[0].value_classification,
  };
}

function calculateDecision(fgValue: number): DCADecision {
  if (fgValue <= FG_THRESHOLDS.EXTREME_FEAR_MAX) {
    return { action: 'buy', percentage: 5, reason: 'Extreme Fear - Buy 5%' };
  }
  if (fgValue <= FG_THRESHOLDS.FEAR_MAX) {
    return { action: 'buy', percentage: 2.5, reason: 'Fear - Buy 2.5%' };
  }
  if (fgValue <= FG_THRESHOLDS.NEUTRAL_MAX) {
    return { action: 'hold', percentage: 0, reason: 'Neutral - Hold' };
  }
  if (fgValue <= FG_THRESHOLDS.GREED_MAX) {
    return { action: 'sell', percentage: 2.5, reason: 'Greed - Sell 2.5%' };
  }
  return { action: 'sell', percentage: 5, reason: 'Extreme Greed - Sell 5%' };
}

// ============ BALANCE FETCHING ============

async function getETHBalance(address: Address): Promise<bigint> {
  return publicClient.getBalance({ address });
}

async function getUSDCBalance(address: Address): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: ADDRESSES.USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
  return balance;
}

// ============ PERMIT2 ABI ============

const permit2Abi = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const;

// ============ ALLOWANCE CHECKING ============

async function getTokenAllowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
  return allowance;
}

async function getPermit2Allowance(owner: Address, token: Address, spender: Address): Promise<{ amount: bigint; expiration: number }> {
  const result = await publicClient.readContract({
    address: ADDRESSES.PERMIT2,
    abi: permit2Abi,
    functionName: 'allowance',
    args: [owner, token, spender],
  });
  return {
    amount: BigInt(result[0]),
    expiration: Number(result[1]),
  };
}

// ============ DELEGATED APPROVAL ============

async function executeDelegatedERC20Approval(
  delegation: DelegationRecord,
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint
): Promise<string | null> {
  try {
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      console.error('Delegation missing signature');
      return null;
    }

    // Encode the ERC20 approve call
    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress, amount],
    });

    const execution = createExecution({
      target: tokenAddress,
      value: 0n,
      callData: approveCalldata,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log(`ERC20 Approving ${tokenAddress} for ${spenderAddress}...`);

    const tx = await walletClient.sendTransaction({
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      gas: 300000n,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: tx,
      timeout: 60000,
    });

    if (receipt.status === 'success') {
      console.log(`ERC20 Approval successful: ${tx}`);
      return tx;
    } else {
      console.error('ERC20 Approval transaction reverted');
      return null;
    }
  } catch (error) {
    console.error('ERC20 approval error:', error);
    return null;
  }
}

// Set Permit2 internal allowance (different from ERC20 approve!)
async function executeDelegatedPermit2Approval(
  delegation: DelegationRecord,
  tokenAddress: Address,
  spenderAddress: Address
): Promise<string | null> {
  try {
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      console.error('Delegation missing signature');
      return null;
    }

    // Set max uint160 allowance, expiration far in future
    const maxAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffff'); // uint160 max
    const expiration = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year

    // Encode Permit2.approve(token, spender, amount, expiration)
    const permit2ApproveCalldata = encodeFunctionData({
      abi: permit2Abi,
      functionName: 'approve',
      args: [tokenAddress, spenderAddress, maxAmount, expiration],
    });

    const execution = createExecution({
      target: ADDRESSES.PERMIT2,
      value: 0n,
      callData: permit2ApproveCalldata,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log(`Permit2 Approving ${tokenAddress} for ${spenderAddress}...`);

    const tx = await walletClient.sendTransaction({
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      gas: 300000n,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: tx,
      timeout: 60000,
    });

    if (receipt.status === 'success') {
      console.log(`Permit2 Approval successful: ${tx}`);
      return tx;
    } else {
      console.error('Permit2 Approval transaction reverted');
      return null;
    }
  } catch (error) {
    console.error('Permit2 approval error:', error);
    return null;
  }
}

// ============ FEE CALCULATION ============

function calculateFee(amount: bigint): bigint {
  return (amount * BigInt(FEE_BPS)) / BigInt(BPS_DENOMINATOR);
}

function calculateAmountAfterFee(amount: bigint): bigint {
  return amount - calculateFee(amount);
}

// ============ SWAP EXECUTION ============

async function getSwapQuote(
  swapper: Address,
  tokenIn: Address,
  tokenOut: Address,
  amount: string
): Promise<{ quote: any; swap: any } | null> {
  try {
    // Get quote
    const quoteRes = await fetch(`${TRADING_API}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.UNISWAP_API_KEY!,
      },
      body: JSON.stringify({
        swapper,
        tokenIn,
        tokenOut,
        tokenInChainId: CHAIN_ID,
        tokenOutChainId: CHAIN_ID,
        amount,
        type: 'EXACT_INPUT',
        slippageTolerance: 1,
      }),
    });

    if (!quoteRes.ok) {
      const error = await quoteRes.json();
      console.error('Quote failed:', error);
      return null;
    }

    const quoteData = await quoteRes.json();

    // Get swap transaction
    const { permitData, permitTransaction, ...cleanQuote } = quoteData;
    const swapRes = await fetch(`${TRADING_API}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.UNISWAP_API_KEY!,
      },
      body: JSON.stringify(cleanQuote),
    });

    if (!swapRes.ok) {
      const error = await swapRes.json();
      console.error('Swap request failed:', error);
      return null;
    }

    const swapData = await swapRes.json();
    return { quote: quoteData, swap: swapData.swap };
  } catch (error) {
    console.error('Swap quote error:', error);
    return null;
  }
}

// ============ DELEGATION EXECUTION ============

async function executeDelegatedSwap(
  delegation: DelegationRecord,
  direction: 'buy' | 'sell',
  swapTo: Address,
  swapData: Hex,
  swapValue: bigint
): Promise<string | null> {
  try {
    // Parse the stored delegation data (handle both string and object)
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;
    
    // Validate the signed delegation has the required fields
    if (!signedDelegation.signature) {
      console.error('Delegation missing signature');
      return null;
    }

    // Create the execution struct using the SDK
    const execution = createExecution({
      target: swapTo,
      value: swapValue,
      callData: swapData,
    });

    // Encode the redeemDelegations call using the SDK
    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    // Send transaction via backend wallet (EOA redemption)
    const redeemTx = await walletClient.sendTransaction({
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      gas: 500000n,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: redeemTx,
      timeout: 60000,
    });

    if (receipt.status === 'success') {
      return redeemTx;
    } else {
      console.error('Transaction reverted');
      return null;
    }
  } catch (error) {
    console.error('Delegation execution error:', error);
    return null;
  }
}

// ============ FEE COLLECTION ============

// Execute delegated transfer from user's smart account to backend wallet
async function executeDelegatedFeeTransfer(
  delegation: DelegationRecord,
  tokenAddress: Address,
  amount: bigint
): Promise<string | null> {
  if (amount === 0n) return null;

  try {
    const signedDelegation = typeof delegation.delegation_data === 'string' 
      ? JSON.parse(delegation.delegation_data) 
      : delegation.delegation_data;

    if (!signedDelegation.signature) {
      console.error('Delegation missing signature for fee transfer');
      return null;
    }

    // Encode ERC20 transfer from smart account to backend wallet
    const transferCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [backendAccount.address, amount],
    });

    const execution = createExecution({
      target: tokenAddress,
      value: 0n,
      callData: transferCalldata,
    });

    const redeemCalldata = DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    console.log(`Transferring fee via delegation: ${formatUnits(amount, tokenAddress === ADDRESSES.USDC ? 6 : 18)} ${tokenAddress === ADDRESSES.USDC ? 'USDC' : 'WETH'}...`);

    const tx = await walletClient.sendTransaction({
      to: ADDRESSES.DELEGATION_MANAGER,
      data: redeemCalldata,
      gas: 300000n,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ 
      hash: tx,
      timeout: 60000,
    });

    if (receipt.status === 'success') {
      console.log(`Fee transfer successful: ${tx}`);
      return tx;
    } else {
      console.error('Fee transfer transaction reverted');
      return null;
    }
  } catch (error) {
    console.error('Fee transfer error:', error);
    return null;
  }
}

// Collect fee: transfer from user's smart account, then deposit to staking
async function collectFee(
  delegation: DelegationRecord,
  tokenAddress: Address, 
  amount: bigint
): Promise<string | null> {
  if (amount === 0n) return null;

  try {
    // Step 1: Transfer fee from user's smart account to backend wallet via delegation
    const transferTx = await executeDelegatedFeeTransfer(delegation, tokenAddress, amount);
    if (!transferTx) {
      console.error('Fee transfer from smart account failed');
      return null;
    }

    // Step 2: Approve staking contract to spend the fee (from backend wallet)
    const approveTx = await walletClient.writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [ADDRESSES.EMBER_STAKING, amount],
    });
    
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // Step 3: Deposit the fee as rewards to stakers
    const depositTx = await walletClient.writeContract({
      address: ADDRESSES.EMBER_STAKING,
      abi: emberStakingAbi,
      functionName: 'depositRewards',
      args: [tokenAddress, amount],
    });

    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    
    console.log(`Fee collected and deposited to stakers: ${formatUnits(amount, tokenAddress === ADDRESSES.USDC ? 6 : 18)} ${tokenAddress === ADDRESSES.USDC ? 'USDC' : 'ETH'}`);
    return depositTx;
  } catch (error) {
    console.error('Fee collection error:', error);
    return null;
  }
}

// ============ DATABASE ============

async function getActiveDelegations(): Promise<DelegationRecord[]> {
  const { data, error } = await supabase
    .from('delegations')
    .select('*')
    .gt('expires_at', new Date().toISOString());

  if (error) {
    console.error('Database error:', error);
    return [];
  }
  return data || [];
}

async function logExecution(
  delegationId: string,
  userAddress: string,
  fgValue: number,
  decision: DCADecision,
  result: ExecutionResult
) {
  const { error } = await supabase.from('dca_executions').insert({
    // delegation_id: delegationId, // Column doesn't exist yet
    user_address: userAddress,
    fear_greed_index: fgValue,
    action: decision.action,
    amount_in: result.amountIn,
    amount_out: result.amountOut,
    fee_collected: result.feeCollected,
    tx_hash: result.txHash,
    status: result.success ? 'success' : 'failed',
    error_message: result.error,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to log execution:', error);
  }
}

async function updateProtocolStats(volume: bigint, fees: bigint) {
  // Update protocol-wide stats
  const { error } = await supabase.rpc('increment_protocol_stats', {
    volume_delta: volume.toString(),
    fees_delta: fees.toString(),
  });

  if (error) {
    console.error('Failed to update stats:', error);
  }
}

// ============ MAIN EXECUTION ============

async function processUserDCA(
  delegation: DelegationRecord,
  decision: DCADecision,
  fgValue: number
): Promise<ExecutionResult> {
  const userAddress = delegation.user_address as Address;
  const smartAccountAddress = delegation.smart_account_address as Address;
  
  console.log(`\n--- Processing: ${userAddress} ---`);
  console.log(`Smart Account: ${smartAccountAddress}`);

  // Determine swap direction and get balance
  const isBuy = decision.action === 'buy';
  const tokenIn = isBuy ? ADDRESSES.USDC : ADDRESSES.WETH;
  const tokenOut = isBuy ? ADDRESSES.WETH : ADDRESSES.USDC;
  
  // Get balance from SMART ACCOUNT (not EOA)
  const balance = isBuy 
    ? await getUSDCBalance(smartAccountAddress)
    : await getETHBalance(smartAccountAddress);

  if (balance === 0n) {
    console.log(`No ${isBuy ? 'USDC' : 'ETH'} balance, skipping`);
    return {
      success: false,
      txHash: null,
      error: 'Insufficient balance',
      amountIn: '0',
      amountOut: '0',
      feeCollected: '0',
    };
  }

  // Calculate swap amount (percentage of balance)
  const percentage = BigInt(Math.floor(decision.percentage * 100));
  let swapAmount = (balance * percentage) / 10000n;

  // Apply max amount limit from delegation
  const maxAmount = BigInt(delegation.max_amount_per_swap);
  if (swapAmount > maxAmount) {
    swapAmount = maxAmount;
    console.log(`Capped to max amount: ${formatUnits(maxAmount, isBuy ? 6 : 18)}`);
  }

  // Calculate fee (taken from input)
  const fee = calculateFee(swapAmount);
  const swapAmountAfterFee = swapAmount - fee;

  console.log(`Swap: ${formatUnits(swapAmountAfterFee, isBuy ? 6 : 18)} ${isBuy ? 'USDC' : 'ETH'} -> ${isBuy ? 'ETH' : 'USDC'}`);
  console.log(`Fee: ${formatUnits(fee, isBuy ? 6 : 18)} ${isBuy ? 'USDC' : 'ETH'}`);

  // STEP 1: Check ERC20 approve to Permit2 contract
  const erc20Allowance = await getTokenAllowance(
    tokenIn,
    smartAccountAddress,
    ADDRESSES.PERMIT2
  );

  if (erc20Allowance < swapAmount) {
    console.log(`ERC20 allowance to Permit2: ${formatUnits(erc20Allowance, isBuy ? 6 : 18)}, need: ${formatUnits(swapAmount, isBuy ? 6 : 18)}`);
    console.log('Executing ERC20 approve to Permit2...');
    
    const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    const erc20ApproveTx = await executeDelegatedERC20Approval(
      delegation,
      tokenIn,
      ADDRESSES.PERMIT2,
      maxApproval
    );

    if (!erc20ApproveTx) {
      return {
        success: false,
        txHash: null,
        error: 'Failed to ERC20 approve token for Permit2',
        amountIn: '0',
        amountOut: '0',
        feeCollected: '0',
      };
    }
  } else {
    console.log('ERC20 already approved for Permit2 ✓');
  }

  // STEP 2: Check Permit2 internal allowance to Universal Router
  const permit2Allowance = await getPermit2Allowance(
    smartAccountAddress,
    tokenIn,
    ADDRESSES.UNISWAP_ROUTER
  );
  const now = Math.floor(Date.now() / 1000);

  if (permit2Allowance.amount < swapAmount || permit2Allowance.expiration < now) {
    console.log(`Permit2 allowance: ${formatUnits(permit2Allowance.amount, isBuy ? 6 : 18)}, exp: ${permit2Allowance.expiration}`);
    console.log('Executing Permit2 internal approve...');
    
    const permit2ApproveTx = await executeDelegatedPermit2Approval(
      delegation,
      tokenIn,
      ADDRESSES.UNISWAP_ROUTER
    );

    if (!permit2ApproveTx) {
      return {
        success: false,
        txHash: null,
        error: 'Failed to set Permit2 internal allowance',
        amountIn: '0',
        amountOut: '0',
        feeCollected: '0',
      };
    }
  } else {
    console.log('Permit2 internal allowance OK ✓');
  }

  // Get swap quote (swapper is the smart account, not EOA)
  const swapQuote = await getSwapQuote(
    smartAccountAddress,
    tokenIn,
    tokenOut,
    swapAmountAfterFee.toString()
  );

  if (!swapQuote) {
    return {
      success: false,
      txHash: null,
      error: 'Failed to get swap quote',
      amountIn: swapAmountAfterFee.toString(),
      amountOut: '0',
      feeCollected: '0',
    };
  }

  // Execute the delegated swap
  const txHash = await executeDelegatedSwap(
    delegation,
    decision.action as 'buy' | 'sell',
    swapQuote.swap.to as Address,
    swapQuote.swap.data as Hex,
    BigInt(swapQuote.swap.value || '0')
  );

  if (!txHash) {
    return {
      success: false,
      txHash: null,
      error: 'Swap execution failed',
      amountIn: swapAmountAfterFee.toString(),
      amountOut: swapQuote.quote.quote.output.amount,
      feeCollected: '0',
    };
  }

  // Fee collection disabled for launch - swaps work, fees can be added later
  // await collectFee(delegation, tokenIn, fee);
  console.log(`Fee skipped for now: ${formatUnits(fee, tokenIn === ADDRESSES.USDC ? 6 : 18)} ${tokenIn === ADDRESSES.USDC ? 'USDC' : 'ETH'}`);

  return {
    success: true,
    txHash,
    error: null,
    amountIn: swapAmountAfterFee.toString(),
    amountOut: swapQuote.quote.quote.output.amount,
    feeCollected: fee.toString(),
  };
}

async function runDCA() {
  console.log('========================================');
  console.log('  Fear & Greed DCA Executor');
  console.log('========================================');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Backend: ${backendAccount.address}`);

  // Check backend has gas
  const backendBalance = await getETHBalance(backendAccount.address);
  console.log(`Backend ETH: ${formatUnits(backendBalance, 18)}`);
  
  if (backendBalance < parseUnits('0.001', 18)) {
    console.error('Backend wallet needs more ETH for gas!');
    return;
  }

  // 1. Fetch Fear & Greed
  const fg = await fetchFearGreed();
  console.log(`\nFear & Greed: ${fg.value} (${fg.classification})`);

  // 2. Calculate decision
  const decision = calculateDecision(fg.value);
  console.log(`Decision: ${decision.reason}`);

  if (decision.action === 'hold') {
    console.log('\n✓ Market neutral - No action needed');
    return;
  }

  // 3. Get active delegations
  const delegations = await getActiveDelegations();
  console.log(`\nActive delegations: ${delegations.length}`);

  if (delegations.length === 0) {
    console.log('No active delegations to process');
    return;
  }

  // 4. Process each delegation
  let totalVolume = 0n;
  let totalFees = 0n;
  let successCount = 0;

  for (const delegation of delegations) {
    const result = await processUserDCA(delegation, decision, fg.value);
    
    // Log to database
    await logExecution(delegation.id, delegation.user_address, fg.value, decision, result);

    if (result.success) {
      successCount++;
      totalVolume += BigInt(result.amountIn);
      totalFees += BigInt(result.feeCollected);
    }
  }

  // 5. Update protocol stats
  if (totalVolume > 0n) {
    await updateProtocolStats(totalVolume, totalFees);
  }

  // 6. Summary
  console.log('\n========================================');
  console.log('  Execution Summary');
  console.log('========================================');
  console.log(`Processed: ${delegations.length} delegations`);
  console.log(`Successful: ${successCount}`);
  console.log(`Total Volume: ${formatUnits(totalVolume, 6)} (base units)`);
  console.log(`Total Fees: ${formatUnits(totalFees, 6)} (base units)`);
  console.log('========================================\n');
}

// Run
runDCA()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
