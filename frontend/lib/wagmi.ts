"use client"

import { http, createConfig } from "wagmi"
import { baseSepolia } from "wagmi/chains"
import { defineChain } from "viem"
import { injected, walletConnect } from "wagmi/connectors"

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
})

// Optional: enables the WalletConnect QR option once the user provides a
// free projectId from https://cloud.reown.com. Until then the QR row in the
// wallet picker renders as a disabled "coming soon" placeholder.
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

export const walletConnectEnabled = Boolean(walletConnectProjectId)

export const config = createConfig({
  chains: [arcTestnet, baseSepolia],
  connectors: [
    // Auto-discovers all EIP-6963 browser wallets
    // (MetaMask, Rabby, Coinbase Wallet extension, and similar).
    injected(),
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId })]
      : []),
  ],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
    [baseSepolia.id]: http("https://base-sepolia-rpc.publicnode.com"),
  },
})
