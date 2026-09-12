import { NextResponse } from "next/server";
import { subscribeLive, type LiveMessage } from "@/lib/live-bus";

export const dynamic = "force-dynamic";

// GET /api/live/stream?repos=owner/repo,owner2/repo2
// Server-sent events: {type:"identity"|"grants", repo} + :heartbeat comments.
// Public data only (logins/avatars/grants) — no secrets cross this channel.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repos = (searchParams.get("repos") ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.includes("/"))
    .slice(0, 10);

  if (repos.length === 0) {
    return NextResponse.json({ error: "Missing repos param" }, { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (msg: LiveMessage) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch {
          // Client gone — cleanup below handles unsubscribe.
        }
      };
      const unsubs = repos.map((repo) => subscribeLive(repo, send));
      const beat = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`:heartbeat\n\n`));
        } catch {
          // Client gone.
        }
      }, 25000);

      const cleanup = () => {
        clearInterval(beat);
        for (const off of unsubs) off();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      // request.signal fires on client disconnect.
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
