"use client"

import { useReadContract, useWriteContract, useAccount, useWalletClient, useSwitchChain } from "wagmi"
import { useState, useEffect, useMemo } from "react"
import { parseUnits, recoverMessageAddress, type Hex } from "viem"
import { addresses, USDC_ADDRESS, CHAIN_ID } from "@/lib/contracts"
import { truncateAddress } from "@/lib/utils"
import { useGitHubStore } from "@/lib/github-store"
import { parseDeadline } from "@/lib/issue-spec"
import { RepoSwitcher } from "@/components/repo-switcher"
import { useWallets } from "@privy-io/react-auth"
import { privyEnabled } from "@/lib/privy/config"
import {
  encodeReleaseTranche,
  privyPersonalSign,
  privySendTransaction,
  GRANT_ADDRESS,
  type PrivyEip1193Provider,
} from "@/lib/privy/grant"
import { BridgeFunds } from "@/components/bridge-funds"
import grantAbi from "@/lib/abi/FlintGrant.json"
import type { Milestone } from "@/app/api/github/milestones/route"

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

/// Unfunded flint issue as returned by /api/grants/pending (mirrors the API type).
interface PendingIssue {
  issueNumber: number
  title: string
  issueUrl: string
  grantee: string | null
  granteeWallet: string | null
  deadline: string | null
  amount: number | null
  milestones: { title: string; releaseBps: number | null; deadline: string | null }[]
  specErrors: string[]
}

function StatusDot({ status, size = "default" }: { status: string; size?: "default" | "sm" }) {
  const color =
    status === "Released" || status === "Auto-released" ? "bg-green" :
    status === "Verified" || status === "closed" ? "bg-amber" :
    "bg-gray-300"
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2"
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${dotSize} rounded-full ${color}`} />
      <span className={`${size === "sm" ? "text-[11px]" : "text-[13px]"} text-gray-700 capitalize`}>{status}</span>
    </span>
  )
}

function MetricCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border border-gray-100 rounded-md px-4 py-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-[18px] text-black font-medium mt-1 ${mono ? "font-mono text-[15px]" : ""}`}>{value}</p>
    </div>
  )
}

