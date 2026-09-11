import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseLinkedPRs } from "@/lib/issue-spec";
import { addresses } from "@/lib/contracts";
import grantAbi from "@/lib/abi/FlintGrant.json";

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
const G_ACTIVE = 0;

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
    }

    return NextResponse.json({ dryRun, hint, verified, autoReleased, reclaimable, skipped, errors });
  } catch (err) {
    console.error("keeper error:", err);
    return NextResponse.json(
      { error: "Keeper failed", verified, autoReleased, reclaimable, skipped, errors },
      { status: 500 },
    );
  }
}
