// Acceptance checks for lib/issue-spec.ts (Block 02).
// Run: node scripts/check-issue-spec.mjs   (.mjs so tsc ignores it;
// Node 24 strips types from the imported .ts directly.)
import { parseIssueSpec, parseLinkedPRs, parseDeadline } from "../lib/issue-spec.ts";

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`ok   ${name}`);
  else { console.log(`FAIL ${name} ${extra}`); failures++;
  }
}

const multi = `## Milestone: Ship auth module
Build OAuth login and session management. closes #12
release: 50%

## Milestone: Security audit
External review of the auth code. fixes #34
release: 50%

<!-- flint
grantee: octocat
deadline: 2026-10-01
amount: 500
-->`;
const s1 = parseIssueSpec(multi);
check("multi: 2 milestones", s1.milestones.length === 2);
check("multi: bps 5000/5000", s1.milestones[0].releaseBps === 5000 && s1.milestones[1].releaseBps === 5000);
check("multi: grantee", s1.grantee === "octocat", s1.grantee);
check("multi: deadline+amount", s1.deadline === "2026-10-01" && s1.amount === 500);
check("multi: linked PRs", JSON.stringify(s1.milestones[0].linkedPRs) === "[12]" && JSON.stringify(s1.milestones[1].linkedPRs) === "[34]");
check("multi: no errors", s1.errors.length === 0, JSON.stringify(s1.errors));

const dec = `## Milestone: A\nrelease: 2.5%\n## Milestone: B\nrelease: 97.5%\n<!-- flint\namount: 100\n-->`;
const s2 = parseIssueSpec(dec);
check("decimals: 250/9750", s2.milestones[0].releaseBps === 250 && s2.milestones[1].releaseBps === 9750);
check("decimals: no errors", s2.errors.length === 0, JSON.stringify(s2.errors));

const legacy = `Fix the login bug. closes #7\n\n<!-- flint\nrelease: 25%\namount: 200\n-->`;
const s3 = parseIssueSpec(legacy);
check("fallback: single 100%", s3.milestones.length === 1 && s3.milestones[0].releaseBps === 10000);
check("fallback: linked PRs", JSON.stringify(s3.milestones[0].linkedPRs) === "[7]");

const bad = `## Milestone: A\nrelease: 30%\n## Milestone: B\nrelease: 30%\n<!-- flint\ndeadline: 2026-13-99\n-->`;
const s4 = parseIssueSpec(bad);
check("bad sum flagged", s4.errors.some((e) => e.includes("must sum to 100%")), JSON.stringify(s4.errors));
check("bad date flagged", s4.errors.some((e) => e.includes("Invalid deadline")), JSON.stringify(s4.errors));

const missing = `## Milestone: A\nNo release line here.\n## Milestone: B\nrelease: 100%`;
const s5 = parseIssueSpec(missing);
check("missing release flagged", s5.errors.some((e) => e.includes("missing release")), JSON.stringify(s5.errors));

check("parseDeadline valid", parseDeadline("2026-10-01") === Date.UTC(2026, 9, 1) / 1000);
check("parseDeadline bogus", parseDeadline("2026-02-30") === null);
check("parseLinkedPRs dedupes", JSON.stringify(parseLinkedPRs("closes #5 and #5, see #9")) === "[5,9]");

process.exit(failures ? 1 : 0);
