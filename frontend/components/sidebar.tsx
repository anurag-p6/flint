"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { ThemeToggle } from "@/components/theme-toggle"

const navItems = [
  { href: "/dashboard", label: "Open Mode" },
  { href: "/grant", label: "Grants" },
  { href: "/network", label: "Network" },
  { href: "/docs", label: "Documentation" },
]

export { navItems }

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border bg-surface flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 pt-5 pb-5 border-b border-border flex items-center justify-between">
        <Link href="/" className="flex items-center gap-0.5 text-[20px] font-semibold text-text-primary tracking-tight">
          <Image src="/logo.svg" alt="Flint logo" width={34} height={34} priority className="dark:invert" />
          Flint
        </Link>
        <ThemeToggle compact />
      </div>

      {/* Navigation */}
      <nav className="px-3 py-4">
        <p className="text-[10px] text-text-muted uppercase tracking-wider px-3 mb-2">Navigation</p>
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block py-2 px-3 text-[13px] rounded-md border-l-2 transition-colors ${
                  isActive
                    ? "text-text-primary border-accent font-medium bg-surface-muted"
                    : "text-text-muted border-transparent hover:text-text-secondary hover:bg-surface-muted"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>


      {/* Protocol Info */}
      <div className="px-3 py-4 border-t border-border">
        <p className="text-[10px] text-text-muted uppercase tracking-wider px-3 mb-3">Protocol</p>
        <div className="space-y-2 px-3 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Network</span>
            <span className="flex items-center gap-1 text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-green" />
              Arc Testnet
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Token</span>
            <span className="text-text-secondary">USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Agent</span>
            <span className="flex items-center gap-1 text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-amber" />
              CRE
            </span>
          </div>
        </div>
      </div>

      {/* Auth */}
      <div className="mt-auto p-3 border-t border-border space-y-2">
        {session ? (
          <button
            onClick={() => signOut({ redirect: true, callbackUrl: "/" })}
            className="w-full px-3 py-2 text-[12px] font-medium text-text-secondary border border-border rounded-md hover:border-text-muted transition-colors"
          >
            Sign out
          </button>
        ) : null}
      </div>
    </aside>
  )
}
