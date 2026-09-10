"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { injected } from "wagmi/connectors"
import { useSession, signOut } from "next-auth/react"
import { truncateAddress } from "@/lib/utils"
import { useGitHubStore } from "@/lib/github-store"

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/grant", label: "Grants" },
]

export function Sidebar() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: session } = useSession()
  const { repo } = useGitHubStore()

  return (
    <aside className="w-[240px] shrink-0 border-r border-gray-100 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 pt-6 pb-6 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-1.5 text-[18px] font-semibold text-black tracking-tight">
          <Image src="/logo.png" alt="Flint logo" width={32} height={32} priority className="rounded-md" />
          Flint
        </Link>
        <p className="text-[11px] text-gray-400 mt-1">Disbursement protocol</p>
      </div>

      {/* Navigation */}
      <nav className="px-3 py-4">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider px-3 mb-2">Navigation</p>
        <div className="space-y-0.5">
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
        </div>
      </nav>


      {/* Protocol Info */}
      <div className="px-3 py-4 border-t border-gray-100">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider px-3 mb-3">Protocol</p>
        <div className="space-y-2 px-3 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Network</span>
            <span className="flex items-center gap-1 text-gray-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green" />
              Base Sepolia
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Token</span>
            <span className="text-gray-700">USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Agent</span>
            <span className="flex items-center gap-1 text-gray-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber" />
              CRE
            </span>
          </div>
        </div>
      </div>

      {/* Auth & Wallet */}
      <div className="mt-auto p-3 border-t border-gray-100 space-y-2">
        {session ? (
          <>
            {/* Wallet */}
            <div className="bg-gray-50 rounded-md px-3 py-3 space-y-2">
              {isConnected && address ? (
                <>
                  <p className="font-mono text-gray-700 text-[11px]">
                    {truncateAddress(address)}
                  </p>
                  <button
                    onClick={() => disconnect()}
                    className="w-full px-2 py-1.5 text-[11px] font-medium text-gray-700 border border-gray-100 rounded hover:border-gray-400 transition-colors"
                  >
                    Disconnect wallet
                  </button>
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

            {/* Sign out */}
            <button
              onClick={() => signOut({ redirect: true, callbackUrl: "/" })}
              className="w-full px-3 py-2 text-[12px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
            >
              Sign out
            </button>
          </>
        ) : null}
      </div>
    </aside>
  )
}
