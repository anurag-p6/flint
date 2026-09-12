# Flint Subgraph — Build Plan (The Graph leg)

## 0. Goal

Audit trail + portable reputation from on-chain events alone. Judges can
reconstruct any disbursement and query any contributor's Flint Score without
trusting our backend.

ERC-5484 status: SETTLED. `FlintReceipt.sol` is the Consensual Soulbound Token
(soulbound via `_update()` block, `BurnAuth.Neither`, on-chain Base64 JSON with
repo/cycle/score/amount). No contract changes in this plan — we only index
`ReceiptMinted`.

## 1. Starting point (already done)

- `schema.graphql`: Contributor / Repository / RepoMembership / Receipt /
  Payout / Pool / Grant / Milestone / Tranche. Rule: totals accumulate ONLY
  from `ReceiptMinted`; `PayoutExecuted` is history-only (no double-count).
- `subgraph.yaml`: 3 datasources on `arc-testnet` (5042002), startBlock
  `61595122`, addresses per `ARC_Contract.md` (Receipt `0xD175…5851`,
  Escrow `0xA687…FE12`, Grant `0x850f…91ed`).
- `src/mapping-{receipt,escrow,grant}.ts` + `utils.ts` match live event
  signatures. `contracts/abi/*.json` present.
- `arc-testnet` is a supported network on The Graph docs — Studio deploy is valid.
- Missing: Studio deployment (needs `DEPLOY_KEY`), live query verification,
  MCP composition for the composable-prize track (Step 6).

## 2. Steps

### Step 1 — Codegen + build

```bash
cd subgraphs
npm i
npm run codegen
npm run build
```

Accept: `graph build` clean, ABIs resolve.

### Step 2 — Deploy to Studio

```bash
graph auth --studio <DEPLOY_KEY>
npm run deploy  # slug flint
```

Accept: Studio shows Syncing → Synced from `61595122`.

### Step 3 — Verify against live Arc state

- Pool/grant #0 + escrow smoke pools from `contracts/ARC_DEPLOY.md §9/§11`.
- Queries:
  - Audit: `Pool → Payouts → Receipts`, `Grant → Milestones → Tranches`
  - Reputation: `Contributor{totalScore totalEarned receiptCount programsCompleted grantsCompleted receipts{score amount mode}}`
  - Receipt proof: `Receipt{repoId cycle score amount mode txHash}`
    (grant receipts have null `repository` by design)
- Accept: smoke-test wallets return exact scores (4,000,000 / 1,000,000),
  match `getTotalScore`, no double-count.

### Step 4 — Frontend wiring

- Add `NEXT_PUBLIC_SUBGRAPH_URL` to `frontend/.env.example` + `.env`.
- New `frontend/lib/subgraph.ts`: typed fetch + 3 queries (profile, pool/grant
  history, receipt gallery).
- Plug into contributor profile + pool/grant timelines. Keep direct
  `getTotalScore` fallback until synced.
- Accept: Flint Score renders from subgraph; txHash links to arcscan.

### Step 5 — Submission assets

- Studio sync screenshot + one sample query JSON for the ETHOnline form.
- Demo line: "every dollar reconstructible from events alone."

### Step 6 — MCP composition (composable-prize qualification)

Why: the "Best Use of Composable or Standardized Graph Products" prize
rejects single-subgraph entries. This step composes TWO Graph products
(Subgraphs + Subgraph MCP) plus a standardized schema, with zero changes to
anything built in Steps 1–5.

The story: one agent query answers "who got paid for what" from OUR schema
(flint) and "where did the money move" from a SHARED standard schema
(a Messari Standardized Subgraph tracking the same USDC). Same question,
two protocols, one query pattern — that is the leverage the judges score.

Sub-steps:

1. Finish Step 2 first (flint live on Studio). Nothing here works
   without a live endpoint — mocked/local data is disqualified.
2. Pick the standard leg: in The Graph Explorer/Studio, find a Messari
   Standardized Subgraph covering USDC/fungible-token flows on a network
   our grantees touch. Record its endpoint + the 3–4 fields you need
   (holder, balance/flow, token, timestamp). Do NOT build anything —
   consume it as-is; consuming a standard schema is the point.
3. Set up the Subgraph MCP server per The Graph MCP docs, configured with
   both endpoints (flint + the standard subgraph).
4. Write ONE cross-protocol prompt and run it, e.g.: "For grantee 0x…:
   total earned + receipts from flint, and USDC inflows from the
   standard subgraph. Do they match?" Save the transcript.
5. Capture evidence: MCP transcript/screenshot + both live endpoints +
   a 30-second demo beat (agent asks once, answers from both protocols).

Accept: agent response cites data from BOTH subgraphs; both endpoints live;
transcript saved under `subgraphs/` for the submission form.

## 3. Risks

- Studio sync lag → fallback to direct RPC reads (Step 4 keeps both paths).
- Slug collision `flint` → rename `flint-testnet`, update
  `package.json` + env.

## 4. Out of scope

No `FlintReceipt.sol` changes. No new events. No schema redesign.

## 5. Progress log

- Step 1 DONE (Sept 12): fixed `subgraph.yaml` event signatures to match ABIs
  (`indexed` keywords required by graph-cli 0.98), `npm run codegen` +
  `npm run build` clean, `generated/` + `build/` produced. Run inside WSL —
  Windows UNC paths break graph-cli.
- Added `QUERIES.graphql` (3 canonical queries) + `frontend/lib/subgraph.ts`
  + `NEXT_PUBLIC_SUBGRAPH_URL` in `frontend/.env.example`.
- NEXT: Step 2 `graph auth --studio <DEPLOY_KEY>` + `npm run deploy`
  (needs your Studio key), then Step 3 query verification.
- Step 6 scoped (Sept 12): MCP composition plan added for the
  composable-prize track. Requires zero rework of Steps 1–5.
- `MCP.md` written (Sept 12): hosted MCP config, 11-question maintainer bank
  (reputation / pool / grant / cross-protocol), 30-sec demo script, Studio
  shopping list. Blocked on: Deploy Key + Gateway API key.
- Steps 2–3 DONE (Sept 12): `graph auth` (bare key, no `--studio` flag on
  CLI 0.98) + `graph deploy flint --version-label 0.0.1` →
  `thegraph.com/studio/subgraph/flint`, query URL
  `api.studio.thegraph.com/query/1760164/flint/0.0.1`. Sync current, no
  indexing errors. Verified live: 2 pools Paid, grant #0 open, 5 receipts
  (smoke scores exactly 4,000,000 / 1,000,000; grant receipt 5000/5000000),
  contributor aggregates exact with no double-count.
- Frontend `.env` (gitignored) now sets `NEXT_PUBLIC_SUBGRAPH_URL` to the
  live endpoint — `frontend/lib/subgraph.ts` is live, no mock needed.
- NEXT: Step 6 MCP wiring on your machine (Gateway key + client config in
  `MCP.md`), then standard-subgraph leg + transcript.
