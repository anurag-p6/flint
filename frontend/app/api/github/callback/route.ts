import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const installationId = url.searchParams.get("installation_id")
  const setupAction = url.searchParams.get("setup_action")

  if (!installationId) {
    return NextResponse.json({ error: "Missing installation_id" }, { status: 400 })
  }

  console.log(`GitHub App installed: installation_id=${installationId}, action=${setupAction}`)

  const origin = new URL(request.url).origin
  return NextResponse.redirect(
    `${origin}/dashboard?installation_id=${installationId}`,
  )
}
