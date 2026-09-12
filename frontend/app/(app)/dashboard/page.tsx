"use client"

import { useAccount, useReadContract } from "wagmi"
import { keccak256, encodePacked } from "viem"
import { useState, useEffect } from "react"
import { addresses } from "@/lib/contracts"
import { truncateAddress, formatScore } from "@/lib/utils"
import { useGitHubStore } from "@/lib/github-store"
import { RepoSwitcher } from "@/components/repo-switcher"
import { ApprovePanel } from "@/components/approve-panel"
import { PrivyWalletButton } from "@/components/privy-auth"
import { PrivyApprovePanel } from "@/components/privy-approve-panel"
import { privyEnabled } from "@/lib/privy/config"
import escrowAbi from "@/lib/abi/FlintEscrow.json"

type PoolStatus = "Active" | "ScoresSubmitted" | "Approved" | "Paid" | "Reclaimed"
const STATUS_LABELS: PoolStatus[] = ["Active", "ScoresSubmitted", "Approved", "Paid", "Reclaimed"]

interface GitHubContributor {
  login: string
  avatarUrl: string
  profileUrl: string
  commits: number
  prs: number
  issues: number
}

function StatusDot({ status, size = "default" }: { status: string; size?: "default" | "sm" }) {
  const color =
    status === "Paid" ? "bg-green" :
    status === "ScoresSubmitted" || status === "Approved" || status === "Scores submitted" || status === "Pending" ? "bg-amber" :
    status === "Active" ? "bg-accent" :
    "bg-red"
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2"
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${dotSize} rounded-full ${color}`} />
      <span className={`${size === "sm" ? "text-[11px]" : "text-[13px]"} text-gray-700`}>{status}</span>
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

export default function DashboardPage() {
  const { repo: connectedRepo } = useGitHubStore()
  const { isConnected } = useAccount()

  // GitHub contributor data
  const [ghContributors, setGhContributors] = useState<GitHubContributor[]>([])
  const [ghLoading, setGhLoading] = useState(false)
  const [walletMapping, setWalletMapping] = useState<Record<string, string>>({})
  const [mdMissing, setMdMissing] = useState(false)

  useEffect(() => {
    if (!connectedRepo) {
      setGhContributors([])
      setWalletMapping({})
      return
    }
    setGhLoading(true)

    Promise.all([
      fetch(`/api/github/contributors?repo=${connectedRepo}`).then((r) => r.json()),
      fetch(`/api/github/contributors-md?repo=${connectedRepo}`).then((r) => r.json()),
    ])
      .then(([contribData, mdData]) => {
        setGhContributors(contribData.contributors ?? [])
        setWalletMapping(mdData.mapping ?? {})
        setMdMissing(mdData.missing ?? false)
      })
      .catch(console.error)
      .finally(() => setGhLoading(false))
  }, [connectedRepo])

  const repoId = connectedRepo
    ? keccak256(encodePacked(["string"], [connectedRepo]))
    : undefined

  const { data: poolData, isLoading: poolLoading } = useReadContract({
    address: addresses.escrow as `0x${string}`,
    abi: escrowAbi,
    functionName: "pools",
    args: repoId ? [repoId] : undefined,
    query: { enabled: !!repoId },
  })

  const { data: scoresData } = useReadContract({
    address: addresses.escrow as `0x${string}`,
    abi: escrowAbi,
    functionName: "getPoolScores",
    args: repoId ? [repoId] : undefined,
    query: { enabled: !!repoId },
  })

  const pool = poolData as any
  const onChainScores = (scoresData as any[]) ?? []
  const hasPool = pool && pool[0] !== "0x0000000000000000000000000000000000000000"
  const status = hasPool ? STATUS_LABELS[Number(pool[7])] : null
  const totalAmount = hasPool ? BigInt(pool[2]) : 0n
  const totalScoreSum = onChainScores.reduce((sum: bigint, s: any) => sum + BigInt(s.score), 0n)
  const walletToLogin: Record<string, string> = Object.fromEntries(
    Object.entries(walletMapping).map(([login, wallet]) => [(wallet as string).toLowerCase(), login]),
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <h1 className="text-[22px] font-semibold text-black">Dashboard</h1>
          <RepoSwitcher />
        </div>
        {connectedRepo && (
          <div className="flex items-center gap-3">
            <a
              href={`https://github.com/${connectedRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-[12px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
            >
              View on GitHub
            </a>
            <PrivyWalletButton />
          </div>
        )}
      </div>

      {/* No repo selected */}
      {!connectedRepo && (
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Escrow contract" value={truncateAddress(addresses.escrow)} mono />
            <MetricCard label="Token" value="USDC" />
            <MetricCard label="Payout policy" value="Square root" />
          </div>
          <div className="border-t border-gray-100 pt-6">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-4">How it works</p>
            <div className="space-y-3">
              {[
                { step: "01", text: "Maintainer creates a pool with USDC deposit and repo ID" },
                { step: "02", text: "CRE agent fetches GitHub data and scores contributors inside TEE" },
                { step: "03", text: "Scores submitted on-chain via DON consensus" },
                { step: "04", text: "Maintainer reviews scores and approves payout on-chain" },
                { step: "05", text: "USDC distributed, ERC-5484 soulbound receipts minted" },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className="text-[11px] text-gray-400 font-mono pt-0.5">{s.step}</span>
                  <span className="text-[13px] text-gray-700">{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Repo selected */}
      {connectedRepo && (
        <>
          {/* Pool metrics */}
          {hasPool && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-[13px] text-gray-400">Pool: {formatPoolAmount(totalAmount)}</span>
                  <StatusDot status={status === "ScoresSubmitted" ? "Scores submitted" : status!} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <MetricCard label="Contributors" value={ghContributors.length.toString()} />
                <MetricCard label="Total pool" value={formatPoolAmount(totalAmount)} />
                <MetricCard label="Status" value={status === "ScoresSubmitted" ? "Scores submitted" : status!} />
                <MetricCard label="Scored" value={onChainScores.length > 0 ? `${onChainScores.length} addresses` : "Pending"} />
              </div>
              {status === "ScoresSubmitted" &&
                (privyEnabled ? (
                  <PrivyApprovePanel
                    repoId={repoId!}
                    signer={pool[4] as string}
                    payoutPolicy={pool[3] as string}
                    totalAmount={totalAmount}
                    scores={onChainScores.map((s: any) => ({
                      contributor: s.contributor as string,
                      score: BigInt(s.score),
                    }))}
                    usernameFor={(w: string) => walletToLogin[w.toLowerCase()]}
                  />
                ) : isConnected ? (
                  <ApprovePanel
                    repoId={repoId!}
                    signer={pool[4] as string}
                    payoutPolicy={pool[3] as string}
                    totalAmount={totalAmount}
                    scores={onChainScores.map((s: any) => ({
                      contributor: s.contributor as string,
                      score: BigInt(s.score),
                    }))}
                    usernameFor={(w: string) => walletToLogin[w.toLowerCase()]}
                  />
                ) : (
                  <p className="text-[12px] text-amber">
                    Connect a wallet to enable one-click payout approval.
                  </p>
                ))}
            </div>
          )}

          {/* CONTRIBUTORS.md warning */}
          {mdMissing && (
            <div className="border border-amber rounded-md px-4 py-3 flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5 shrink-0" />
              <div>
                <p className="text-[13px] text-gray-700 font-medium">CONTRIBUTORS.md not found</p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  Contributors must add their wallet address to <span className="font-mono">CONTRIBUTORS.md</span> in the repo root for disbursement.
                </p>
                <p className="text-[11px] text-gray-400 font-mono mt-2 bg-gray-50 px-2 py-1.5 rounded">
                  | @username | 0xYourWalletAddress |
                </p>
              </div>
            </div>
          )}

          {/* Contributors table */}
          {ghLoading ? (
            <p className="text-[13px] text-gray-400">Loading contributors...</p>
          ) : ghContributors.length > 0 ? (
            <ContributorsTable
              contributors={ghContributors}
              walletMapping={walletMapping}
              onChainScores={onChainScores}
              totalAmount={totalAmount}
              totalScoreSum={totalScoreSum}
            />
          ) : (
            <p className="text-[13px] text-gray-400">No contributors found.</p>
          )}
        </>
      )}
    </div>
  )
}

function ContributorsTable({
  contributors,
  walletMapping,
  onChainScores,
  totalAmount,
  totalScoreSum,
}: {
  contributors: GitHubContributor[]
  walletMapping: Record<string, string>
  onChainScores: any[]
  totalAmount: bigint
  totalScoreSum: bigint
}) {
  const hasScores = onChainScores.length > 0

  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-3">Contributors</p>
      <div className="border border-gray-100 rounded-md overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-normal">#</th>
              <th className="text-left px-4 py-3 font-normal">Contributor</th>
              <th className="text-left px-4 py-3 font-normal">Wallet</th>
              <th className="text-right px-4 py-3 font-normal">PRs</th>
              <th className="text-right px-4 py-3 font-normal">Issues</th>
              <th className="text-right px-4 py-3 font-normal">Commits</th>
              <th className="text-right px-4 py-3 font-normal">Score</th>
              <th className="text-right px-4 py-3 font-normal">Share</th>
            </tr>
          </thead>
          <tbody>
            {contributors.map((c, i) => {
              const wallet = walletMapping[c.login.toLowerCase()]

              // Match on-chain score by wallet address
              const onChain = wallet
                ? onChainScores.find(
                    (s) => s.contributor?.toLowerCase() === wallet.toLowerCase()
                  )
                : null
              const score = onChain ? BigInt(onChain.score) : null
              const share = score && totalScoreSum > 0n
                ? Number((score * 10000n) / totalScoreSum) / 100
                : null
              const amount = score && totalScoreSum > 0n
                ? (totalAmount * score) / totalScoreSum
                : null

              return (
                <tr key={c.login} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-[12px] text-gray-400 font-mono">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <img src={c.avatarUrl} alt={c.login} className="w-6 h-6 rounded-full shrink-0" />
                      <div>
                        <a
                          href={c.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] text-gray-700 hover:text-accent"
                        >
                          {c.login}
                        </a>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {wallet
                      ? <span className="text-[11px] font-mono text-gray-500">{truncateAddress(wallet)}</span>
                      : <span className="text-[11px] text-amber">not registered</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-[13px] text-gray-700 text-right">{c.prs}</td>
                  <td className="px-4 py-3 text-[13px] text-gray-700 text-right">{c.issues}</td>
                  <td className="px-4 py-3 text-[13px] text-gray-700 text-right">{c.commits}</td>
                  <td className="px-4 py-3 text-right">
                    {score !== null
                      ? <span className="text-[13px] text-black font-medium">{formatScore(score).toFixed(2)}</span>
                      : <span className="text-[11px] text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {share !== null && amount !== null
                      ? (
                        <div className="text-right">
                          <span className="text-[13px] text-gray-700">{share.toFixed(1)}%</span>
                          <div className="text-[11px] text-gray-400 font-mono">{formatPoolAmount(amount)}</div>
                        </div>
                      )
                      : <span className="text-[11px] text-gray-300">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!hasScores && (
        <p className="text-[11px] text-gray-400 mt-2">
          Score and share columns will populate after CRE agent scores this repo
        </p>
      )}
    </div>
  )
}

function formatPoolAmount(amount: bigint): string {
  return `${(Number(amount) / 1e6).toLocaleString()} USDC`
}
