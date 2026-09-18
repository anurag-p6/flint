# Block 03 — Webhook Hardening (DONE)

> Status: DONE. `lib/github-webhook.ts` (HMAC, 5/5 node checks green),
> `webhook/route.ts` rewritten (verify → route → keeper trigger, always-200
> discipline), env keys added to `.env.example`, `tsc` clean.
> Deferred: comment-back on labeled issues (needs PAT with issues:write —
> revisit in Block 05 when GITHUB_SERVER_PAT exists). Live GitHub delivery
> check moves to Block 06 checklist. LOCAL TESTING:
> `frontend/scripts/simulate-webhook.sh issues_closed|pr_merged` replays
> signed deliveries against localhost:3000 (restart dev server after env
> bootstrap first). No tunnel needed for logic tests; real delivery only at
> final e2e (Vercel URL + repo webhook).

## Goal

Turn `frontend/app/api/github/webhook/route.ts` (currently logs + `{ok: true}`)
into a verified event router. Stateless: repo identity comes from the payload
itself (`repository.full_name`, `installation.id`) — no DB.

## Files

- EDIT `frontend/app/api/github/webhook/route.ts` — full rewrite.
- NEW `frontend/lib/github-webhook.ts` — `verifyWebhookSignature(rawBody, signatureHeader, secret)` using `node:crypto` HMAC-SHA256 + `timingSafeEqual` against the `sha256=<hex>` header format.
- Env: `GITHUB_WEBHOOK_SECRET` (server-only, no `NEXT_PUBLIC_` prefix).

## Steps

1. Read the raw body (`await request.text()`, parse JSON after verifying —
   signature must be computed on raw bytes, not re-serialized JSON).
2. Missing/invalid signature → `401`. Valid → route by `x-github-event` + `action`:
   - `installation` (created/deleted) → structured log (repo set comes in payload).
   - `issues` opened/edited/labeled/unlabeled with `flint` label → structured log
     `{ repo, issue, action }`. No chain writes (funding stays one-click, Block 04).
   - `issues` closed → trigger keeper verify pass (step 4).
   - `pull_request` closed with `merged: true` → extract `closes #N` targets from
     PR body via `parseLinkedPRs` (Block 02 lib) → trigger keeper verify pass
     for the affected repo.
   - Everything else → log + 200.
3. Always respond fast; wrap handler body in try/catch and still return 200 on
   internal error (after logging) so GitHub doesn't retry-storm a broken rev.
   Only auth failures get 401.
4. Keeper trigger: `fetch(${APP_URL}/api/keeper, { method: "POST", headers: {
   Authorization: "Bearer " + KEEPER_CRON_SECRET, "Content-Type": "application/json" },
   body: JSON.stringify({ reason: "issues-closed", repo, issue }) })` —
   fire-and-forget (don't await; log failures). Needs `APP_URL` env
   (production URL; localhost in dev).
5. Comment-back on newly labeled issues (PAT, `issues:write` only if granted):
   post `Tracked by Flint — fund it from the dashboard` + `flint-tracked` label.
   Best-effort, failures logged not thrown. Skip entirely if PAT lacks scope.

## Acceptance

- [ ] Local: `curl` with correctly/incorrectly computed HMAC → 200 / 401.
- [ ] GitHub App → Recent Deliveries shows 200s after deploy (use Redeliver on an
      old event if the test repo is quiet).
- [ ] Merging a PR with `closes #N` produces a keeper-trigger log line.
- [ ] `npx tsc --noEmit` clean, `npm run build` passes.

## Depends on

Block 02 (imports `parseLinkedPRs`). Keeper route (Block 05) should exist before
the trigger does anything — but the fire-and-forget call is safe to ship first.
