// useSmartAccount.ts - Hook for MetaMask Smart Account management
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Implementation, toMetaMaskSmartAccount } from '@metamask/smart-accounts-kit';
import { http } from 'viem';
import { type SmartAccount } from '@metamask/smart-accounts-kit';

type SmartAccountState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'created'; account: SmartAccount<Implementation.Hybrid>; address: string; isDeployed: boolean }
  | { status: 'error'; error: string };

const SMART_ACCOUNT_STORAGE_KEY = 'fear-greed-dca-smart-account';

interface StoredSmartAccount {
  address: string;
  createdAt: string;
}

export function useSmartAccount() {
  const { address: eoaAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [state, setState] = useState<SmartAccountState>({ status: 'idle' });

  // Load stored smart account address from localStorage
  const getStoredAddress = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(SMART_ACCOUNT_STORAGE_KEY);
      if (!stored) return null;
      const data: StoredSmartAccount = JSON.parse(stored);
      return data.address;
    } catch {
      return null;
    }
  }, []);

  // Save smart account address to localStorage
  const saveStoredAddress = useCallback((address: string) => {
    if (typeof window === 'undefined') return;
    try {
      const data: StoredSmartAccount = {
        address,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(SMART_ACCOUNT_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Clear stored smart account
  const clearStoredAddress = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(SMART_ACCOUNT_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Create or load smart account
  const createSmartAccount = useCallback(async () => {
    if (!isConnected || !eoaAddress || !publicClient || !walletClient) {
      setState({ status: 'error', error: 'Wallet not connected' });
      return null;
    }

    setState({ status: 'loading' });

    try {
      // Create smart account with Hybrid implementation (EOA + passkey support)
      const smartAccount = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [eoaAddress, [], [], []],
        deploySalt: '0x',
        signer: {
          account: walletClient.account,
        },
      });

      // Check if account is deployed by checking code
      const code = await publicClient.getCode({
        address: smartAccount.address,
      });
      const isDeployed = code !== undefined && code !== '0x';

      // Save to localStorage
      saveStoredAddress(smartAccount.address);

      setState({
        status: 'created',
        account: smartAccount,
        address: smartAccount.address,
        isDeployed,
      });

      return smartAccount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState({ status: 'error', error: errorMessage });
      return null;
    }
  }, [isConnected, eoaAddress, publicClient, walletClient, saveStoredAddress]);

  // Try to load existing smart account
  const loadExistingAccount = useCallback(async () => {
    if (!isConnected || !eoaAddress || !publicClient || !walletClient) {
      return;
    }

    const storedAddress = getStoredAddress();
    if (!storedAddress) {
      return;
    }

    setState({ status: 'loading' });

    try {
      // Recreate the smart account (address will be deterministic)
      const smartAccount = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [eoaAddress, [], [], []],
        deploySalt: '0x',
        signer: {
          account: walletClient.account,
        },
      });

      // Verify it matches the stored address
      if (smartAccount.address.toLowerCase() !== storedAddress.toLowerCase()) {
        console.warn('Smart account address mismatch, clearing stored address');
        clearStoredAddress();
        setState({ status: 'idle' });
        return;
      }

      // Check if account is deployed
      const code = await publicClient.getCode({
        address: smartAccount.address,
      });
      const isDeployed = code !== undefined && code !== '0x';

      setState({
        status: 'created',
        account: smartAccount,
        address: smartAccount.address,
        isDeployed,
      });
    } catch (error) {
      console.error('Failed to load existing smart account:', error);
      setState({ status: 'idle' });
    }
  }, [isConnected, eoaAddress, publicClient, walletClient, getStoredAddress, clearStoredAddress]);

  // Auto-load when wallet connects
  useEffect(() => {
    if (isConnected && state.status === 'idle') {
      loadExistingAccount();
    }
  }, [isConnected, state.status, loadExistingAccount]);

  // Reset when wallet disconnects
  useEffect(() => {
    if (!isConnected && state.status !== 'idle') {
      setState({ status: 'idle' });
    }
  }, [isConnected, state.status]);

  return {
    state,
    createSmartAccount,
    loadExistingAccount,
    clearStoredAddress,
    smartAccountAddress: state.status === 'created' ? state.address : null,
    isDeployed: state.status === 'created' ? state.isDeployed : false,
  };
}
