# Block 02 — Issue Spec + Shared Parser (DONE)

> Status: DONE. `lib/issue-spec.ts` created (16/16 node checks green),
> milestones route refactored to import it, `tsc` clean. Check script kept at
> `frontend/scripts/check-issue-spec.mjs` for reuse.

## Goal

One canonical parser for the grant-issue format. Used by the milestones API
route (Block 04 UI), the webhook (Block 03), and the keeper (Block 05).
Write once, import everywhere — no duplicated regexes.

## Issue body format (maintainer writes this)

```markdown
## Milestone: Ship auth module
Build OAuth login and session management. closes #12
release: 50%

## Milestone: Security audit
External review of the auth code.
release: 50%

<!-- flint
grantee: octocat
deadline: 2026-10-01
amount: 500
-->
```

Rules:
- Each `## Milestone: <title>` section = one sub-milestone. Its `release: X%`
  line sets the tranche. Body text may contain `closes #N` PR links.
- The `<!-- flint -->` footer carries `grantee` (GitHub username), `deadline`
  (YYYY-MM-DD, applies to every sub-milestone unless a section overrides with
  its own `deadline:` line), `amount` (total USDC).
- Fallback (backward compatible): no `## Milestone` sections → the whole issue
  is one milestone at 100%, using top-level `release:`/`amount:` if present.
- `release:` accepts decimals (`2.5%` → 250 bps). Validation: bps are integers,
  sum must equal exactly 10000, else return errors (never throw).

## Files

- NEW `frontend/lib/issue-spec.ts` — parser + validators, zero dependencies.
- EDIT `frontend/app/api/github/milestones/route.ts` — replace local
  `parseReleasePercent/parseReleaseAmount/parseLinkedPRs` with imports from the
  lib. **Move `parseLinkedPRs` into the lib** (keeper needs it). Keep the
  exported `Milestone` interface stable; extend it with optional fields only:
  `subMilestones?: { title: string; releaseBps: number }[]`,
  `grantee?: string | null`, `deadline?: string | null`,
  `specErrors?: string[]`.
- Linkage convention (needed by Block 04): when funding, the first milestone
  description written on-chain MUST start with `source: owner/repo#<issueNumber>`
  on its own line, e.g. `source: acme/repo#42\nShip auth module`. Document it
  here, enforce it in Block 04.

## Steps

1. Write `issue-spec.ts`:
   - `parseIssueSpec(body: string): { grantee, deadline, amount, milestones: {title, body, releaseBps, linkedPRs, deadline}[], errors: string[] }`
   - `validateSpec(spec): string[]` — bps sum, integer bps, grantee present
     (warning not error if missing → grantee "unclaimed"), deadline parseable.
   - Export `parseLinkedPRs` (moved as-is), `parseDeadline` (YYYY-MM-DD → unix).
2. Refactor the milestones route to import from the lib. No behavior change
   for existing responses; new optional fields appended.
3. Node check script (repo-local, delete after or keep under `frontend/scripts/`):
   run 5 sample bodies (multi-milestone valid, decimals, fallback single,
   bps≠10000, missing footer) with `node` (Node 24 strips types; use relative
   imports, no `@/` alias in the check script).
4. `npx tsc --noEmit` clean.

## Acceptance

- [ ] Check script: all 5 samples parse/validate as specified.
- [ ] Milestones API response unchanged for old issues, extended fields present
      for new-format issues (verify with one real labeled issue).
- [ ] `source:` linkage convention documented and referenced by Block 04.

## Depends on

Nothing (besides Block 01 for morale). Blocks 03, 04, 05 import this file.