export default function GrantPage() {
  const { isConnected, address } = useAccount()
  const { repo: connectedRepo } = useGitHubStore()

  // GitHub milestones from issues with "flint" label
  const [ghMilestones, setGhMilestones] = useState<Milestone[]>([])
  const [ghLoading, setGhLoading] = useState(false)

  // On-chain grant ID (optional manual override)
  const [grantIdInput, setGrantIdInput] = useState("1")
  const [grantId, setGrantId] = useState<bigint | null>(null)

  // Pending (unfunded) grants derived from flint issues + on-chain state
  const [pending, setPending] = useState<PendingIssue[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [funding, setFunding] = useState<PendingFunding | null>(null)

  useEffect(() => {
    if (!connectedRepo) {
      setPending([])
      return
    }
    setPendingLoading(true)
    fetch(`/api/grants/pending?repo=${connectedRepo}`)
      .then((r) => r.json())
      .then((d) => setPending(d.pending ?? []))
      .catch(console.error)
      .finally(() => setPendingLoading(false))
  }, [connectedRepo])

  useEffect(() => {
    if (!connectedRepo) {
      setGhMilestones([])
      return
    }
    setGhLoading(true)
    fetch(`/api/github/milestones?repo=${connectedRepo}`)
      .then((r) => r.json())
      .then((d) => setGhMilestones(d.milestones ?? []))
      .catch(console.error)
      .finally(() => setGhLoading(false))
  }, [connectedRepo])

  const { data: grantData, isLoading: grantLoading } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "grants",
    args: grantId !== null ? [grantId] : undefined,
    query: { enabled: grantId !== null },
  })

  const { data: onChainMilestones } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "getMilestones",
    args: grantId !== null ? [grantId] : undefined,
    query: { enabled: grantId !== null },
  })

  const grant = grantData as any
  const chainMilestones = (onChainMilestones as any[]) ?? []
  const hasGrant = grant && grant[0] !== "0x0000000000000000000000000000000000000000"
  const totalAmount = hasGrant ? BigInt(grant[3]) : 0n

  const closedCount = ghMilestones.filter((m) => m.status === "closed").length
  const totalRelease = ghMilestones.reduce((sum, m) => sum + (m.releasePercent ?? 0), 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <h1 className="text-[22px] font-semibold text-black">Grants</h1>
          <RepoSwitcher />
        </div>
        {connectedRepo && (
          <a
            href={`https://github.com/${connectedRepo}/issues?q=label%3Aflint`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-[12px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
          >
            View issues on GitHub
          </a>
        )}
      </div>

      {/* No repo */}
      {!connectedRepo && (
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Grant contract" value={truncateAddress(addresses.grant)} mono />
            <MetricCard label="Auto-release" value="14 days" />
            <MetricCard label="Approval" value="Wallet signer" />
          </div>
          <div className="border-t border-gray-100 pt-6">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-4">Grant lifecycle</p>
            <div className="space-y-3">
              {[
                { step: "01", text: "Grantor creates grant with USDC deposit on-chain" },
                { step: "02", text: "Each milestone is a GitHub issue with label 'flint' and release: X% in the body" },
                { step: "03", text: "Grantee closes the issue when milestone is complete" },
                { step: "04", text: "CRE agent verifies linked PRs are merged" },
                { step: "05", text: "Grantor approves tranche release → USDC sent" },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className="text-[11px] text-gray-400 font-mono pt-0.5">{s.step}</span>
                  <span className="text-[13px] text-gray-700">{s.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-gray-50 rounded-md px-4 py-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">Issue body format</p>
              <pre className="text-[12px] text-gray-700 font-mono whitespace-pre">{`## Milestone: Ship auth module\n\nBuild OAuth login and session management.\n\ncloses #12\n\n<!-- flint\nrelease: 25%\n-->`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Repo selected — GitHub milestones */}
      {connectedRepo && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard label="Milestones" value={ghMilestones.length.toString()} />
            <MetricCard label="Completed" value={`${closedCount} / ${ghMilestones.length}`} />
            <MetricCard label="Total release %" value={`${totalRelease.toFixed(0)}%`} />
            <MetricCard label="Grant contract" value={truncateAddress(addresses.grant)} mono />
          </div>

          {/* Pending grants from flint issues */}
          <PendingGrants
            pending={pending}
            loading={pendingLoading}
            repo={connectedRepo}
            onFund={(f) => setFunding(f)}
          />

          {/* Create grant or link existing */}
          {!hasGrant ? (
            funding ? (
              <>
                <button
                  onClick={() => setFunding(null)}
                  className="text-[12px] text-gray-400 hover:text-black transition-colors"
                >
                  ← Back to pending grants
                </button>
                <CreateGrantForm
                  key={funding.issueNumber}
                  ghMilestones={ghMilestones}
                  isConnected={isConnected}
                  onCreated={(id) => {
                    setGrantId(id)
                    setFunding(null)
                    setPending((ps) => ps.filter((p) => p.issueNumber !== funding.issueNumber))
                  }}
                  initial={funding}
                />
              </>
            ) : (
              <>
                <BridgeFunds />
                <CreateGrantForm
                  ghMilestones={ghMilestones}
                  isConnected={isConnected}
                  onCreated={(id) => setGrantId(id)}
                />
              </>
            )
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 border border-gray-100 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-green" />
              <span className="text-[13px] text-gray-700">
                Grant #{grantId!.toString()} · {formatAmount(totalAmount)} · Grantee:{" "}
                <span className="font-mono">{truncateAddress(grant[1])}</span>
              </span>
              <button
                onClick={() => setGrantId(null)}
                className="ml-auto text-[11px] text-gray-400 hover:text-red transition-colors"
              >
                Unlink
              </button>
            </div>
          )}

          {/* Or link existing grant ID */}
          {!hasGrant && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={grantIdInput}
                onChange={(e) => setGrantIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const id = parseInt(grantIdInput)
                    if (!isNaN(id) && id > 0) setGrantId(BigInt(id))
                  }
                }}
                placeholder="Or link existing grant ID"
                className="border border-gray-100 px-3 py-2 text-[13px] rounded-md focus:border-accent focus:outline-none w-52 font-mono"
              />
              <button
                onClick={() => {
                  const id = parseInt(grantIdInput)
                  if (!isNaN(id) && id > 0) setGrantId(BigInt(id))
                }}
                className="px-4 py-2 text-[13px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
              >
                Load
              </button>
            </div>
          )}

          {/* Milestones table */}
          {ghLoading ? (
            <p className="text-[13px] text-gray-400">Loading milestones...</p>
          ) : ghMilestones.length === 0 ? (
            <div className="border border-gray-100 rounded-md p-6">
              <p className="text-[13px] text-gray-700">No milestones found</p>
              <p className="text-[12px] text-gray-400 mt-1">
                Create GitHub issues with the <span className="font-mono bg-gray-100 px-1 rounded">flint</span> label and add{" "}
                <span className="font-mono bg-gray-100 px-1 rounded">release: X%</span> in the body
              </p>
            </div>
          ) : (
            <>
              <MilestoneTable
                ghMilestones={ghMilestones}
                chainMilestones={chainMilestones}
                totalAmount={totalAmount}
                grantId={grantId}
                ledgerApprover={hasGrant && grant ? (grant[5] as string) : ""}
                isConnected={isConnected}
                repo={connectedRepo}
              />
              {hasGrant && grant && (
                <ReclaimSection
                  grantId={grantId!}
                  grantor={grant[0] as string}
                  totalAmount={BigInt(grant[3])}
                  amountPaid={BigInt(grant[4])}
                  chainMilestones={chainMilestones}
                  connectedAddress={address}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export interface PendingFunding {
  issueNumber: number
  repo: string
  granteeAddress: string
  granteeGithub: string | null
  totalUsdc: string
  milestones: { title: string; releaseBps: number; deadlineUnix: number }[]
}

function toFunding(p: PendingIssue, repo: string): PendingFunding | null {
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
  return {
    issueNumber: p.issueNumber,
    repo,
    granteeAddress: p.granteeWallet ?? "",
    granteeGithub: p.grantee,
    totalUsdc: String(p.amount),
    milestones,
  }
}

function PendingGrants({
  pending,
  loading,
  repo,
  onFund,
}: {
  pending: PendingIssue[]
  loading: boolean
  repo: string
  onFund: (f: PendingFunding) => void
}) {
  if (loading) {
    return <p className="text-[13px] text-gray-400">Checking for pending grants...</p>
  }
  if (pending.length === 0) return null
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-wider">
        Pending grants from issues ({pending.length})
      </p>
      {pending.map((p) => {
        const funding = toFunding(p, repo)
        return (
          <div key={p.issueNumber} className="border border-gray-100 rounded-md p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <a
                  href={p.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-gray-700 hover:text-accent font-medium"
                >
                  {p.title}
                </a>
                <span className="text-[11px] text-gray-400 ml-2 font-mono">#{p.issueNumber}</span>
                <p className="text-[12px] text-gray-500 mt-1">
                  Grantee:{" "}
                  {p.grantee ? (
                    <span className="font-mono">{p.grantee}</span>
                  ) : (
                    <span className="text-gray-300">unassigned</span>
                  )}{" "}
                  {p.granteeWallet ? (
                    <span className="font-mono text-gray-400">→ {truncateAddress(p.granteeWallet)}</span>
                  ) : (
                    p.grantee && <span className="text-amber">· wallet unclaimed</span>
                  )}
                  {p.amount !== null && <span className="ml-3 font-mono">{p.amount} USDC total</span>}
                  {p.deadline && <span className="ml-3 font-mono">due {p.deadline}</span>}
                </p>
              </div>
              <button
                onClick={() => funding && onFund(funding)}
                disabled={!funding}
                className="px-4 py-2 text-[13px] font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors disabled:opacity-40 shrink-0"
              >
                Fund this grant
              </button>
            </div>
            <div className="space-y-1">
              {p.milestones.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-gray-500">
                  <span className="text-gray-300 font-mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate">{m.title || "Milestone"}</span>
                  <span className="ml-auto font-mono shrink-0">
                    {m.releaseBps !== null ? `${m.releaseBps / 100}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
            {p.specErrors.length > 0 && (
              <p className="text-[11px] text-red">
                Fix the issue body before funding: {p.specErrors.join("; ")}
              </p>
            )}
            {!p.granteeWallet && funding && (
              <p className="text-[11px] text-amber">
                Grantee wallet unclaimed — you can still fund, then paste their address in the form.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CreateGrantForm({
  ghMilestones,
  isConnected,
  onCreated,
  initial,
}: {
  ghMilestones: Milestone[]
  isConnected: boolean
  onCreated: (id: bigint) => void
  initial?: PendingFunding | null
}) {
  const [grantee, setGrantee] = useState(initial?.granteeAddress ?? "")
  const [approver, setApprover] = useState("")
  const [totalUsdc, setTotalUsdc] = useState(initial?.totalUsdc ?? "")
  const [step, setStep] = useState<"idle" | "approving" | "creating">("idle")
  const { writeContractAsync } = useWriteContract()

  const initialMilestones = initial
    ? initial.milestones.map((m) => ({
        title: m.title,
        releasePercent: m.releaseBps / 100,
        deadlineUnix: m.deadlineUnix,
        issueNumber: initial.issueNumber,
      }))
    : null
  const validMilestones = initialMilestones ?? ghMilestones.filter((m) => m.releasePercent !== null)
  const totalBps = validMilestones.reduce((sum, m) => sum + (m.releasePercent ?? 0) * 100, 0)
  const bpsValid = Math.round(totalBps) === 10000

  const handleCreate = async () => {
    if (!grantee || !approver || !totalUsdc) return
    const amount = parseUnits(totalUsdc, 6)

    const descriptions = initial
      ? initial.milestones.map((m, i) =>
          i === 0 ? `source: ${initial.repo}#${initial.issueNumber}\n${m.title}` : m.title,
        )
      : validMilestones.map((m) => m.title)
    const bps = initial
      ? initial.milestones.map((m) => BigInt(m.releaseBps))
      : validMilestones.map((m) => BigInt(Math.round((m.releasePercent ?? 0) * 100)))
    const deadlines = initial
      ? initial.milestones.map((m) => BigInt(m.deadlineUnix))
      : validMilestones.map(() => 0n)

    try {
      // Step 1: approve USDC
      setStep("approving")
      await writeContractAsync({
        address: USDC_ADDRESS as `0x${string}`,
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [addresses.grant as `0x${string}`, amount],
      })

      // Step 2: create grant
      setStep("creating")
      await writeContractAsync({
        address: addresses.grant as `0x${string}`,
        abi: grantAbi,
        functionName: "createGrant",
        args: [
          grantee as `0x${string}`,
          USDC_ADDRESS as `0x${string}`,
          amount,
          approver as `0x${string}`,
          validMilestones.map((m) => m.title),
          bps,
          deadlines,
        ],
      })
      setStep("idle")
    } catch (err) {
      console.error("Create grant failed:", err)
      setStep("idle")
    }
  }

  if (!isConnected) return null

  return (
    <div className="border border-gray-100 rounded-md p-4 space-y-4">
      <p className="text-[11px] text-gray-400 uppercase tracking-wider">Create grant on-chain</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-gray-400 mb-1 block">Grantee wallet</label>
          <input
            value={grantee}
            onChange={(e) => setGrantee(e.target.value)}
            placeholder="0x..."
            className="w-full border border-gray-100 px-3 py-2 text-[12px] rounded-md focus:border-accent focus:outline-none font-mono"
          />
        </div>
        <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Approver wallet</label>
          <input
            value={approver}
            onChange={(e) => setApprover(e.target.value)}
            placeholder="0x..."
            className="w-full border border-gray-100 px-3 py-2 text-[12px] rounded-md focus:border-accent focus:outline-none font-mono"
          />
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="text-[11px] text-gray-400 mb-1 block">Total USDC</label>
          <input
            value={totalUsdc}
            onChange={(e) => setTotalUsdc(e.target.value)}
            placeholder="1000"
            className="border border-gray-100 px-3 py-2 text-[12px] rounded-md focus:border-accent focus:outline-none w-32 font-mono"
          />
        </div>
        <div className="flex-1">
          <p className="text-[11px] text-gray-400 mb-1">
            Milestones from GitHub issues ({validMilestones.length} with release %)
            {!bpsValid && validMilestones.length > 0 && (
              <span className="text-amber ml-1">— total {(totalBps / 100).toFixed(0)}% (must be 100%)</span>
            )}
          </p>
          <div className="space-y-1">
            {validMilestones.map((m) => (
              <div key={m.issueNumber} className="flex items-center gap-2 text-[11px] text-gray-500">
                <span className="text-gray-300">#{m.issueNumber}</span>
                <span className="truncate">{m.title}</span>
                <span className="ml-auto font-mono shrink-0">{m.releasePercent}%</span>
              </div>
            ))}
            {validMilestones.length === 0 && (
              <p className="text-[11px] text-gray-300">No issues with release % found</p>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={step !== "idle" || !grantee || !approver || !totalUsdc || !bpsValid || validMilestones.length === 0}
        className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-40 transition-colors"
      >
        {step === "approving" ? "Approving USDC..." : step === "creating" ? "Creating grant..." : "Create grant"}
      </button>
    </div>
  )
}

function countdown(targetUnix: number): string | null {
  if (!targetUnix) return null
  const diff = targetUnix - Math.floor(Date.now() / 1000)
  const abs = Math.abs(diff)
  const d = Math.floor(abs / 86400)
  const h = Math.floor((abs % 86400) / 3600)
  const txt = d > 0 ? `${d}d` : `${h}h`
  return diff >= 0 ? `${txt} left` : `${txt} ago`
}

const AUTO_RELEASE_DELAY = 14 * 86400

function MilestoneTable({
  ghMilestones,
  chainMilestones,
  totalAmount,
  grantId,
  ledgerApprover,
  isConnected,
  repo,
}: {
  ghMilestones: Milestone[]
  chainMilestones: any[]
  totalAmount: bigint
  grantId: bigint | null
  ledgerApprover: string
  isConnected: boolean
  repo: string
}) {
  const allPRs = useMemo(
    () => [...new Set(ghMilestones.flatMap((m) => m.linkedPRs))],
    [ghMilestones],
  )
  const [prState, setPrState] = useState<Record<number, { merged: boolean; state: string }>>({})

  useEffect(() => {
    if (!repo || allPRs.length === 0) return
    fetch(`/api/github/pr-status?repo=${repo}&prs=${allPRs.join(",")}`)
      .then((r) => r.json())
      .then((d) => setPrState(d.prs ?? {}))
      .catch(console.error)
  }, [repo, allPRs])
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-3">Milestones</p>
      <div className="border border-gray-100 rounded-md overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-normal">#</th>
              <th className="text-left px-4 py-3 font-normal">Milestone</th>
              <th className="text-right px-4 py-3 font-normal">Release</th>
              <th className="text-right px-4 py-3 font-normal">Amount</th>
              <th className="text-right px-4 py-3 font-normal">Linked PRs</th>
              <th className="text-right px-4 py-3 font-normal">Status</th>
              <th className="text-right px-4 py-3 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {ghMilestones.map((m, i) => {
              const chainM = chainMilestones[i]
              const chainStatus = chainM
                ? MILESTONE_STATUS[Number(chainM.status ?? chainM[3])]
                : null
              const trancheBps = chainM ? Number(chainM.trancheBps ?? chainM[1]) : null
              const trancheAmount = trancheBps && totalAmount > 0n
                ? (totalAmount * BigInt(trancheBps)) / 10000n
                : null

              const releaseDisplay = m.releasePercent !== null
                ? `${m.releasePercent}%`
                : m.releaseAmount !== null
                  ? `${m.releaseAmount} USDC`
                  : "—"

              const amountDisplay = trancheAmount
                ? formatAmount(trancheAmount)
                : m.releaseAmount !== null
                  ? `${m.releaseAmount} USDC`
                  : "—"

              const displayStatus = chainStatus
                ? (chainStatus === "AutoReleased" ? "Auto-released" : chainStatus)
                : m.status

              const deadlineUnix = chainM ? Number(chainM.deadline ?? chainM[2]) : 0
              const verifiedAt = chainM ? Number(chainM.verifiedAt ?? chainM[4]) : 0
              const autoAt = verifiedAt ? verifiedAt + AUTO_RELEASE_DELAY : 0

              return (
                <tr key={m.issueNumber} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-[12px] text-gray-400 font-mono">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={m.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-gray-700 hover:text-accent"
                    >
                      {m.title}
                    </a>
                    <span className="text-[11px] text-gray-400 ml-2">#{m.issueNumber}</span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-gray-700 text-right font-mono">
                    {releaseDisplay}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-gray-700 text-right font-mono">
                    {amountDisplay}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.linkedPRs.length > 0 ? (
                      <span className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                        {m.linkedPRs.map((n) => {
                          const st = prState[n]
                          const dot =
                            st == null ? "bg-gray-200" : st.merged ? "bg-green" : "bg-amber"
                          return (
                            <span key={n} className="inline-flex items-center gap-1 text-[12px] text-gray-500 font-mono">
                              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />#{n}
                            </span>
                          )
                        })}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300">none</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusDot status={displayStatus} size="sm" />
                    {chainM && deadlineUnix > 0 && (
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                        due {countdown(deadlineUnix)}
                      </p>
                    )}
                    {chainStatus === "Verified" && autoAt > 0 && (
                      <p className="text-[11px] text-amber font-mono mt-0.5">
                        auto-release {countdown(autoAt)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {chainStatus === "Verified" && isConnected && grantId !== null && (
                      <ReleaseTrancheButton
                        grantId={grantId}
                        milestoneId={BigInt(i)}
                        ledgerApprover={ledgerApprover}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReclaimSection({
  grantId,
  grantor,
  totalAmount,
  amountPaid,
  chainMilestones,
  connectedAddress,
}: {
  grantId: bigint
  grantor: string
  totalAmount: bigint
  amountPaid: bigint
  chainMilestones: any[]
  connectedAddress: string | undefined
}) {
  const [waiting, setWaiting] = useState(false)
  const { writeContractAsync } = useWriteContract()

  const lastDeadline =
    chainMilestones.length > 0
      ? Number(
          chainMilestones[chainMilestones.length - 1].deadline ??
            chainMilestones[chainMilestones.length - 1][2],
        )
      : 0
  const remainder = totalAmount - amountPaid
  const expired = lastDeadline > 0 && Math.floor(Date.now() / 1000) > lastDeadline
  const isGrantor =
    !!connectedAddress && grantor.toLowerCase() === connectedAddress.toLowerCase()

  if (!expired || remainder <= 0n) return null
  if (!isGrantor) {
    return (
      <p className="text-[12px] text-amber">
        Final deadline passed with {formatAmount(remainder)} unclaimed — only the grantor can reclaim.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border border-amber/30 rounded-md">
      <span className="text-[13px] text-gray-700">
        Deadline passed · {formatAmount(remainder)} reclaimable
      </span>
      <button
        onClick={async () => {
          setWaiting(true)
          try {
            await writeContractAsync({
              address: addresses.grant as `0x${string}`,
              abi: grantAbi,
              functionName: "reclaimUndisbursed",
              args: [grantId],
            })
          } catch (err) {
            console.error("Reclaim failed:", err)
          } finally {
            setWaiting(false)
          }
        }}
        disabled={waiting}
        className="ml-auto px-4 py-2 text-[13px] font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        {waiting ? "Reclaiming..." : "Reclaim funds"}
      </button>
    </div>
  )
}

function ReleaseTrancheButton({
  grantId,
  milestoneId,
  ledgerApprover,
}: {
  grantId: bigint
  milestoneId: bigint
  ledgerApprover: string
}) {
  const [phase, setPhase] = useState<
    "idle" | "signing" | "verifying" | "submitting" | "success" | "error"
  >("idle")
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync: writeRelease } = useWriteContract()
  const { wallets } = useWallets()
  const activePrivy =
    wallets.find((w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2") ??
    wallets[0]

  const { data: approvalHash } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "computeApprovalHash",
    args: [grantId, milestoneId],
  })

  const hashReady = !!approvalHash
  const busy = phase === "signing" || phase === "verifying" || phase === "submitting"

  const onRelease = async () => {
    setError(null)
    setTxHash(null)
    try {
      if (!hashReady) throw new Error("Approval hash not loaded yet")
      if (!ledgerApprover) throw new Error("Grant approver not loaded yet")
      const hash = approvalHash as Hex

      // Privy embedded wallet takes precedence when available.
      if (privyEnabled && activePrivy) {
        const from = activePrivy.address as Hex
        try {
          await activePrivy.switchChain(CHAIN_ID)
        } catch {
          // User may have dismissed the switch prompt; the check below still guards us.
        }
        const provider = (await activePrivy.getEthereumProvider()) as unknown as PrivyEip1193Provider
        const chainHex = (await provider.request({ method: "eth_chainId" })) as string
        if (Number(chainHex) !== CHAIN_ID) {
          throw new Error("Switch your wallet to Arc Testnet and retry")
        }
        setPhase("signing")
        const signature = await privyPersonalSign(provider, from, hash)
        setPhase("verifying")
        const recovered = await recoverMessageAddress({
          message: { raw: hash },
          signature,
        })
        if (recovered.toLowerCase() !== ledgerApprover.toLowerCase()) {
          throw new Error(
            `Signature is from ${truncateAddress(recovered)}, but the grant expects ${truncateAddress(ledgerApprover)}. Wrong wallet?`,
          )
        }
        setPhase("submitting")
        const tx = await privySendTransaction(provider, {
          from,
          to: GRANT_ADDRESS,
          data: encodeReleaseTranche(grantId, milestoneId, signature),
        })
        setTxHash(tx)
        setPhase("success")
        return
      }

      // Fallback: connected browser wallet via wagmi.
      if (!walletClient || !address) throw new Error("Connect a wallet first (top right)")
      if (walletClient.chain.id !== CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: CHAIN_ID })
        } catch {
          // User may have dismissed the switch prompt; the check below still guards us.
        }
      }
      if ((await walletClient.getChainId()) !== CHAIN_ID) {
        throw new Error("Switch your wallet to Arc Testnet and retry")
      }

      // 1. One-click approval signature (wallet confirms).
      setPhase("signing")
      const signature = await walletClient.signMessage({ message: { raw: hash } })

      // 2. Silent verification — invisible unless something is wrong.
      setPhase("verifying")
      const recovered = await recoverMessageAddress({
        message: { raw: hash },
        signature,
      })
      if (recovered.toLowerCase() !== ledgerApprover.toLowerCase()) {
        throw new Error(
          `Signature is from ${truncateAddress(recovered)}, but the grant expects ${truncateAddress(ledgerApprover)}. Wrong wallet?`,
        )
      }

      // 3. Submit the tranche release from the same wallet.
      setPhase("submitting")
      const tx = await writeRelease({
        address: GRANT_ADDRESS,
        abi: grantAbi,
        functionName: "releaseTranche",
        args: [grantId, milestoneId, signature],
      })
      setTxHash(tx)
      setPhase("success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed")
      setPhase("error")
    }
  }

  const phaseLabel =
    phase === "signing"
      ? "Confirm…"
      : phase === "verifying"
        ? "Verifying…"
        : phase === "submitting"
          ? "Releasing…"
          : phase === "success"
            ? "Released"
            : "Approve tranche"

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={onRelease}
        disabled={busy || !hashReady || phase === "success"}
        className="px-3 py-1.5 text-[12px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {phaseLabel}
      </button>
      {phase === "error" && error && (
        <span className="text-[11px] text-red max-w-44 text-right">{error}</span>
      )}
      {phase === "success" && txHash && (
        <a
          href={`https://testnet.arcscan.app/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-accent hover:underline font-mono"
        >
          {truncateAddress(txHash)}
        </a>
      )}
    </span>
  )
}

function formatAmount(amount: bigint): string {
  return `${(Number(amount) / 1e6).toLocaleString()} USDC`
}
