// Acceptance checks for lib/live-bus.ts (live identity beat).
// Run: node scripts/check-live-bus.mjs  (Node 22+ strips types natively)
import { emitLive, subscribeLive, touchesContributorsMd } from "../lib/live-bus.ts";

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`ok   ${name}`);
  else { console.log(`FAIL ${name}`); failures++; }
}

// touchesContributorsMd — path filter
check("added CONTRIBUTORS.md", touchesContributorsMd({ commits: [{ added: ["CONTRIBUTORS.md"], modified: [], removed: [] }] }));
check("nested path counts", touchesContributorsMd({ commits: [{ added: [], modified: ["docs/CONTRIBUTORS.md"], removed: [] }] }));
check("case-insensitive", touchesContributorsMd({ commits: [{ added: [], modified: [], removed: ["contributors.md"] }] }));
check("unrelated files ignored", !touchesContributorsMd({ commits: [{ added: ["README.md"], modified: ["src/x.ts"], removed: [] }] }));
check("no commits → false", !touchesContributorsMd({}));
check("missing arrays → false", !touchesContributorsMd({ commits: [{}] }));
check("non-string entries ignored", !touchesContributorsMd({ commits: [{ added: [null, 42] }] }));

// bus — repo-keyed delivery + normalization
let got = [];
const off = subscribeLive("Owner/Repo", (m) => got.push(m));
emitLive("owner/repo", "identity");
check("same-repo delivery (case-insensitive)", got.length === 1 && got[0].type === "identity" && got[0].repo === "owner/repo");
emitLive("other/repo", "identity");
check("other-repo isolated", got.length === 1);
off();
emitLive("owner/repo", "identity");
check("unsubscribe works", got.length === 1);
check("emit with no listeners is safe", (() => { emitLive("ghost/repo", "grants"); return true; })());

process.exit(failures ? 1 : 0);
