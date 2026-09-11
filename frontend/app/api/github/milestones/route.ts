import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

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
}

function parseReleasePercent(body: string): number | null {
  const match = body.match(/release\s*:\s*(\d+(?:\.\d+)?)\s*%/i)
  return match ? parseFloat(match[1]) : null
}

function parseReleaseAmount(body: string): number | null {
  const match = body.match(/amount\s*:\s*(\d+(?:\.\d+)?)/i)
  return match ? parseFloat(match[1]) : null
}

function parseLinkedPRs(body: string): number[] {
  // Matches "closes #123", "fixes #456", "resolves #789", or plain "#123"
  const matches = body.matchAll(/(?:closes?|fixes?|resolves?)?\s*#(\d+)/gi)
  const prs: number[] = []
  for (const m of matches) {
    prs.push(parseInt(m[1]))
  }
  return [...new Set(prs)]
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
        return {
          issueNumber: i.number,
          title: i.title,
          body,
          status: i.state as "open" | "closed",
          releasePercent: parseReleasePercent(body),
          releaseAmount: parseReleaseAmount(body),
          linkedPRs: parseLinkedPRs(body),
          issueUrl: i.html_url,
          closedAt: i.closed_at ?? null,
          createdAt: i.created_at,
        }
      })

    return NextResponse.json({ milestones })
  } catch (err) {
    console.error("Error fetching milestones:", err)
    return NextResponse.json({ error: "Internal server error", milestones: [] }, { status: 500 })
  }
}
