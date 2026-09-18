"use client"

import Image from "next/image"

const STEPS = [
  { key: "github", label: "GitHub", hint: "PRs, commits, reviews", icon: "/icons/github.svg" },
  { key: "flint", label: "Flint", hint: "Agent scores the work", icon: "/icons/flint.svg" },
  { key: "rail", label: "Payment rail", hint: "USDC on Arc", icon: "/icons/usdc.svg" },
  { key: "done", label: "Done", hint: "Signed. Settled. Receipt.", icon: "/icons/done.svg" },
] as const

export function WorkRail() {
  return (
    <div className="border border-gray-100 rounded-md px-5 py-6 sm:px-8">
      <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-6">How work becomes money</p>

      <div className="relative">
        <div className="hidden sm:block absolute top-[18px] left-[28px] right-[28px] h-px bg-gray-100" />
        <div className="hidden sm:block absolute top-[18px] left-[28px] right-[28px] h-px overflow-hidden">
          <span className="work-rail-beam block h-full bg-accent" />
        </div>

        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-3 relative">
          {STEPS.map((step, i) => (
            <li key={step.key} className="flex flex-col items-center text-center sm:items-start sm:text-left">
              <span
                className="work-rail-node relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-white"
                style={{ animationDelay: `${i * 1.15}s` }}
              >
                <Image src={step.icon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
              </span>
              <p className="mt-3 text-[13px] font-medium text-black">{step.label}</p>
              <p className="mt-0.5 text-[12px] text-gray-400 leading-snug">{step.hint}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
