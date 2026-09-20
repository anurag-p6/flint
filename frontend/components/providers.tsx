"use client"

import { SessionProvider } from "next-auth/react"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { PrivyProvider } from "@privy-io/react-auth"
import { config, arcTestnet } from "@/lib/wagmi"
import { PRIVY_APP_ID, privyEnabled } from "@/lib/privy/config"
import { ThemeProvider, useTheme } from "@/lib/theme"
import { useState, type ReactNode } from "react"

function PrivyThemedApp({ children }: { children: ReactNode }) {
  const { resolved } = useTheme()
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email"],
        appearance: { theme: resolved === "dark" ? "dark" : "light" },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet],
      }}
    >
      {children}
    </PrivyProvider>
  )
}

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
      <ThemeProvider>
        {privyEnabled ? (
          <PrivyThemedApp>{app}</PrivyThemedApp>
        ) : (
          app
        )}
      </ThemeProvider>
    </SessionProvider>
  )
}
