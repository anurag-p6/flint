"use client"

import Image from "next/image"
import Link from "next/link"
import { useSession, signIn, signOut } from "next-auth/react"
import { WorkRail } from "@/components/work-rail"
import { ThemeToggle } from "@/components/theme-toggle"

const features = [
  {
    title: "Work is scored, not guessed",
    desc: "Merged PRs, commits, and reviews become a split. An agent does the math. You don't.",
  },
  {
    title: "Nothing moves without you",
    desc: "One signature from the maintainer wallet releases USDC. Not a bot. Not a spreadsheet.",
  },
  {
    title: "Proof that lasts",
    desc: "Every payout mints a soulbound receipt. The work is on-chain. The resume writes itself.",
  },
]

export default function Home() {
  const { data: session } = useSession()

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="flex items-center justify-between px-5 sm:px-8 py-5 border-b border-border">
        <span className="flex items-center gap-0.5 text-[19px] font-semibold text-text-primary tracking-tight">
          <Image src="/logo.svg" alt="Flint logo" width={38} height={38} priority className="dark:invert" />
          Flint
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {session ? (
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
              <div className="flex items-center gap-2">
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt={session.user.name || "User"}
                    className="w-6 h-6 rounded-full"
                  />
                )}
                <span className="text-[13px] text-text-secondary">{session.user?.name}</span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="px-4 py-2 text-[13px] font-medium text-text-secondary border border-border rounded-md hover:border-text-muted transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn("github")}
              className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-5 sm:px-8 py-16 sm:py-20">
        <div className="max-w-2xl w-full space-y-14">
          <div className="space-y-4">
            <p className="text-[11px] text-text-muted uppercase tracking-wider">
              Open source · Grants · USDC
            </p>
            <h1 className="text-[28px] sm:text-[32px] font-semibold text-text-primary tracking-tight leading-tight">
              Merge the PR.
              <br />
              Pay the people who shipped it.
            </h1>
            <p className="text-[15px] text-text-secondary leading-relaxed max-w-lg">
              Flint watches the repo, scores the work, and settles USDC on-chain.
              You sign once. Contributors get paid. No invoices. No trust required.
            </p>

            {!session ? (
              <div className="pt-2">
                <button
                  onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
                  className="px-5 py-2.5 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors inline-flex items-center gap-2"
                >
                  <Image src="/github.svg" alt="" width={16} height={16} className="invert" />
                  Continue with GitHub
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
                  className="px-5 py-2.5 text-[13px] font-medium text-text-secondary border border-border rounded-md hover:border-text-muted transition-colors"
                >
                  Grants
                </Link>
              </div>
            )}
          </div>

          <WorkRail />

          <div className="grid sm:grid-cols-3 gap-8">
            {features.map((f) => (
              <div key={f.title} className="space-y-2">
                <p className="text-[14px] font-medium text-text-primary">{f.title}</p>
                <p className="text-[13px] text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-5 sm:px-8 py-6 text-center text-[12px] text-text-muted">
        Flint · work in, money out
      </footer>
    </div>
  )
}
