import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

// Parses lines like:
// | @username | 0x1234...5678 |
// @username 0x1234...5678
// username: 0x1234...5678
const ETH_ADDRESS_RE = /0x[a-fA-F0-9]{40}/
const GITHUB_LOGIN_RE = /@?([\w-]+)/

export function parseContributorsMd(content: string): Record<string, string> {
  const mapping: Record<string, string> = {}

  for (const line of content.split("\n")) {
    const address = ETH_ADDRESS_RE.exec(line)?.[0]
    if (!address) continue

    // Remove the address from the line then look for a username
    const withoutAddress = line.replace(address, "")
    const loginMatch = GITHUB_LOGIN_RE.exec(withoutAddress)
    if (!loginMatch) continue

    const login = loginMatch[1].toLowerCase()
    if (login && login !== "github" && login !== "wallet") {
      mapping[login] = address
    }
  }

  return mapping
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
          Authorization: `token ${session.accessToken}`,
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
