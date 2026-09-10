"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { truncateAddress } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/grant", label: "Grants" },
]

export function Sidebar() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  return (
    <aside className="w-[240px] shrink-0 border-r border-gray-100 flex flex-col h-screen sticky top-0">
      <div className="px-6 pt-6 pb-5">
        <Link href="/" className="flex items-center gap-1.5 text-[18px] font-semibold text-black tracking-tight">
          <Image src="/logo.png" alt="Flint logo" width={32} height={32} priority className="rounded-md" />
          Flint
        </Link>
        <p className="text-[11px] text-gray-400 mt-0.5">Disbursement protocol</p>
      </div>

      <div className="px-6 pb-4">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">Navigation</p>
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block py-2 px-3 text-[13px] rounded-md border-l-2 transition-colors ${
                  isActive
                    ? "text-black border-accent font-medium bg-gray-50"
                    : "text-gray-400 border-transparent hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="px-6 pb-4">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">Protocol</p>
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Network</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green" />
              <span className="text-gray-700">Base Sepolia</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Token</span>
            <span className="text-gray-700">USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Agent</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber" />
              <span className="text-gray-700">CRE</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto p-4 mx-4 mb-4 border border-gray-100 rounded-md space-y-2">
        {isConnected && address ? (
          <>
            <p className="font-mono text-gray-700 text-[12px]">
              {truncateAddress(address)}
            </p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green" />
                <span className="text-gray-400 text-[11px]">Connected</span>
              </div>
              <button
                onClick={() => disconnect()}
                className="text-gray-400 text-[11px] hover:text-red transition-colors"
              >
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => connect({ connector: injected() })}
            className="w-full px-3 py-2 text-[12px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
          >
            Connect wallet
          </button>
        )}
      </div>
    </aside>
  )
}
