# Flint GitHub App — Install-Only Repo Connection (Option A)

> Dashboard shows repo info where the Flint GitHub App is installed. No OAuth login, no user sessions, no PAT paste. GitHub App installation flow only.

## 1. Why this option

- Flint already needs a GitHub App for webhooks (`pull_request`, `pull_request_review`, `issues`, `issue_comment`).
- The same App identity can answer "which repos am I installed on?" via installation tokens.
- Dashboard needs repo-level data, not user-level data. No `Login with GitHub` required.
- Claim/assign binds via `CONTRIBUTORS.md + FlintIdentity` (wallet mapping), not via OAuth token.
- All GitHub writes (label, comment, assign) happen server-side with the installation token. User only signs on-chain txs (Ledger / wallet).

If dashboard ever needs to act *as the user* (e.g. close issue as user), upgrade to OAuth (Option B). Until then, stay here.

## 2. Architecture

```
Maintainer clicks "Connect repo"
  -> github.com/apps/<flint-app>/installations/new
  -> selects repo(s) -> GitHub redirects to
     <BACKEND>/api/github/callback?installation_id=12345&setup_action=install
  -> backend mints App JWT -> exchanges for installation token
  -> GET /installation/repositories + GET /repos/{owner}/{repo}
  -> stores installation_id <-> owner/repo <-> repoId <-> escrow/grant
  -> redirects to dashboard?repo=owner/repo
  -> dashboard fetches repo info + open flint issues from backend

Webhooks (issues.opened/edited/closed/labeled/assigned, pull_request, issue_comment)
  -> carry installation.id -> backend looks up repo mapping -> updates task browser
```

## 3. GitHub App configuration

Create at `github.com/settings/apps` (one App for dev + one for prod, or single App with separate installs).

**General:**
- Name: `flint-dev` (prod: `flint`)
- Homepage URL: `https://your-dashboard.vercel.app`
- Callback URL: not used (no OAuth), leave blank
- Setup URL (optional but recommended): `https://your-backend/api/github/callback`
- Webhook URL: `https://your-backend/api/github/webhook`
- Webhook secret: generate, store as `GITHUB_WEBHOOK_SECRET`

**Permissions (read-only minimum):**
- `pull_requests: read` — PR data, diffs, merge status
- `issues: read` — issue open/close/label (milestone source of truth)
- `contents: read` — file diffs, `CONTRIBUTORS.md` wallet mapping
- `metadata: read` — repo info (required)

**Optional (only if agent comments/labels/assigns):**
- `issues: write` — add `flint-tracked`, `flint-verified` labels, post bounty comment
- `pull_requests: write` — post scoring comment (skip for hackathon unless needed)

**Events (subscribe):**
- `pull_request` (opened, closed, synchronize)
- `pull_request_review` (submitted)
- `issues` (opened, edited, closed, labeled, assigned)
- `issue_comment` (created)

**Install link (used by dashboard button):**
```
https://github.com/apps/<flint-app>/installations/new
```

## 4. Backend environment

```bash
# GitHub App identity (from App settings page)
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=whsec_...

# Public URLs
BACKEND_PUBLIC_URL=https://your-backend.fly.dev
FRONTEND_URL=https://your-dashboard.vercel.app
```

> Never commit the private key. Use `.env` locally, secret manager in prod. The `chainlink-cre/.env` `SECRET_GITHUB_TOKEN` PAT is a fallback for local dev only — installation tokens replace it in prod.

## 5. Backend implementation (Node.js + Octokit)

```bash
npm i @octokit/app @octokit/rest
```

```ts
// lib/github.ts
import { App } from "@octokit/app";

export const flintApp = new App({
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"),
});

// Short-lived installation token (expires in 1h, cache it)
export async function getInstallationOctokit(installationId: number) {
  return flintApp.getInstallationOctokit(installationId);
}
```

```ts
// api/github/callback.ts
import { flintApp, getInstallationOctokit } from "./lib/github";

export async function handleCallback(installationId: number) {
  const octokit = await getInstallationOctokit(installationId);

  // 1. List repos on this installation
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation();
  // data.repositories: [{ id, full_name, private, ... }]

  // 2. Enrich one repo (for dashboard header)
  const [owner, repo] = data.repositories[0].full_name.split("/");
  const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });

  // 3. Persist mapping (DB or JSON for hackathon):
  // installation_id -> [{ repoId(github repo id), full_name, owner, repo }]
  // repo full_name -> FlintEscrow repoId (keccak256("repo:"+full_name)) / FlintGrant grantId
  await db.upsertInstallation(installationId, data.repositories);

  return { repositories: data.repositories, repoInfo };
  // then redirect: 302 FRONTEND_URL/dashboard?repo=owner/repo&installation_id=...
}
```

