import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createPublicClient, defineChain, http } from "viem";
import { parseIssueSpec } from "@/lib/issue-spec";
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

export interface PendingGrant {
  issueNumber: number;
  title: string;
  issueUrl: string;
  grantee: string | null;
  granteeWallet: string | null;
  deadline: string | null;
  amount: number | null;
  milestones: { title: string; releaseBps: number | null; deadline: string | null }[];
  specErrors: string[];
}

export interface FundedGrant extends PendingGrant {
  grantId: number;
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

    // Index on-chain milestones by their `source: owner/repo#issue` tag.
    const fundedByIssue = new Map<number, { grantId: number; chain: any; chainMilestones: any[] }>();
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
          fundedByIssue.set(parseInt(tag[2], 10), { grantId: g, chain: grant, chainMilestones: ms });
          break;
        }
      }
    }

    const pending: PendingGrant[] = [];
    const funded: FundedGrant[] = [];
    for (const i of issues) {
      const spec = parseIssueSpec(i.body ?? "");
      const base = {
        issueNumber: i.number,
        title: i.title,
        issueUrl: i.html_url,
        grantee: spec.grantee,
        granteeWallet: await getWallet(client, spec.grantee),
        deadline: spec.deadline,
        amount: spec.amount,
        milestones: spec.milestones.map((m) => ({
          title: m.title,
          releaseBps: m.releaseBps,
          deadline: m.deadline ?? spec.deadline,
        })),
        specErrors: spec.errors,
      };
      const hit = fundedByIssue.get(i.number);
      if (!hit) {
        pending.push(base);
      } else {
        funded.push({
          ...base,
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

    return NextResponse.json({ pending, funded });
  } catch (err) {
    console.error("pending grants error:", err);
    return NextResponse.json({ error: "Internal server error", pending: [], funded: [] }, { status: 500 });
  }
}
