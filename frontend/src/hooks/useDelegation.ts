// useDelegation.ts - Hook for managing DCA delegations using MetaMask Delegation Framework
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { type Address, encodeFunctionData, erc20Abi, keccak256, encodePacked } from 'viem';
import { createDelegation, type Delegation } from '@metamask/smart-accounts-kit';
import { useSmartAccountContext } from '@/contexts/SmartAccountContext';
import {
  DELEGATION_ADDRESSES,
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

// Backend signer address (the delegate that will execute swaps)
const BACKEND_SIGNER = (process.env.NEXT_PUBLIC_BACKEND_SIGNER || 
  '0x9f2840DB6c36836cB7Ae342a79C762c657985dd0') as Address;

interface DelegationState {
  status: 'idle' | 'loading' | 'created' | 'signed' | 'error';
  error: string | null;
  delegation: StoredDelegation | null;
  signedDelegation: any | null; // The actual signed delegation object for redemption
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
  const { smartAccount, smartAccountAddress, state: smartAccountState } = useSmartAccountContext();
  
  const [state, setState] = useState<DelegationState>({
    status: 'idle',
    error: null,
    delegation: null,
    signedDelegation: null,
  });

  // Load existing delegation on mount (check localStorage + DB)
  useEffect(() => {
    if (!isConnected || !address) {
      setState({ status: 'idle', error: null, delegation: null, signedDelegation: null });
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
            signedDelegation: null,
          });
        } else {
          setState({
            status: stored.signature ? 'signed' : 'created',
            error: null,
            delegation: stored,
            signedDelegation: null, // Will be loaded from DB if needed
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
                expiry: BigInt(Math.floor(new Date(result.expiresAt).getTime() / 1000)),
              },
              basePercentage: 2.5,
              targetAsset: 'ETH',
            },
            signedDelegation: null,
          });
        }
      } catch (err) {
        console.error('Failed to check delegation in DB:', err);
      }
    };

    checkDelegation();
  }, [address, isConnected]);

  // Save delegation to Supabase via API (server-side with service key)
  const saveDelegationToDb = async (
    delegation: StoredDelegation, 
    signedDelegation: any,
    smartAccountAddr?: string
  ) => {
    try {
      const response = await fetch('/api/delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: delegation.delegator,
          smartAccountAddress: smartAccountAddr,
          delegationHash: delegation.delegationHash,
          signature: delegation.signature,
          // Store the complete signed delegation for backend redemption
          delegationData: {
            ...signedDelegation,
            // Ensure BigInt values are stringified
            authority: signedDelegation.authority || '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
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

  // Remove delegation from Supabase via API
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

  // Create and sign a new delegation using MetaMask Delegation Framework
  const createAndSignDelegation = useCallback(async (
    basePercentage: number,
    targetAsset: string,
    smartAccountAddr?: string
  ) => {
    if (!address || !walletClient || !publicClient) {
      setState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return;
    }

    if (!smartAccount) {
      setState(prev => ({ ...prev, error: 'Smart account not ready' }));
      return;
    }

    setState({ status: 'loading', error: null, delegation: null, signedDelegation: null });

    try {
      const now = Math.floor(Date.now() / 1000);
      const expiryTimestamp = now + (DELEGATION_CONFIG.VALIDITY_DAYS * 24 * 60 * 60);
      
      // Get the smart account's environment (deployment addresses)
      const environment = smartAccount.environment;
      
      // All targets the backend can interact with
      const allowedTargets = [
        DELEGATION_ADDRESSES.UNISWAP_ROUTER, // Swap router (execute)
        DELEGATION_ADDRESSES.PERMIT2,         // Permit2 (Universal Router uses this)
        DELEGATION_ADDRESSES.USDC,            // For approve()
        DELEGATION_ADDRESSES.WETH,            // For approve()
      ];

      // Create delegation using MetaMask Delegation Framework
      // This grants the backend permission to:
      // 1. Call Uniswap swap functions
      // 2. Approve tokens for the router (needed before swaps)
      const delegation = createDelegation({
        to: BACKEND_SIGNER,
        from: smartAccountAddress as Address,
        environment,
        // Scope: Allow function calls to Router + token approvals
        scope: {
          type: 'functionCall',
          targets: allowedTargets,
          selectors: [
            // Uniswap V4 Universal Router execute function
            'execute(bytes,bytes[],uint256)',
            // Legacy V3 swap functions (backup)
            'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',
            'exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))',
            // ERC20 approve (for USDC/WETH -> Permit2)
            'approve(address,uint256)',
            // Permit2 approve (for setting internal allowance to Router)
            'approve(address,address,uint160,uint48)',
          ],
        },
        // Caveats: Time limit and call frequency
        caveats: [
          { 
            type: 'timestamp', 
            afterThreshold: now, 
            beforeThreshold: expiryTimestamp 
          },
          { 
            type: 'limitedCalls', 
            // Extra calls for approvals (2 tokens * 2 approvals each [ERC20 + Permit2] + daily swaps)
            limit: 4 + (DELEGATION_CONFIG.MAX_CALLS_PER_DAY * DELEGATION_CONFIG.VALIDITY_DAYS)
          },
          {
            type: 'allowedTargets',
            targets: allowedTargets,
          },
        ],
      });

      // Sign the delegation with the smart account
      const signature = await smartAccount.signDelegation({ delegation });
      
      // Create the signed delegation object
      const signedDelegation = {
        ...delegation,
        signature,
      };

      // Create hash for reference
      const delegationHash = keccak256(
        encodePacked(
          ['address', 'address', 'uint256'],
          [BACKEND_SIGNER, smartAccountAddress as Address, BigInt(expiryTimestamp)]
        )
      );

      // Create storage-friendly delegation data
      const delegationData: StoredDelegation = {
        delegationHash,
        delegate: BACKEND_SIGNER,
        delegator: address,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(expiryTimestamp * 1000).toISOString(),
        basePercentage,
        targetAsset,
        status: 'signed' as DelegationStatus,
        signature,
        caveats: {
          allowedTargets: [
            DELEGATION_ADDRESSES.UNISWAP_ROUTER,
            DELEGATION_ADDRESSES.PERMIT2,
            DELEGATION_ADDRESSES.USDC,
            DELEGATION_ADDRESSES.WETH,
          ],
          allowedMethods: [
            'execute(bytes,bytes[],uint256)',
            'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',
            'exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))',
            'approve(address,uint256)',
            'approve(address,address,uint160,uint48)',
          ],
          maxCalls: 4 + (DELEGATION_CONFIG.MAX_CALLS_PER_DAY * DELEGATION_CONFIG.VALIDITY_DAYS),
          expiry: BigInt(expiryTimestamp),
        },
      };

      // Save to localStorage
      saveDelegation(delegationData);
      
      // Save to Supabase for backend access (include signed delegation for redemption)
      await saveDelegationToDb(delegationData, signedDelegation, smartAccountAddr);

      setState({
        status: 'signed',
        error: null,
        delegation: delegationData,
        signedDelegation,
      });

    } catch (error) {
      console.error('Failed to create delegation:', error);
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to create delegation',
        delegation: null,
        signedDelegation: null,
      });
    }
  }, [address, walletClient, publicClient, smartAccount, smartAccountAddress]);

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
        signedDelegation: null,
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
        signedDelegation: null,
      });
    } else {
      setState({ status: 'idle', error: null, delegation: null, signedDelegation: null });
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
