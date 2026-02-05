// useSwap - React hook for executing swaps via Uniswap Trading API
'use client';

import { useState, useCallback } from 'react';
import { useWalletClient, usePublicClient } from 'wagmi';
import {
  TOKENS,
  QuoteResponse,
  SwapTransaction,
  checkApproval,
  getQuote,
  getSwapTransaction,
  calculateFee,
  FEE_BIPS,
} from '@/lib/swap';

export type SwapDirection = 'buy' | 'sell';

interface SwapState {
  status: 'idle' | 'checking_approval' | 'approving' | 'quoting' | 'swapping' | 'success' | 'error';
  quote: QuoteResponse | null;
  txHash: `0x${string}` | null;
  error: string | null;
}

export function useSwap() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  
  const [state, setState] = useState<SwapState>({
    status: 'idle',
    quote: null,
    txHash: null,
    error: null,
  });

  /**
   * Execute a DCA swap based on Fear & Greed decision
   * @param direction - 'buy' (USDC → ETH) or 'sell' (ETH → USDC)
   * @param amount - Amount in wei (for ETH) or base units (for USDC)
   */
  const executeSwap = useCallback(async (
    direction: SwapDirection,
    amount: string
  ): Promise<`0x${string}` | null> => {
    if (!walletClient?.account) {
      setState(s => ({ ...s, status: 'error', error: 'Wallet not connected' }));
      return null;
    }

    const tokenIn = direction === 'buy' ? TOKENS.USDC : TOKENS.ETH;
    const tokenOut = direction === 'buy' ? TOKENS.ETH : TOKENS.USDC;
    const swapperAddress = walletClient.account.address;

    try {
      // 1. Check approval (for USDC sells)
      setState(s => ({ ...s, status: 'checking_approval', error: null }));
      
      const approvalResult = await checkApproval(swapperAddress, tokenIn, amount);
      
      if (approvalResult.approval) {
        setState(s => ({ ...s, status: 'approving' }));
        
        const approvalHash = await walletClient.sendTransaction({
          to: approvalResult.approval.to,
          data: approvalResult.approval.data,
          value: BigInt(approvalResult.approval.value || '0'),
        });
        
        // Wait for approval to confirm
        await publicClient?.waitForTransactionReceipt({ hash: approvalHash });
      }

      // 2. Get quote
      setState(s => ({ ...s, status: 'quoting' }));
      
      const quoteResponse = await getQuote({
        swapper: swapperAddress,
        tokenIn,
        tokenOut,
        amount,
        type: 'EXACT_INPUT',
        slippageTolerance: 1, // 1% for volatile markets
      });
      
      setState(s => ({ ...s, quote: quoteResponse }));

      // 3. Get swap transaction
      setState(s => ({ ...s, status: 'swapping' }));
      
      const swapTx = await getSwapTransaction(quoteResponse);

      // 4. Execute swap
      const txHash = await walletClient.sendTransaction({
        to: swapTx.to,
        data: swapTx.data,
        value: BigInt(swapTx.value || '0'),
        gas: swapTx.gasLimit ? BigInt(swapTx.gasLimit) : undefined,
      });

      setState(s => ({ 
        ...s, 
        status: 'success', 
        txHash,
        error: null 
      }));

      return txHash;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Swap failed';
      setState(s => ({ ...s, status: 'error', error: errorMessage }));
      return null;
    }
  }, [walletClient, publicClient]);

  /**
   * Get a quote without executing (for preview)
   */
  const previewSwap = useCallback(async (
    direction: SwapDirection,
    amount: string
  ): Promise<QuoteResponse | null> => {
    if (!walletClient?.account) return null;

    const tokenIn = direction === 'buy' ? TOKENS.USDC : TOKENS.ETH;
    const tokenOut = direction === 'buy' ? TOKENS.ETH : TOKENS.USDC;

    try {
      const quote = await getQuote({
        swapper: walletClient.account.address,
        tokenIn,
        tokenOut,
        amount,
        type: 'EXACT_INPUT',
        slippageTolerance: 1,
      });
      
      setState(s => ({ ...s, quote }));
      return quote;
    } catch (err) {
      return null;
    }
  }, [walletClient]);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      quote: null,
      txHash: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    executeSwap,
    previewSwap,
    reset,
    feeBips: FEE_BIPS,
    calculateFee,
  };
}

export default useSwap;
