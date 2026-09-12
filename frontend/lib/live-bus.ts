// Server-only repo-keyed event bus for live UI (no DB, no extra infra).
// Webhook handlers emit; /api/live/stream subscribers receive.
// NOTE: in-memory — correct on localhost / single instance. On multi-instance
// serverless the client poll fallback covers missed events.
// globalThis singleton survives Next dev HMR module reloads.

export type LiveMessage =
  | { type: "identity"; repo: string; at: number }
  | { type: "grants"; repo: string; at: number };

type Listener = (msg: LiveMessage) => void;

interface BusState {
  byRepo: Map<string, Set<Listener>>;
}

function state(): BusState {
  const g = globalThis as unknown as { __flintLiveBus?: BusState };
  if (!g.__flintLiveBus) g.__flintLiveBus = { byRepo: new Map() };
  return g.__flintLiveBus;
}

function key(repo: string): string {
  return repo.trim().toLowerCase();
}

export function emitLive(repo: string, type: LiveMessage["type"]): void {
  const msg = { type, repo, at: Date.now() } as LiveMessage;
  const listeners = state().byRepo.get(key(repo));
  if (!listeners || listeners.size === 0) return;
  for (const fn of [...listeners]) {
    try {
      fn(msg);
    } catch (err) {
      console.error("live-bus listener error:", err);
    }
  }
}

export function subscribeLive(repo: string, fn: Listener): () => void {
  const s = state();
  const k = key(repo);
  let set = s.byRepo.get(k);
  if (!set) {
    set = new Set();
    s.byRepo.set(k, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) s.byRepo.delete(k);
  };
}

/** Pure helper — is this push payload touching CONTRIBUTORS.md? Unit-tested. */
export function touchesContributorsMd(body: Record<string, any>): boolean {
  const commits = body.commits;
  if (!Array.isArray(commits)) return false;
  return commits.some((c: any) => {
    const files: unknown[] = [
      ...(Array.isArray(c.added) ? c.added : []),
      ...(Array.isArray(c.modified) ? c.modified : []),
      ...(Array.isArray(c.removed) ? c.removed : []),
    ];
    return files.some((f) => typeof f === "string" && f.split("/").pop()?.toLowerCase() === "contributors.md");
  });
}
