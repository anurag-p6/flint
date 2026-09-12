// Shared wallet → GitHub identity resolution for the Universe (/network).
// Merge order: caller-known pairs → in-memory cache → /api/identity/batch
// (CONTRIBUTORS.md per repo, server PAT) → null (UI falls back to address).

export interface ResolvedIdentity {
  login: string | null;
  avatarUrl: string | null;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { v: ResolvedIdentity; exp: number }>();

export function avatarFor(login: string): string {
  return `https://github.com/${login}.png`;
}

export function shortAddress(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

function getCached(wallet: string): ResolvedIdentity | undefined {
  const hit = cache.get(wallet);
  if (!hit) return undefined;
  if (Date.now() > hit.exp) {
    cache.delete(wallet);
    return undefined;
  }
  return hit.v;
}

/** Drop cached identities (all, or just `wallets`) — e.g. on a live push event. */
export function invalidateIdentities(wallets?: string[]): void {
  if (!wallets) {
    cache.clear();
    return;
  }
  for (const raw of wallets) cache.delete(raw.toLowerCase());
}

/**
 * Resolve wallets to GitHub logins with ONE server call, not N.
 * @param wallets raw addresses (any case)
 * @param opts.known pre-known wallet(lower) → login pairs (e.g. grant grantees)
 * @param opts.repos owner/repo slugs whose CONTRIBUTORS.md should be searched
 */
export async function resolveLogins(
  wallets: string[],
  opts?: { known?: Record<string, string>; repos?: string[] },
): Promise<Record<string, ResolvedIdentity>> {
  const out: Record<string, ResolvedIdentity> = {};
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const raw of wallets) {
    const w = raw.toLowerCase();
    if (seen.has(w)) continue;
    seen.add(w);
    const knownLogin = opts?.known?.[w];
    if (knownLogin) {
      const v = { login: knownLogin, avatarUrl: avatarFor(knownLogin) };
      out[w] = v;
      cache.set(w, { v, exp: Date.now() + TTL_MS });
      continue;
    }
    const hit = getCached(w);
    if (hit) {
      out[w] = hit;
      continue;
    }
    missing.push(w);
  }

  if (missing.length > 0) {
    try {
      const params = new URLSearchParams({ wallets: missing.join(",") });
      if (opts?.repos?.length) params.set("repos", opts.repos.join(","));
      const res = await fetch(`/api/identity/batch?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { identities?: Record<string, ResolvedIdentity | null> };
        for (const w of missing) {
          const v = data.identities?.[w] ?? { login: null, avatarUrl: null };
          out[w] = v;
          cache.set(w, { v, exp: Date.now() + TTL_MS });
        }
      } else {
        throw new Error(`identity-batch-${res.status}`);
      }
    } catch {
      for (const w of missing) {
        if (!out[w]) {
          const v = { login: null, avatarUrl: null };
          out[w] = v;
          cache.set(w, { v, exp: Date.now() + TTL_MS });
        }
      }
    }
  }

  return out;
}
