// Acceptance checks for lib/grant-timeline.ts (grant race board + graph).
// Run: node scripts/check-grant-timeline.mjs (Node 22+ strips types natively)
import { racePct, timeFrac, mergedCurve } from "../lib/grant-timeline.ts";

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`ok   ${name}`);
  else { console.log(`FAIL ${name} ${extra}`); failures++; }
}

check("race half", racePct(5000000n, 10000000n) === 0.5);
check("race full", racePct(10000000n, 10000000n) === 1);
check("race zero-total", racePct(0n, 0n) === 0);
check("race clamps over", racePct(12000000n, 10000000n) === 1);
check("frac mid", timeFrac(150, 100, 200) === 0.5);
check("frac clamps", timeFrac(50, 100, 200) === 0 && timeFrac(250, 100, 200) === 1);
check("frac degenerate", timeFrac(100, 100, 100) === 0);

const curve = mergedCurve([
  { n: 3, createdAt: 100, mergedAt: 300 },
  { n: 5, createdAt: 120, mergedAt: null },
  { n: 7, createdAt: 140, mergedAt: 200 },
]);
check("curve sorts by merge time", curve.length === 2 && curve[0].at === 200 && curve[1].at === 300, JSON.stringify(curve));
check("curve cumulative", curve[0].frac === 1 / 3 && curve[1].frac === 2 / 3);
check("curve empty", mergedCurve([]).length === 0);
check("curve none-merged", mergedCurve([{ n: 1, createdAt: 5, mergedAt: null }]).length === 0);

process.exit(failures ? 1 : 0);
