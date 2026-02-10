// wagmi.ts - Wagmi configuration for Fear & Greed DCA using RainbowKit
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';

// Use Base Sepolia for testing, Base mainnet for production
const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453');
export const targetChain = chainId === 8453 ? base : baseSepolia;

// WalletConnect Project ID - REQUIRED for WalletConnect to work
// Get one at: https://cloud.walletconnect.com
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. WalletConnect will not work properly.');
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Fear & Greed DCA',
  projectId: projectId || '',
  chains: [targetChain],
  ssr: true,
});

// USDC and WETH addresses for the target chain
export const TOKEN_ADDRESSES = {
  USDC: chainId === 8453 ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' : '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  WETH: '0x4200000000000000000000000000000000000006',
} as const;

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
