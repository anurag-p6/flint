import { keccak256, encodePacked, createPublicClient, http } from "viem";
import { arcTestnet } from "@/lib/wagmi";
import { addresses } from "@/lib/contracts";
import grantAbi from "@/lib/abi/FlintGrant.json";
import { isSubgraphConfigured } from "@/lib/subgraph";

// ─── repoId derivations (must match contracts; see scripts/check-universe-keccak.mjs)
// Pool:  keccak256(encodePacked(["string"], ["owner/repo"]))  — dashboard createPool
// Grant: keccak256(abi.encodePacked("grant", grantId))         — FlintGrant.sol mint path

export function poolRepoId(slug: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [slug]));
}

export function grantRepoId(grantId: number | bigint): `0x${string}` {
  return keccak256(encodePacked(["string", "uint256"], ["grant", BigInt(grantId)]));
}

export function shortHash(hex: string): string {
  return hex.length > 12 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex;
}

// ─── Subgraph feed ───

export interface UniverseReceipt {
  tokenId: string;
  contributor: string; // wallet hex (lowercased)
  repoId: string; // bytes32 hex (lowercased)
  cycle: string;
  score: string;
  amount: string;
  mode: string;
  timestamp: string;
  txHash: string;
}

export interface UniverseContributor {
  id: string;
  totalScore: string;
  totalEarned: string;
  receiptCount: number;
}

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? "";

export async function fetchUniverseFeed(): Promise<{
  receipts: UniverseReceipt[];
  contributors: UniverseContributor[];
}> {
  if (!isSubgraphConfigured() && !SUBGRAPH_URL) throw new Error("subgraph-not-configured");
  const url = SUBGRAPH_URL;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `{
        receipts(orderBy: timestamp, orderDirection: asc, first: 500) {
          tokenId contributor { id } repoId cycle score amount mode timestamp txHash
        }
        contributors(orderBy: totalScore, orderDirection: desc, first: 500) {
          id totalScore totalEarned receiptCount
        }
      }`,
    }),
  });
  if (!res.ok) throw new Error(`subgraph-http-${res.status}`);
  const json = (await res.json()) as {
    data?: {
      receipts: (Omit<UniverseReceipt, "contributor"> & { contributor: { id: string } })[];
      contributors: UniverseContributor[];
    };
    errors?: { message: string }[];
  };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return {
    receipts: (json.data?.receipts ?? []).map((r) => ({
      ...r,
      contributor: r.contributor.id.toLowerCase(),
      repoId: r.repoId.toLowerCase(),
    })),
    contributors: (json.data?.contributors ?? []).map((c) => ({ ...c, id: c.id.toLowerCase() })),
  };
}

export async function fetchNextGrantId(): Promise<number> {
  const client = createPublicClient({ chain: arcTestnet, transport: http() });
  const n = (await client.readContract({
    address: addresses.grant as `0x${string}`,
    abi: grantAbi,
    functionName: "nextGrantId",
  })) as bigint;
  return Number(n);
}

// ─── Scene graph ───

export type HubKind = "repo" | "grant" | "unknown";

export interface UniverseHub {
  id: string; // repoId hex
  kind: HubKind;
  label: string;
  grantId: number | null;
  totalDisbursed: bigint;
}

export interface UniverseEdge {
  id: string; // receipt tokenId
  from: string; // contributor wallet
  to: string; // hub id (repoId)
  amount: bigint;
  score: bigint;
  mode: string;
  txHash: string;
}

export interface UniverseNode {
  id: string;
  totalScore: bigint;
  totalEarned: bigint;
  receiptCount: number;
}

export interface UniverseGraph {
  nodes: UniverseNode[];
  hubs: UniverseHub[];
  edges: UniverseEdge[];
  maxScore: bigint;
  maxAmount: bigint;
  maxDisbursed: bigint;
}

export interface HubResolver {
  (repoId: string): { kind: HubKind; label: string; grantId: number | null };
}

