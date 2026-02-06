// useDelegation.ts - Hook for managing DCA delegations
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { type Address, keccak256, encodePacked } from 'viem';
import { createClient } from '@supabase/supabase-js';
import {
  DELEGATION_ADDRESSES,
  BACKEND_SIGNER,
  DELEGATION_CONFIG,
  calculateExpiryTimestamp,
  calculateStartTimestamp,
  saveDelegation,
  loadDelegation,
  clearDelegation,
  isDelegationExpired,
  type StoredDelegation,
  type DelegationStatus,
} from '@/lib/delegation';

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

interface DelegationState {
  status: 'idle' | 'loading' | 'created' | 'signed' | 'error';
  error: string | null;
  delegation: StoredDelegation | null;
}

interface UseDelegationReturn {
  state: DelegationState;
  createAndSignDelegation: (basePercentage: number, targetAsset: string, smartAccountAddress?: string) => Promise<void>;
  revokeDelegation: () => Promise<void>;
  refreshDelegation: () => void;
  isExpired: boolean;
  daysUntilExpiry: number;
}

export function useDelegation(): UseDelegationReturn {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [state, setState] = useState<DelegationState>({
    status: 'idle',
    error: null,
    delegation: null,
  });

  // Load existing delegation on mount (check localStorage + DB)
  useEffect(() => {
    if (!isConnected || !address) {
      setState({ status: 'idle', error: null, delegation: null });
      return;
    }

    const checkDelegation = async () => {
      // First check localStorage
      const stored = loadDelegation();
      if (stored && stored.delegator.toLowerCase() === address.toLowerCase()) {
        // Check if expired
        if (isDelegationExpired(stored.caveats.expiry)) {
          setState({
            status: 'idle',
            error: 'Previous delegation expired',
            delegation: { ...stored, status: 'expired' },
          });
        } else {
          setState({
            status: stored.signature ? 'signed' : 'created',
            error: null,
            delegation: stored,
          });
        }
        return;
      }

      // If not in localStorage, check database
      try {
        const response = await fetch(`/api/delegation?userAddress=${address}`);
        const result = await response.json();
        if (result.exists) {
          // Delegation exists in DB - mark as signed
          setState({
            status: 'signed',
            error: null,
            delegation: {
              delegate: BACKEND_SIGNER,
              delegator: address,
              delegationHash: '',
              signature: 'stored-in-db',
              status: 'signed',
              createdAt: new Date().toISOString(),
              expiresAt: result.expiresAt,
              caveats: {
                allowedTargets: [] as `0x${string}`[],
                allowedMethods: [],
                maxCalls: DELEGATION_CONFIG.MAX_CALLS_PER_DAY,
                expiry: BigInt(Math.floor(new Date(result.expiresAt).getTime() / 1000)), // Unix seconds
              },
              basePercentage: 2.5,
              targetAsset: 'ETH',
            },
          });
        }
      } catch (err) {
        console.error('Failed to check delegation in DB:', err);
      }
    };

    checkDelegation();
  }, [address, isConnected]);

  // Save delegation to Supabase via API (server-side with service key)
  const saveDelegationToDb = async (delegation: StoredDelegation, smartAccountAddress?: string) => {
    try {
      const response = await fetch('/api/delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: delegation.delegator,
          smartAccountAddress: smartAccountAddress,
          delegationHash: delegation.delegationHash,
          signature: delegation.signature,
          delegationData: {
            delegate: delegation.delegate,
            delegator: delegation.delegator,
            caveats: {
              ...delegation.caveats,
              expiry: delegation.caveats.expiry.toString(),
            },
            basePercentage: delegation.basePercentage,
            targetAsset: delegation.targetAsset,
          },
          maxAmountPerSwap: DELEGATION_CONFIG.MAX_SWAP_AMOUNT_USDC.toString(),
          expiresAt: delegation.expiresAt,
        }),
      });

      const result = await response.json();
      
      if (!response.ok) {
        console.error('Failed to save delegation to DB:', result.error);
      } else {
        console.log('Delegation saved to database');
      }
    } catch (err) {
      console.error('Database error:', err);
    }
  };

  // Remove delegation from Supabase via API (uses service key for proper permissions)
  const removeDelegationFromDb = async (userAddress: string) => {
    try {
      const response = await fetch(`/api/delegation?userAddress=${userAddress}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json();
        console.error('Failed to remove delegation from DB:', result.error);
      } else {
        console.log('Delegation removed from database');
      }
    } catch (err) {
      console.error('Database error:', err);
    }
  };

  // Create and sign a new delegation
  const createAndSignDelegation = useCallback(async (
    basePercentage: number,
    targetAsset: string,
    smartAccountAddress?: string
  ) => {
    if (!address || !walletClient || !publicClient) {
      setState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return;
    }

    setState({ status: 'loading', error: null, delegation: null });

    try {
      const startTimestamp = calculateStartTimestamp();
      const expiryTimestamp = calculateExpiryTimestamp();
      
      // Create delegation data structure
      const delegationData: StoredDelegation = {
        delegationHash: '', // Will be set after hashing
        delegate: BACKEND_SIGNER,
        delegator: address,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Number(expiryTimestamp) * 1000).toISOString(),
        basePercentage,
        targetAsset,
        status: 'created' as DelegationStatus,
        caveats: {
          allowedTargets: [DELEGATION_ADDRESSES.UNISWAP_ROUTER],
          allowedMethods: [
            'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',
            'exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))',
          ],
          maxCalls: DELEGATION_CONFIG.MAX_CALLS_PER_DAY,
          expiry: expiryTimestamp,
        },
      };

      // Create a hash of the delegation for signing
      const delegationHash = keccak256(
        encodePacked(
          ['address', 'address', 'address[]', 'uint256', 'uint256', 'uint8'],
          [
            delegationData.delegate,
            delegationData.delegator,
            delegationData.caveats.allowedTargets,
            startTimestamp,
            expiryTimestamp,
            Number(delegationData.caveats.maxCalls),
          ]
        )
      );
      
      delegationData.delegationHash = delegationHash;

      // Request signature from user using EIP-712 typed data
      const typedData = {
        domain: {
          name: 'Fear & Greed DCA',
          version: '1',
          chainId: 8453, // Base mainnet
          verifyingContract: DELEGATION_ADDRESSES.DELEGATION_MANAGER,
        },
        types: {
          Delegation: [
            { name: 'delegate', type: 'address' },
            { name: 'delegator', type: 'address' },
            { name: 'allowedTarget', type: 'address' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validUntil', type: 'uint256' },
            { name: 'maxCalls', type: 'uint256' },
            { name: 'basePercentage', type: 'uint256' },
          ],
        },
        primaryType: 'Delegation' as const,
        message: {
          delegate: delegationData.delegate,
          delegator: delegationData.delegator,
          allowedTarget: DELEGATION_ADDRESSES.UNISWAP_ROUTER,
          validAfter: startTimestamp,
          validUntil: expiryTimestamp,
          maxCalls: Number(delegationData.caveats.maxCalls),
          basePercentage: BigInt(Math.floor(basePercentage * 100)), // Convert % to basis points (2.5% -> 250)
        },
      };

      const signature = await walletClient.signTypedData({ 
        ...typedData, 
        account: walletClient.account! 
      });
      
      delegationData.signature = signature;
      delegationData.status = 'signed';

      // Save to localStorage
      saveDelegation(delegationData);
      
      // Save to Supabase for backend access (include smart account address for TVL tracking)
      await saveDelegationToDb(delegationData, smartAccountAddress);

      setState({
        status: 'signed',
        error: null,
        delegation: delegationData,
      });

    } catch (error) {
      console.error('Failed to create delegation:', error);
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to create delegation',
        delegation: null,
      });
    }
  }, [address, walletClient, publicClient]);

  // Revoke delegation
  const revokeDelegation = useCallback(async () => {
    if (!state.delegation || !address) return;
    
    setState(prev => ({ ...prev, status: 'loading' }));
    
    try {
      // Clear local storage
      clearDelegation();
      
      // Remove from Supabase
      await removeDelegationFromDb(address);
      
      setState({
        status: 'idle',
        error: null,
        delegation: null,
      });
    } catch (error) {
      console.error('Failed to revoke delegation:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to revoke',
      }));
    }
  }, [state.delegation, address]);

  // Refresh delegation state
  const refreshDelegation = useCallback(() => {
    const stored = loadDelegation();
    if (stored && address && stored.delegator.toLowerCase() === address.toLowerCase()) {
      const expired = isDelegationExpired(stored.caveats.expiry);
      setState({
        status: expired ? 'idle' : (stored.signature ? 'signed' : 'created'),
        error: expired ? 'Delegation expired' : null,
        delegation: { ...stored, status: expired ? 'expired' : stored.status },
      });
    } else {
      setState({ status: 'idle', error: null, delegation: null });
    }
  }, [address]);

  // Calculate expiry info
  const isExpired = state.delegation 
    ? isDelegationExpired(state.delegation.caveats.expiry)
    : false;
    
  const daysUntilExpiry = state.delegation
    ? Math.max(0, Math.floor(
        (Number(state.delegation.caveats.expiry) * 1000 - Date.now()) / (1000 * 60 * 60 * 24)
      ))
    : 0;

  return {
    state,
    createAndSignDelegation,
    revokeDelegation,
    refreshDelegation,
    isExpired,
    daysUntilExpiry,
  };
}
