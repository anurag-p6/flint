"use client"

import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { truncateAddress } from "@/lib/utils"

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="px-4 py-2 text-[13px] font-mono text-gray-400 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
      >
        {truncateAddress(address)}
      </button>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
    >
      Connect wallet
    </button>
  )
}
