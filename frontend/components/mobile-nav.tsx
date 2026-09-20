"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Menu, X } from "lucide-react"
import { navItems } from "@/components/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

export function MobileNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  // Lock scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-surface">
        <Link href="/" className="flex items-center gap-0.5 text-[18px] font-semibold text-text-primary tracking-tight">
          <Image src="/logo.svg" alt="Flint logo" width={30} height={30} priority className="dark:invert" />
          Flint
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="w-8 h-8 shrink-0 rounded-full border border-border text-text-muted hover:text-text-primary hover:border-text-muted transition-colors flex items-center justify-center"
          >
            <Menu size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-[280px] max-w-[85vw] bg-surface border-l border-border flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="flex items-center gap-0.5 text-[17px] font-semibold text-text-primary tracking-tight">
                <Image src="/logo.svg" alt="Flint logo" width={28} height={28} className="dark:invert" />
                Flint
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="w-8 h-8 shrink-0 rounded-full border border-border text-text-muted hover:text-text-primary hover:border-text-muted transition-colors flex items-center justify-center"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>

            <nav className="px-3 py-4">
              <p className="text-[10px] text-text-muted uppercase tracking-wider px-3 mb-2">Navigation</p>
              <div className="space-y-0.5">
                {navItems.map((item) => {
                  const isActive = pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`block py-2.5 px-3 text-[14px] rounded-md border-l-2 transition-colors ${
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
              </div>
            </div>

            {session ? (
              <div className="mt-auto p-3 border-t border-border">
                <button
                  onClick={() => signOut({ redirect: true, callbackUrl: "/" })}
                  className="w-full px-3 py-2.5 text-[13px] font-medium text-text-secondary border border-border rounded-md hover:border-text-muted transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
