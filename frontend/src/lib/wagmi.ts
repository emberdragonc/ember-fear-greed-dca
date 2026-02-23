// wagmi.ts - Wagmi configuration for Fear & Greed DCA using RainbowKit
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import type { Wallet } from '@rainbow-me/rainbowkit';
import {
  rainbowWallet,
  walletConnectWallet,
  metaMaskWallet,
  injectedWallet,
  rabbyWallet,
  phantomWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { coinbaseWallet as wagmiCoinbaseWallet } from '@wagmi/connectors';
import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

// Coinbase Wallet in EOA-only mode — prevents smart wallet simulation which breaks
// MetaMask smart account UserOp signing on mobile (Coinbase Wallet's simulation
// engine rejects eth_signTypedData_v4 for MetaMask smart accounts).
const coinbaseEOAWallet = (): Wallet => ({
  id: 'coinbase-eoa',
  name: 'Coinbase Wallet',
  iconUrl: async () => 'https://assets.coingecko.com/markets/images/23/small/Coinbase_Wallet_Symbol.png',
  iconBackground: '#0051FF',
  downloadUrls: {
    android: 'https://play.google.com/store/apps/details?id=org.toshi',
    ios: 'https://apps.apple.com/us/app/coinbase-wallet-nfts-crypto/id1278383455',
    mobile: 'https://go.cb-w.com/mtUeDhpZum',
    qrCode: 'https://go.cb-w.com/mtUeDhpZum',
  },
  mobile: {
    getUri: (uri: string) => `cbwallet://dapp?url=${encodeURIComponent(uri)}`,
  },
  createConnector: () =>
    wagmiCoinbaseWallet({
      appName: 'Fear & Greed DCA',
      preference: { options: 'eoaOnly' },
    }),
});

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
        coinbaseEOAWallet,
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
