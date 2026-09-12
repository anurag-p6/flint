import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeEventTopics,
  http,
  parseAbi,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseLinkedPRs, parseIssueSpec } from "@/lib/issue-spec";
import { addresses } from "@/lib/contracts";
import grantAbi from "@/lib/abi/FlintGrant.json";

const ARCSCAN_TX = "https://testnet.arcscan.app/tx";
const START_BLOCK = 61595122n; // Arc grant deployment block (see contracts/ARC_DEPLOY.md)

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

const AUTO_RELEASE_DELAY = 14 * 86400;
const ZERO = "0x0000000000000000000000000000000000000000";

// FlintGrant enums
const M_PENDING = 0;
const M_VERIFIED = 1;
const M_PAID = 2;
const G_ACTIVE = 0;

const payoutMarker = (g: number, m: number) => `<!-- flint-payout:g${g}-m${m} -->`;

function formatUSDC(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function milestoneTitle(desc: string): string {
  const lines = desc.split("\n");
  if (lines.length > 1 && /^source:\s*\S+?#\d+\s*$/.test(lines[0])) lines.shift();
  return lines.join("\n").trim().split("\n")[0] || "Milestone";
}

interface Action {
  grantId: number;
  milestoneId?: number;
  txHash?: string;
  reason?: string;
  error?: string;
}

function authed(request: Request): boolean {
  const secret = process.env.KEEPER_CRON_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function prMerged(
  pat: string,
  owner: string,
  repo: string,
  n: number,
): Promise<boolean> {
  try {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${n}`, {
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Flint",
      },
    });
    if (!r.ok) return false;
    return (await r.json()).merged === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!authed(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pat = process.env.GITHUB_SERVER_PAT;
  if (!pat) {
    return NextResponse.json({ error: "GITHUB_SERVER_PAT not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1";
  let hint: Record<string, unknown> = {};
  try {
    hint = await request.json();
  } catch {
    // No body (cron calls) — full sweep.
  }

  const verified: Action[] = [];
  const autoReleased: Action[] = [];
  const reclaimable: Action[] = [];
  const commented: Action[] = [];
  const skipped: Action[] = [];
  const errors: Action[] = [];

  try {
    const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
    const walletClient = dryRun
      ? null
      : createWalletClient({
          account: privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY as Hex),
          chain: arcTestnet,
          transport: http(),
        });

    const nextId = Number(
      (await publicClient.readContract({
        address: addresses.grant as `0x${string}`,
        abi: grantAbi,
        functionName: "nextGrantId",
      })) as bigint,
    );

    const now = Math.floor(Date.now() / 1000);

    for (let g = 0; g < nextId && g < 100; g++) {
      const grant = (await publicClient.readContract({
        address: addresses.grant as `0x${string}`,
        abi: grantAbi,
        functionName: "grants",
        args: [BigInt(g)],
      })) as any;
      if (!grant || grant[0] === ZERO) continue;
      if (Number(grant.status ?? grant[7]) !== G_ACTIVE) continue;

      const milestones = (await publicClient.readContract({
        address: addresses.grant as `0x${string}`,
        abi: grantAbi,
        functionName: "getMilestones",
        args: [BigInt(g)],
      })) as any[];

      const total = BigInt(grant.totalAmount ?? grant[3]);
      const paid = BigInt(grant.amountPaid ?? grant[4]);

      // Sibling milestones share the grant's issue: fall back to the tag on
      // milestone 0 when a milestone has no tag of its own.
      const grantTag =
        milestones.length > 0
          ? String(milestones[0].description ?? milestones[0][0] ?? "").match(
              /^source:\s*(\S+?)#(\d+)\s*$/m,
            )
          : null;

      for (let m = 0; m < milestones.length; m++) {
        const ms = milestones[m];
        const status = Number(ms.status ?? ms[3]);
        const desc = String(ms.description ?? ms[0] ?? "");

        // ── Pass 1: verify pending milestones with all linked PRs merged ──
        if (status === M_PENDING) {
          const ownTag = desc.match(/^source:\s*(\S+?)#(\d+)\s*$/m);
          const tag = ownTag ?? grantTag;
          if (!tag) {
            skipped.push({ grantId: g, milestoneId: m, reason: "no-source-tag" });
            continue;
          }
          const [owner, repo] = tag[1].split("/");
          const issueNo = parseInt(tag[2], 10);
          let prs: number[] = [];
          try {
            const ir = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/issues/${issueNo}`,
              {
                headers: {
                  Authorization: `token ${pat}`,
                  Accept: "application/vnd.github.v3+json",
                  "User-Agent": "Flint",
                },
              },
            );
            if (!ir.ok) {
              skipped.push({ grantId: g, milestoneId: m, reason: `issue-fetch-${ir.status}` });
              continue;
            }
            prs = parseLinkedPRs((await ir.json()).body ?? "");
          } catch (e) {
            errors.push({ grantId: g, milestoneId: m, error: `issue-fetch: ${e}` });
            continue;
          }
          if (prs.length === 0) {
            skipped.push({ grantId: g, milestoneId: m, reason: "no-linked-prs" });
            continue;
          }
          const states = await Promise.all(prs.map((n) => prMerged(pat, owner, repo, n)));
          if (!states.every(Boolean)) {
            skipped.push({ grantId: g, milestoneId: m, reason: "prs-not-merged" });
            continue;
          }
          console.log(`keeper: grant ${g} milestone ${m} verified by merged PRs [${prs}]`);
          if (dryRun) {
            verified.push({ grantId: g, milestoneId: m, reason: "dry-run" });
            continue;
          }
          try {
            const tx = await walletClient!.writeContract({
              address: addresses.grant as `0x${string}`,
              abi: grantAbi,
              functionName: "verifyMilestone",
              args: [BigInt(g), BigInt(m)],
            });
            verified.push({ grantId: g, milestoneId: m, txHash: tx });
          } catch (e) {
            errors.push({ grantId: g, milestoneId: m, error: `verify: ${e instanceof Error ? e.message : e}` });
          }
        }

        // ── Pass 2: auto-release verified-but-unpaid past the 14-day window ──
        if (status === M_VERIFIED) {
          const verifiedAt = Number(ms.verifiedAt ?? ms[4]);
          if (now >= verifiedAt + AUTO_RELEASE_DELAY) {
            console.log(`keeper: grant ${g} milestone ${m} past auto-release window`);
            if (dryRun) {
              autoReleased.push({ grantId: g, milestoneId: m, reason: "dry-run" });
              continue;
            }
            try {
              const tx = await walletClient!.writeContract({
                address: addresses.grant as `0x${string}`,
                abi: grantAbi,
                functionName: "autoRelease",
                args: [BigInt(g), BigInt(m)],
              });
              autoReleased.push({ grantId: g, milestoneId: m, txHash: tx });
            } catch (e) {
              errors.push({ grantId: g, milestoneId: m, error: `autoRelease: ${e instanceof Error ? e.message : e}` });
            }
          }
        }
      }

      // ── Pass 2b: flag reclaimable (grantor-only tx — keeper never sends it) ──
      if (milestones.length > 0) {
        const last = milestones[milestones.length - 1];
        const lastDeadline = Number(last.deadline ?? last[2]);
        if (lastDeadline > 0 && now > lastDeadline && total - paid > 0n) {
          reclaimable.push({ grantId: g, reason: `${total - paid} base units unclaimed` });
        }
      }

      // ── Pass 3: post disbursement proof comment on the grant issue ──
      // For each Paid milestone: find its payout log (amount + exact tx hash),
      // skip if our marker comment already exists (idempotent, no DB).
      const granteeAddr = String(grant.grantee ?? grant[1]);
      for (let m = 0; m < milestones.length; m++) {
        const ms = milestones[m];
        if (Number(ms.status ?? ms[3]) !== M_PAID) continue;
        const ownTag = String(ms.description ?? ms[0] ?? "").match(/^source:\s*(\S+?)#(\d+)\s*$/m);
        const tag = ownTag ?? grantTag;
        if (!tag) {
          skipped.push({ grantId: g, milestoneId: m, reason: "comment-no-source-tag" });
          continue;
        }
        const [owner, repo] = tag[1].split("/");
        const issueNo = parseInt(tag[2], 10);

        try {
          // Manual topic encoding: viem drops `args` when events are held in
          // variables, and the RPC rejects unfiltered scans — so build the
          // filter with encodeEventTopics and decode matches by hand.
          const releasedAbi = parseAbi([
            "event TrancheReleased(uint256 indexed grantId, uint256 indexed milestoneId, address indexed grantee, uint256 amount)",
          ]);
          const autoAbi = parseAbi([
            "event TrancheAutoReleased(uint256 indexed grantId, uint256 indexed milestoneId, uint256 amount)",
          ]);
          const grantAddr = addresses.grant as `0x${string}`;
          const pairArgs = { grantId: BigInt(g), milestoneId: BigInt(m) };
          const topicsM = encodeEventTopics({ abi: releasedAbi, eventName: "TrancheReleased", args: pairArgs });
          const topicsA = encodeEventTopics({ abi: autoAbi, eventName: "TrancheAutoReleased", args: pairArgs });
          const combinedAbi = [...releasedAbi, ...autoAbi] as const;
          // One call per chunk, both events OR-ed in topics[0], newest chunks
          // first — recent payouts resolve in 1–2 calls, old ones stay bounded.
          const CHUNK = 5000n;
          const MAX_CHUNKS = 20;
          const head = await publicClient.getBlockNumber();
          let found: { decoded: { eventName: string; args: any }; transactionHash: string } | null = null;
          for (let i = 0; i < MAX_CHUNKS && !found; i++) {
            const to = head - BigInt(i) * CHUNK;
            const from = to - CHUNK + 1n > START_BLOCK ? to - CHUNK + 1n : START_BLOCK;
            if (to < START_BLOCK) break;
            const raw = await publicClient.request({
              method: "eth_getLogs",
              params: [
                {
                  address: grantAddr,
                  topics: [[topicsM[0]!, topicsA[0]!], topicsM[1]!, topicsM[2]!] as unknown as [Hex, ...Hex[]],
                  fromBlock: toHex(from),
                  toBlock: toHex(to),
                },
              ],
            });
            const decoded = raw
              .map((l) => {
                try {
                  return {
                    decoded: decodeEventLog({
                      abi: combinedAbi,
                      data: l.data,
                      topics: l.topics.filter((t): t is Hex => t !== null) as [Hex, ...Hex[]],
                    }),
                    blockNumber: BigInt(l.blockNumber ?? "0x0"),
                    logIndex: Number(l.logIndex ?? 0),
                    transactionHash: String(l.transactionHash ?? ""),
                  };
                } catch {
                  return null;
                }
              })
              .filter((x): x is NonNullable<typeof x> => x !== null)
              .sort(
                (a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex,
              );
            if (decoded.length > 0) found = decoded[decoded.length - 1];
            if (from <= START_BLOCK) break;
          }
          const logs = found ? [found] : [];
          if (logs.length === 0) {
            skipped.push({ grantId: g, milestoneId: m, reason: "comment-no-payout-log" });
            continue;
          }
          const log = logs[logs.length - 1];
          const auto = (log.decoded as any).eventName === "TrancheAutoReleased";
          const payoutAmount = BigInt((log.decoded as any).args.amount as bigint);
          const payoutTx = String(log.transactionHash);

          const gh = { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", "User-Agent": "Flint" };
          const commentsRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/issues/${issueNo}/comments?per_page=100`,
            { headers: gh },
          );
          if (!commentsRes.ok) {
            skipped.push({ grantId: g, milestoneId: m, reason: `comment-list-${commentsRes.status}` });
            continue;
          }
          const comments = (await commentsRes.json()) as { body?: string }[];
          if (comments.some((c) => (c.body ?? "").includes(payoutMarker(g, m)))) {
            skipped.push({ grantId: g, milestoneId: m, reason: "already-commented" });
            continue;
          }

          let granteeLogin: string | null = null;
          try {
            const ir = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNo}`, { headers: gh });
            if (ir.ok) granteeLogin = parseIssueSpec((await ir.json()).body ?? "").grantee;
          } catch {
            // Username is cosmetic — address + links carry the proof.
          }

          const title = milestoneTitle(String(ms.description ?? ms[0] ?? ""));
          const body = [
            `## \u{1F4B8} Flint disbursement — milestone paid`,
            ``,
            `**${title}** · ${formatUSDC(payoutAmount)} USDC → ${granteeLogin ? `@${granteeLogin} ` : ""}(\`${granteeAddr}\`)`,
            ``,
            `- **Tx:** [${payoutTx.slice(0, 10)}…](${ARCSCAN_TX}/${payoutTx})`,
            auto
              ? `- **Mode:** auto-released after 14 days with no maintainer action`
              : `- **Mode:** released by maintainer approval`,
            `- **Proof:** soulbound receipt (ERC-5484) minted to the grantee on Arc`,
            ``,
            payoutMarker(g, m),
          ].join("\n");

          console.log(`keeper: commenting payout g${g}m${m} on ${owner}/${repo}#${issueNo}`);
          if (dryRun) {
            commented.push({ grantId: g, milestoneId: m, reason: "dry-run" });
            continue;
          }
          const post = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/issues/${issueNo}/comments`,
            { method: "POST", headers: { ...gh, "Content-Type": "application/json" }, body: JSON.stringify({ body }) },
          );
          if (!post.ok) {
            errors.push({ grantId: g, milestoneId: m, error: `comment-post-${post.status}` });
            continue;
          }
          commented.push({ grantId: g, milestoneId: m, txHash: payoutTx });
        } catch (e) {
          errors.push({ grantId: g, milestoneId: m, error: `comment: ${e instanceof Error ? e.message : e}` });
        }
      }
    }

    return NextResponse.json({ dryRun, hint, verified, autoReleased, reclaimable, commented, skipped, errors });
  } catch (err) {
    console.error("keeper error:", err);
    return NextResponse.json(
      { error: "Keeper failed", verified, autoReleased, reclaimable, commented, skipped, errors },
      { status: 500 },
    );
  }
}
