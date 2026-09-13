"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useReadContract } from "wagmi"
import { keccak256, encodePacked } from "viem"
import { addresses } from "@/lib/contracts"
import { thresholdOrDefault } from "@/lib/threshold"
import { racePct, timeFrac, mergedCurve } from "@/lib/grant-timeline"
import { truncateAddress } from "@/lib/utils"
import { addressUrl, txUrl } from "@/lib/explorer"
import grantAbi from "@/lib/abi/FlintGrant.json"
import escrowAbi from "@/lib/abi/FlintEscrow.json"
import type { FundedGrant } from "@/app/api/grants/pending/route"
import type { Milestone } from "@/app/api/github/milestones/route"

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? ""

interface SubgraphTranche {
  id: string
  milestoneId: string
  amount: string
  auto: boolean
  timestamp: string
}

function txFromId(id: string): string {
  return id.split("-")[0]
}

function fmtDate(unix: number): string {
  if (!unix) return "—"
  return new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function fmtDay(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
}

/// Grant command center: race board, PR progress graph, TEE score vs gate,
/// and every transaction with an arcscan trail. Rendered when a grant is linked.
export function GrantDetailCard({ grantId, repo }: { grantId: bigint; repo: string }) {
  const [funded, setFunded] = useState<FundedGrant | null>(null)
  const [issue, setIssue] = useState<Milestone | null>(null)
  const [prDates, setPrDates] = useState<Record<number, { merged: boolean; createdAt: string | null; mergedAt: string | null }>>({})
  const [tranches, setTranches] = useState<SubgraphTranche[]>([])
  const [subgraphOk, setSubgraphOk] = useState(true)
  const [cachedScore, setCachedScore] = useState<number | null>(null)

  const { data: grantData } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "grants",
    args: [grantId],
    query: { enabled: grantId !== null },
  })
  const { data: chainMilestonesData } = useReadContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "getMilestones",
    args: [grantId],
    query: { enabled: grantId !== null },
  })
  const grant = grantData as any
  const chainMilestones = ((chainMilestonesData as any[]) ?? []) as any[]
  const hasGrant = grant && grant[0] !== "0x0000000000000000000000000000000000000000"
  const grantee: string = hasGrant ? String(grant.grantee ?? grant[1] ?? "") : ""
  const totalAmount: bigint = hasGrant ? BigInt(grant.totalAmount ?? grant[3] ?? 0) : 0n
  const amountPaid: bigint = hasGrant ? BigInt(grant.amountPaid ?? grant[4] ?? 0) : 0n
  const createdAt: number = hasGrant ? Number(grant.createdAt ?? grant[6] ?? 0) : 0
  const completed: boolean = hasGrant ? Boolean(grant.completed ?? false) : false

  // Grantee score from the TEE-submitted pool (null until the scorer submits).
  const repoIdHex = useMemo(
    () => (repo ? keccak256(encodePacked(["string"], [repo])) : undefined),
    [repo],
  )
  const { data: poolScores } = useReadContract({
    address: addresses.escrow as `0x${string}`,
    abi: escrowAbi,
    functionName: "getPoolScores",
    args: repoIdHex ? [repoIdHex] : undefined,
    query: { enabled: !!repoIdHex && !!grantee },
  })
  useEffect(() => {
    if (!repo || !grantee) return
    let stop = false
    const pull = () => {
      fetch(`/api/scorer/latest?repo=${encodeURIComponent(repo)}`)
        .then((r) => r.json())
        .then((d) => {
          if (stop) return
          const hit = (d.details ?? []).find(
            (row: { wallet?: string; scaled?: string }) =>
              (row.wallet ?? "").toLowerCase() === grantee.toLowerCase(),
          )
          if (hit?.scaled != null) setCachedScore(Number(hit.scaled) / 1_000_000)
        })
        .catch(() => {})
    }
    pull()
    const id = setInterval(pull, 4000)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [repo, grantee])

  const teeScore: bigint | null = useMemo(() => {
    if (!grantee || !poolScores) return null
    const hit = (poolScores as any[]).find(
      (s: any) => String(s.contributor ?? s[0]).toLowerCase() === grantee.toLowerCase(),
    )
    return hit ? BigInt(hit.score ?? hit[1]) : null
  }, [poolScores, grantee])

  // Issue context: funded entry (assignees) for this grant…
  useEffect(() => {
    if (!repo) return
    fetch(`/api/grants/pending?repo=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((d) => {
        const hit = ((d.funded ?? []) as FundedGrant[]).find((f) => BigInt(f.grantId) === grantId)
        setFunded(hit ?? null)
      })
      .catch(() => setFunded(null))
  }, [repo, grantId])

  // …then the linked issue (threshold, PRs) once the funded entry resolves.
  useEffect(() => {
    if (!repo || funded?.issueNumber === undefined) return
    fetch(`/api/github/milestones?repo=${encodeURIComponent(repo)}`)
      .then((r) => r.json())
      .then((d) => {
        const ms = ((d.milestones ?? []) as Milestone[]).find((m) => m.issueNumber === funded.issueNumber)
        setIssue(ms ?? null)
      })
      .catch(() => setIssue(null))
  }, [repo, funded])

  // PR dates for the progress graph.
  const linkedPRs = useMemo(() => issue?.linkedPRs ?? [], [issue])
  useEffect(() => {
    if (!repo || linkedPRs.length === 0) {
      setPrDates({})
      return
    }
    fetch(`/api/github/pr-status?repo=${encodeURIComponent(repo)}&prs=${linkedPRs.join(",")}`)
      .then((r) => r.json())
      .then((d) => setPrDates(d.prs ?? {}))
      .catch(() => setPrDates({}))
  }, [repo, linkedPRs])

  // Subgraph: tranches carry exact tx hashes (id = txHash-logIndex).
  useEffect(() => {
    if (!SUBGRAPH_URL) {
      setSubgraphOk(false)
      return
    }
    fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query ($id: ID!) {
          grant(id: $id) { id completed }
          tranches(where: { grant: $id }, orderBy: timestamp, orderDirection: asc, first: 50) {
            id milestoneId amount auto timestamp
          }
        }`,
        variables: { id: grantId.toString() },
      }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.errors?.length) throw new Error(j.errors[0].message)
        setTranches(j.data?.tranches ?? [])
        setSubgraphOk(true)
      })
      .catch(() => {
        setTranches([])
        setSubgraphOk(false)
      })
  }, [grantId])

  const threshold = useMemo(() => thresholdOrDefault(issue?.threshold ?? null), [issue])

  const pct = racePct(amountPaid, totalAmount)
  const login =
    funded?.assignees?.[0]?.login ?? (funded as any)?.grantee ?? issue?.grantee ?? null
  const avatar = login ? `https://github.com/${login}.png` : null

  // Progress graph model.
  const now = Math.floor(Date.now() / 1000)
  const prPoints = useMemo(
    () =>
      linkedPRs.map((n) => {
        const st = prDates[n]
        const toUnix = (s: string | null) => (s ? Math.floor(new Date(s).getTime() / 1000) : null)
        return { n, createdAt: toUnix(st?.createdAt ?? null), mergedAt: st?.merged ? toUnix(st?.mergedAt ?? null) : null }
      }),
    [linkedPRs, prDates],
  )
  const curve = useMemo(() => mergedCurve(prPoints), [prPoints])
  const eventTimes = useMemo(() => {
    const ts: number[] = [now]
    if (createdAt) ts.push(createdAt)
    for (const p of prPoints) {
      if (p.createdAt) ts.push(p.createdAt)
      if (p.mergedAt) ts.push(p.mergedAt)
    }
    for (const m of chainMilestones) {
      const v = Number(m.verifiedAt ?? m[4] ?? 0)
      if (v) ts.push(v)
    }
    for (const t of tranches) ts.push(Number(t.timestamp))
    return ts
  }, [now, createdAt, prPoints, chainMilestones, tranches])
  const start = eventTimes.length ? Math.min(...eventTimes) : now
  const end = Math.max(now, ...eventTimes)

  if (!hasGrant) return null

  const scoreShown =
    teeScore !== null ? Number(teeScore) / 1000000 : cachedScore
  const passes = scoreShown !== null && scoreShown >= threshold

  return (
    <div className="border border-gray-100 rounded-md p-5 space-y-5 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={login ?? ""}
              width={44}
              height={44}
              className="rounded-full shrink-0"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          ) : (
            <span className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-[15px] font-medium shrink-0">
              {(login ?? "GR").slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-mono">
              Grant #{grantId.toString()}
              {funded ? ` · issue #${funded.issueNumber}` : ""}
            </p>
            <p className="text-[16px] font-medium text-black truncate">
              {funded?.title ?? `Grant #${grantId.toString()}`}
            </p>
            <p className="text-[12px] text-gray-400 font-mono truncate">
              {login ?? truncateAddress(grantee)} · {chainMilestones.length} milestones
            </p>
          </div>
        </div>
        <span
          className={`text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 ${
            completed ? "bg-green text-white" : amountPaid > 0n ? "bg-accent text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          {completed ? "Completed" : amountPaid > 0n ? "In progress" : "Funded — awaiting work"}
        </span>
      </div>

      {/* Linked GitHub issue */}
      {funded && (
        <a
          href={funded.issueUrl ?? `https://github.com/${repo}/issues/${funded.issueNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-[13px] text-gray-700 hover:text-accent transition-colors"
        >
          <Image src="/github.svg" alt="GitHub" width={16} height={16} className="shrink-0" />
          <span className="truncate">{funded.title}</span>
          <span className="text-[11px] text-gray-400 font-mono shrink-0">#{funded.issueNumber}</span>
        </a>
      )}

      {/* Score above the graph */}
      <div className="flex items-center gap-4 border border-gray-100 rounded-md px-4 py-3">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Agent score</p>
          <p className="text-[24px] text-black font-medium tnum leading-tight">
            {scoreShown === null ? "—" : scoreShown.toFixed(1)}
          </p>
        </div>
        <div className="w-px self-stretch bg-gray-100" />
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Release gate</p>
          <p className="text-[24px] text-black font-medium tnum leading-tight">{threshold}</p>
        </div>
        <div className="ml-auto text-right">
          {scoreShown === null ? (
            <p className="text-[12px] text-gray-400">Awaiting merged PR — agent scores on merge</p>
          ) : passes ? (
            <p className="text-[13px] font-medium text-green">CLEAR — releasable on verify ✓</p>
          ) : (
            <p className="text-[13px] font-medium text-amber">HELD — below gate, funds stay locked</p>
          )}
          <p className="text-[11px] text-gray-400 mt-0.5">
            Agent scores the merged work, then the keeper unlocks Release
          </p>
        </div>
      </div>

      {/* Race board */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Goal board</p>
          <p className="text-[11px] text-gray-400 font-mono tnum">
            {(Number(amountPaid) / 1e6).toLocaleString()} / {(Number(totalAmount) / 1e6).toLocaleString()} USDC
          </p>
        </div>
        <div className="relative h-16 bg-gray-50 rounded-md overflow-hidden">
          {/* milestone posts */}
          {chainMilestones.map((m, i) => {
            const st = Number(m.status ?? m[3] ?? 0)
            const left = `${((i + 1) / (chainMilestones.length + 1)) * 100}%`
            return (
              <div key={i} className="absolute top-0 bottom-0" style={{ left }} title={`M${i + 1}`}>
                <div className={`w-px h-full ${st >= 2 ? "bg-green" : st === 1 ? "bg-amber" : "bg-gray-100"}`} />
                <span
                  className={`absolute -translate-x-1/2 top-1 text-[9px] font-mono px-1 rounded ${
                    st >= 2 ? "bg-green text-white" : st === 1 ? "bg-amber text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  M{i + 1}
                </span>
              </div>
            )
          })}
          {/* track line */}
          <div className="absolute left-3 right-3 top-1/2 h-0.5 bg-gray-100 -translate-y-1/2" />
          <div
            className="absolute left-3 top-1/2 h-0.5 bg-accent -translate-y-1/2 transition-all"
            style={{ width: `calc(${pct * 100}% * 0.96)` }}
          />
          {/* horse */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all"
            style={{ left: `calc(${(pct * 100).toFixed(1)}% * 0.96 + 12px)` }}
            title={login ?? grantee}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                width={30}
                height={30}
                className="rounded-full ring-2 ring-white shadow-sm"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            ) : (
              <span className="block w-[30px] h-[30px] rounded-full bg-black text-white text-[11px] font-medium flex items-center justify-center">
                {(login ?? "GR").slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          {/* finish flag */}
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[16px]" title="100% released">
            🏁
          </span>
        </div>
      </div>

      {/* Progress over days */}
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Approach · PRs over days</p>
        <ProgressGraph
          curve={curve}
          prPoints={prPoints}
          verifies={chainMilestones
            .map((m) => Number(m.verifiedAt ?? m[4] ?? 0))
            .filter((v) => v > 0)}
          releases={tranches.map((t) => Number(t.timestamp))}
          start={start}
          end={end}
        />
      </div>

      {/* Money trail */}
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Money trail</p>
        <div className="border border-gray-100 rounded-md overflow-hidden">
          <TrailRow
            dot="bg-black"
            label={`Grant created · ${(Number(totalAmount) / 1e6).toLocaleString()} USDC escrowed`}
            meta={createdAt ? fmtDate(createdAt) : ""}
            href={addressUrl(addresses.grant)}
            linkLabel="view contract on Arcscan ↗"
          />
          {chainMilestones.map((m, i) => {
            const v = Number(m.verifiedAt ?? m[4] ?? 0)
            if (!v) return null
            return (
              <TrailRow
                key={`v${i}`}
                dot="bg-amber"
                label={`Milestone ${i + 1} verified`}
                meta={fmtDate(v)}
                href={addressUrl(addresses.grant)}
                linkLabel="view contract on Arcscan ↗"
              />
            )
          })}
          {tranches.map((t) => (
            <TrailRow
              key={t.id}
              dot={t.auto ? "bg-gray-400" : "bg-green"}
              label={`${t.auto ? "Auto-released" : "Released"} · milestone ${Number(t.milestoneId) + 1} · ${(Number(t.amount) / 1e6).toLocaleString()} USDC`}
              meta={fmtDate(Number(t.timestamp))}
              href={txUrl(txFromId(t.id))}
              linkLabel="view on Arcscan ↗"
            />
          ))}
          {!subgraphOk && (
            <p className="px-4 py-2.5 text-[11px] text-gray-400">
              Release transactions appear here once the subgraph endpoint is configured.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TrailRow({
  dot,
  label,
  meta,
  href,
  linkLabel,
}: {
  dot: string
  label: string
  meta: string
  href: string
  linkLabel: string
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-50 last:border-b-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <p className="text-[12px] text-gray-700 truncate">{label}</p>
      <span className="ml-auto text-[11px] text-gray-400 font-mono shrink-0">{meta}</span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-[11px] text-accent hover:underline shrink-0"
      >
        {linkLabel} ↗
      </a>
    </div>
  )
}

function ProgressGraph({
  curve,
  prPoints,
  verifies,
  releases,
  start,
  end,
}: {
  curve: { at: number; frac: number }[]
  prPoints: { n: number; createdAt: number | null; mergedAt: number | null }[]
  verifies: number[]
  releases: number[]
  start: number
  end: number
}) {
  const W = 600
  const H = 170
  const P = { l: 8, r: 8, t: 10, b: 22 }
  const X = (at: number) => P.l + timeFrac(at, start, end) * (W - P.l - P.r)
  const Y = (frac: number) => P.t + (1 - frac) * (H - P.t - P.b - 34)
  const baseY = H - P.b

  // Step line through cumulative merges.
  const stepPath =
    curve.length === 0
      ? ""
      : `M ${X(start).toFixed(1)} ${Y(0).toFixed(1)} ` +
        curve
          .map((p) => `L ${X(p.at).toFixed(1)} ${Y(p.frac).toFixed(1)}`)
          .join(" ") +
        ` L ${X(end).toFixed(1)} ${Y(curve[curve.length - 1].frac).toFixed(1)}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full block border border-gray-100 rounded-md bg-white">
      {/* axis */}
      <line x1={P.l} y1={baseY} x2={W - P.r} y2={baseY} className="stroke-gray-100" strokeWidth={1} />
      <text x={P.l} y={H - 6} className="fill-gray-400" fontSize={10}>
        {fmtDay(start)}
      </text>
      <text x={W - P.r} y={H - 6} textAnchor="end" className="fill-gray-400" fontSize={10}>
        today
      </text>
      {/* merged curve */}
      {stepPath && <path d={stepPath} fill="none" className="stroke-accent" strokeWidth={2} />}
      {/* PR dots: hollow = opened, filled = merged */}
      {prPoints.map((p) => {
        const at = p.mergedAt ?? p.createdAt
        if (!at) return null
        const y = p.mergedAt ? Y(curve.find((c) => c.at === p.mergedAt)?.frac ?? 0) : baseY - 52
        return (
          <g key={p.n}>
            <circle
              cx={X(at)}
              cy={p.mergedAt ? y : baseY - 52}
              r={5}
              className={p.mergedAt ? "fill-accent" : "fill-white stroke-gray-400"}
              strokeWidth={p.mergedAt ? 0 : 1.5}
            >
              <title>PR #{p.n} {p.mergedAt ? "merged" : "open"}</title>
            </circle>
            <text x={X(at)} y={(p.mergedAt ? y : baseY - 52) - 9} textAnchor="middle" className="fill-gray-400" fontSize={9}>
              #{p.n}
            </text>
          </g>
        )
      })}
      {/* verify ✓ and release $ flags */}
      {verifies.map((v, i) => (
        <text key={`v${i}`} x={X(v)} y={baseY + 0} textAnchor="middle" fontSize={11} className="fill-amber">
          ✓<title>verified {fmtDate(v)}</title>
        </text>
      ))}
      {releases.map((r, i) => (
        <text key={`r${i}`} x={X(r)} y={baseY + 0} textAnchor="middle" fontSize={11} className="fill-green">
          $<title>released {fmtDate(r)}</title>
        </text>
      ))}
    </svg>
  )
}
