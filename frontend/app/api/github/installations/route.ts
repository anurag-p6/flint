import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const installRes = await fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `token ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Flint",
      },
    })

    if (!installRes.ok) {
      const text = await installRes.text()
      console.error("installations error:", installRes.status, text)
      return NextResponse.json({ error: text, repos: [] }, { status: installRes.status })
    }

    const installData = await installRes.json()
    const installations = installData.installations || []

    const repos: any[] = []

    for (const inst of installations) {
      const reposRes = await fetch(
        `https://api.github.com/user/installations/${inst.id}/repositories`,
        {
          headers: {
            Authorization: `token ${session.accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Flint",
          },
        },
      )

      if (!reposRes.ok) {
        console.error("repos error for installation", inst.id, await reposRes.text())
        continue
      }

      const reposData = await reposRes.json()
      const repoList = reposData.repositories || []

      for (const r of repoList) {
        repos.push({
          id: r.id,
          name: r.full_name,
          fullName: r.full_name,
          owner: r.owner?.login || "",
          avatar: r.owner?.avatar_url || "",
        })
      }
    }

    return NextResponse.json({ repos })
  } catch (error) {
    console.error("Error:", error)
    return NextResponse.json({ error: "Internal server error", repos: [] }, { status: 500 })
  }
}
