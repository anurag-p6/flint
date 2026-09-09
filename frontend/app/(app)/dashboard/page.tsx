"use client"

import { useReadContract, useWriteContract, useAccount } from "wagmi"
import { keccak256, encodePacked } from "viem"
import { useState } from "react"
import { addresses, USDC_ADDRESS } from "@/lib/contracts"
import { truncateAddress, formatScore } from "@/lib/utils"
import escrowAbi from "@/lib/abi/FlintEscrow.json"

type PoolStatus = "Active" | "ScoresSubmitted" | "Approved" | "Paid" | "Reclaimed"
const STATUS_LABELS: PoolStatus[] = ["Active", "ScoresSubmitted", "Approved", "Paid", "Reclaimed"]

function StatusDot({ status, size = "default" }: { status: string; size?: "default" | "sm" }) {
  const color =
    status === "Paid" || status === "Released" ? "bg-green" :
    status === "ScoresSubmitted" || status === "Approved" || status === "Scores submitted" ? "bg-amber" :
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

const DEMO_SCORES = [
  { username: "spirosikmd", address: "0x1111...1111", score: 847, share: 45.2, amount: 452 },
  { username: "bgw", address: "0x2222...2222", score: 621, share: 33.1, amount: 331 },
  { username: "gaearon", address: "0x3333...3333", score: 312, share: 16.6, amount: 166 },
  { username: "petehunt", address: "0x4444...4444", score: 95, share: 5.1, amount: 51 },
]

export default function DashboardPage() {
  const { isConnected } = useAccount()
  const [repoInput, setRepoInput] = useState("vercel/next.js")
  const [repo, setRepo] = useState("")
  const [showDemo, setShowDemo] = useState(false)

  const repoId = repo
    ? keccak256(encodePacked(["string"], [repo]))
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
  const scores = (scoresData as any[]) ?? []
  const hasPool = pool && pool[0] !== "0x0000000000000000000000000000000000000000"
  const status = hasPool ? STATUS_LABELS[Number(pool[7])] : null
  const totalAmount = hasPool ? BigInt(pool[2]) : 0n
  const totalScoreSum = scores.reduce((sum: bigint, s: any) => sum + BigInt(s.score), 0n)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold text-black">Dashboard</h1>
        <p className="text-[13px] text-gray-400 mt-1">Open mode scoring and payouts</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setRepo(repoInput)}
          placeholder="owner/repo"
          className="border border-gray-100 px-3 py-2 text-[13px] rounded-md focus:border-accent focus:outline-none w-72 font-mono"
        />
        <button
          onClick={() => setRepo(repoInput)}
          className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
        >
          Load pool
        </button>
        {!repo && (
          <button
            onClick={() => setShowDemo(!showDemo)}
            className="px-4 py-2 text-[13px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
          >
            {showDemo ? "Hide demo" : "View demo"}
          </button>
        )}
      </div>

      {repo && poolLoading && (
        <p className="text-[13px] text-gray-400">Loading...</p>
      )}

      {repo && !poolLoading && !hasPool && (
        <div className="border border-gray-100 rounded-md p-6">
          <p className="text-[13px] text-gray-700">No pool found for <span className="font-mono">{repo}</span></p>
          <p className="text-[12px] text-gray-400 mt-1">
            Create a pool by calling <span className="font-mono">FlintEscrow.createPool()</span> with this repo ID
          </p>
          <div className="mt-3 bg-black rounded-md px-4 py-3">
            <p className="font-mono text-[12px] text-green break-all">repoId: {repoId}</p>
          </div>
        </div>
      )}

      {hasPool && (
        <PoolView
          repo={repo}
          status={status!}
          totalAmount={totalAmount}
          scores={scores}
          totalScoreSum={totalScoreSum}
          repoId={repoId!}
          isConnected={isConnected}
        />
      )}

      {showDemo && !repo && <DemoView />}

      {!repo && !showDemo && (
        <div className="space-y-6 pt-4">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Escrow contract" value={truncateAddress(addresses.escrow)} mono />
            <MetricCard label="Token" value="USDC" />
            <MetricCard label="Scoring policy" value="Square root" />
          </div>

          <div className="border-t border-gray-100 pt-6">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-4">How it works</p>
            <div className="space-y-3">
              {[
                { step: "01", text: "Maintainer creates a pool with USDC deposit and repo ID" },
                { step: "02", text: "CRE agent fetches GitHub data and scores contributors inside TEE" },
                { step: "03", text: "Scores submitted on-chain via DON consensus" },
                { step: "04", text: "Maintainer reviews scores and approves payout with Ledger" },
                { step: "05", text: "USDC distributed proportionally, ERC-5484 soulbound receipts minted" },
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
    </div>
  )
}

function PoolView({
  repo, status, totalAmount, scores, totalScoreSum, repoId, isConnected,
}: {
  repo: string; status: PoolStatus; totalAmount: bigint; scores: any[]; totalScoreSum: bigint;
  repoId: `0x${string}`; isConnected: boolean;
}) {
  const statusLabel = status === "ScoresSubmitted" ? "Scores submitted" : status
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-black">{repo}</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-[13px] text-gray-400">Pool: {formatPoolAmount(totalAmount)}</span>
            <StatusDot status={statusLabel} />
          </div>
        </div>
        {status === "ScoresSubmitted" && isConnected && (
          <ApprovePayoutButton repoId={repoId} />
        )}
      </div>

      {scores.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Contributors" value={scores.length.toString()} />
          <MetricCard label="Total pool" value={formatPoolAmount(totalAmount)} />
          <MetricCard label="Status" value={statusLabel} />
        </div>
      )}

      <ScoresTable scores={scores} totalAmount={totalAmount} totalScoreSum={totalScoreSum} status={status} />
    </>
  )
}

function ScoresTable({ scores, totalAmount, totalScoreSum, status }: {
  scores: any[]; totalAmount: bigint; totalScoreSum: bigint; status: PoolStatus;
}) {
  if (scores.length === 0) {
    return (
      <div className="border border-gray-100 rounded-md p-6 text-center">
        <p className="text-[13px] text-gray-700">
          {status === "Active" ? "Waiting for CRE agent to submit scores" : "No scores available"}
        </p>
        {status === "Active" && (
          <p className="text-[12px] text-gray-400 mt-1">Scores will appear here after the next cron cycle</p>
        )}
      </div>
    )
  }

  const statusLabel = status === "ScoresSubmitted" ? "Pending" : status === "Paid" ? "Paid" : "Active"

  return (
    <table className="w-full">
      <thead>
        <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
          <th className="text-left py-3 font-normal">Contributor</th>
          <th className="text-right py-3 font-normal">Score</th>
          <th className="text-right py-3 font-normal">Share</th>
          <th className="text-right py-3 font-normal">Amount</th>
          <th className="text-right py-3 font-normal">Status</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((s: any, i: number) => {
          const score = BigInt(s.score)
          const share = totalScoreSum > 0n ? Number((score * 10000n) / totalScoreSum) / 100 : 0
          const amount = totalScoreSum > 0n ? (totalAmount * score) / totalScoreSum : 0n
          return (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="py-3 text-[13px] font-mono text-gray-700">{truncateAddress(s.contributor)}</td>
              <td className="py-3 text-[13px] text-gray-700 text-right">{formatScore(score).toFixed(2)}</td>
              <td className="py-3 text-[13px] text-gray-700 text-right">{share.toFixed(1)}%</td>
              <td className="py-3 text-[13px] font-mono text-gray-700 text-right">{formatPoolAmount(amount)}</td>
              <td className="py-3 text-right"><StatusDot status={statusLabel} size="sm" /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function DemoView() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-black">vercel/next.js</h2>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-[13px] text-gray-400">Pool: 1,000 USDC</span>
            <StatusDot status="Scores submitted" />
          </div>
        </div>
        <button className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md opacity-50 cursor-not-allowed">
          Approve payout
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Contributors" value="4" />
        <MetricCard label="Total pool" value="1,000 USDC" />
        <MetricCard label="Cycle" value="30 days" />
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
            <th className="text-left py-3 font-normal">GitHub username</th>
            <th className="text-right py-3 font-normal">Score</th>
            <th className="text-right py-3 font-normal">Share</th>
            <th className="text-right py-3 font-normal">Amount</th>
            <th className="text-right py-3 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {DEMO_SCORES.map((s) => (
            <tr key={s.username} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="py-3 text-[13px] text-gray-700">{s.username}</td>
              <td className="py-3 text-[13px] text-gray-700 text-right">{s.score}</td>
              <td className="py-3 text-[13px] text-gray-700 text-right">{s.share}%</td>
              <td className="py-3 text-[13px] font-mono text-gray-700 text-right">{s.amount} USDC</td>
              <td className="py-3 text-right"><StatusDot status="Pending" size="sm" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[11px] text-gray-400 text-center pt-2">
        Demo data from CRE agent simulation on vercel/next.js
      </p>
    </div>
  )
}

function ApprovePayoutButton({ repoId }: { repoId: `0x${string}` }) {
  const [waiting, setWaiting] = useState(false)
  const { writeContract } = useWriteContract()

  return (
    <button
      onClick={() => {
        setWaiting(true)
        try {
          writeContract({
            address: addresses.escrow as `0x${string}`,
            abi: escrowAbi,
            functionName: "approveAndPayout",
            args: [repoId, "0x"],
          })
        } catch { setWaiting(false) }
      }}
      disabled={waiting}
      className={`px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md transition-colors ${
        waiting ? "ledger-pulse border border-accent opacity-75" : "hover:bg-accent/90"
      }`}
    >
      {waiting ? "Waiting for Ledger..." : "Approve payout"}
    </button>
  )
}

function formatPoolAmount(amount: bigint): string {
  const whole = Number(amount) / 1e6
  return `${whole.toLocaleString()} USDC`
}
