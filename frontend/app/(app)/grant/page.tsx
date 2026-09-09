"use client"

import { useReadContract, useWriteContract, useAccount } from "wagmi"
import { useState } from "react"
import { addresses } from "@/lib/contracts"
import { truncateAddress } from "@/lib/utils"
import grantAbi from "@/lib/abi/FlintGrant.json"

const MILESTONE_STATUS = ["Pending", "Verified", "Released", "AutoReleased"] as const
type MilestoneStatus = (typeof MILESTONE_STATUS)[number]

function StatusDot({ status }: { status: string }) {
  const color =
    status === "Released" || status === "Auto-released" ? "bg-green" :
    status === "Verified" ? "bg-amber" :
    "bg-gray-400"
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[13px] text-gray-700">{status}</span>
    </span>
  )
}

const DEMO_MILESTONES = [
  { desc: "Ship v1 — core escrow and scoring contracts", tranche: "300 USDC", deadline: "Sep 1", status: "Released" },
  { desc: "Deploy to testnet with CRE integration", tranche: "300 USDC", deadline: "Sep 8", status: "Verified" },
  { desc: "Frontend dashboard and Ledger flow", tranche: "200 USDC", deadline: "Sep 12", status: "Pending" },
  { desc: "Mainnet deployment and audit", tranche: "200 USDC", deadline: "Oct 1", status: "Pending" },
]

