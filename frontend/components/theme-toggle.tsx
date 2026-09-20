"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/lib/theme"

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { toggle, resolved } = useTheme()
  const isDark = resolved === "dark"

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      suppressHydrationWarning
      className={
        compact
          ? "w-8 h-8 shrink-0 rounded-full border border-border text-text-muted hover:text-text-primary hover:border-text-muted transition-colors flex items-center justify-center"
          : "px-2.5 py-1.5 text-text-secondary border border-border rounded-md hover:text-text-primary hover:border-text-muted transition-colors flex items-center justify-center"
      }
    >
      {/* Both icons always render — CSS picks the visible one, so server
          and client HTML match exactly and hydration never mismatches.
          The .dark class is set pre-paint by the theme-init script. */}
      <span className="hidden dark:inline-flex" aria-hidden="true">
        <Sun size={15} strokeWidth={2} />
      </span>
      <span className="inline-flex dark:hidden" aria-hidden="true">
        <Moon size={15} strokeWidth={2} />
      </span>
    </button>
  )
}
