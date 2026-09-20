"use client"

import Link from "next/link"
import { useState, useEffect, useMemo } from "react"
import { parseUnits, type Hex } from "viem"
import { useWallets } from "@privy-io/react-auth"
import { addresses, USDC_ADDRESS, CHAIN_ID } from "@/lib/contracts"
import { splitEqual, formatUsdcExact } from "@/lib/payout"
import { truncateAddress } from "@/lib/utils"
import { TxLink } from "@/components/tx-link"
import { useGitHubStore } from "@/lib/github-store"
import { parseDeadline } from "@/lib/issue-spec"
import { RepoSwitcher } from "@/components/repo-switcher"
import { BridgeModal } from "@/components/bridge-modal"
import { PrivyWalletButton } from "@/components/privy-auth"
import {
  privySendTransaction,
  type PrivyEip1193Provider,
} from "@/lib/privy/tokens"
import grantAbi from "@/lib/abi/FlintGrant.json"
import type { FundedGrant } from "@/app/api/grants/pending/route"
import { encodeFunctionData } from "viem"

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const

const MILESTONE_STATUS = ["Pending", "Verified", "Released", "AutoReleased"] as const

interface PendingIssue {
  issueNumber: number
  title: string
  issueUrl: string
  grantee: string | null
  granteeWallet: string | null
  granteeSource: "onchain" | "repo" | null
  assignees: { login: string; wallet: string | null; source: "onchain" | "repo" | null }[]
  deadline: string | null
  amount: number | null
  milestones: { title: string; releaseBps: number | null; deadline: string | null }[]
  specErrors: string[]
}

interface PendingFunding {
  issueNumber: number
  repo: string
  granteeAddress: string
  granteeGithub: string | null
  totalUsdc: string
  milestones: { title: string; releaseBps: number; deadlineUnix: number }[]
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "Completed" || status === "Released" ? "bg-green text-white" :
    status === "In progress" ? "bg-accent text-white" :
    status === "Unfunded" ? "bg-surface-muted text-text-secondary" :
    "bg-surface-muted text-text-secondary"
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${color}`}>
      {status}
    </span>
  )
}

function MetricCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border border-border rounded-md px-4 py-3">
      <p className="text-[11px] text-text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-[18px] text-text-primary font-medium mt-1 ${mono ? "font-mono text-[15px]" : ""}`}>{value}</p>
    </div>
  )
}

function grantStatus(f: FundedGrant): string {
  const paid = BigInt(f.amountPaid)
  const total = BigInt(f.totalAmount)
  if (paid >= total && total > 0n) return "Completed"
  if (paid > 0n) return "In progress"
  return "Funded"
}

function milestoneSummary(f: FundedGrant): string {
  const done = f.milestonesChain.filter((m) => m.status >= 2).length
  return `${done}/${f.milestonesChain.length}`
}

const isWallet = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s)

