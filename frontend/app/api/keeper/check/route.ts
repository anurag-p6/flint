import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"

/// Logged-in maintainer trigger: re-run the keeper verify pass.
/// Used when a PR was merged before the issue listed it (or the webhook missed).
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Sign in to check work" }, { status: 401 })
  }
  const secret = process.env.KEEPER_CRON_SECRET
  const appUrl = process.env.APP_URL ?? "http://localhost:3000"
  if (!secret) {
    return NextResponse.json({ error: "KEEPER_CRON_SECRET is not set" }, { status: 500 })
  }

  let repo = ""
  try {
    const body = await request.json()
    if (typeof body?.repo === "string") repo = body.repo
  } catch {
    // no body
  }

  const headers = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  }
  const res = await fetch(`${appUrl}/api/keeper`, {
    method: "POST",
    headers,
    body: JSON.stringify({ reason: "manual-check" }),
  })
  const data = await res.json().catch(() => ({}))
  if (repo.includes("/")) {
    fetch(`${appUrl}/api/scorer/run`, {
      method: "POST",
      headers: { ...headers, "x-flint-scorer": "1" },
      body: JSON.stringify({ repo }),
    }).catch(() => {})
  }
  return NextResponse.json(data, { status: res.status })
}
