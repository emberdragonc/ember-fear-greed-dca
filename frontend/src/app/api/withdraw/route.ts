// Withdrawal API - executes withdrawals via delegation (backend pays gas)
import { NextRequest, NextResponse } from 'next/server';
import { 
  createPublicClient, 
  createWalletClient, 
  http, 
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

// Config
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const DELEGATION_MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address;

// Lazy-loaded clients (initialized on first request to avoid build-time env issues)
let _supabase: any = null;
let _publicClient: any = null;
let _walletClient: any = null;
let _backendAccount: any = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
  }
  return _supabase;
}

function getPublicClient(): any {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });
  }
  return _publicClient;
}

function getBackendAccount() {
  if (!_backendAccount) {
    _backendAccount = privateKeyToAccount(process.env.BACKEND_PRIVATE_KEY as Hex);
  }
  return _backendAccount;
}

function getWalletClient(): any {
  if (!_walletClient) {
    _walletClient = createWalletClient({
      account: getBackendAccount(),
      chain: base,
      transport: http(),
    });
  }
  return _walletClient;
}

// Delegation Manager ABI for executing via delegation
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

// Simple execution encoder
function encodeExecution(target: Address, value: bigint, callData: Hex): Hex {
  // Encode as a simple tuple (target, value, callData)
  return encodeFunctionData({
    abi: [{
      name: 'execute',
      type: 'function',
      inputs: [
        { name: 'target', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'callData', type: 'bytes' },
      ],
      outputs: [],
    }],
    functionName: 'execute',
    args: [target, value, callData],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { smartAccountAddress, recipientAddress, userAddress, amount, token } = body;

    // Validate inputs
    if (!smartAccountAddress || !recipientAddress || !userAddress || !amount || !token) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (token !== 'ETH' && token !== 'USDC') {
      return NextResponse.json(
        { error: 'Invalid token - must be ETH or USDC' },
        { status: 400 }
      );
    }

    // Get delegation from database (lookup by user's EOA address)
    const { data: delegation, error: dbError } = await getSupabase()
      .from('delegations')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .gt('expires_at', new Date().toISOString())
      .single();

    if (dbError || !delegation) {
      return NextResponse.json(
        { error: 'No active delegation found. Please complete Step 3 - Configure DCA Delegation first.' },
        { status: 404 }
      );
    }

    // Parse delegation data (stored in delegation_hash as JSON until schema updated)
    const storedData = JSON.parse(delegation.delegation_hash);
    const delegationData = storedData.data;

    // Build the withdrawal execution
    let executionCallData: Hex;
    let executionValue = 0n;

    if (token === 'ETH') {
      // For ETH: just send value to recipient
      executionCallData = '0x' as Hex;
      executionValue = BigInt(amount);
    } else {
      // For USDC: call transfer on USDC contract
      executionCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientAddress as Address, BigInt(amount)],
      });
    }

    const executionTarget = token === 'ETH' ? recipientAddress : USDC;
    const executionEncoded = encodeExecution(
      executionTarget as Address,
      executionValue,
      executionCallData
    );

    // Execute via DelegationManager
    const txHash = await getWalletClient().writeContract({
      address: DELEGATION_MANAGER,
      abi: delegationManagerAbi,
      functionName: 'redeemDelegations',
      args: [
        [[delegationData.encoded]], // delegations
        [0], // modes (0 = SingleDefault)
        [[executionEncoded]], // executions
      ],
      chain: base,
      account: getBackendAccount(),
      gas: 300000n,
    });

    // Wait for confirmation
    const receipt = await getPublicClient().waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });

    if (receipt.status !== 'success') {
      return NextResponse.json(
        { error: 'Transaction reverted' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      txHash,
      message: `Withdrew ${token} to ${recipientAddress}`,
    });

  } catch (error) {
    console.error('Withdrawal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Withdrawal failed' },
      { status: 500 }
    );
  }
}
