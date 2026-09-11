import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const repo = searchParams.get("repo")
  if (!repo || !repo.includes("/")) {
    return NextResponse.json({ error: "Missing repo param (owner/repo)" }, { status: 400 })
  }

  const headers = {
    Authorization: `token ${session.accessToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Flint",
  }

  try {
    // Fetch contributors, merged PRs, and issues in parallel
    const [contributorsRes, prsRes, issuesRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${repo}/contributors?per_page=50`, { headers }),
      fetch(`https://api.github.com/repos/${repo}/pulls?state=closed&per_page=100`, { headers }),
      fetch(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100`, { headers }),
    ])

    if (!contributorsRes.ok) {
      const err = await contributorsRes.text()
      console.error("contributors error:", err)
      return NextResponse.json({ error: "Failed to fetch contributors" }, { status: contributorsRes.status })
    }

    const contributors: any[] = await contributorsRes.json()
    const allPRs: any[] = prsRes.ok ? await prsRes.json() : []
    const allIssues: any[] = issuesRes.ok ? await issuesRes.json() : []

    // Count merged PRs per author
    const mergedPRsByAuthor = new Map<string, number>()
    for (const pr of allPRs) {
      if (pr.merged_at && pr.user?.login) {
        const login = pr.user.login
        mergedPRsByAuthor.set(login, (mergedPRsByAuthor.get(login) ?? 0) + 1)
      }
    }

    // Count issues (non-PR) per author
    const issuesByAuthor = new Map<string, number>()
    for (const issue of allIssues) {
      if (!issue.pull_request && issue.user?.login) {
        const login = issue.user.login
        issuesByAuthor.set(login, (issuesByAuthor.get(login) ?? 0) + 1)
      }
    }

    // Build contributor list
    const result = contributors
      .filter((c) => c.type === "User")
      .map((c) => ({
        login: c.login,
        avatarUrl: c.avatar_url,
        profileUrl: c.html_url,
        commits: c.contributions,
        prs: mergedPRsByAuthor.get(c.login) ?? 0,
        issues: issuesByAuthor.get(c.login) ?? 0,
      }))

    return NextResponse.json({ contributors: result })
  } catch (err) {
    console.error("Error fetching contributors:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
