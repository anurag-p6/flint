// Acceptance checks for grant fan-out math (lib/payout.ts).
// Run: node scripts/check-grant-split.mjs (Node 22+ strips types natively)
import { splitEqual, formatUsdcExact, calculatePayoutPreview } from "../lib/payout.ts";

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`ok   ${name}`);
  else { console.log(`FAIL ${name}`); failures++; }
}

// 10 USDC across 2 assignees: exact halves, no dust.
let s = splitEqual(10000000n, 2);
check("2-way exact", s.length === 2 && s[0] === 5000000n && s[1] === 5000000n);
check("2-way sums", s[0] + s[1] === 10000000n);

// 10 USDC across 3: dust (1 base unit) lands on last.
s = splitEqual(10000000n, 3);
check("3-way sums", s[0] + s[1] + s[2] === 10000000n);
check("3-way dust-last", s[2] - s[0] === 1n);

// Single grantee: identity.
s = splitEqual(10000000n, 1);
check("single unchanged", s.length === 1 && s[0] === 10000000n);

// Formatting round-trips through parseUnits-style decimals.
check("fmt whole", formatUsdcExact(5000000n) === "5");
check("fmt frac", formatUsdcExact(3333334n) === "3.333334");
check("fmt dust", formatUsdcExact(1n) === "0.000001");

// Preview still policy-exact (dashboard table depends on it).
const prev = calculatePayoutPreview([4000000n, 1000000n], 10000000n, false);
check("preview sums", prev[0] + prev[1] === 10000000n);
check("preview proportional", prev[0] === 8000000n && prev[1] === 2000000n);

process.exit(failures ? 1 : 0);
