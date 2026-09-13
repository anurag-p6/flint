import { getCachedScores } from "@/lib/scorer/cache"

export async function GET(request: Request) {
  const repo = new URL(request.url).searchParams.get("repo") ?? ""
  if (!repo.includes("/")) {
    return Response.json({ error: "Missing repo (owner/repo)" }, { status: 400 })
  }
  const cached = getCachedScores(repo)
  if (!cached) return Response.json({ found: false, details: [] })
  return Response.json({ found: true, ...cached })
}
