import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const event = request.headers.get("x-github-event")
  const body = await request.json()

  console.log(`Webhook received: ${event}`, {
    action: body.action,
    repo: body.repository?.full_name,
    installation: body.installation?.id,
  })

  // For hackathon: log events. Production would verify signature and process.
  return NextResponse.json({ ok: true })
}
