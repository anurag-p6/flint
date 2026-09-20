"use client"

import Image from "next/image"

const STEPS = [
  { key: "github", label: "GitHub", hint: "PRs, commits, reviews", icon: "/icons/github.svg", invertInDark: true },
  { key: "flint", label: "Flint", hint: "Agent scores the work", icon: "/icons/flint.svg", invertInDark: true },
  { key: "rail", label: "Payment rail", hint: "USDC on Arc", icon: "/icons/usdc.svg", invertInDark: false },
  { key: "done", label: "Done", hint: "Signed. Settled. Receipt.", icon: "/icons/done.svg", invertInDark: false },
] as const

export function WorkRail() {
  return (
    <div className="border border-border bg-surface rounded-md px-5 py-6 sm:px-8">
      <p className="text-[11px] text-text-muted uppercase tracking-wider mb-6">How work becomes money</p>

      {/* Mobile: vertical timeline with animated beam */}
      <div className="relative sm:hidden">
        <div className="absolute left-[17px] top-[28px] bottom-[28px] w-px bg-border" />
        <div className="absolute left-[17px] top-[28px] bottom-[28px] w-px overflow-hidden">
          <span className="work-rail-beam-y block w-full bg-accent" />
        </div>

        <ol className="flex flex-col gap-6 relative">
          {STEPS.map((step, i) => (
            <li key={step.key} className="flex items-center gap-4 text-left">
              <span
                className="work-rail-node relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface"
                style={{ animationDelay: `${i * 1.15}s` }}
              >
                <Image src={step.icon} alt="" width={20} height={20} className={`h-5 w-5 object-contain ${step.invertInDark ? "dark:invert" : ""}`} />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-text-primary">{step.label}</p>
                <p className="mt-0.5 text-[12px] text-text-muted leading-snug">{step.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Desktop: horizontal rail with animated beam */}
      <div className="relative hidden sm:block">
        <div className="absolute top-[18px] left-[28px] right-[28px] h-px bg-border" />
        <div className="absolute top-[18px] left-[28px] right-[28px] h-px overflow-hidden">
          <span className="work-rail-beam block h-full bg-accent" />
        </div>

        <ol className="grid grid-cols-4 gap-3 relative">
          {STEPS.map((step, i) => (
            <li key={step.key} className="flex flex-col items-start text-left">
              <span
                className="work-rail-node relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
                style={{ animationDelay: `${i * 1.15}s` }}
              >
                <Image src={step.icon} alt="" width={20} height={20} className={`h-5 w-5 object-contain ${step.invertInDark ? "dark:invert" : ""}`} />
              </span>
              <p className="mt-3 text-[13px] font-medium text-text-primary">{step.label}</p>
              <p className="mt-0.5 text-[12px] text-text-muted leading-snug">{step.hint}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
