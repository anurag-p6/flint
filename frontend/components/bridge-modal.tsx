"use client"

import { useEffect, useState } from "react"
import { useAccount, useSwitchChain } from "wagmi"
import { AppKit, BridgeChain } from "@circle-fin/app-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import {
  ArcTestnet,
  ArbitrumSepolia,
  BaseSepolia,
  EthereumSepolia,
  OptimismSepolia,
} from "@circle-fin/bridge-kit/chains"
import { addressUrl } from "@/lib/explorer"

/// CCTP source chains (Sepolia testnets) → Arc Testnet (fixed destination).
const SOURCES = [
  { id: BridgeChain.Ethereum_Sepolia, def: EthereumSepolia, label: "Ethereum", sub: "Sepolia · domain 0", logo: "/ethereum.png" },
  { id: BridgeChain.Base_Sepolia, def: BaseSepolia, label: "Base", sub: "Sepolia · domain 6", logo: "/base.png" },
  { id: BridgeChain.Arbitrum_Sepolia, def: ArbitrumSepolia, label: "Arbitrum", sub: "Sepolia · domain 3", logo: "/arbitrum.png" },
  { id: BridgeChain.Optimism_Sepolia, def: OptimismSepolia, label: "Optimism", sub: "Sepolia · domain 2", logo: "/optimism.png" },
] as const

type SourceId = (typeof SOURCES)[number]["id"]
type Status = "idle" | "switching" | "bridging" | "success" | "error"

/// Glass-blur modal: pick where your USDC lives → native CCTP mint on Arc.
/// Closes on background click or Escape.
export function BridgeModal({ onClose }: { onClose: () => void }) {
  const { address, isConnected, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const [source, setSource] = useState<SourceId>(BridgeChain.Base_Sepolia)
  const [amount, setAmount] = useState("5")
  const [status, setStatus] = useState<Status>("idle")
  const [detail, setDetail] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const srcDef = SOURCES.find((s) => s.id === source)!
  const srcChainId = (srcDef.def as unknown as { chainId: number }).chainId

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
      // Wallet must sign on the source chain.
      if (chainId !== srcChainId) {
        setStatus("switching")
        setDetail(`Switching wallet to ${srcDef.label} Sepolia for approval…`)
        await switchChainAsync({ chainId: srcChainId })
      }
      setStatus("bridging")
      setDetail(
        `Approve + burn on ${srcDef.label} Sepolia, CCTP attestation, then mint on Arc. Takes ~5–15 min on testnet — you can continue once the wallet prompts are done.`,
      )
      // Explicit any: AppKit infers adapter capability generics per call;
      // the provider-built adapter satisfies both legs at runtime.
      const adapter: any = await createViemAdapterFromProvider({
        provider: provider as any,
        capabilities: {
          addressContext: "user-controlled",
          supportedChains: [EthereumSepolia, BaseSepolia, ArbitrumSepolia, OptimismSepolia, ArcTestnet],
        },
      })
      const kit = new AppKit()
      const result = await kit.bridge({
        from: { adapter, chain: source },
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bridge USDC to Arc"
    >
      <div
        className="w-full max-w-lg bg-surface rounded-md shadow-sm border border-border p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[15px] font-medium text-text-primary">Bridge USDC to Arc</p>
            <p className="text-[12px] text-text-muted mt-0.5">
              Native CCTP · Sepolia testnets · lands in your wallet in ~5–15 min
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-secondary text-[18px] leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
          {/* FROM: source chain selector */}
          <div className="border border-border rounded-md p-2 space-y-1 bg-surface">
            <p className="text-[10px] text-text-muted uppercase tracking-wider px-1 pt-1">From</p>
            {SOURCES.map((s) => {
              const active = s.id === source
              return (
                <button
                  key={s.id}
                  onClick={() => setSource(s.id)}
                  aria-pressed={active}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                    active ? "bg-surface-muted border border-text-muted" : "border border-transparent hover:bg-surface-muted"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.logo}
                    alt={`${s.label} logo`}
                    width={24}
                    height={24}
                    className={`w-6 h-6 rounded-full shrink-0 object-cover ${
                      active ? "ring-2 ring-black" : "opacity-80"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] text-text-primary font-medium leading-tight">{s.label}</span>
                    <span className="block text-[10px] text-text-muted font-mono leading-tight">{s.sub}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center text-text-muted text-[16px]">→</div>

          {/* TO: fixed destination */}
          <div className="border border-border rounded-md p-2 bg-surface-muted flex flex-col">
            <p className="text-[10px] text-text-muted uppercase tracking-wider px-1 pt-1">To</p>
            <div className="flex-1 flex flex-col items-center justify-center gap-1 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/arc.png"
                alt="Arc logo"
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover"
              />
              <p className="text-[13px] text-text-primary font-medium">Arc USDC</p>
              <p className="text-[10px] text-text-muted font-mono">Testnet · domain 26</p>
              <p className="text-[10px] text-text-muted">fixed destination</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="5"
            inputMode="decimal"
            className="border border-border px-3 py-2 text-[13px] rounded-md focus:border-accent focus:outline-none w-28 font-mono"
          />
          <span className="text-[12px] text-text-muted font-mono">USDC</span>
          <button
            onClick={handleBridge}
            disabled={status === "bridging" || status === "switching" || !isConnected}
            className="ml-auto px-4 py-2 text-[13px] font-medium text-surface bg-text-primary rounded-md hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {status === "switching"
              ? "Switching chain…"
              : status === "bridging"
                ? "Bridging…"
                : "Bridge to Arc"}
          </button>
        </div>

        {!isConnected && (
          <p className="text-[12px] text-amber">Connect a wallet to bridge (top right).</p>
        )}
        {status !== "idle" && (
          <p
            className={`text-[12px] font-mono break-all ${
              status === "error" ? "text-red" : status === "success" ? "text-green" : "text-text-secondary"
            }`}
          >
            {detail}
          </p>
        )}
        {address && (
          <a
            href={addressUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[11px] text-text-muted hover:text-text-primary transition-colors font-mono"
          >
            Watch wallet on Arcscan ↗
          </a>
        )}
      </div>
    </div>
  )
}
