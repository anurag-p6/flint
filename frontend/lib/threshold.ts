// Quality gate for grant milestones: the grantee's on-chain TEE score must
// clear the issue threshold before the keeper verifies. Dependency-free
// (no @/ imports) so node check scripts can import it directly.
//
// Units: on-chain scores are scaled by FlintEscrow.SCORE_SCALE (1e6);
// thresholds are plain 0–100 like the issue footer. Compare in scaled units
// — never divide first (precision).

export const SCORE_SCALE = 1000000n;

/** Issue default when no `threshold:` footer is present. */
export const DEFAULT_THRESHOLD = 60;

export function thresholdOrDefault(t: number | null | undefined): number {
  return typeof t === "number" && Number.isFinite(t) ? t : DEFAULT_THRESHOLD;
}

/** True when a scaled on-chain score clears a 0–100 threshold. */
export function meetsThreshold(scoreScaled: bigint, threshold: number): boolean {
  return scoreScaled >= BigInt(Math.round(threshold)) * SCORE_SCALE;
}

/** Human "42.5 / 60" for logs and skip reasons. */
export function describeGate(scoreScaled: bigint, threshold: number): string {
  const points = Number(scoreScaled) / Number(SCORE_SCALE);
  const shown = Math.round(points * 10) / 10;
  return `${shown}<${threshold}`;
}
