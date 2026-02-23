// Withdrawal API — executes withdrawals via MetaMask delegation (backend pays gas)
// This is Method B in the two-method withdrawal strategy.
// Method A (client-side UserOp) is attempted first in useWithdraw.ts.
//
// Flow:
//  1. Validate inputs
//  2. Look up delegation in Supabase (by user_address, fallback to smart_account_address)
//  3. Build ERC-20 transfer calldata
//  4. Execute via DelegationManager.redeemDelegations()
//  5. Wait for tx confirmation
//
// Error logging is comprehensive — check Vercel function logs for [withdraw] prefixed lines.

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

// ─── Config ───────────────────────────────────────────────────────────────────

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const WETH = '0x4200000000000000000000000000000000000006' as Address;
const DELEGATION_MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address;

// ─── Lazy-loaded clients ──────────────────────────────────────────────────────

let _supabase: any = null;
let _publicClient: any = null;
let _walletClient: any = null;
let _backendAccount: any = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    console.log('[withdraw] Supabase init — URL present:', !!url, '| Key present:', !!key);
    _supabase = createClient(url!, key!);
  }
  return _supabase;
}

function getPublicClient(): any {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: base, transport: http() });
  }
  return _publicClient;
}

function getBackendAccount() {
  if (!_backendAccount) {
    const pk = process.env.BACKEND_PRIVATE_KEY;
    console.log('[withdraw] Backend private key present:', !!pk);
    _backendAccount = privateKeyToAccount(pk as Hex);
    console.log('[withdraw] Backend account address:', _backendAccount.address);
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

// ─── DelegationManager ABI ────────────────────────────────────────────────────

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

// ─── Execution encoder ────────────────────────────────────────────────────────

function encodeExecution(target: Address, value: bigint, callData: Hex): Hex {
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

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  console.log('[withdraw] ──── Incoming request ────────────────────────────');

  try {
    const body = await request.json();
    const { smartAccountAddress, recipientAddress, userAddress, amount, token } = body;

    console.log('[withdraw] Request body:', {
      smartAccountAddress,
      recipientAddress,
      userAddress,
      amount,
      token,
    });

    // ── Input validation ──
    if (!smartAccountAddress || !recipientAddress || !userAddress || !amount || !token) {
      console.error('[withdraw] Missing required fields:', { smartAccountAddress, recipientAddress, userAddress, amount, token });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (token !== 'ETH' && token !== 'WETH' && token !== 'USDC') {
      console.error('[withdraw] Invalid token:', token);
      return NextResponse.json({ error: 'Invalid token — must be WETH or USDC' }, { status: 400 });
    }

    // ── Delegation lookup ──
    // Primary key: user_address (the EOA that signed the delegation)
    // Fallback: smart_account_address (in case we stored by contract address)
    // No expiry filter — expiry is enforced on-chain by the caveat enforcer.
    console.log('[withdraw] Looking up delegation by user_address:', userAddress.toLowerCase());
    const { data: byUser, error: byUserError } = await getSupabase()
      .from('delegations')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1);

    if (byUserError) {
      console.error('[withdraw] Supabase error (by user_address):', byUserError);
    } else {
      console.log('[withdraw] Delegation rows by user_address:', byUser?.length ?? 0, byUser?.map((r: any) => ({
        id: r.id,
        user_address: r.user_address,
        smart_account_address: r.smart_account_address,
        created_at: r.created_at,
        expires_at: r.expires_at,
        has_delegation_data: !!r.delegation_data,
      })));
    }

    let delegation = byUser?.[0] ?? null;

    if (!delegation) {
      console.log('[withdraw] No delegation by user_address — trying smart_account_address:', smartAccountAddress.toLowerCase());
      const { data: bySA, error: bySAError } = await getSupabase()
        .from('delegations')
        .select('*')
        .eq('smart_account_address', smartAccountAddress.toLowerCase())
        .order('created_at', { ascending: false })
        .limit(1);

      if (bySAError) {
        console.error('[withdraw] Supabase error (by smart_account_address):', bySAError);
      } else {
        console.log('[withdraw] Delegation rows by smart_account_address:', bySA?.length ?? 0, bySA?.map((r: any) => ({
          id: r.id,
          user_address: r.user_address,
          smart_account_address: r.smart_account_address,
          created_at: r.created_at,
          expires_at: r.expires_at,
          has_delegation_data: !!r.delegation_data,
        })));
      }

      delegation = bySA?.[0] ?? null;
    }

    if (!delegation) {
      console.error('[withdraw] ❌ No delegation found for user_address:', userAddress, '| smart_account:', smartAccountAddress);
      return NextResponse.json(
        { error: 'No delegation found. Please set up DCA (Step 3) to enable withdrawals.' },
        { status: 404 }
      );
    }

    console.log('[withdraw] ✅ Delegation found:', {
      id: delegation.id,
      user_address: delegation.user_address,
      smart_account_address: delegation.smart_account_address,
      created_at: delegation.created_at,
      expires_at: delegation.expires_at,
    });

    // ── Parse delegation data ──
    const delegationData = typeof delegation.delegation_data === 'string'
      ? JSON.parse(delegation.delegation_data)
      : delegation.delegation_data;

    console.log('[withdraw] Delegation data keys:', delegationData ? Object.keys(delegationData) : 'null');
    console.log('[withdraw] Has encoded field:', !!delegationData?.encoded);

    if (!delegationData?.encoded) {
      console.error('[withdraw] ❌ delegation_data.encoded is missing!', delegationData);
      return NextResponse.json(
        { error: 'Delegation data is incomplete. Please revoke and re-sign your delegation (Step 3).' },
        { status: 400 }
      );
    }

    // ── Build execution calldata ──
    const executionTarget = (token === 'ETH' || token === 'WETH') ? WETH : USDC;
    const executionCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipientAddress as Address, BigInt(amount)],
    });
    const executionValue = 0n;

    console.log('[withdraw] Execution:', {
      target: executionTarget,
      recipient: recipientAddress,
      amount,
      token,
    });

    const executionEncoded = encodeExecution(
      executionTarget as Address,
      executionValue,
      executionCallData,
    );

    // ── Execute via DelegationManager ──
    console.log('[withdraw] Calling DelegationManager.redeemDelegations at:', DELEGATION_MANAGER);

    let txHash: string;
    try {
      txHash = await getWalletClient().writeContract({
        address: DELEGATION_MANAGER,
        abi: delegationManagerAbi,
        functionName: 'redeemDelegations',
        args: [
          [[delegationData.encoded]], // delegations (bytes[][])
          [0],                        // modes (0 = SingleDefault)
          [[executionEncoded]],       // executions (bytes[][])
        ],
        chain: base,
        account: getBackendAccount(),
        gas: 300000n,
      });
    } catch (writeErr) {
      const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
      console.error('[withdraw] ❌ writeContract failed:', msg);
      console.error('[withdraw] Full error:', writeErr);
      return NextResponse.json(
        { error: `Transaction failed: ${msg.slice(0, 200)}` },
        { status: 500 }
      );
    }

    console.log('[withdraw] Transaction submitted:', txHash, '— waiting for confirmation...');

    // ── Wait for confirmation ──
    const receipt = await getPublicClient().waitForTransactionReceipt({
      hash: txHash,
      timeout: 60000,
    });

    console.log('[withdraw] Receipt status:', receipt.status, '| gasUsed:', receipt.gasUsed?.toString());

    if (receipt.status !== 'success') {
      console.error('[withdraw] ❌ Transaction reverted. Hash:', txHash);
      return NextResponse.json({ error: 'Transaction reverted on-chain' }, { status: 500 });
    }

    const elapsedMs = Date.now() - startMs;
    console.log('[withdraw] ✅ Withdrawal complete in', elapsedMs, 'ms. txHash:', txHash);

    return NextResponse.json({
      success: true,
      txHash,
      message: `Withdrew ${token} to ${recipientAddress}`,
      method: 'delegation',
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[withdraw] ❌ Unhandled error:', msg);
    console.error('[withdraw] Stack:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json(
      { error: msg.slice(0, 300) },
      { status: 500 }
    );
  }
}
