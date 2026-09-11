import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

/// GET /api/github/pr-status?repo=owner/name&prs=1,2,3
/// Returns merge state per PR. Server-PAT first, session token fallback.
/// Responses cached 5 min client-side (keeper and UI both poll this shape).
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const pat = process.env.GITHUB_SERVER_PAT ?? (session as any)?.accessToken;
  if (!pat) {
    return NextResponse.json({ error: "No GitHub credential" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo");
  const prs = (searchParams.get("prs") ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 20);
  if (!repo || !repo.includes("/") || prs.length === 0) {
    return NextResponse.json({ error: "Missing repo/prs params" }, { status: 400 });
  }

  const headers = {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Flint",
  };

  const out: Record<number, { merged: boolean; state: string }> = {};
  await Promise.all(
    prs.map(async (n) => {
      try {
        const r = await fetch(`https://api.github.com/repos/${repo}/pulls/${n}`, { headers });
        if (!r.ok) {
          out[n] = { merged: false, state: "unknown" };
          return;
        }
        const pr = await r.json();
        out[n] = { merged: pr.merged === true, state: pr.merged === true ? "merged" : pr.state };
      } catch {
        out[n] = { merged: false, state: "unknown" };
      }
    }),
  );

  return NextResponse.json(
    { prs: out },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
