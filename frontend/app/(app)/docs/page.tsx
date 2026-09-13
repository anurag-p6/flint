"use client"

import { useState } from "react"

const SAMPLE_ISSUE = `## Milestone: Ship auth module
Build OAuth login and session management. closes #12
release: 50%

## Milestone: Security audit
External review of the auth code.
release: 50%

<!-- flint
grantee: octocat
deadline: 2026-10-15
amount: 500
-->`

const SAMPLE_CONTRIBUTORS = `| GitHub Username | Wallet Address                           |
|-----------------|------------------------------------------|
| octocat         | 0x225Fd0b9D011C8BBffd0f0c6f854Cd23b99B6aF7 |
`

const STEPS = [
  { n: "01", title: "Open an issue", text: "Add the flint label. Write sub milestones with release percent each. Tag the grantee in the footer." },
  { n: "02", title: "Fund it", text: "The issue appears under Grants as pending. Maintainer reviews and signs once. USDC locks in escrow on Arc." },
  { n: "03", title: "Do the work", text: "Grantee links PRs with closes #N. Merged PRs count toward the milestone." },
  { n: "04", title: "Get verified", text: "Keeper checks every linked PR is merged, then marks the milestone verified on chain." },
  { n: "05", title: "Get paid", text: "Maintainer signs the release. USDC moves plus a soulbound receipt as permanent proof." },
  { n: "06", title: "Backstop", text: "No release 14 days after verification. Anyone triggers auto release. No committee needed." },
]

function CopyBlock({ title, body, hint }: { title: string; body: string; hint: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = body
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="border border-gray-100 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider">{title}</p>
        <button
          onClick={copy}
          className="text-[12px] font-medium text-gray-700 hover:text-black transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-4 py-3 text-[12px] text-gray-700 font-mono whitespace-pre overflow-x-auto">
        {body}
      </pre>
      <p className="px-4 pb-3 text-[11px] text-gray-400">{hint}</p>
    </div>
  )
}

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-[22px] font-semibold text-black">Documentation</h1>

      <div className="space-y-3">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider">How it works</p>
        {STEPS.map((s) => (
          <div key={s.n} className="flex items-start gap-3">
            <span className="text-[11px] text-gray-400 font-mono pt-0.5">{s.n}</span>
            <div>
              <span className="text-[13px] text-gray-700 font-medium">{s.title}. </span>
              <span className="text-[13px] text-gray-500">{s.text}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider">Issue template</p>
        <CopyBlock
          title="flint issue body"
          body={SAMPLE_ISSUE}
          hint="Release percents must sum to 100. Grantee must be a real GitHub login."
        />
      </div>

      <div className="space-y-3">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider">CONTRIBUTORS.md</p>
        <CopyBlock
          title="repo root file"
          body={SAMPLE_CONTRIBUTORS}
          hint="One row per contributor. Only your own row is trusted."
        />
      </div>
    </div>
  )
}
