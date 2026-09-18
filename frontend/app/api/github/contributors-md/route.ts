import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { parseContributorsMd } from "@/lib/contributor-mapping"

export { parseContributorsMd }

export async function GET(request: Request) {
  // No login required: server PAT serves public repo data.
  const session = await getServerSession(authOptions)
  const pat = process.env.GITHUB_SERVER_PAT ?? (session as any)?.accessToken
  if (!pat) {
    return NextResponse.json({ error: "No GitHub credential" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const repo = searchParams.get("repo")
  if (!repo || !repo.includes("/")) {
    return NextResponse.json({ error: "Missing repo param" }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/CONTRIBUTORS.md`,
      {
        headers: {
          Authorization: `token ${pat}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Flint",
        },
      },
    )

    if (res.status === 404) {
      return NextResponse.json({ mapping: {}, missing: true })
    }

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch CONTRIBUTORS.md" }, { status: res.status })
    }

    const data = await res.json()
    // GitHub returns base64-encoded content
    const content = Buffer.from(data.content, "base64").toString("utf-8")
    const mapping = parseContributorsMd(content)

    return NextResponse.json({ mapping, missing: false })
  } catch (err) {
    console.error("Error fetching CONTRIBUTORS.md:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
