"use client"

import { useState } from "react"
import { useAccount, useDisconnect } from "wagmi"
import { truncateAddress } from "@/lib/utils"
import { ConnectWalletDialog } from "@/components/connect-wallet-dialog"

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)

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
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
      >
        Connect wallet
      </button>
      <ConnectWalletDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
