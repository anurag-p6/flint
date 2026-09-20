"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark" | "system"
type Resolved = "light" | "dark"

const STORAGE_KEY = "flint-theme"

const ThemeContext = createContext<{
  theme: Theme
  resolved: Resolved
  setTheme: (t: Theme) => void
  toggle: () => void
}>({ theme: "system", resolved: "light", setTheme: () => {}, toggle: () => {} })

function getSystem(): Resolved {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function storedTheme(): Theme {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s === "light" || s === "dark" ? s : "system"
  } catch {
    return "system"
  }
}

function apply(resolved: Resolved) {
  document.documentElement.classList.toggle("dark", resolved === "dark")
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(storedTheme)
  const [resolved, setResolved] = useState<Resolved>(() => {
    const t = storedTheme()
    return t === "system" ? getSystem() : t
  })

  // Keep the <html> class in sync + follow OS changes while in system mode.
  // (The inline script in layout.tsx sets the initial class pre-paint.)
  useEffect(() => {
    apply(resolved)
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setResolved(mq.matches ? "dark" : "light")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [theme, resolved])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {}
    const r = t === "system" ? getSystem() : t
    setResolved(r)
    apply(r)
  }, [])

  const toggle = useCallback(() => {
    const next = resolved === "dark" ? "light" : "dark"
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
    setResolved(next)
    apply(next)
  }, [resolved])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
