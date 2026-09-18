# Block 05 — Keeper (LIVE-PROVEN EXCEPT REAL-ISSUE VERIFY)

> Status: route live-tested via dry-run against Arc grant #0 — tag inheritance
> fix shipped (`issue-fetch-404` on the fake tag proves the full detection
> chain: chain read → tag → GitHub fetch → reasoned skip). Live grant loop
> (fund → verify → signed release) proven via cast on Arc: escrow leftover
> exactly 5/10 USDC, receipt minted. Remaining: end-to-end verify on a REAL
> issue+PR — needs test repo name + KEEPER_PRIVATE_KEY in frontend/.env.

## Goal

The autonomous agent leg: a stateless cron route that verifies finished work
and fires timeout releases. Anyone can call `autoRelease`; only the keeper key
(after `setVerifier`) can call `verifyMilestone`.

## Files

- NEW `frontend/app/api/keeper/route.ts` — POST only.
- Env: `KEEPER_PRIVATE_KEY`, `KEEPER_CRON_SECRET`, `GITHUB_SERVER_PAT` (reuse),
  `APP_URL` (only for self-reference, not needed here).
- Manual op first: `setVerifier(keeperAddress, true)` on Arc FlintGrant
  `0x850fB024B03310A17888EC5174B93dDB90Fa91ed`:
  `cast send 0x850fB024B03310A17888EC5174B93dDB90Fa91ed "setVerifier(address,bool)" <KEEPER> true --private-key $PRIVATE_KEY --rpc-url https://rpc.testnet.arc.network`
  Fund the keeper key with Arc USDC (gas) beforehand.

## Route logic

Auth: `Authorization: Bearer <secret>` compared with `timingSafeEqual`;
reject → 401. Query `?dryRun=1` = plan only, no transactions (used for testing
and for the submission's "timeout detection" proof).

Clients: viem `publicClient` (Arc testnet) + `walletClient` (keeper key, skipped
entirely in dry-run).

Pass 1 — verify (per Active grant `0..nextGrantId-1`):
1. `getMilestones(grantId)` → for each `Pending` milestone, read its `source:`
   line → `owner/repo#issue`.
2. PAT-fetch the issue body → `parseLinkedPRs` (Block 02) → for each PR,
   PAT `GET /repos/{o}/{r}/pulls/{n}` → `merged === true` (treat missing/closed-unmerged as not-done).
3. All linked PRs merged AND at least one linked PR exists → `verifyMilestone`.
   Zero linked PRs → skip with reason `no-linked-prs` (never auto-verify on
   issue-close alone; closing without merged PRs proves nothing).
4. Per-tx try/catch; collect `{ grantId, milestoneId, txHash | error }`.

Pass 2 — timeouts:
1. `Verified` + `now >= verifiedAt + 14 days` → `autoRelease` (permissionless).
2. Last milestone `deadline` passed + `totalAmount - amountPaid > 0` →
   report `reclaimable: true` (NO tx — grantor-only; dashboard button in Block 04).

Response: `{ verified: [], autoReleased: [], reclaimable: [], skipped: [], errors: [] }`.
Log every decision line (repo, issue, reason) — these logs are demo footage.

Scheduling: cron-job.org free tier → `POST https://<app>/api/keeper` with the
bearer header, every 10–15 min. (Not Vercel cron — avoids redeploy coupling and
interval limits.)

## Acceptance

- [ ] `dryRun=1` on live Arc state returns a sane plan (no txs sent — verify by
      absence of new arcscan txs from keeper).
- [ ] Live: test grant milestone with all PRs merged → keeper verifies
      (`MilestoneVerified` on arcscan) → release via Block 01 UI → paid.
- [ ] Live: milestone with open PRs → skipped with reason, no tx.
- [ ] `tsc` clean, `npm run build` passes.

## Depends on

Block 02 (parser + linked PRs). Block 04 for the reclaim button, but the route
itself is standalone. Webhook trigger (Block 03) calls this route.
