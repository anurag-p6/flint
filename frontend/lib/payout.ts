/// Payout preview math mirroring the on-chain policies exactly
/// (ProportionalPolicy / SqrtPolicy: weight share, remainder dust to last,
/// zero total weight pays everyone zero).

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

export function calculatePayoutPreview(
  scores: bigint[],
  totalPool: bigint,
  useSqrt: boolean,
): bigint[] {
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
