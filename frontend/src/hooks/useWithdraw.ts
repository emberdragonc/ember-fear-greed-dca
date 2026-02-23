// useWithdraw.ts
// Two-method withdrawal hook:
//   Method A: Direct UserOp via Pimlico bundler (MetaMask suggestion)
//             - Build UserOp for the MetaMask smart account
//             - Connected wallet (Base App) signs the userOpHash via personal_sign
//             - Submit to Pimlico bundler with gas sponsorship
//   Method B: Backend delegation fallback via /api/withdraw
//             - Backend executes redeemDelegations() using stored delegation
//             - No wallet signing required
//
// Method A is tried first. If it throws, Method B is attempted automatically.
// All errors are captured with full details for debugging.

'use client';

import { useState, useCallback } from 'react';
import { encodeFunctionData, parseEther, parseUnits, erc20Abi, type Address } from 'viem';
import { base } from 'wagmi/chains';
import { http } from 'viem';

// ─── Constants ────────────────────────────────────────────────────────────────

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address;
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
// EntryPoint v0.7 — used by MetaMask smart accounts kit
const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as Address;

// ─── Types ────────────────────────────────────────────────────────────────────

export type WithdrawMethod = 'userOp' | 'delegation';

export type WithdrawState =
  | { status: 'idle' }
  | { status: 'pending'; step: string; method?: WithdrawMethod }
  | { status: 'success'; txHash: string; method: WithdrawMethod }
  | { status: 'error'; message: string; details?: string; methodAttempted: WithdrawMethod | 'both' };

export interface WithdrawParams {
  /** MetaMask smart account object (from SmartAccountContext) */
  smartAccount: any;
  smartAccountAddress: string;
  recipientAddress: string;
  userAddress: string;
  amount: bigint;
  token: 'WETH' | 'USDC';
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWithdraw() {
  const [state, setState] = useState<WithdrawState>({ status: 'idle' });

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  // ── Method A: Direct UserOp via Pimlico ──────────────────────────────────────
  const tryUserOpWithdraw = useCallback(async (params: WithdrawParams): Promise<string> => {
    const { smartAccount, recipientAddress, amount, token } = params;

    const pimlicoApiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
    if (!pimlicoApiKey) {
      throw new Error('[method-a] NEXT_PUBLIC_PIMLICO_API_KEY not set');
    }
    if (!smartAccount) {
      throw new Error('[method-a] Smart account not initialized — cannot build UserOp');
    }

    const pimlicoUrl = `https://api.pimlico.io/v2/8453/rpc?apikey=${pimlicoApiKey}`;
    const tokenAddress = token === 'WETH' ? WETH_ADDRESS : USDC_ADDRESS;

    const callData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipientAddress as Address, amount],
    });

    console.log('[withdraw:method-a] Starting UserOp withdrawal', {
      token,
      tokenAddress,
      recipient: recipientAddress,
      amount: amount.toString(),
      smartAccountAddress: params.smartAccountAddress,
      entryPoint: ENTRY_POINT_V07,
      pimlicoUrl: pimlicoUrl.replace(pimlicoApiKey, '***'),
    });

    setState({ status: 'pending', step: 'Building UserOp...', method: 'userOp' });

    // Dynamically import permissionless to avoid SSR issues
    const { createSmartAccountClient } = await import('permissionless');
    const { createPimlicoClient } = await import('permissionless/clients/pimlico');

    console.log('[withdraw:method-a] Creating Pimlico client...');

    const pimlicoClient = createPimlicoClient({
      transport: http(pimlicoUrl),
      entryPoint: {
        address: ENTRY_POINT_V07,
        version: '0.7',
      },
    });