export default function GrantPage() {
  const { repo: connectedRepo } = useGitHubStore()
  const { wallets } = useWallets()
  const activeWallet =
    wallets.find((w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2") ??
    wallets[0]

  const [pending, setPending] = useState<PendingIssue[]>([])
  const [funded, setFunded] = useState<FundedGrant[]>([])
  const [loading, setLoading] = useState(false)
  const [liveTick, setLiveTick] = useState(0)
  const [fundingIssue, setFundingIssue] = useState<PendingIssue | null>(null)
  const [bridgeOpen, setBridgeOpen] = useState(false)

  useEffect(() => {
    if (!connectedRepo) {
      setPending([])
      setFunded([])
      return
    }
    setLoading(true)
    fetch(`/api/grants/pending?repo=${connectedRepo}`)
      .then((r) => r.json())
      .then((d) => {
        setPending(d.pending ?? [])
        setFunded(d.funded ?? [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [connectedRepo, liveTick])

  useEffect(() => {
    if (!connectedRepo) return
    const repoLower = connectedRepo.toLowerCase()
    let es: EventSource | null = null
    let fails = 0
    let debounce: ReturnType<typeof setTimeout> | null = null
    const kick = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => setLiveTick((t) => t + 1), 2000)
    }
    try {
      es = new EventSource(`/api/live/stream?repos=${encodeURIComponent(connectedRepo)}`)
      es.onmessage = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data) as { type?: string; repo?: string }
          if ((msg.repo ?? "").toLowerCase() === repoLower && (msg.type === "identity" || msg.type === "grants")) {
            kick()
          }
        } catch {}
      }
      es.onerror = () => {
        fails += 1
        if (fails >= 3) es?.close()
      }
    } catch {}
    return () => {
      if (debounce) clearTimeout(debounce)
      es?.close()
    }
  }, [connectedRepo])

  const totalFunded = funded.reduce((sum, f) => sum + Number(BigInt(f.totalAmount) / 1000000n), 0)
  const totalPaid = funded.reduce((sum, f) => sum + Number(BigInt(f.amountPaid) / 1000000n), 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <h1 className="text-[22px] font-semibold text-text-primary">Grants</h1>
          <RepoSwitcher />
        </div>
        {connectedRepo && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={() => setBridgeOpen(true)}
              className="px-3 py-1.5 text-[12px] font-medium text-text-secondary border border-border rounded-md hover:border-text-muted transition-colors"
            >
              Bridge to Arc
            </button>
            <a
              href={`https://github.com/${connectedRepo}/issues?q=label%3Aflint`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-[12px] font-medium text-text-secondary border border-border rounded-md hover:border-text-muted transition-colors"
            >
              View issues
            </a>
            <PrivyWalletButton />
          </div>
        )}
      </div>

      {/* No repo selected */}
      {!connectedRepo && (
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label="Grant contract" value={truncateAddress(addresses.grant)} mono />
            <MetricCard label="Auto-release" value="14 days" />
            <MetricCard label="Approval" value="Wallet signer" />
          </div>
          <div className="border-t border-border pt-6">
            <p className="text-[11px] text-text-muted uppercase tracking-wider mb-4">Grant lifecycle</p>
            <div className="space-y-3">
              {[
                { step: "01", text: "Create a GitHub issue with the 'flint' label" },
                { step: "02", text: "Add milestones with release: X% in the issue body" },
                { step: "03", text: "Assign a contributor — their wallet resolves from CONTRIBUTORS.md" },
                { step: "04", text: "Fund the grant on-chain from this page" },
                { step: "05", text: "Milestones verified by CRE agent, USDC released per tranche" },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className="text-[11px] text-text-muted font-mono pt-0.5">{s.step}</span>
                  <span className="text-[13px] text-text-secondary">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Repo selected */}
      {connectedRepo && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Active grants" value={funded.length.toString()} />
            <MetricCard label="Pending" value={pending.length.toString()} />
            <MetricCard label="Total funded" value={`${totalFunded.toLocaleString()} USDC`} />
            <MetricCard label="Total paid" value={`${totalPaid.toLocaleString()} USDC`} />
          </div>

          {/* Funded grants table */}
          {funded.length > 0 && (
            <div>
              <p className="text-[11px] text-text-muted uppercase tracking-wider mb-3">
                Funded grants ({funded.length})
              </p>
              <div className="border border-border rounded-md overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="text-[11px] text-text-muted uppercase tracking-wider border-b border-border bg-surface-muted">
                      <th className="text-left px-4 py-3 font-normal">ID</th>
                      <th className="text-left px-4 py-3 font-normal">Title</th>
                      <th className="text-left px-4 py-3 font-normal">Grantee</th>
                      <th className="text-right px-4 py-3 font-normal">Amount</th>
                      <th className="text-right px-4 py-3 font-normal">Paid</th>
                      <th className="text-center px-4 py-3 font-normal">Milestones</th>
                      <th className="text-right px-4 py-3 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funded.map((f) => {
                      const status = grantStatus(f)
                      const assignee = f.paysAssignee ?? f.assignees[0]?.login ?? f.grantee
                      return (
                        <tr
                          key={f.grantId}
                          className="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 text-[12px] text-text-muted font-mono">
                            <Link
                              href={`/grant/${f.grantId}?repo=${encodeURIComponent(connectedRepo)}`}
                              className="hover:text-accent"
                            >
                              #{f.grantId}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/grant/${f.grantId}?repo=${encodeURIComponent(connectedRepo)}`}
                              className="text-[13px] text-text-secondary hover:text-accent font-medium"
                            >
                              {f.title}
                            </Link>
                            <span className="text-[11px] text-text-muted ml-2 font-mono">
                              #{f.issueNumber}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {assignee ? (
                              <span className="text-[12px] text-text-secondary">{assignee}</span>
                            ) : (
                              <span className="text-[11px] text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-text-secondary text-right font-mono">
                            {formatAmount(BigInt(f.totalAmount))}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-text-secondary text-right font-mono">
                            {formatAmount(BigInt(f.amountPaid))}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-[12px] text-text-secondary font-mono">
                              {milestoneSummary(f)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <StatusBadge status={status} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pending (unfunded) issues */}
          {pending.length > 0 && (
            <div>
              <p className="text-[11px] text-text-muted uppercase tracking-wider mb-3">
                Pending — unfunded issues ({pending.length})
              </p>
              <div className="border border-border rounded-md overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr className="text-[11px] text-text-muted uppercase tracking-wider border-b border-border bg-surface-muted">
                      <th className="text-left px-4 py-3 font-normal">Issue</th>
                      <th className="text-left px-4 py-3 font-normal">Title</th>
                      <th className="text-left px-4 py-3 font-normal">Assignee</th>
                      <th className="text-right px-4 py-3 font-normal">Amount</th>
                      <th className="text-center px-4 py-3 font-normal">Milestones</th>
                      <th className="text-right px-4 py-3 font-normal"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((p) => {
                      const plan = toFundings(p, connectedRepo)
                      const fundings = plan?.fundings ?? null
                      const missing = (plan?.fundings ?? []).filter((f) => !isWallet(f.granteeAddress))
                      const ready = !!plan && !!fundings && missing.length === 0
                      const assignee = p.assignees[0]?.login ?? p.grantee

                      return (
                        <tr
                          key={p.issueNumber}
                          className="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors"
                        >
                          <td className="px-4 py-3 text-[12px] text-text-muted font-mono">
                            <a
                              href={p.issueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-accent"
                            >
                              #{p.issueNumber}
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={p.issueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[13px] text-text-secondary hover:text-accent font-medium"
                            >
                              {p.title}
                            </a>
                            {p.specErrors.length > 0 && (
                              <p className="text-[11px] text-red mt-0.5">
                                {p.specErrors.join("; ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {assignee ? (
                              <div>
                                <span className="text-[12px] text-text-secondary">{assignee}</span>
                                {missing.length > 0 && (
                                  <p className="text-[11px] text-amber">no wallet</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-text-muted">unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[13px] text-text-secondary text-right font-mono">
                            {p.amount !== null ? `${p.amount} USDC` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-[12px] text-text-secondary font-mono">
                              {p.milestones.length}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => ready ? setFundingIssue(p) : undefined}
                              disabled={!ready}
                              title={
                                !plan ? "Fix the issue spec first" :
                                missing.length > 0 ? "Waiting on wallet resolution" :
                                "Fund this grant"
                              }
                              className="px-3 py-1.5 text-[12px] font-medium text-surface bg-text-primary rounded-md hover:opacity-90 transition-colors disabled:opacity-30"
                            >
                              Fund
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && funded.length === 0 && pending.length === 0 && (
            <div className="border border-border rounded-md p-6">
              <p className="text-[13px] text-text-secondary">No grants found</p>
              <p className="text-[12px] text-text-muted mt-1">
                Create GitHub issues with the <span className="font-mono bg-surface-muted px-1 rounded">flint</span> label and add{" "}
                <span className="font-mono bg-surface-muted px-1 rounded">release: X%</span> in the body
              </p>
            </div>
          )}

          {loading && (
            <p className="text-[13px] text-text-muted">Loading grants...</p>
          )}
        </>
      )}

      {/* Fund modal */}
      {fundingIssue && connectedRepo && (
        <FundModal
          issue={fundingIssue}
          repo={connectedRepo}
          wallet={activeWallet}
          onClose={() => setFundingIssue(null)}
          onDone={() => {
            setFundingIssue(null)
            setLiveTick((t) => t + 1)
          }}
        />
      )}

      {bridgeOpen && <BridgeModal onClose={() => setBridgeOpen(false)} />}
    </div>
  )
}

function toFundings(p: PendingIssue, repo: string) {
  if (p.specErrors.length > 0 || p.amount === null) return null
  const milestones: PendingFunding["milestones"] = []
  for (const m of p.milestones) {
    if (m.releaseBps === null) return null
    const dl = m.deadline ? parseDeadline(m.deadline) : null
    milestones.push({
      title: m.title || "Milestone",
      releaseBps: m.releaseBps,
      deadlineUnix: dl ?? 0,
    })
  }
  if (milestones.length === 0) return null
  const total = parseUnits(String(p.amount), 6)

  const payers =
    p.assignees.length > 0
      ? p.assignees.map((a) => ({ login: a.login, wallet: a.wallet ?? "" }))
      : [{ login: p.grantee ?? "grantee", wallet: p.granteeWallet ?? "" }]
  const shares = splitEqual(total, payers.length)
  const fundings = payers.map((pay, i) => ({
    issueNumber: p.issueNumber,
    repo,
    granteeAddress: pay.wallet,
    granteeGithub: pay.login,
    totalUsdc: formatUsdcExact(shares[i]),
    milestones,
  }))
  return { fundings, totalUsdc: total }
}

function FundModal({
  issue,
  repo,
  wallet,
  onClose,
  onDone,
}: {
  issue: PendingIssue
  repo: string
  wallet: any
  onClose: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState<"review" | "approving" | "creating" | "done">("review")
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const plan = toFundings(issue, repo)
  const fundings = plan?.fundings ?? []
  const total = plan?.totalUsdc ?? 0n
  const busy = step === "approving" || step === "creating"

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [busy, onClose])

  const handleFund = async () => {
    if (!wallet) return
    setError(null)
    try {
      const from = wallet.address as Hex
      try { await wallet.switchChain(CHAIN_ID) } catch {}
      const provider = (await wallet.getEthereumProvider()) as unknown as PrivyEip1193Provider

      setStep("approving")
      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [addresses.grant as Hex, total],
      })
      await privySendTransaction(provider, { from, to: USDC_ADDRESS as Hex, data: approveData })

      for (let i = 0; i < fundings.length; i++) {
        const f = fundings[i]
        setStep("creating")
        const createData = encodeFunctionData({
          abi: grantAbi,
          functionName: "createGrant",
          args: [
            f.granteeAddress as Hex,
            USDC_ADDRESS as Hex,
            parseUnits(f.totalUsdc, 6),
            from,
            f.milestones.map((m, j) =>
              j === 0 ? `source: ${f.repo}#${f.issueNumber}\n${m.title}` : m.title,
            ),
            f.milestones.map((m) => BigInt(m.releaseBps)),
            f.milestones.map((m) => BigInt(m.deadlineUnix)),
          ],
        })
        const tx = await privySendTransaction(provider, { from, to: addresses.grant as Hex, data: createData })
        setTxHash(tx)
      }
      setStep("done")
    } catch (err) {
      console.error("Fund grant failed:", err)
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed")
      setStep("review")
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-md p-4"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-surface rounded-md shadow-sm border border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[15px] font-medium text-text-primary">
              Fund grant · {formatUsdcExact(total)} USDC
            </p>
            <p className="text-[12px] text-text-muted mt-0.5">
              {issue.title} <span className="font-mono">#{issue.issueNumber}</span>
            </p>
          </div>
          <button
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="text-text-muted hover:text-text-secondary text-[18px] leading-none px-1 disabled:opacity-30"
          >
            x
          </button>
        </div>

        <div className="space-y-1">
          {fundings.map((f) => (
            <div key={f.granteeGithub ?? f.granteeAddress} className="flex items-center justify-between text-[13px]">
              <span className="text-text-secondary">
                {f.granteeGithub ?? truncateAddress(f.granteeAddress)}{" "}
                <span className="font-mono text-text-muted">{truncateAddress(f.granteeAddress)}</span>
              </span>
              <span className="font-mono text-text-secondary">{f.totalUsdc} USDC</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          {fundings[0]?.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-text-secondary">
              <span className="text-text-muted font-mono">{String(i + 1).padStart(2, "0")}</span>
              <span className="truncate">{m.title}</span>
              <span className="ml-auto font-mono shrink-0">{m.releaseBps / 100}%</span>
            </div>
          ))}
        </div>

        {!wallet ? (
          <p className="text-[12px] text-amber">Connect a wallet to fund this grant.</p>
        ) : (
          <p className="text-[11px] text-text-muted">
            Funding as <span className="font-mono">{truncateAddress(wallet.address)}</span> · auto-release 14 days after verification
          </p>
        )}

        {step === "done" ? (
          <div className="space-y-2">
            <p className="text-[13px] text-text-secondary">Grant funded successfully.</p>
            {txHash && <TxLink hash={txHash} />}
            <button
              onClick={onDone}
              className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="text-[12px] text-text-muted hover:text-text-primary transition-colors disabled:opacity-30"
            >
              Cancel
            </button>
            <button
              onClick={handleFund}
              disabled={busy || !wallet}
              className="px-4 py-2 text-[13px] font-medium text-surface bg-text-primary rounded-md hover:opacity-90 transition-colors disabled:opacity-50"
            >
              {step === "approving"
                ? "Approving USDC..."
                : step === "creating"
                  ? "Creating grant..."
                  : "Confirm & fund"}
            </button>
          </div>
        )}
        {error && <p className="text-[12px] text-red">{error}</p>}
      </div>
    </div>
  )
}

function formatAmount(amount: bigint): string {
  return `${(Number(amount) / 1e6).toLocaleString()} USDC`
}
