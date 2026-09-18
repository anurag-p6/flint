# Block 04 — Pending Grants + Timeline UI (DONE, doctrine evolved Sept 12)

> AGENTIC DOCTRINE (Sept 12): GitHub is the only input surface. Assignees set
> by the issue raiser = grantees (multi, equal split → one grant each);
> wallets from CONTRIBUTORS.md; website never takes manual entry — Fund
> executes approve+creates immediately with the connected wallet as approver,
> grant IDs auto-link from receipts. Manual CreateGrantForm retained in-file
> but unrendered. Pending cards show blocked states naming the exact
> CONTRIBUTORS.md row to add; grant page live-refetches on webhook events.

> Status: DONE (code). `GET /api/grants/pending` (issue↔chain matching via
> `source:` tag, grantee wallet resolution), `GET /api/github/pr-status`,
> pending cards with one-click prefilled funding, timeline countdowns
> (deadline + 14-day auto-release), PR merged badges, grantor reclaim button.
> Also fixed: Identity address corrected to Arc, ABI added. `tsc` + build green.
> Live acceptance (real issue → pending → fund) moves to Block 06 checklist.

## Goal

A labeled issue appears on the site as a fundable card; after funding it becomes
a timeline (milestones, deadlines, 14-day countdowns, grantee, PR merge state).
Uses the existing manual `CreateGrantForm` — prefilled, not replaced.

## Files

- NEW `frontend/app/api/grants/pending/route.ts` — GET `?repo=owner/name`.
- EDIT `frontend/app/(app)/grant/page.tsx` — pending card + timeline + grantee display.
- EDIT `CreateGrantForm` (same file) — accept optional `initial` prop
  `{ grantee, approver, totalUsdc, milestones: {title, releaseBps}[] }`.
- Env: `GITHUB_SERVER_PAT` (server-only; fine-grained read-only on issues + PRs).
- Check ABI: `frontend/lib/abi/FlintIdentity.json` must expose
  `getWallet(githubUsername)`; if the file/ABI is missing or stale, regenerate
  from `contracts/out/FlintIdentity.sol/FlintIdentity.json`.

## Pending route logic (stateless, no DB)

1. PAT-fetch `GET /repos/{repo}/issues?labels=flint&state=all&per_page=50`,
   filter out PRs, parse each body with Block 02 `parseIssueSpec`.
2. On-chain state via viem public client (Arc `https://rpc.testnet.arc.network`):
   `nextGrantId()` → for `i` in `0..n-1`: `grants(i)` tuple
   (grantor, grantee, token, totalAmount, amountPaid, ledgerApprover, createdAt, status)
   + `getMilestones(i)` array. Small-N loop is fine for the demo (note: paginate
   if `n` ever grows past ~50).
3. Linkage: an issue is FUNDED if any on-chain milestone description starts with
   `source: owner/repo#<issueNumber}` (convention from Block 02). Return
   `{ pending: [...], funded: [{ grantId, chain state, issueNumber }] }`.
4. Grantee resolution: for each issue/grant, `FlintIdentity.getWallet(username)` —
   return `{ wallet | null }` (`null` = "unclaimed" badge in UI).
   ⚠️ Verify the Identity contract address on Arc first (overview lists the Base
   one as unchecked) — redeploy or re-point as needed, then update
   `frontend/lib/contracts.ts`.

## Page changes

1. Above `CreateGrantForm` (when no grant linked yet): pending-issue cards with
   title, `#number`, grantee (+wallet or "unclaimed"), amount, deadline,
   sub-milestone table, spec errors inline. Button "Fund this grant" →
   renders `CreateGrantForm` with `initial` prefilled (descriptions prefixed
   with the `source:` line — THIS is what makes future matching work).
2. Funded view: timeline per milestone — deadline countdown, status dot
   (Pending/Verified/Paid/Auto-released), `verifiedAt + 14d` auto-release
   countdown for Verified rows, linked PRs with merged/open badges
   (PAT `GET /repos/{o}/{r}/pulls/{n}` → `merged`; cache 5 min in-module).
3. Grantor-only "Reclaim" button when last deadline passed and remainder > 0
   (calls `reclaimUndisbursed`; visible only if connected wallet === grantor).

## Acceptance

- [ ] Test repo, one new-format labeled issue → pending card with correct
      milestones, math, grantee, countdowns.
- [ ] Fund from UI → card flips to funded timeline; arcscan shows `GrantCreated`.
- [ ] Grantee without mapped wallet shows "unclaimed", no crash.
- [ ] `tsc` clean, `npm run build` passes.

## Depends on

Block 02 (parser + `source:` convention). Independent of 01/03.
