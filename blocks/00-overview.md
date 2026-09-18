# Flint Agentic Grant Pipeline — Build Blocks

## Spec (locked)

1. Maintainer opens a `flint` issue: sub-milestones with release % each, grantee GitHub in the body.
2. Issue lists on the site with a grant timeline.
3. Maintainer reviews milestones + amounts on site, signs once, funds the escrow.
4. Grantee shown on site (GitHub → wallet via FlintIdentity, or "unclaimed").
5. Each PR references the issue number; merged PRs show on site; CRE LLM scores the work.
6. At disbursement, maintainer reviews the score and releases each tranche.
7. Ghosting backstop: verified-but-unpaid tranches auto-release 14 days after verification.

## Key findings (do not re-decide)

- **No contract changes needed.** One issue = one grant with N sub-milestones fits
  `createGrant` exactly (bps must sum to 10000, enforced on-chain).
- **Real bug:** `ReleaseTrancheButton` passes `"0x"` as signature — Block 01 fixes it first.
- **No `addMilestone` exists** — sub-milestones are fixed at funding time. Matches the spec.
- **`reclaimUndisbursed` is grantor-only** — keeper fires `autoRelease` but only surfaces
  reclaim (dashboard button for grantor).
- **Server GitHub access = PAT + webhook secret.** Full GitHub App is deferred post-hackathon.
- **Forge can't simulate native-USDC `transferFrom`** (compliance precompile) — on-chain
  writes via `cast send`, reads via `cast call`. See `contracts/ARC_DEPLOY.md` §10.

## Execution order (numbered files)

| # | Block | Why this order |
|---|-------|----------------|
| 01 | Release signing fix | Only actually-broken thing; unlocks the demo release |
| 02 | Issue spec + shared parser | Every later block imports it |
| 03 | Webhook hardening | Produces the events the keeper consumes |
| 04 | Pending grants + timeline UI | Visible payoff: issue → fundable card → timeline |
| 05 | Keeper (verify + timeout) | The autonomous agent leg |
| 06 | Tests | Unit + dry-run + live loop checklist |
| 07 | Docs/diagram/video | Submission assets |

Work top to bottom. Each file lists exact files, steps, and acceptance criteria.
A block is done only when its acceptance checks pass.

## Keys / env needed (collect once)

| Var | Where | Purpose |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | frontend `.env` | HMAC verification of webhooks (generate: `openssl rand -hex 32`) |
| `GITHUB_SERVER_PAT` | frontend `.env` | Server-side issue/PR reads (fine-grained, read-only; can reuse `SECRET_GITHUB_TOKEN` value) |
| `KEEPER_PRIVATE_KEY` | frontend `.env` | Keeper EOA: calls `verifyMilestone` + `autoRelease` on Arc (needs Arc USDC for gas; can start as deployer key) |
| `KEEPER_CRON_SECRET` | frontend `.env` | Bearer token protecting `/api/keeper` (random string) |

## Manual ops (not code, do not forget)

1. `setVerifier(keeperAddress, true)` on the Arc FlintGrant
   (`0x850fB024B03310A17888EC5174B93dDB90Fa91ed`) — else keeper verifies revert.
2. When a grant is funded, add the grantee wallet to `contributorMapping` in
   `chainlink-cre/flint-scorer/config.staging.json` so the existing DON scorer
   covers their PRs for the disbursement-time score display.
3. Fund the keeper key with Arc USDC (gas) from `faucet.circle.com`.
4. cron-job.org → `POST https://<app>/api/keeper` with
   `Authorization: Bearer <KEEPER_CRON_SECRET>`, every 10–15 min.

## Arc addresses (testnet `5042002`)

- Escrow `0xA6872e0f927926CA850c970fdb06E9AD3B03FE12`
- Grant `0x850fB024B03310A17888EC5174B93dDB90Fa91ed`
- Receiver `0x34244c939061da16Db12AFD5E57ccf9775e3E0B4`
- Receipt `0xD1758e1205f79C4F2dAc8f6b7D32A2E517835851`
- Identity `0xcd7Eb5099ab4d486D32F312F4980bB9384Ec431e` (Base Sepolia; re-check on Arc — see Block 04)
- USDC `0x3600000000000000000000000000000000000000`
