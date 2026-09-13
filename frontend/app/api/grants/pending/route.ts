import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createPublicClient, defineChain, http } from "viem";
import { parseIssueSpec } from "@/lib/issue-spec";
import { parseContributorsMd } from "@/lib/contributor-mapping";
import { addresses } from "@/lib/contracts";
import grantAbi from "@/lib/abi/FlintGrant.json";
import identityAbi from "@/lib/abi/FlintIdentity.json";

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

const ZERO = "0x0000000000000000000000000000000000000000";

export interface AssigneeResolution {
  login: string;
  wallet: string | null;
  /** onchain = FlintIdentity registry, repo = CONTRIBUTORS.md, null wallet = unclaimed */
  source: "onchain" | "repo" | null;
}

export interface PendingGrant {
  issueNumber: number;
  title: string;
  issueUrl: string;
  grantee: string | null;
  granteeWallet: string | null;
  granteeSource: "onchain" | "repo" | null;
  /** GitHub assignees set by the issue raiser — the grant's grantees, resolved. */
  assignees: AssigneeResolution[];
  deadline: string | null;
  amount: number | null;
  milestones: { title: string; releaseBps: number | null; deadline: string | null; linkedPRs: number[] }[];
  specErrors: string[];
}

export interface FundedGrant extends PendingGrant {
  grantId: number;
  /** Which assignee this grant pays (multi-grant issues fan out 1:1). */
  paysAssignee: string | null;
  chainStatus: number;
  totalAmount: string;
  amountPaid: string;
  milestonesChain: {
    description: string;
    trancheBps: string;
    deadline: string;
    status: number;
    verifiedAt: string;
    paidAt: string;
  }[];
}

async function getWallet(client: any, username: string | null): Promise<string | null> {
  if (!username) return null;
  try {
    const w = (await client.readContract({
      address: addresses.identity as `0x${string}`,
      abi: identityAbi,
      functionName: "getWallet",
      args: [username],
    })) as string;
    return w === ZERO ? null : w;
  } catch {
    return null;
  }
}

// Unified wallet resolution: on-chain registry first, CONTRIBUTORS.md second.
// The maintainer-approved file is what makes a login payable without a tx.
async function resolveAssignee(
  client: any,
  login: string,
  mdByLogin: Record<string, string>,
): Promise<AssigneeResolution> {
  const w = await getWallet(client, login);
  if (w) return { login, wallet: w, source: "onchain" };
  const md = mdByLogin[login.toLowerCase()];
  if (md) return { login, wallet: md, source: "repo" };
  return { login, wallet: null, source: null };
}

