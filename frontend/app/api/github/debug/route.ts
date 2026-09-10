import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: "No session or access token" })
  }

  const [userRes, installRes] = await Promise.all([
    fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Flint",
      },
    }),
    fetch("https://api.github.com/user/installations", {
      headers: {
        Authorization: `token ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Flint",
      },
    }),
  ])

  const user = await userRes.json()
  const installations = await installRes.json()

  return NextResponse.json({
    tokenPrefix: (session.accessToken as string).slice(0, 8),
    user: user.login,
    installationsStatus: installRes.status,
    totalInstallations: installations.total_count ?? "error",
    installations: installations.installations?.map((i: any) => ({
      id: i.id,
      account: i.account?.login,
      repositoriesUrl: i.repositories_url,
    })) ?? installations,
  })
}
