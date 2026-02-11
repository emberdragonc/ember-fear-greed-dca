// wagmi.ts - Wagmi configuration for Fear & Greed DCA using RainbowKit
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  rainbowWallet,
  walletConnectWallet,
  metaMaskWallet,
  coinbaseWallet,
  injectedWallet,
  rabbyWallet,
  phantomWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

// Use Base Sepolia for testing, Base mainnet for production
const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453');
export const targetChain = chainId === 8453 ? base : baseSepolia;

// WalletConnect Project ID - prefer env var, fallback to hardcoded
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '2f196408f3e0e85205a0fbbd55ee93f0';

// Use Alchemy RPC for faster connections (fixes mobile wallet timeouts)
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const baseRpc = alchemyKey
  ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
  : 'https://mainnet.base.org';
const baseSepoliaRpc = alchemyKey
  ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
  : 'https://sepolia.base.org';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        rabbyWallet,
        phantomWallet,
        rainbowWallet,
        walletConnectWallet,
      ],
    },
    {
      groupName: 'Other Wallets',
      wallets: [
        injectedWallet,
      ],
    },
  ],
  {
    appName: 'Fear & Greed DCA',
    projectId,
    walletConnectParameters: {
      metadata: {
        name: 'Fear & Greed DCA',
        description: 'Automated DCA wallet based on Fear & Greed Index',
        url: 'https://dca.ember.engineer',
        icons: ['https://dca.ember.engineer/favicon.ico'],
      },
    },
  }
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(baseRpc),
    [baseSepolia.id]: http(baseSepoliaRpc),
  },
  ssr: true,
});

// Token addresses for the target chain
export const TOKEN_ADDRESSES = {
  USDC: chainId === 8453 ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' : '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  WETH: '0x4200000000000000000000000000000000000006',
  cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
} as const;

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
