"use client"

import { http, createConfig } from "wagmi"
import { baseSepolia } from "wagmi/chains"

export const config = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http("https://base-sepolia-rpc.publicnode.com"),
  },
})
