import { timingSafeEqual } from "node:crypto"
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { addresses } from "@/lib/contracts"
import escrowAbi from "@/lib/abi/FlintEscrow.json"
import { parseContributorsMd } from "@/lib/contributor-mapping"
import { runScorer } from "@/lib/scorer/run"
import { emitLive } from "@/lib/live-bus"
import { setCachedScores } from "@/lib/scorer/cache"

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
})

function authed(request: Request): boolean {
  const secret = process.env.KEEPER_CRON_SECRET ?? ""
  const header = request.headers.get("authorization") ?? ""
  if (!secret || !header.startsWith("Bearer ")) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function fetchContributorMapping(
  token: string,
  owner: string,
  repo: string,
): Promise<Record<string, string>> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/CONTRIBUTORS.md`,
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3.raw",
        "User-Agent": "flint-scorer",
      },
    },
  )
  if (!res.ok) return {}
  const content = await res.text()
  return parseContributorsMd(content)
}

export async function POST(request: Request) {
  const isInternal = request.headers.get("x-flint-scorer") === "1"
  if (!isInternal && !authed(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const githubToken = process.env.GITHUB_SERVER_PAT
  if (!githubToken) {
    return Response.json({ error: "GITHUB_SERVER_PAT not configured" }, { status: 500 })
  }

  const llmApiKey = process.env.GROQ_API_KEY ?? ""

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get("dryRun") === "1"

  let body: { repo?: string; cycleDays?: number } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body — expected { repo: 'owner/repo' }" }, { status: 400 })
  }

  const repoFull = body.repo
  if (!repoFull || !repoFull.includes("/")) {
    return Response.json({ error: "Missing or invalid repo (expected 'owner/repo')" }, { status: 400 })
  }

  const [owner, repo] = repoFull.split("/")

  try {
    console.log(`[scorer-api] Starting scorer for ${repoFull} (dryRun=${dryRun})`)

    const contributorMapping = await fetchContributorMapping(githubToken, owner, repo)
    if (Object.keys(contributorMapping).length === 0) {
      return Response.json(
        { error: "No CONTRIBUTORS.md found or no valid mappings" },
        { status: 422 },
      )
    }

    console.log(`[scorer-api] Found ${Object.keys(contributorMapping).length} contributor mappings`)

    const result = await runScorer({
      owner,
      repo,
      cycleDays: body.cycleDays ?? 30,
      githubToken,
      llmApiKey,
      contributorMapping,
    })

    const details = result.details.map((d) => ({
      username: d.githubUsername,
      wallet: d.address,
      composite: d.compositeScore,
      scaled: d.scaledScore.toString(),
      breakdown: {
        pr: d.prScore,
        review: d.reviewScore,
        issue: d.issueScore,
        community: d.communityScore,
      },
    }))

    setCachedScores({ repo: repoFull, at: Date.now(), txHash: null, details })
    emitLive(repoFull, "grants")

    if (result.contributors.length === 0) {
      return Response.json({
        dryRun,
        scored: 0,
        message: "No contributors with mapped wallets found in recent activity",
        details: [],
      })
    }

    let txHash: string | null = null
    let alreadySubmitted = false

    if (!dryRun) {
      const keeperKey = process.env.KEEPER_PRIVATE_KEY as Hex | undefined
      if (!keeperKey) {
        console.log("[scorer-api] KEEPER_PRIVATE_KEY missing — preview scores only")
      } else {
        try {
          const publicClient = createPublicClient({
            chain: arcTestnet,
            transport: http(),
          })
          const pool = await publicClient.readContract({
            address: addresses.escrow as `0x${string}`,
            abi: escrowAbi,
            functionName: "pools",
            args: [result.repoId],
          }) as readonly unknown[]
          const status = Number(pool[7] ?? 0)
          // 0 = Active, 1 = ScoresSubmitted (overwrite allowed until Approved).
          if (status > 1) {
            alreadySubmitted = true
            console.log(
              `[scorer-api] Pool status=${status} is past scoring — skipping submitScores`,
            )
          } else {
            const walletClient = createWalletClient({
              account: privateKeyToAccount(keeperKey),
              chain: arcTestnet,
              transport: http(),
            })

            txHash = await walletClient.writeContract({
              address: addresses.escrow as `0x${string}`,
              abi: escrowAbi,
              functionName: "submitScores",
              args: [result.repoId, result.contributors, result.scores],
            })

            console.log(`[scorer-api] Submitted scores on-chain: ${txHash}`)
            setCachedScores({ repo: repoFull, at: Date.now(), txHash, details })
            emitLive(repoFull, "grants")
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes("InvalidStatus")) {
            alreadySubmitted = true
            console.log("[scorer-api] Scores already on-chain — ready to pay")
          } else {
            console.log("[scorer-api] on-chain submit skipped:", msg)
          }
        }
      }
    }

    return Response.json({
      dryRun,
      txHash,
      alreadySubmitted,
      scored: result.contributors.length,
      repoId: result.repoId,
      details,
    })
  } catch (err) {
    console.error("[scorer-api] Error:", err)
    return Response.json(
      { error: `Scorer failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    )
  }
}
