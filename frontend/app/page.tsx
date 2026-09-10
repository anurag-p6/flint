"use client"

import Image from "next/image"
import Link from "next/link"
import { useSession, signIn, signOut } from "next-auth/react"

const features = [
  {
    title: "TEE-attested scoring",
    desc: "AI agent scores contributions inside a Chainlink CRE enclave. API keys and raw data never leave.",
  },
  {
    title: "Hardware approval",
    desc: "Every payout requires a physical Ledger confirmation. No funds move without a button press.",
  },
  {
    title: "On-chain audit trail",
    desc: "The Graph indexes every score, payout, and milestone. Fully queryable, permanently verifiable.",
  },
]

const stats = [
  { label: "Contracts deployed", value: "10" },
  { label: "Chain", value: "Base Sepolia" },
  { label: "Scoring model", value: "Gemini Flash" },
  { label: "Token", value: "USDC" },
]

export default function Home() {
  const { data: session } = useSession()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <span className="flex items-center gap-1.5 text-[17px] font-semibold text-black tracking-tight">
          <Image src="/logo.png" alt="Flint logo" width={32} height={32} priority className="rounded-md" />
          Flint
        </span>
        <div className="flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <span className="text-[13px] text-gray-700">{session.user?.name}</span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="px-4 py-2 text-[13px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
              >
                Sign out
              </button>
              <Link
                href="/dashboard"
                className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
              >
                Dashboard
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-20">
        <div className="max-w-2xl w-full space-y-16">
          <div className="space-y-4">
            <h1 className="text-[28px] font-semibold text-black tracking-tight leading-tight">
              Trustless disbursement for grants<br />and open source contributions
            </h1>
            <p className="text-[15px] text-gray-700 leading-relaxed max-w-lg">
              Work verified inside a TEE. Ledger proves a human approved. Blockchain records
              everything. No spreadsheets, no manual transfers, no trust required.
            </p>

            {!session ? (
              <div className="mt-6 p-4 border border-gray-100 rounded-md space-y-3">
                <p className="text-[13px] text-gray-700 font-medium">Connect with GitHub to get started</p>
                <button
                  onClick={() => signIn("github")}
                  className="w-full px-5 py-2.5 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
                >
                  Sign in with GitHub
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-2">
                <Link
                  href="/dashboard"
                  className="px-5 py-2.5 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
                >
                  Open dashboard
                </Link>
                <Link
                  href="/grant"
                  className="px-5 py-2.5 text-[13px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
                >
                  View grants
                </Link>
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-6">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">{s.label}</p>
                <p className="text-[15px] text-black font-medium mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-8">
            {features.map((f) => (
              <div key={f.title} className="space-y-2">
                <p className="text-[14px] font-medium text-black">{f.title}</p>
                <p className="text-[13px] text-gray-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100 px-8 py-8 text-center text-[12px] text-gray-400">
        <p>Built for ETHOnline 2025 • Chainlink CRE • Ledger • The Graph</p>
      </footer>
    </div>
  )
}
