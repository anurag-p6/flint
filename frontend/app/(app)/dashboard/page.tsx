"use client"

import { useReadContract } from "wagmi"
import { keccak256, encodePacked, encodeFunctionData, parseUnits, type Hex } from "viem"
import { useState, useEffect, useRef, useCallback } from "react"
import { useWallets } from "@privy-io/react-auth"
import { addresses, USDC_ADDRESS, CHAIN_ID } from "@/lib/contracts"
import { calculatePayoutPreview } from "@/lib/payout"
import { POLICY_OPTIONS, policyAddress, policyIdFromAddress, policyLabel, type PolicyId } from "@/lib/policy"
import { truncateAddress, formatScore } from "@/lib/utils"
import { TxLink } from "@/components/tx-link"
import { useGitHubStore } from "@/lib/github-store"
import { RepoSwitcher } from "@/components/repo-switcher"
import { PrivyWalletButton } from "@/components/privy-auth"
import { PrivyApprovePanel } from "@/components/privy-approve-panel"
import { BridgeModal } from "@/components/bridge-modal"
import {
  encodeCreatePool,
  privySendTransaction,
  ESCROW_ADDRESS,
  type PrivyEip1193Provider,
} from "@/lib/privy/tokens"
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
  const { wallets } = useWallets()
  const [scorerState, setScorerState] = useState<"idle" | "running" | "done" | "error">("idle")
  const [scorerMsg, setScorerMsg] = useState<string | null>(null)
  const [scorerTxHash, setScorerTxHash] = useState<string | null>(null)
  const [lastPayoutHash, setLastPayoutHash] = useState<string | null>(null)
  const [bridgeOpen, setBridgeOpen] = useState(false)
  const [liveTick, setLiveTick] = useState(0)
  const [previewScores, setPreviewScores] = useState<Record<string, bigint>>({})
  const autoScoredRepo = useRef<string | null>(null)
  const activeWallet =
    wallets.find((w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2") ??
    wallets[0]
  const walletAddress = activeWallet?.address as Hex | undefined

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
  }, [connectedRepo, liveTick])

  useEffect(() => {
    if (!connectedRepo) {
      setPreviewScores({})
      setScorerTxHash(null)
      return
    }
    fetch(`/api/scorer/latest?repo=${encodeURIComponent(connectedRepo)}`)
      .then((r) => r.json())
      .then((data) => {
        const next: Record<string, bigint> = {}
        for (const row of data.details ?? []) {
          if (!row.wallet || row.scaled == null) continue
          next[(row.wallet as string).toLowerCase()] = BigInt(row.scaled)
        }
        setPreviewScores(next)
        if (typeof data.txHash === "string" && data.txHash) {
          setScorerTxHash(data.txHash)
        }
      })
      .catch(console.error)
  }, [connectedRepo, liveTick])

  const runScorerAgent = useCallback(async () => {
    if (!connectedRepo) return
    setScorerState("running")
    setScorerMsg("Scoring PRs, commits, and issues…")
    try {
      const res = await fetch("/api/scorer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-flint-scorer": "1" },
        body: JSON.stringify({ repo: connectedRepo }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScorerState("error")
        setScorerMsg(data.error ?? "Scorer failed")
        return
      }
      const next: Record<string, bigint> = {}
      for (const row of data.details ?? []) {
        if (!row.wallet || row.scaled == null) continue
        next[(row.wallet as string).toLowerCase()] = BigInt(row.scaled)
      }
      setPreviewScores(next)
      setScorerState("done")
      setScorerTxHash(typeof data.txHash === "string" ? data.txHash : null)
      setScorerMsg(
        data.alreadySubmitted
          ? `Pool already approved/paid — showing last scores`
          : `Scored ${data.scored} contributors`,
      )
      setLiveTick((t) => t + 1)
    } catch (err) {
      setScorerState("error")
      setScorerMsg(err instanceof Error ? err.message : "Network error")
    }
  }, [connectedRepo])

  useEffect(() => {
    if (!connectedRepo) return
    if (Object.keys(walletMapping).length === 0) return
    if (autoScoredRepo.current === connectedRepo) return
    autoScoredRepo.current = connectedRepo
    void runScorerAgent()
  }, [connectedRepo, walletMapping, runScorerAgent])

  useEffect(() => {
    if (!connectedRepo) return
    const repoLower = connectedRepo.toLowerCase()
    let es: EventSource | null = null
    let fails = 0
    let debounce: ReturnType<typeof setTimeout> | null = null
    const kick = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => setLiveTick((t) => t + 1), 400)
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

  const repoId = connectedRepo
    ? keccak256(encodePacked(["string"], [connectedRepo]))
    : undefined

  const { data: poolData, isLoading: poolLoading } = useReadContract({
    address: addresses.escrow as `0x${string}`,
    abi: escrowAbi,
    functionName: "pools",
    args: repoId ? [repoId] : undefined,
    scopeKey: `pool-${liveTick}`,
    query: { enabled: !!repoId },
  })

  const { data: scoresData } = useReadContract({
    address: addresses.escrow as `0x${string}`,
    abi: escrowAbi,
    functionName: "getPoolScores",
    args: repoId ? [repoId] : undefined,
    scopeKey: `scores-${liveTick}`,
    query: { enabled: !!repoId },
  })

  const pool = poolData as any
  const onChainScores = (scoresData as any[]) ?? []
  const hasPool = pool && pool[0] !== "0x0000000000000000000000000000000000000000"
  const status = hasPool ? STATUS_LABELS[Number(pool[7])] : null
  const totalAmount = hasPool ? BigInt(pool[2]) : 0n
  const walletToLogin: Record<string, string> = Object.fromEntries(
    Object.entries(walletMapping).map(([login, wallet]) => [(wallet as string).toLowerCase(), login]),
  )

  // Eligibility: only CONTRIBUTORS.md wallets share the split. Payouts are
  // computed over the full submitted set in order (dust-to-last rule), then
  // looked up per wallet — policy-exact for proportional, square-root, and fixed.
  const poolPolicy: PolicyId =
    hasPool && pool ? policyIdFromAddress(pool[3] as string) : "sqrt"
  const scoreByWallet: Record<string, bigint> = {}
  const payoutByWallet: Record<string, bigint> = {}
  if (onChainScores.length > 0) {
    const payouts = calculatePayoutPreview(
      onChainScores.map((s: any) => BigInt(s.score)),
      totalAmount,
      poolPolicy,
    )
    onChainScores.forEach((s: any, i: number) => {
      const w = (s.contributor as string).toLowerCase()
      scoreByWallet[w] = BigInt(s.score)
      payoutByWallet[w] = payouts[i] ?? 0n
    })
  } else if (Object.keys(previewScores).length > 0) {
    for (const [w, score] of Object.entries(previewScores)) {
      scoreByWallet[w] = score
    }
    const wallets = Object.keys(scoreByWallet)
    const payouts = calculatePayoutPreview(
      wallets.map((w) => scoreByWallet[w]),
      totalAmount,
      poolPolicy,
    )
    wallets.forEach((w, i) => {
      payoutByWallet[w] = payouts[i] ?? 0n
    })
  }
  const eligibleContributors = ghContributors.filter((c) => walletMapping[c.login.toLowerCase()])
  const excludedContributors = ghContributors.filter((c) => !walletMapping[c.login.toLowerCase()])
  const mappedWallets = new Set(Object.values(walletMapping).map((w) => (w as string).toLowerCase()))
  const unmappedScored = onChainScores.filter(
    (s: any) => !mappedWallets.has((s.contributor as string).toLowerCase()),
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <h1 className="text-[22px] font-semibold text-black">Open Mode</h1>
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
            <button
              type="button"
              onClick={() => setBridgeOpen(true)}
              className="px-3 py-1.5 text-[12px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
            >
              Bridge to Arc
            </button>
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
            <MetricCard label="Payout policy" value="Fixed · Square root · Proportional" />
          </div>
          <div className="border-t border-gray-100 pt-6">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-4">How it works</p>
            <div className="space-y-3">
              {[
                { step: "01", text: "Maintainer deposits USDC into a reward pool for the repo" },
                { step: "02", text: "Contributors work on the repo — PRs, reviews, issues" },
                { step: "03", text: "CRE agent scores every contributor inside a TEE enclave" },
                { step: "04", text: "Scores land on-chain, maintainer approves the split" },
                { step: "05", text: "USDC distributed automatically based on agent scores" },
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
          {/* Create pool — Open Mode starts here */}
          {!hasPool && !poolLoading && (
            <CreatePoolForm
              repoId={repoId!}
              repo={connectedRepo}
              wallet={activeWallet}
              onCreated={() => window.location.reload()}
            />
          )}
          {/* Pool metrics */}
          {hasPool && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-[13px] text-gray-400">Pool: {formatPoolAmount(totalAmount)}</span>
                  <span className="text-[13px] text-gray-400">{policyLabel(poolPolicy)}</span>
                  <StatusDot status={status === "ScoresSubmitted" ? "Scores submitted" : status!} />
                  {lastPayoutHash && (
                    <TxLink hash={lastPayoutHash} />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <MetricCard label="Contributors" value={ghContributors.length.toString()} />
                <MetricCard label="Total pool" value={formatPoolAmount(totalAmount)} />
                <MetricCard label="Status" value={status === "ScoresSubmitted" ? "Scores submitted" : status!} />
                <MetricCard label="Scored" value={onChainScores.length > 0 ? `${onChainScores.length} addresses` : "Pending"} />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void runScorerAgent()}
                  disabled={scorerState === "running"}
                  className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors disabled:opacity-40"
                >
                  {scorerState === "running" ? "Scoring..." : scorerState === "done" ? "Scored" : "Run Scorer Agent"}
                </button>
                {scorerMsg && (
                  <span className={`text-[12px] ${scorerState === "error" ? "text-red" : "text-gray-500"}`}>
                    {scorerMsg}
                    {scorerTxHash && scorerState !== "error" && (
                      <>
                        {" · "}
                        <TxLink hash={scorerTxHash} />
                      </>
                    )}
                  </span>
                )}
              </div>
              {status === "ScoresSubmitted" && (
                activeWallet ? (
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
                    onPaid={(hash) => {
                      if (hash) setLastPayoutHash(hash)
                      setLiveTick((t) => t + 1)
                    }}
                  />
                ) : (
                  <p className="text-[12px] text-amber">
                    Connect a wallet to approve the payout.
                  </p>
                )
              )}
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

          {/* Scored but unregistered: WILL be paid on approval — fix mapping or resubmit */}
          {unmappedScored.length > 0 && (
            <div className="border border-amber rounded-md px-4 py-3 flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber mt-1.5 shrink-0" />
              <div>
                <p className="text-[13px] text-gray-700 font-medium">
                  {unmappedScored.length} scored wallet{unmappedScored.length === 1 ? " is" : "s are"} not in CONTRIBUTORS.md
                </p>
                <p className="text-[12px] text-gray-400 mt-0.5 font-mono">
                  {unmappedScored.map((s: any) => truncateAddress(s.contributor as string)).join(", ")}
                </p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  They will be paid on approval. Ask them to register, or re-run scoring after updating the mapping.
                </p>
              </div>
            </div>
          )}

          {!hasPool && scorerMsg && (
            <p className={`text-[12px] ${scorerState === "error" ? "text-red" : "text-gray-500"}`}>
              {scorerState === "running" ? "Scoring PRs, commits, and issues…" : scorerMsg}
              {scorerTxHash && scorerState !== "error" && (
                <>
                  {" · "}
                  <TxLink hash={scorerTxHash} />
                </>
              )}
            </p>
          )}

          {/* Eligible table: registered wallets only — this is the pay-all set */}
          {ghLoading ? (
            <p className="text-[13px] text-gray-400">Loading contributors...</p>
          ) : eligibleContributors.length > 0 ? (
            <ContributorsTable
              contributors={eligibleContributors}
              walletMapping={walletMapping}
              scoreByWallet={scoreByWallet}
              payoutByWallet={payoutByWallet}
              totalAmount={totalAmount}
              hasScores={onChainScores.length > 0 || Object.keys(previewScores).length > 0}
            />
          ) : (
            <p className="text-[13px] text-gray-400">
              No eligible contributors — wallets appear here once added to CONTRIBUTORS.md.
            </p>
          )}

          {/* Excluded: visible GitHub contributors the split ignores */}
          {!ghLoading && excludedContributors.length > 0 && (
            <ExcludedContributors contributors={excludedContributors} />
          )}
        </>
      )}
      {bridgeOpen && <BridgeModal onClose={() => setBridgeOpen(false)} />}
    </div>
  )
}

function CreatePoolForm({
  repoId,
  repo,
  wallet,
  onCreated,
}: {
  repoId: Hex
  repo: string
  wallet: any
  onCreated: () => void
}) {
  const [amount, setAmount] = useState("")
  const [policy, setPolicy] = useState<PolicyId>("equal")
  const [step, setStep] = useState<"idle" | "approving" | "creating" | "done">("idle")
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  if (!wallet) {
    return (
      <div className="border border-gray-100 rounded-md p-4">
        <p className="text-[13px] text-gray-400">Connect your wallet to create a reward pool.</p>
      </div>
    )
  }

  const handleCreate = async () => {
    if (!amount) return
    setError(null)
    let value: bigint
    try {
      value = parseUnits(amount, 6)
    } catch {
      setError(`Invalid USDC amount "${amount}"`)
      return
    }
    if (value <= 0n) {
      setError("Amount must be greater than zero")
      return
    }
    try {
      const from = wallet.address as Hex
      try { await wallet.switchChain(CHAIN_ID) } catch {}
      const provider = (await wallet.getEthereumProvider()) as unknown as PrivyEip1193Provider

      setStep("approving")
      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [addresses.escrow as Hex, value],
      })
      await privySendTransaction(provider, {
        from,
        to: USDC_ADDRESS as Hex,
        data: approveData,
      })

      setStep("creating")
      const policyAddr = policyAddress(policy) as Hex
      const createData = encodeCreatePool(repoId, USDC_ADDRESS as Hex, value, policyAddr, from, "open")
      const hash = await privySendTransaction(provider, {
        from,
        to: ESCROW_ADDRESS,
        data: createData,
      })
      setTxHash(hash)
      setStep("done")
    } catch (err) {
      console.error("Create pool failed:", err)
      setError(err instanceof Error ? err.message.split("\n")[0] : "Create pool failed")
      setStep("idle")
    }
  }

  return (
    <div className="border border-gray-100 rounded-md p-4 space-y-4">
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider">
          Open Mode · create reward pool
        </p>
        <p className="text-[12px] text-gray-500 mt-1 font-mono">{repo}</p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-gray-400 mb-1 block">Pool amount (USDC)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            inputMode="decimal"
            className="w-full border border-gray-100 px-3 py-2 text-[12px] rounded-md focus:border-accent focus:outline-none font-mono"
          />
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" />
          <span className="text-gray-400">Approver:</span>
          <span className="font-mono text-gray-700">{truncateAddress(wallet.address)}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex rounded-md border border-gray-100 overflow-hidden text-[12px]">
            {POLICY_OPTIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPolicy(p.id)}
                className={`px-3 py-1.5 transition-colors ${
                  policy === p.id ? "bg-black text-white" : "text-gray-500 hover:text-black"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            {POLICY_OPTIONS.find((p) => p.id === policy)?.hint}
          </p>
        </div>
        {step === "done" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-[13px] text-gray-700">Pool created.</p>
            {txHash && <TxLink hash={txHash} />}
            <button
              onClick={onCreated}
              className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
            >
              Continue
            </button>
          </div>
        ) : (
          <button
            onClick={handleCreate}
            disabled={step !== "idle" || !amount}
            className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors disabled:opacity-40"
          >
            {step === "approving" ? "Approving USDC..." : step === "creating" ? "Creating pool..." : "Create pool"}
          </button>
        )}
      </div>
      {error && <p className="text-[12px] text-red">{error}</p>}
    </div>
  )
}

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

function ContributorsTable({
  contributors,
  walletMapping,
  scoreByWallet,
  payoutByWallet,
  totalAmount,
  hasScores,
}: {
  contributors: GitHubContributor[]
  walletMapping: Record<string, string>
  scoreByWallet: Record<string, bigint>
  payoutByWallet: Record<string, bigint>
  totalAmount: bigint
  hasScores: boolean
}) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-3">
        Eligible contributors · {contributors.length} sharing the split
      </p>
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
              const wallet = walletMapping[c.login.toLowerCase()] as string
              const w = wallet.toLowerCase()
              // Policy-exact: looked up from the full-set preview (sqrt-aware,
              // dust-to-last), never recomputed per row.
              const score = scoreByWallet[w]
              const amount = payoutByWallet[w]
              const share =
                score !== undefined && totalAmount > 0n && hasScores
                  ? Number((amount * 10000n) / totalAmount) / 100
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
                    {score !== undefined
                      ? <span className="text-[13px] text-black font-medium">{formatScore(score).toFixed(2)}</span>
                      : <span className="text-[11px] text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    {share !== null && amount !== undefined
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
          Score and share columns will populate after the agent scores this repo
        </p>
      )}
    </div>
  )
}

function ExcludedContributors({ contributors }: { contributors: GitHubContributor[] }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-3">
        Excluded · {contributors.length} not sharing the split
      </p>
      <div className="border border-gray-100 rounded-md overflow-hidden">
        {contributors.map((c) => (
          <div
            key={c.login}
            className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-b-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <img src={c.avatarUrl} alt={c.login} className="w-5 h-5 rounded-full shrink-0" />
              <a
                href={c.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-gray-700 hover:text-accent truncate"
              >
                {c.login}
              </a>
            </div>
            <p className="text-[11px] text-amber shrink-0 ml-3">
              No wallet in CONTRIBUTORS.md
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatPoolAmount(amount: bigint): string {
  return `${(Number(amount) / 1e6).toLocaleString()} USDC`
}
