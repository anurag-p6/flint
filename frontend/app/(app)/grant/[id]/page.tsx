"use client"

import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useState, useEffect, useMemo, useRef } from "react"
import { useReadContract } from "wagmi"
import { recoverMessageAddress, type Hex } from "viem"
import { useWallets } from "@privy-io/react-auth"
import { addresses, CHAIN_ID } from "@/lib/contracts"
import { truncateAddress } from "@/lib/utils"
import { AddressLink, TxLink } from "@/components/tx-link"
import { thresholdOrDefault } from "@/lib/threshold"
import { GrantDetailCard } from "@/components/grant-detail-card"
import {
  encodeReleaseTranche,
  privyPersonalSign,
  privySendTransaction,
  GRANT_ADDRESS,
  type PrivyEip1193Provider,
} from "@/lib/privy/grant"
import grantAbi from "@/lib/abi/FlintGrant.json"
import type { FundedGrant } from "@/app/api/grants/pending/route"
import type { Milestone } from "@/app/api/github/milestones/route"

const MILESTONE_STATUS = ["Pending", "Verified", "Released", "AutoReleased"] as const
const AUTO_RELEASE_DELAY = 14 * 86400

export default function GrantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const repo = searchParams.get("repo") ?? ""
  const grantId = BigInt(id)

  const { wallets } = useWallets()
  const activeWallet =
    wallets.find((w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2") ??
    wallets[0]

  const [liveTick, setLiveTick] = useState(0)

  useEffect(() => {
    if (!repo) return
    const repoLower = repo.toLowerCase()
    let es: EventSource | null = null
    let fails = 0
    let debounce: ReturnType<typeof setTimeout> | null = null
    const kick = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => setLiveTick((t) => t + 1), 2000)
    }
    try {
      es = new EventSource(`/api/live/stream?repos=${encodeURIComponent(repo)}`)
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
  }, [repo])

  const { data: grantData } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "grants",
    args: [grantId],
    scopeKey: `grant-${liveTick}`,
  })

  const { data: chainMilestonesData } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "getMilestones",
    args: [grantId],
    scopeKey: `milestones-${liveTick}`,
  })

  const grant = grantData as any
  const chainMilestones = ((chainMilestonesData as any[]) ?? []) as any[]
  const hasGrant = grant && grant[0] !== "0x0000000000000000000000000000000000000000"
  const totalAmount: bigint = hasGrant ? BigInt(grant[3]) : 0n
  const amountPaid: bigint = hasGrant ? BigInt(grant[4]) : 0n
  const approver: string = hasGrant ? String(grant[5]) : ""
  const grantee: string = hasGrant ? String(grant[1]) : ""

  const [ghMilestones, setGhMilestones] = useState<Milestone[]>([])
  const [funded, setFunded] = useState<FundedGrant | null>(null)
  const [prState, setPrState] = useState<Record<number, { merged: boolean; state: string }>>({})
  const [closingPrs, setClosingPrs] = useState<number[]>([])
  const autoVerifyOnce = useRef(false)

  useEffect(() => {
    if (!repo) return
    fetch(`/api/github/milestones?repo=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((d) => setGhMilestones(d.milestones ?? []))
      .catch(console.error)
  }, [repo, liveTick])

  useEffect(() => {
    if (!repo) return
    fetch(`/api/grants/pending?repo=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((d) => {
        const hit = ((d.funded ?? []) as FundedGrant[]).find((f) => BigInt(f.grantId) === grantId)
        setFunded(hit ?? null)
      })
      .catch(console.error)
  }, [repo, grantId, liveTick])

  const grantIssue = useMemo(
    () =>
      funded
        ? ghMilestones.find((m) => m.issueNumber === funded.issueNumber) ?? null
        : null,
    [ghMilestones, funded],
  )

  const allPRs = useMemo(() => {
    if (funded?.milestones?.some((m) => m.linkedPRs?.length)) {
      return [...new Set(funded.milestones.flatMap((m) => m.linkedPRs ?? []))]
    }
    return [...new Set(grantIssue?.linkedPRs ?? [])]
  }, [funded, grantIssue])

  useEffect(() => {
    if (!repo || allPRs.length === 0) return
    fetch(`/api/github/pr-status?repo=${encodeURIComponent(repo)}&prs=${allPRs.join(",")}`)
      .then((r) => r.json())
      .then((d) => setPrState(d.prs ?? {}))
      .catch(console.error)
  }, [repo, allPRs])

  const issueNumber = funded?.issueNumber ?? grantIssue?.issueNumber
  useEffect(() => {
    if (!repo || !issueNumber) return
    fetch(`/api/github/prs-closing?repo=${encodeURIComponent(repo)}&issue=${issueNumber}`)
      .then((r) => r.json())
      .then((d) => {
        const nums = ((d.prs ?? []) as { number: number }[]).map((p) => p.number)
        setClosingPrs(nums)
        setPrState((prev) => {
          const next = { ...prev }
          for (const n of nums) next[n] = { merged: true, state: "merged" }
          return next
        })
      })
      .catch(console.error)
  }, [repo, issueNumber, liveTick])

  const firstPending = chainMilestones.some((m) => Number(m.status ?? m[3]) === 0)
  const hasMergedCloser = closingPrs.length > 0
  useEffect(() => {
    if (!repo || !firstPending || !hasMergedCloser || autoVerifyOnce.current) return
    autoVerifyOnce.current = true
    fetch("/api/keeper/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo }),
    })
      .then(() => setLiveTick((t) => t + 1))
      .catch(console.error)
  }, [repo, firstPending, hasMergedCloser])

  if (!hasGrant && grantData !== undefined) {
    return (
      <div className="space-y-6">
        <Link href="/grant" className="text-[12px] text-gray-400 hover:text-black transition-colors">
          ← All grants
        </Link>
        <div className="border border-gray-100 rounded-md p-6">
          <p className="text-[13px] text-gray-700">Grant #{id} not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href="/grant" className="text-[12px] text-gray-400 hover:text-black transition-colors">
        ← All grants
      </Link>

      {/* Detail card with race board, progress graph, money trail */}
      <GrantDetailCard grantId={grantId} repo={repo} />

      {/* Milestones table with release actions */}
      {chainMilestones.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-3">
            Milestones ({chainMilestones.length})
          </p>
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
                {chainMilestones.map((chainM, i) => {
                  const specM = funded?.milestones[i]
                  const subM = grantIssue?.subMilestones?.[i]
                  const chainStatus = MILESTONE_STATUS[Number(chainM.status ?? chainM[3])]
                  const trancheBps = Number(chainM.trancheBps ?? chainM[1])
                  const trancheAmount = totalAmount > 0n
                    ? (totalAmount * BigInt(trancheBps)) / 10000n
                    : 0n
                  const description = String(chainM.description ?? chainM[0] ?? "")
                  const title =
                    specM?.title ||
                    subM?.title ||
                    description.replace(/^source:.*\n/m, "").trim() ||
                    `Milestone ${i + 1}`
                  const deadlineUnix = Number(chainM.deadline ?? chainM[2])
                  const verifiedAt = Number(chainM.verifiedAt ?? chainM[4])
                  const paidAt = Number(chainM.paidAt ?? chainM[5])
                  const autoAt = verifiedAt ? verifiedAt + AUTO_RELEASE_DELAY : 0

                  const displayStatus =
                    chainStatus === "AutoReleased" ? "Auto-released" : chainStatus

                  const statusColor =
                    chainStatus === "Released" || chainStatus === "AutoReleased" ? "bg-green" :
                    chainStatus === "Verified" ? "bg-amber" :
                    "bg-gray-300"

                  const linkedPRs = [
                    ...new Set([
                      ...(specM?.linkedPRs ?? []),
                      ...(subM?.linkedPRs ?? []),
                      ...(i === 0 ? closingPrs : []),
                    ]),
                  ]
                  const issueUrl = funded?.issueUrl ?? grantIssue?.issueUrl
                  const canPay =
                    !!activeWallet &&
                    chainStatus !== "Released" &&
                    chainStatus !== "AutoReleased" &&
                    (chainStatus === "Verified" || (i === 0 && hasMergedCloser))

                  return (
                    <tr key={i} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-[12px] text-gray-400 font-mono">
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] text-gray-700 font-medium">{title}</p>
                        {issueNumber != null && (
                          <a
                            href={issueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-gray-400 hover:text-accent font-mono"
                          >
                            #{issueNumber}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-gray-700 text-right font-mono">
                        {trancheBps / 100}%
                      </td>
                      <td className="px-4 py-3 text-[13px] text-gray-700 text-right font-mono">
                        {formatAmount(trancheAmount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {linkedPRs.length > 0 ? (
                          <span className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                            {linkedPRs.map((n) => {
                              const st = prState[n]
                              const dot =
                                st == null ? "bg-gray-200" : st.merged ? "bg-green" : "bg-amber"
                              return (
                                <a
                                  key={n}
                                  href={`https://github.com/${repo}/pull/${n}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[12px] text-gray-500 font-mono hover:text-accent"
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />#{n}
                                </a>
                              )
                            })}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">none</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                          <span className="text-[11px] text-gray-700">{displayStatus}</span>
                        </span>
                        {deadlineUnix > 0 && (
                          <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                            due {countdown(deadlineUnix)}
                          </p>
                        )}
                        {chainStatus === "Verified" && autoAt > 0 && (
                          <p className="text-[11px] text-amber font-mono mt-0.5">
                            auto-release {countdown(autoAt)}
                          </p>
                        )}
                        {paidAt > 0 && (
                          <p className="text-[11px] text-green font-mono mt-0.5">
                            paid {new Date(paidAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canPay && (
                          <ReleaseTrancheButton
                            grantId={grantId}
                            milestoneId={BigInt(i)}
                            approver={approver}
                            wallet={activeWallet}
                            repo={repo}
                            verifyFirst={chainStatus === "Pending"}
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
      )}

      {/* Transaction links */}
      {hasGrant && (
        <div className="flex items-center gap-4 text-[12px]">
          <AddressLink address={addresses.grant} label="Grant contract on Arcscan ↗" />
          {funded?.issueUrl && (
            <a
              href={funded.issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              GitHub issue #{funded.issueNumber} ↗
            </a>
          )}
          <span className="text-gray-400 font-mono">
            Grantee: {truncateAddress(grantee)}
          </span>
          <span className="text-gray-400 font-mono">
            Approver: {truncateAddress(approver)}
          </span>
        </div>
      )}

      {/* Reclaim section */}
      {hasGrant && (
        <ReclaimSection
          grantId={grantId}
          grantor={String(grant[0])}
          totalAmount={totalAmount}
          amountPaid={amountPaid}
          chainMilestones={chainMilestones}
          wallet={activeWallet}
        />
      )}
    </div>
  )
}

function ReleaseTrancheButton({
  grantId,
  milestoneId,
  approver,
  wallet,
  repo,
  verifyFirst,
}: {
  grantId: bigint
  milestoneId: bigint
  approver: string
  wallet: any
  repo?: string
  verifyFirst?: boolean
}) {
  const [phase, setPhase] = useState<"idle" | "signing" | "verifying" | "submitting" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)

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
      const hash = approvalHash as Hex
      const from = wallet.address as Hex

      try { await wallet.switchChain(CHAIN_ID) } catch {}
      const provider = (await wallet.getEthereumProvider()) as unknown as PrivyEip1193Provider

      if (verifyFirst && repo) {
        setPhase("verifying")
        const check = await fetch("/api/keeper/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo }),
        })
        if (!check.ok) {
          const data = await check.json().catch(() => ({}))
          throw new Error(data.error ?? "Could not verify the merged PR")
        }
      }

      setPhase("signing")
      const signature = await privyPersonalSign(provider, from, hash)

      setPhase("verifying")
      const recovered = await recoverMessageAddress({
        message: { raw: hash },
        signature,
      })
      if (recovered.toLowerCase() !== approver.toLowerCase()) {
        throw new Error(
          `Signature from ${truncateAddress(recovered)}, expected ${truncateAddress(approver)}`,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release failed")
      setPhase("error")
    }
  }

  const phaseLabel =
    phase === "signing" ? "Confirm..." :
    phase === "verifying" ? "Verifying..." :
    phase === "submitting" ? "Releasing..." :
    phase === "success" ? "Released" :
    "Release funds"

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
        <TxLink hash={txHash} className="text-[11px] font-mono text-accent hover:underline" />
      )}
    </span>
  )
}

function ReclaimSection({
  grantId,
  grantor,
  totalAmount,
  amountPaid,
  chainMilestones,
  wallet,
}: {
  grantId: bigint
  grantor: string
  totalAmount: bigint
  amountPaid: bigint
  chainMilestones: any[]
  wallet: any
}) {
  const [waiting, setWaiting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const lastDeadline =
    chainMilestones.length > 0
      ? Number(chainMilestones[chainMilestones.length - 1].deadline ?? chainMilestones[chainMilestones.length - 1][2])
      : 0
  const remainder = totalAmount - amountPaid
  const expired = lastDeadline > 0 && Math.floor(Date.now() / 1000) > lastDeadline
  const isGrantor = !!wallet && grantor.toLowerCase() === wallet.address.toLowerCase()

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
          if (!wallet) return
          setWaiting(true)
          try {
            const from = wallet.address as Hex
            try { await wallet.switchChain(CHAIN_ID) } catch {}
            const provider = (await wallet.getEthereumProvider()) as unknown as PrivyEip1193Provider
            const { encodeFunctionData } = await import("viem")
            const data = encodeFunctionData({
              abi: grantAbi,
              functionName: "reclaimUndisbursed",
              args: [grantId],
            })
            const hash = await privySendTransaction(provider, { from, to: GRANT_ADDRESS, data })
            setTxHash(hash)
          } catch (err) {
            console.error("Reclaim failed:", err)
          } finally {
            setWaiting(false)
          }
        }}
        disabled={waiting || !!txHash}
        className="ml-auto px-4 py-2 text-[13px] font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
      >
        {waiting ? "Reclaiming..." : txHash ? "Reclaimed" : "Reclaim funds"}
      </button>
      {txHash && <TxLink hash={txHash} />}
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

function formatAmount(amount: bigint): string {
  return `${(Number(amount) / 1e6).toLocaleString()} USDC`
}