/** Default resolver: grant hashes via brute-forced set, pool hashes via slug dict. */
export function makeHubResolver(opts: {
  grantIds: number[];
  grantTitles: Record<number, string>;
  poolSlugs: string[];
}): HubResolver {
  const grantHashes = new Map<string, number>();
  for (const n of opts.grantIds) grantHashes.set(grantRepoId(n).toLowerCase(), n);
  const poolHashes = new Map<string, string>();
  for (const slug of opts.poolSlugs) poolHashes.set(poolRepoId(slug).toLowerCase(), slug);
  return (repoId: string) => {
    const r = repoId.toLowerCase();
    const g = grantHashes.get(r);
    if (g !== undefined) {
      return { kind: "grant", label: opts.grantTitles[g] ?? `Grant #${g}`, grantId: g };
    }
    const slug = poolHashes.get(r);
    if (slug) return { kind: "repo", label: slug, grantId: null };
    return { kind: "unknown", label: shortHash(repoId), grantId: null };
  };
}

export function buildUniverse(
  receipts: UniverseReceipt[],
  contributors: UniverseContributor[],
  resolve: HubResolver,
): UniverseGraph {
  const scoreByWallet = new Map(contributors.map((c) => [c.id.toLowerCase(), c]));
  const nodes = new Map<string, UniverseNode>();
  const hubs = new Map<string, UniverseHub>();
  const edges: UniverseEdge[] = [];
  let maxScore = 0n;
  let maxAmount = 0n;

  for (const r of receipts) {
    const amount = BigInt(r.amount);
    const score = BigInt(r.score);
    if (amount > maxAmount) maxAmount = amount;
    const agg = scoreByWallet.get(r.contributor);
    if (!nodes.has(r.contributor)) {
      const totalScore = agg ? BigInt(agg.totalScore) : score;
      if (totalScore > maxScore) maxScore = totalScore;
      nodes.set(r.contributor, {
        id: r.contributor,
        totalScore,
        totalEarned: agg ? BigInt(agg.totalEarned) : amount,
        receiptCount: agg ? agg.receiptCount : 1,
      });
    }
    let hub = hubs.get(r.repoId);
    if (!hub) {
      const resolved = resolve(r.repoId);
      hub = { id: r.repoId, kind: resolved.kind, label: resolved.label, grantId: resolved.grantId, totalDisbursed: 0n };
      hubs.set(r.repoId, hub);
    }
    hub.totalDisbursed += amount;
    edges.push({
      id: r.tokenId,
      from: r.contributor,
      to: r.repoId,
      amount,
      score,
      mode: r.mode,
      txHash: r.txHash,
    });
  }

  // Contributors with aggregates but no receipts in the window still get nodes.
  for (const c of contributors) {
    const id = c.id.toLowerCase();
    if (!nodes.has(id)) {
      const totalScore = BigInt(c.totalScore);
      if (totalScore > maxScore) maxScore = totalScore;
      nodes.set(id, { id, totalScore, totalEarned: BigInt(c.totalEarned), receiptCount: c.receiptCount });
    }
  }

  // Cap: aggregate the long tail into one node past 300 (acceptance rule).
  const nodeList = [...nodes.values()];
  const hubList = [...hubs.values()];
  const maxDisbursed = hubList.reduce((m, h) => (h.totalDisbursed > m ? h.totalDisbursed : m), 0n);
  return { nodes: nodeList, hubs: hubList, edges, maxScore, maxAmount, maxDisbursed };
}

// Sizing mirrors the payout philosophy: sqrt compression, clamped for legibility.
export function contributorRadius(score: bigint, maxScore: bigint): number {
  if (maxScore <= 0n) return 10;
  const t = Math.sqrt(Number(score) / Number(maxScore));
  return 8 + 20 * t;
}

export function hubRadius(disbursed: bigint, maxDisbursed: bigint): number {
  if (maxDisbursed <= 0n) return 12;
  const t = Math.sqrt(Number(disbursed) / Number(maxDisbursed));
  return 12 + 16 * t;
}

export function edgeWidth(amount: bigint, maxAmount: bigint): number {
  if (maxAmount <= 0n) return 1;
  return 1 + 3 * (Number(amount) / Number(maxAmount));
}
