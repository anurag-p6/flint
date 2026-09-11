"use client"

import { useState } from "react"
import { useAccount } from "wagmi"
import { AppKit, BridgeChain } from "@circle-fin/app-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { ArcTestnet, BaseSepolia } from "@circle-fin/bridge-kit/chains"

type Status = "idle" | "bridging" | "success" | "error"

/// Bridge USDC from Base Sepolia to Arc Testnet via Circle App Kit (CCTP).
/// Additive helper above grant creation: fund Arc-side balance from any chain.
export function BridgeFunds() {
  const { address, isConnected } = useAccount()
  const [amount, setAmount] = useState("5")
  const [status, setStatus] = useState<Status>("idle")
  const [detail, setDetail] = useState("")

  if (!isConnected) return null

  const handleBridge = async () => {
    const provider = (window as unknown as { ethereum?: unknown })?.ethereum
    if (!provider) {
      setStatus("error")
      setDetail("No browser wallet found.")
      return
    }
    if (!amount || Number(amount) <= 0) {
      setStatus("error")
      setDetail("Enter an amount greater than zero.")
      return
    }
    try {
      setStatus("bridging")
      setDetail("Approve + burn on Base Sepolia, CCTP attestation, then mint on Arc. Takes ~5–15 min on testnet — you can continue once the wallet prompts are done.")
      // Explicit any: AppKit infers adapter capability generics per call;
      // the provider-built adapter satisfies both legs at runtime.
      const adapter: any = await createViemAdapterFromProvider({
        provider: provider as any,
        capabilities: {
          addressContext: "user-controlled",
          supportedChains: [BaseSepolia, ArcTestnet],
        },
      })
      const kit = new AppKit()
      const result = await kit.bridge({
        from: { adapter, chain: BridgeChain.Base_Sepolia },
        to: { adapter, chain: BridgeChain.Arc_Testnet },
        amount,
      })
      setStatus("success")
      const summary = JSON.stringify(result ?? {})
      setDetail(`Bridge submitted. ${summary.slice(0, 180)}`)
    } catch (err) {
      setStatus("error")
      setDetail(err instanceof Error ? err.message : "Bridge failed.")
    }
  }

  return (
    <div className="border border-gray-100 rounded-md p-4 space-y-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-wider">
        Fund from any chain · Circle App Kit
      </p>
      <p className="text-[12px] text-gray-500">
        Move USDC from Base Sepolia to Arc Testnet (native CCTP, no wrapped tokens).
        Bridged funds land in this wallet and can seed the grant pool below.
      </p>
      <div className="flex items-center gap-3">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="5"
          inputMode="decimal"
          className="border border-gray-100 px-3 py-2 text-[12px] rounded-md focus:border-accent focus:outline-none w-28 font-mono"
        />
        <span className="text-[12px] text-gray-400 font-mono">USDC · Base → Arc</span>
        <button
          onClick={handleBridge}
          disabled={status === "bridging"}
          className="px-4 py-2 text-[13px] font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {status === "bridging" ? "Bridging…" : "Bridge to Arc"}
        </button>
        {address && (
          <a
            href={`https://testnet.arcscan.app/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[11px] text-gray-400 hover:text-black transition-colors font-mono"
          >
            Watch on Arcscan
          </a>
        )}
      </div>
      {status !== "idle" && (
        <p
          className={`text-[12px] font-mono break-all ${
            status === "error" ? "text-red" : status === "success" ? "text-green" : "text-gray-500"
          }`}
        >
          {detail}
        </p>
      )}
    </div>
  )
}
