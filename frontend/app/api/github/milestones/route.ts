import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { parseIssueSpec } from "@/lib/issue-spec"

export interface Milestone {
  issueNumber: number
  title: string
  body: string
  status: "open" | "closed"
  releasePercent: number | null  // parsed from <!-- flint\nrelease: 25%\n-->
  releaseAmount: number | null   // parsed from <!-- flint\namount: 500\n-->
  linkedPRs: number[]
  issueUrl: string
  closedAt: string | null
  createdAt: string
  subMilestones?: { title: string; releaseBps: number | null }[]
  grantee?: string | null
  deadline?: string | null
  specErrors?: string[]
}

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

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?labels=flint&state=all&per_page=50&sort=created&direction=asc`,
      {
        headers: {
          Authorization: `token ${session.accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Flint",
        },
      },
    )

    if (!res.ok) {
      const text = await res.text()
      console.error("milestones error:", res.status, text)
      return NextResponse.json({ error: "Failed to fetch issues", milestones: [] }, { status: res.status })
    }

    const issues: any[] = await res.json()

    // Filter out PRs (GitHub issues API returns PRs too)
    const milestones: Milestone[] = issues
      .filter((i) => !i.pull_request)
      .map((i) => {
        const body = i.body ?? ""
        const spec = parseIssueSpec(body)
        const legacyRelease = body.match(/release\s*:\s*(\d+(?:\.\d+)?)\s*%/i)
        const legacyAmount = body.match(/amount\s*:\s*(\d+(?:\.\d+)?)/i)
        return {
          issueNumber: i.number,
          title: i.title,
          body,
          status: i.state as "open" | "closed",
          releasePercent: spec.milestones.length > 1
            ? spec.milestones.reduce((a, m) => a + (m.releaseBps ?? 0), 0) / 100
            : legacyRelease ? parseFloat(legacyRelease[1]) : null,
          releaseAmount: spec.amount ?? (legacyAmount ? parseFloat(legacyAmount[1]) : null),
          linkedPRs: spec.milestones.flatMap((m) => m.linkedPRs).filter((v, idx, a) => a.indexOf(v) === idx),
          issueUrl: i.html_url,
          closedAt: i.closed_at ?? null,
          createdAt: i.created_at,
          subMilestones: spec.milestones.length > 1
            ? spec.milestones.map((m) => ({ title: m.title, releaseBps: m.releaseBps }))
            : undefined,
          grantee: spec.grantee,
          deadline: spec.deadline,
          specErrors: spec.errors,
        }
      })

    return NextResponse.json({ milestones })
  } catch (err) {
    console.error("Error fetching milestones:", err)
    return NextResponse.json({ error: "Internal server error", milestones: [] }, { status: 500 })
  }
}
