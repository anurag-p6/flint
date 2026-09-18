// Pure helpers for the grant race board + progress graph. Dependency-free
// (no @/ imports) so node check scripts can import this file directly.

/// 0..1 progress of money released. Guards divide-by-zero.
export function racePct(released: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  const pct = Number((released * 10000n) / total) / 10000;
  return Math.min(1, Math.max(0, pct));
}

/// Fraction of a timestamp within [start, end], clamped 0..1.
export function timeFrac(at: number, start: number, end: number): number {
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (at - start) / (end - start)));
}

export interface PrPoint {
  n: number;
  createdAt: number | null; // unix seconds
  mergedAt: number | null; // unix seconds
}

/// Cumulative merged-PR curve: sorted (at, mergedCount/totalPRs) steps.
/// Empty input → empty curve (graph renders the axis only).
export function mergedCurve(prs: PrPoint[]): { at: number; frac: number }[] {
  const total = prs.length;
  if (total === 0) return [];
  const merged = prs
    .filter((p) => p.mergedAt !== null)
    .sort((a, b) => (a.mergedAt as number) - (b.mergedAt as number));
  return merged.map((p, i) => ({ at: p.mergedAt as number, frac: (i + 1) / total }));
}
