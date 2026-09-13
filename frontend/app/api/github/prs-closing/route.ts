import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { parseLinkedPRs } from "@/lib/issue-spec"

/// GET /api/github/prs-closing?repo=owner/name&issue=1
/// Merged PRs whose body references this issue (closes #N).
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  const pat = process.env.GITHUB_SERVER_PAT ?? (session as any)?.accessToken
  if (!pat) {
    return NextResponse.json({ error: "No GitHub credential", prs: [] }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const repo = searchParams.get("repo") ?? ""
  const issue = parseInt(searchParams.get("issue") ?? "", 10)
  if (!repo.includes("/") || !Number.isFinite(issue) || issue <= 0) {
    return NextResponse.json({ error: "Missing repo/issue", prs: [] }, { status: 400 })
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/pulls?state=closed&per_page=30`,
      {
        headers: {
          Authorization: `token ${pat}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Flint",
        },
      },
    )
    if (!r.ok) return NextResponse.json({ prs: [] })
    const rows = (await r.json()) as {
      number: number
      merged_at: string | null
      body: string | null
    }[]
    const prs = rows
      .filter((p) => p.merged_at && parseLinkedPRs(p.body ?? "").includes(issue))
      .map((p) => ({
        number: p.number,
        merged: true,
        state: "merged",
        mergedAt: p.merged_at,
      }))
    return NextResponse.json({ prs })
  } catch {
    return NextResponse.json({ prs: [] })
  }
}
