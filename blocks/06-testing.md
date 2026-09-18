# Block 06 — Tests (FORGE + ARC LOOP DONE, REAL-ISSUE LOOP PENDING)

> Status: `contracts/test/FlintGrant.t.sol` — 5/5 green. Keeper dry-run green
> against live Arc state. Cast-based Arc grant loop green (fund → verify →
> signed release, leftover exactly 5/10). Remaining: real-issue live loop on
> the test repo (needs issue + PR + webhook delivery) — record in
> `contracts/ARC_DEPLOY.md` §11 when run.

## Goal

Prove the time logic honestly. The 14-day wait cannot be demoed live, so:
unit-test the boundaries locally + prove detection on live state via dry-run.

## Files

- NEW `contracts/test/FlintGrant.t.sol` (`contracts/test/` is empty today).
- Use `contracts/src/mocks/MockUSDC.sol` (NOT native USDC — forge cannot
  simulate the compliance precompile; see `contracts/ARC_DEPLOY.md` §10).

## Forge tests (`forge test`)

Setup: deploy receipt + grant, mint MockUSDC to grantor, approve, `createGrant`
with 2 milestones, deadlines `now + 30d / now + 60d`.
1. `createGrant` validation: bps ≠ 10000 reverts; zero milestones reverts.
2. Release flow: `setVerifier(tester)` → `verifyMilestone(0,0)` →
   sign approval hash as approver (`vm.sign`) → `releaseTranche` →
   balances + `Paid` status + receipt minted.
3. Timeout boundary: `verifyMilestone(0,0)` → `vm.warp(verifiedAt + 14 days - 1)`
   → `autoRelease` reverts `AutoReleaseNotReady` → `vm.warp(verifiedAt + 14 days + 1)`
   → `autoRelease` succeeds, grantee paid, `TrancheAutoReleased` emitted.
4. Reclaim: warp past last deadline → `reclaimUndisbursed` as grantor succeeds;
   as non-grantor reverts `NotGrantor`.
5. Double-verify / double-pay reverts (`MilestoneAlreadyVerified`,
   `MilestoneAlreadyPaid`).

Run: `forge test` from `contracts/`. All green required.

## Keeper dry-run (live Arc state)

`curl -X POST "https://<app>/api/keeper?dryRun=1" -H "Authorization: Bearer $KEEPER_CRON_SECRET"`
→ assert the plan matches arcscan reality (verified-but-old milestones listed
for auto-release, open ones skipped). No keeper txs on arcscan afterwards.

## Live loop checklist (test repo, record for video)

- [ ] Open new-format issue, label `flint` → webhook 200 → pending card appears.
- [ ] Fund from UI → `GrantCreated` on arcscan → timeline shows.
- [ ] Open + merge linked PR → webhook fires → keeper verifies → `MilestoneVerified`.
- [ ] Score visible (grantee in `contributorMapping`, Block 00 manual op #2).
- [ ] Maintainer signs release (Block 01) → `TrancheReleased`, grantee paid, SBT minted.
- [ ] Keeper dry-run output saved as timeout-detection proof.

## Depends on

Blocks 01–05 complete. Run last before Block 07.