    console.log('[withdraw:method-a] Creating smart account client...');

    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: base,
      bundlerTransport: http(pimlicoUrl),
      paymaster: pimlicoClient,
    });

    console.log('[withdraw:method-a] Smart account client ready. Sending transaction via UserOp...');
    setState({ status: 'pending', step: 'Sign the UserOp in your wallet...', method: 'userOp' });

    const txHash = await smartAccountClient.sendTransaction({
      to: tokenAddress,
      data: callData,
      value: 0n,
    } as any);

    console.log('[withdraw:method-a] ✅ UserOp submitted! txHash:', txHash);
    setState({ status: 'pending', step: 'Waiting for confirmation...', method: 'userOp' });

    return txHash;
  }, []);

  // ── Method B: Backend delegation via /api/withdraw ───────────────────────────
  const tryDelegationWithdraw = useCallback(async (params: WithdrawParams): Promise<string> => {
    const { smartAccountAddress, recipientAddress, userAddress, amount, token } = params;

    console.log('[withdraw:method-b] Starting backend delegation withdrawal', {
      token,
      smartAccountAddress,
      recipient: recipientAddress,
      userAddress,
      amount: amount.toString(),
    });

    setState({ status: 'pending', step: 'Executing via delegation...', method: 'delegation' });

    const response = await fetch('/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smartAccountAddress,
        recipientAddress,
        userAddress,
        amount: amount.toString(),
        token,
      }),
    });

    const data = await response.json();

    console.log('[withdraw:method-b] API response', {
      status: response.status,
      ok: response.ok,
      data,
    });

    if (!response.ok) {
      throw new Error(data.error || `API returned ${response.status}`);
    }

    const txHash: string = data.txHash;
    console.log('[withdraw:method-b] ✅ Delegation withdrawal successful! txHash:', txHash);

    return txHash;
  }, []);

  // ── Main withdraw: try A then B ───────────────────────────────────────────────
  // Returns the final WithdrawState so callers can react directly without stale closure issues.
  const withdraw = useCallback(async (params: WithdrawParams): Promise<WithdrawState> => {
    if (!params.smartAccountAddress || !params.recipientAddress || !params.userAddress) {
      const errState: WithdrawState = {
        status: 'error',
        message: 'Wallet not connected. Please connect your wallet first.',
        methodAttempted: 'both',
      };
      setState(errState);
      return errState;
    }

    let methodAError: string | null = null;

    // ── Try Method A (UserOp) ──
    try {
      const txHash = await tryUserOpWithdraw(params);
      const successState: WithdrawState = { status: 'success', txHash, method: 'userOp' };
      setState(successState);
      console.log('[withdraw] ✅ Method A (UserOp) succeeded:', txHash);
      return successState;
    } catch (errA) {
      const errAMsg = errA instanceof Error ? errA.message : String(errA);
      methodAError = errAMsg;
      console.warn('[withdraw] ⚠️ Method A (UserOp) failed — trying Method B (delegation)', {
        error: errAMsg,
        stack: errA instanceof Error ? errA.stack : undefined,
      });
    }

    // ── Fallback to Method B (delegation) ──
    setState({
      status: 'pending',
      step: `UserOp failed — trying delegation fallback...`,
      method: 'delegation',
    });

    try {
      const txHash = await tryDelegationWithdraw(params);
      const successState: WithdrawState = { status: 'success', txHash, method: 'delegation' };
      setState(successState);
      console.log('[withdraw] ✅ Method B (delegation) succeeded:', txHash);
      return successState;
    } catch (errB) {
      const errBMsg = errB instanceof Error ? errB.message : String(errB);
      console.error('[withdraw] ❌ Both methods failed', {
        methodA: methodAError,
        methodB: errBMsg,
      });
      const errState: WithdrawState = {
        status: 'error',
        message: `Withdrawal failed. Both methods were tried.`,
        details: `UserOp error: ${methodAError}\n\nDelegation error: ${errBMsg}`,
        methodAttempted: 'both',
      };
      setState(errState);
      return errState;
    }
  }, [tryUserOpWithdraw, tryDelegationWithdraw]);

  return { state, withdraw, reset };
}