// One CONTRIBUTORS.md fetch per repo per minute, shared by all issues.
const mdCache = new Map<string, { exp: number; map: Record<string, string> }>();
async function getMdByLogin(pat: string, repo: string): Promise<Record<string, string>> {
  const hit = mdCache.get(repo.toLowerCase());
  if (hit && Date.now() < hit.exp) return hit.map;
  let map: Record<string, string> = {};
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/CONTRIBUTORS.md`, {
      headers: {
        Authorization: `token ${pat}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Flint",
      },
    });
    if (res.ok) {
      const data = await res.json();
      map = parseContributorsMd(Buffer.from(data.content, "base64").toString("utf-8"));
    }
  } catch {
    // Missing file / rate limit → on-chain-only resolution.
  }
  mdCache.set(repo.toLowerCase(), { exp: Date.now() + 60000, map });
  return map;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const pat = process.env.GITHUB_SERVER_PAT ?? (session as any)?.accessToken;
  if (!pat) {
    return NextResponse.json({ error: "No GitHub credential (GITHUB_SERVER_PAT or login)" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo");
  if (!repo || !repo.includes("/")) {
    return NextResponse.json({ error: "Missing repo param (owner/repo)" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?labels=flint&state=all&per_page=50&sort=created&direction=asc`,
      {
        headers: {
          Authorization: `token ${pat}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Flint",
        },
      },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch issues", pending: [], funded: [] }, { status: res.status });
    }
    const issues: any[] = (await res.json()).filter((i: any) => !i.pull_request);

    const client = createPublicClient({ chain: arcTestnet, transport: http() });
    const nextId = Number(
      (await client.readContract({
        address: addresses.grant as `0x${string}`,
        abi: grantAbi,
        functionName: "nextGrantId",
      })) as bigint,
    );

    const mdByLogin = await getMdByLogin(pat, repo);

    // Index on-chain milestones by their `source: owner/repo#issue` tag.
    // Multi-value: one issue fans out to one grant PER assignee.
    const fundedByIssue = new Map<number, { grantId: number; chain: any; chainMilestones: any[] }[]>();
    for (let g = 0; g < nextId && g < 100; g++) {
      const [grant, ms] = await Promise.all([
        client.readContract({
          address: addresses.grant as `0x${string}`,
          abi: grantAbi,
          functionName: "grants",
          args: [BigInt(g)],
        }) as Promise<any>,
        client.readContract({
          address: addresses.grant as `0x${string}`,
          abi: grantAbi,
          functionName: "getMilestones",
          args: [BigInt(g)],
        }) as Promise<any[]>,
      ]);
      if (!grant || grant[0] === ZERO) continue;
      for (const m of ms) {
        const desc = String(m.description ?? m[0] ?? "");
        const tag = desc.match(/^source:\s*(\S+?)#(\d+)\s*$/m);
        if (tag && tag[1].toLowerCase() === repo.toLowerCase()) {
          const key = parseInt(tag[2], 10);
          const arr = fundedByIssue.get(key) ?? [];
          arr.push({ grantId: g, chain: grant, chainMilestones: ms });
          fundedByIssue.set(key, arr);
          break;
        }
      }
    }

    const pending: PendingGrant[] = [];
    const funded: FundedGrant[] = [];
    for (const i of issues) {
      const spec = parseIssueSpec(i.body ?? "");
      // Assignees set by the issue raiser = the grant's grantees.
      const assigneeLogins = [...new Set(
        ((i.assignees ?? []) as any[])
          .map((a) => (typeof a === "string" ? a : a?.login))
          .filter((l): l is string => !!l)
          .map((l) => l.replace(/^@/, "")),
      )];
      const assignees = await Promise.all(
        assigneeLogins.map((login) => resolveAssignee(client, login, mdByLogin)),
      );
      const footer = spec.grantee ? await resolveAssignee(client, spec.grantee, mdByLogin) : null;
      const base = {
        issueNumber: i.number,
        title: i.title,
        issueUrl: i.html_url,
        grantee: spec.grantee,
        granteeWallet: footer?.wallet ?? null,
        granteeSource: footer?.source ?? null,
        assignees,
        deadline: spec.deadline,
        amount: spec.amount,
        milestones: spec.milestones.map((m) => ({
          title: m.title,
          releaseBps: m.releaseBps,
          deadline: m.deadline ?? spec.deadline,
          linkedPRs: m.linkedPRs,
        })),
        specErrors: spec.errors,
      };
      const hits = fundedByIssue.get(i.number) ?? [];
      if (hits.length === 0) {
        pending.push(base);
      } else {
        for (const hit of hits) {
          funded.push({
            ...base,
            // On-chain grants don't record which login they pay; attribute only
            // when the issue maps 1:1, otherwise group under the issue.
            paysAssignee: hits.length === 1 && assignees.length === 1 ? assignees[0].login : null,
            grantId: hit.grantId,
            chainStatus: Number(hit.chain.status ?? hit.chain[7]),
            totalAmount: String(hit.chain.totalAmount ?? hit.chain[3]),
            amountPaid: String(hit.chain.amountPaid ?? hit.chain[4]),
            milestonesChain: hit.chainMilestones.map((m: any) => ({
              description: String(m.description ?? m[0]),
              trancheBps: String(m.trancheBps ?? m[1]),
              deadline: String(m.deadline ?? m[2]),
              status: Number(m.status ?? m[3]),
              verifiedAt: String(m.verifiedAt ?? m[4]),
              paidAt: String(m.paidAt ?? m[5]),
            })),
          });
        }
      }
    }

    return NextResponse.json({ pending, funded });
  } catch (err) {
    console.error("pending grants error:", err);
    return NextResponse.json({ error: "Internal server error", pending: [], funded: [] }, { status: 500 });
  }
}