```ts
// api/repos/[owner]/[repo].ts — dashboard data source
export async function getRepoView(owner: string, repo: string) {
  const installationId = await db.getInstallationId(owner, repo);
  const octokit = await getInstallationOctokit(installationId);

  const [{ data: info }, { data: issues }] = await Promise.all([
    octokit.rest.repos.get({ owner, repo }),
    octokit.rest.issues.listForRepo({
      owner, repo, state: "open", labels: "flint-bounty", per_page: 50,
    }),
  ]);

  return {
    name: info.full_name,
    avatar: info.owner.avatar_url,
    stars: info.stargazers_count,
    openIssues: info.open_issues_count,
    bountyIssues: issues.map(i => ({
      number: i.number,
      title: i.title,
      assignee: i.assignee?.login ?? null,
      labels: i.labels.map(l => typeof l === "string" ? l : l.name),
      url: i.html_url,
    })),
  };
}
```

### Token caching

- Installation tokens live 60 min. Cache per `installationId` with 50-min TTL.
- `App.getInstallationOctokit()` handles caching automatically — prefer it over manual `createInstallationAccessToken`.

## 6. Issue-as-milestone convention

Maintainer creates an issue; agent parses it; dashboard lists it. No milestone form.

**Recommended issue template** (`.github/ISSUE_TEMPLATE/flint-bounty.yml`):

```yaml
name: Flint bounty
labels: ["flint-bounty"]
body:
  - type: input
    id: amount
    attributes: { label: Amount (USDC), placeholder: "300" }
  - type: input
    id: deadline
    attributes: { label: Deadline (YYYY-MM-DD), placeholder: "2026-10-01" }
  - type: textarea
    id: scope
    attributes: { label: Acceptance criteria }
```

Agent parses `<!-- flint: amount=300USDC deadline=2026-10-01 -->` footer or the labels `flint-bounty-300`, `flint-deadline-2026-10-01`. On `issues.opened`:

1. Verify `installation.id` maps to a known repo.
2. Post confirmation comment + `flint-tracked` label (if `issues:write` granted).
3. Call `FlintGrant.addMilestone(grantId, issueNumber, description, trancheBps, deadline)` or create escrow pool entry (depends on grant-per-repo vs grant-per-grantee decision).
4. Dashboard task browser picks it up via webhook push or 30s poll of `GET /api/repos/{owner}/{repo}`.

**Claim flow:** dashboard `Claim` button → checks `FlintIdentity.getWallet(githubUsername)` → tx binds wallet → backend sets GitHub assignee via installation token. First-claim-wins or maintainer-approves (lock this before build).

**Verify flow:** `issues.closed as completed` + linked merged PR → verifier calls `FlintGrant.verifyMilestone` → dashboard shows `Verified ●` → `Approve Tranche` (Ledger) appears.

## 7. Dashboard wiring (flint-ui)

- Sidebar bottom: show `owner/repo` (mono, truncated) + network `Base Sepolia ●` + installation status dot. No wallet/user section needed for repo display.
- `Connect repo` — secondary button → opens install link in new tab. After redirect, read `?repo=` param, call `GET /api/repos/{owner}/{repo}`.
- Loading state: single `Loading...` line in `gray-400` (per UI skill, no skeletons).
- Error states (exact copy): `App not installed on this repo — install at github.com/apps/flint` / `Installation expired — reconnect repo`.
- Tables reuse existing spec: bounty browser `Issue | Bounty | Deadline | Assignee | Status`, amounts as `300 USDC`, links as accent text.

## 8. Testing checklist

- [ ] Install App on a test repo, confirm redirect carries `installation_id`.
- [ ] `GET /api/repos/{owner}/{repo}` returns name, avatar, stars without any user login.
- [ ] Open `flint-bounty` issue → webhook received → appears in dashboard < 60s.
- [ ] Uninstall App → dashboard shows `App not installed` error, no crash.
- [ ] Token expiry (wait 1h or force) → next request refreshes silently.
- [ ] Private repo → 404 handled as `No access — reinstall with repo access`.

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `404 Not Found` on repo fetch | Installation token for wrong install, or repo not granted | Reinstall via install link, check `listReposAccessibleToInstallation` |
| `401 Bad credentials` | App JWT clock skew or malformed private key | Fix `\n` newlines in env, check server time, confirm App ID |
| Webhook never arrives | Webhook URL / secret mismatch, or event not subscribed | Check App Advanced → Recent Deliveries, verify secret, enable `issues` events |
| Empty repo list | User installed on account but granted zero repos | Prompt to `Configure` install and grant repo access |
| Rate limit `403` | Polling too fast across many repos | Webhook-push instead of poll; cache repo info 5 min |

## 10. Scope guardrails

- Do NOT add OAuth (`auth.js`/`next-auth`) in this phase. It doubles review surface for judges with zero demo payoff.
- Do NOT request `administration` or `code:write`. Read-only + optional `issues:write` keeps install friction low.
- Do NOT store installation tokens in DB. Cache in memory only; re-mint on demand.
