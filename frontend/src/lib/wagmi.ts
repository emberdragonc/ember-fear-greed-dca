// wagmi.ts - Wagmi configuration for Fear & Greed DCA
import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { injected, metaMask, walletConnect } from 'wagmi/connectors';

// Use Base Sepolia for testing, Base mainnet for production
const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453');
export const targetChain = chainId === 8453 ? base : baseSepolia;

// WalletConnect Project ID - REQUIRED for WalletConnect to work
// Get one at: https://cloud.walletconnect.com
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 
                  process.env.NEXT_PUBLIC_WC_PROJECT_ID || 
                  '';

// Create connectors array
const connectors = [
  metaMask(),
  injected(),
];

// Only add WalletConnect if projectId is configured
if (projectId && projectId !== 'YOUR_PROJECT_ID') {
  connectors.push(
    walletConnect({
      projectId,
      metadata: {
        name: 'Fear & Greed DCA',
        description: 'Automated DCA based on Fear & Greed Index',
        url: 'https://dca.ember.engineer',
        icons: ['https://dca.ember.engineer/favicon.ico'],
      },
    })
  );
}

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors,
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
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
