// Providers.tsx - Wagmi and Query client providers
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { SmartAccountProvider } from '@/contexts/SmartAccountContext';
import { ReactNode, useState } from 'react';
import { wagmiConfig } from '@/lib/wagmi';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchInterval: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SmartAccountProvider>
          {children}
        </SmartAccountProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