export default function GrantPage() {
  const { isConnected } = useAccount()
  const [grantIdInput, setGrantIdInput] = useState("1")
  const [grantId, setGrantId] = useState<bigint | null>(null)
  const [showDemo, setShowDemo] = useState(false)

  const { data: grantData, isLoading } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "grants",
    args: grantId !== null ? [grantId] : undefined,
    query: { enabled: grantId !== null },
  })

  const { data: milestonesData } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "getMilestones",
    args: grantId !== null ? [grantId] : undefined,
    query: { enabled: grantId !== null },
  })

  const grant = grantData as any
  const milestones = (milestonesData as any[]) ?? []
  const hasGrant = grant && grant[0] !== "0x0000000000000000000000000000000000000000"
  const totalAmount = hasGrant ? BigInt(grant[3]) : 0n

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold text-black">Grants</h1>
        <p className="text-[13px] text-gray-400 mt-1">Milestone escrow and tranche releases</p>
      </div>

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
          placeholder="Grant ID"
          className="border border-gray-100 px-3 py-2 text-[13px] rounded-md focus:border-accent focus:outline-none w-32 font-mono"
        />
        <button
          onClick={() => {
            const id = parseInt(grantIdInput)
            if (!isNaN(id) && id > 0) setGrantId(BigInt(id))
          }}
          className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
        >
          Load grant
        </button>
        {grantId === null && (
          <button
            onClick={() => setShowDemo(!showDemo)}
            className="px-4 py-2 text-[13px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
          >
            {showDemo ? "Hide demo" : "View demo"}
          </button>
        )}
      </div>

      {grantId !== null && isLoading && (
        <p className="text-[13px] text-gray-400">Loading...</p>
      )}

      {grantId !== null && !isLoading && !hasGrant && (
        <div className="border border-gray-100 rounded-md p-6">
          <p className="text-[13px] text-gray-700">No grant found with ID {grantId.toString()}</p>
          <p className="text-[12px] text-gray-400 mt-1">
            Create a grant by calling <span className="font-mono">FlintGrant.createGrant()</span>
          </p>
        </div>
      )}

      {hasGrant && (
        <>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[18px] font-semibold text-black">Grant #{grantId!.toString()}</h2>
              <p className="text-[13px] text-gray-400 mt-1">
                Grantee: <span className="font-mono">{truncateAddress(grant[1])}</span> · {formatAmount(totalAmount)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-100 rounded-md px-4 py-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total amount</p>
              <p className="text-[18px] text-black font-medium mt-1">{formatAmount(totalAmount)}</p>
            </div>
            <div className="border border-gray-100 rounded-md px-4 py-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Milestones</p>
              <p className="text-[18px] text-black font-medium mt-1">{milestones.length}</p>
            </div>
            <div className="border border-gray-100 rounded-md px-4 py-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Grantor</p>
              <p className="text-[15px] text-black font-mono font-medium mt-1">{truncateAddress(grant[0])}</p>
            </div>
          </div>

          {milestones.length > 0 ? (
            <MilestoneTable
              milestones={milestones}
              totalAmount={totalAmount}
              grantId={grantId!}
              isConnected={isConnected}
            />
          ) : (
            <div className="border border-gray-100 rounded-md p-6 text-center">
              <p className="text-[13px] text-gray-700">No milestones defined</p>
            </div>
          )}
        </>
      )}

      {showDemo && grantId === null && <DemoGrantView />}

      {grantId === null && !showDemo && (
        <div className="space-y-6 pt-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-gray-100 rounded-md px-4 py-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Grant contract</p>
              <p className="text-[15px] text-black font-mono font-medium mt-1">{truncateAddress(addresses.grant)}</p>
            </div>
            <div className="border border-gray-100 rounded-md px-4 py-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Auto-release</p>
              <p className="text-[18px] text-black font-medium mt-1">14 days</p>
            </div>
            <div className="border border-gray-100 rounded-md px-4 py-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider">Approval</p>
              <p className="text-[18px] text-black font-medium mt-1">Ledger</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-4">Grant lifecycle</p>
            <div className="space-y-3">
              {[
                { step: "01", text: "Grantor creates grant with milestones, deadlines, and USDC deposit" },
                { step: "02", text: "Grantee works on milestones, progress tracked via GitHub" },
                { step: "03", text: "AI agent verifies milestone completion inside TEE" },
                { step: "04", text: "Grantor approves tranche release with Ledger" },
                { step: "05", text: "Auto-release after 14 days if grantor delays (protects grantees)" },
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

function MilestoneTable({ milestones, totalAmount, grantId, isConnected }: {
  milestones: any[]; totalAmount: bigint; grantId: bigint; isConnected: boolean;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
          <th className="text-left py-3 font-normal w-10">#</th>
          <th className="text-left py-3 font-normal">Description</th>
          <th className="text-right py-3 font-normal">Tranche</th>
          <th className="text-right py-3 font-normal">Deadline</th>
          <th className="text-right py-3 font-normal">Status</th>
          <th className="text-right py-3 font-normal w-36"></th>
        </tr>
      </thead>
      <tbody>
        {milestones.map((m: any, i: number) => {
          const status = MILESTONE_STATUS[Number(m.status ?? m[3])]
          const statusLabel = status === "AutoReleased" ? "Auto-released" : status
          const trancheBps = Number(m.trancheBps ?? m[1])
          const trancheAmount = (totalAmount * BigInt(trancheBps)) / 10000n
          const deadline = Number(m.deadline ?? m[2])
          const deadlineStr = deadline > 0
            ? new Date(deadline * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "No deadline"

          return (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="py-3 text-[13px] text-gray-400 font-mono">{String(i + 1).padStart(2, "0")}</td>
              <td className="py-3 text-[13px] text-gray-700">{m.description ?? m[0]}</td>
              <td className="py-3 text-[13px] font-mono text-gray-700 text-right">{formatAmount(trancheAmount)}</td>
              <td className="py-3 text-[13px] text-gray-400 text-right">{deadlineStr}</td>
              <td className="py-3 text-right"><StatusDot status={statusLabel} /></td>
              <td className="py-3 text-right">
                {status === "Verified" && isConnected && (
                  <ReleaseTrancheButton grantId={grantId} milestoneId={BigInt(i)} />
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function DemoGrantView() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-black">Flint Protocol Grant</h2>
          <p className="text-[13px] text-gray-400 mt-1">
            Grantee: <span className="font-mono">0x225F...6aF7</span> · 1,000 USDC
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border border-gray-100 rounded-md px-4 py-3">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Total amount</p>
          <p className="text-[18px] text-black font-medium mt-1">1,000 USDC</p>
        </div>
        <div className="border border-gray-100 rounded-md px-4 py-3">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Milestones</p>
          <p className="text-[18px] text-black font-medium mt-1">4</p>
        </div>
        <div className="border border-gray-100 rounded-md px-4 py-3">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Released</p>
          <p className="text-[18px] text-black font-medium mt-1">300 USDC</p>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
            <th className="text-left py-3 font-normal w-10">#</th>
            <th className="text-left py-3 font-normal">Description</th>
            <th className="text-right py-3 font-normal">Tranche</th>
            <th className="text-right py-3 font-normal">Deadline</th>
            <th className="text-right py-3 font-normal">Status</th>
            <th className="text-right py-3 font-normal w-36"></th>
          </tr>
        </thead>
        <tbody>
          {DEMO_MILESTONES.map((m, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="py-3 text-[13px] text-gray-400 font-mono">{String(i + 1).padStart(2, "0")}</td>
              <td className="py-3 text-[13px] text-gray-700">{m.desc}</td>
              <td className="py-3 text-[13px] font-mono text-gray-700 text-right">{m.tranche}</td>
              <td className="py-3 text-[13px] text-gray-400 text-right">{m.deadline}</td>
              <td className="py-3 text-right"><StatusDot status={m.status} /></td>
              <td className="py-3 text-right">
                {m.status === "Verified" && (
                  <button className="px-3 py-1.5 text-[12px] font-medium text-white bg-accent rounded-md opacity-50 cursor-not-allowed">
                    Approve tranche
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[11px] text-gray-400 text-center pt-2">
        Demo data — connect wallet and load a real grant ID to interact
      </p>
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
        waiting ? "ledger-pulse border border-accent opacity-75" : "hover:bg-accent/90"
      }`}
    >
      {waiting ? "Waiting for Ledger..." : "Approve tranche"}
    </button>
  )
}

function formatAmount(amount: bigint): string {
  const whole = Number(amount) / 1e6
  return `${whole.toLocaleString()} USDC`
}
