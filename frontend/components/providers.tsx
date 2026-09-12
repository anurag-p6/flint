"use client"

import { SessionProvider } from "next-auth/react"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PrivyProvider } from "@privy-io/react-auth"
import { config, arcTestnet } from "@/lib/wagmi"
import { PRIVY_APP_ID, privyEnabled } from "@/lib/privy/config"
import { useState, type ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  const app = (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )

  return (
    <SessionProvider>
      {privyEnabled ? (
        <PrivyProvider
          appId={PRIVY_APP_ID}
          config={{
            loginMethods: ["email"],
            appearance: { theme: "light" },
            embeddedWallets: {
              ethereum: { createOnLogin: "users-without-wallets" },
            },
            defaultChain: arcTestnet,
            supportedChains: [arcTestnet],
          }}
        >
          {app}
        </PrivyProvider>
      ) : (
        app
      )}
    </SessionProvider>
  )
}
