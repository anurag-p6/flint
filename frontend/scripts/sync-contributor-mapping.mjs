// Syncs CRE contributorMapping from a repo's CONTRIBUTORS.md.
// Eligibility rule: only wallets listed here can ever be submitted/scored/paid.
//   node scripts/sync-contributor-mapping.mjs --repo owner/repo [--env staging|production|both] [--write]
// Without --write: prints the diff and exits 0 (diff) / 2 (fetch failed).
// Reads GITHUB_SERVER_PAT from frontend/.env (local only, never printed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseContributorsMd, diffMappings } from "../lib/contributor-mapping.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = root;

function flag(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}
const has = (name) => process.argv.includes(name);

const repo = flag("--repo");
const envSel = flag("--env") ?? "both";
const write = has("--write");
if (!repo || !repo.includes("/")) {
  console.error("usage: sync-contributor-mapping.mjs --repo owner/repo [--env staging|production|both] [--write]");
  process.exit(2);
}
const envs = envSel === "both" ? ["staging", "production"] : [envSel];
if (!envs.every((e) => ["staging", "production"].includes(e))) {
  console.error("--env must be staging, production, or both");
  process.exit(2);
}

// Token: local .env only.
let pat = null;
try {
  const envText = fs.readFileSync(path.join(FRONTEND, ".env"), "utf8");
  pat = envText.match(/^GITHUB_SERVER_PAT=(.+)$/m)?.[1]?.trim() || null;
} catch { /* missing .env */ }
if (!pat) {
  console.error("GITHUB_SERVER_PAT not found in frontend/.env");
  process.exit(2);
}

const gh = await fetch(`https://api.github.com/repos/${repo}/contents/CONTRIBUTORS.md`, {
  headers: { Authorization: `token ${pat}`, Accept: "application/vnd.github.v3+json", "User-Agent": "Flint" },
});
if (gh.status === 404) {
  console.error(`CONTRIBUTORS.md missing in ${repo} — mapping untouched (payable set unchanged)`);
  process.exit(2);
}
if (!gh.ok) {
  console.error(`GitHub fetch failed: ${gh.status}`);
  process.exit(2);
}
const content = Buffer.from((await gh.json()).content, "base64").toString("utf-8");
const mapping = parseContributorsMd(content);
const [owner, name] = repo.split("/");

let failed = false;
for (const e of envs) {
  const file = path.join(root, "..", "chainlink-cre", "flint-scorer", `config.${e}.json`);
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.error(`cannot read ${file}`);
    failed = true;
    continue;
  }
  const d = diffMappings(cfg.contributorMapping ?? {}, mapping);
  console.log(`[${e}] repo ${cfg.repoOwner}/${cfg.repoName} -> ${owner}/${name}`);
  console.log(`[${e}] added: ${d.added.join(", ") || "(none)"}`);
  console.log(`[${e}] removed: ${d.removed.join(", ") || "(none)"}`);
  console.log(`[${e}] changed: ${d.changed.join(", ") || "(none)"} | total payable: ${Object.keys(mapping).length}`);
  if (write) {
    cfg.repoOwner = owner;
    cfg.repoName = name;
    cfg.contributorMapping = mapping;
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
    console.log(`[${e}] wrote ${file} — redeploy workflow for TEE pickup: cre workflow deploy`);
  }
}
if (!write) console.log("dry run — pass --write to update configs");
process.exit(failed ? 2 : 0);
