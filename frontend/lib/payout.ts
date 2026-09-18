/// Payout preview math mirroring the on-chain policies exactly
/// (ProportionalPolicy / SqrtPolicy: weight share, remainder dust to last,
/// zero total weight pays everyone zero. EqualPolicy: ignore scores, split N ways).

import type { PolicyId } from "@/lib/policy"

function isqrt(x: bigint): bigint {
  if (x < 2n) return x;
  let y = x;
  let z = (x + 1n) / 2n;
  while (z < y) {
    y = z;
    z = (x / z + z) / 2n;
  }
  return y;
}

/// Equal split of a total across N payees; dust remainder goes to the last
/// (same convention as calculatePayoutPreview).
export function splitEqual(total: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const share = total / BigInt(n);
  return Array.from({ length: n }, (_, i) =>
    i === n - 1 ? total - share * BigInt(n - 1) : share,
  );
}

/// Exact bigint → "12.5"-style decimal (6dp trim) so parseUnits round-trips.
export function formatUsdcExact(raw: bigint): string {
  const whole = raw / 1000000n;
  const frac = (raw % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function calculatePayoutPreview(
  scores: bigint[],
  totalPool: bigint,
  policy: PolicyId | boolean,
): bigint[] {
  if (policy === "equal") return splitEqual(totalPool, scores.length)
  const useSqrt = policy === true || policy === "sqrt"
  const weights = useSqrt ? scores.map(isqrt) : [...scores];
  const total = weights.reduce((a, b) => a + b, 0n);
  const payouts = new Array<bigint>(scores.length).fill(0n);
  if (total === 0n) return payouts;
  let distributed = 0n;
  for (let i = 0; i < scores.length; i++) {
    if (i === scores.length - 1) {
      payouts[i] = totalPool - distributed;
    } else {
      payouts[i] = (weights[i] * totalPool) / total;
      distributed += payouts[i];
    }
  }
  return payouts;
}
