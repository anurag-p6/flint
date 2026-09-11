"use client"

import { useReadContract, useWriteContract, useAccount } from "wagmi"
import { useState, useEffect } from "react"
import { parseUnits } from "viem"
import { addresses, USDC_ADDRESS } from "@/lib/contracts"
import { truncateAddress } from "@/lib/utils"
import { useGitHubStore } from "@/lib/github-store"
import { RepoSwitcher } from "@/components/repo-switcher"
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
  const { isConnected } = useAccount()
  const { repo: connectedRepo } = useGitHubStore()

  // GitHub milestones from issues with "flint" label
  const [ghMilestones, setGhMilestones] = useState<Milestone[]>([])
  const [ghLoading, setGhLoading] = useState(false)

  // On-chain grant ID (optional manual override)
  const [grantIdInput, setGrantIdInput] = useState("1")
  const [grantId, setGrantId] = useState<bigint | null>(null)

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
            <MetricCard label="Approval" value="Privy signer" />
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

          {/* Create grant or link existing */}
          {!hasGrant ? (
            <>
              <BridgeFunds />
              <CreateGrantForm
              ghMilestones={ghMilestones}
              isConnected={isConnected}
              onCreated={(id) => setGrantId(id)}
              />
            </>
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
            <MilestoneTable
              ghMilestones={ghMilestones}
              chainMilestones={chainMilestones}
              totalAmount={totalAmount}
              grantId={grantId}
              isConnected={isConnected}
            />
          )}
        </>
      )}
    </div>
  )
}

function CreateGrantForm({
  ghMilestones,
  isConnected,
  onCreated,
}: {
  ghMilestones: Milestone[]
  isConnected: boolean
  onCreated: (id: bigint) => void
}) {
  const [grantee, setGrantee] = useState("")
  const [approver, setApprover] = useState("")
  const [totalUsdc, setTotalUsdc] = useState("")
  const [step, setStep] = useState<"idle" | "approving" | "creating">("idle")
  const { writeContractAsync } = useWriteContract()

  const validMilestones = ghMilestones.filter((m) => m.releasePercent !== null)
  const totalBps = validMilestones.reduce((sum, m) => sum + (m.releasePercent ?? 0) * 100, 0)
  const bpsValid = totalBps === 10000

  const handleCreate = async () => {
    if (!grantee || !approver || !totalUsdc) return
    const amount = parseUnits(totalUsdc, 6)

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
          validMilestones.map((m) => BigInt(Math.round((m.releasePercent ?? 0) * 100))),
          validMilestones.map(() => 0n),
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
          <label className="text-[11px] text-gray-400 mb-1 block">Approver wallet (Privy)</label>
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

function MilestoneTable({
  ghMilestones,
  chainMilestones,
  totalAmount,
  grantId,
  isConnected,
}: {
  ghMilestones: Milestone[]
  chainMilestones: any[]
  totalAmount: bigint
  grantId: bigint | null
  isConnected: boolean
}) {
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
                    {m.linkedPRs.length > 0
                      ? <span className="text-[12px] text-gray-500">{m.linkedPRs.map((n) => `#${n}`).join(", ")}</span>
                      : <span className="text-[11px] text-gray-300">none</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusDot status={displayStatus} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {chainStatus === "Verified" && isConnected && grantId !== null && (
                      <ReleaseTrancheButton grantId={grantId} milestoneId={BigInt(i)} />
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

function ReleaseTrancheButton({ grantId, milestoneId }: { grantId: bigint; milestoneId: bigint }) {
  const [waiting, setWaiting] = useState(false)
  const { writeContract } = useWriteContract()

  return (
    <button
      onClick={() => {
        setWaiting(true)
        try {
          writeContract({
            address: addresses.grant as `0x${string}`,
            abi: grantAbi,
            functionName: "releaseTranche",
            args: [grantId, milestoneId, "0x"],
          })
        } catch { setWaiting(false) }
      }}
      disabled={waiting}
      className={`px-3 py-1.5 text-[12px] font-medium text-white bg-accent rounded-md transition-colors ${
        waiting ? "opacity-75" : "hover:bg-accent/90"
      }`}
    >
      {waiting ? "Waiting..." : "Approve tranche"}
    </button>
  )
}

function formatAmount(amount: bigint): string {
  return `${(Number(amount) / 1e6).toLocaleString()} USDC`
}
