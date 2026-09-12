# Contributor Universe (`/network`) — Build Plan

## What it is

One route, one repo at a glance — the Universe follows the repo switcher (same rule as Dashboard + Grants): **members of the selected repo are nodes** (GitHub avatars you can grab and drag), **that repo's pool and its grants are hub nodes**, **edges are certificates** (ERC-5484 receipts). No repo selected → prompt to pick one. Click a contributor → trace everything they earned here. Member aggregates (Flint Score, earned) stay global — reputation is portable — but only members get nodes. The Explorer proves money moved; the Universe proves *people*.

## Decisions (locked)

- Route: `/network` (not `/graph` — avoids confusion with The Graph protocol). Sidebar entry after Grants.
- Renderer: **custom d3-force SVG** (not react-force-graph). Full theme control, tiny bundle.
- Feed updates: refresh-on-action (same locked pattern as Explorer).
- Palette: existing theme only (white/grays/black + accent).

## Install

```bash
npm i d3-force d3-zoom
npm i -D @types/d3-force @types/d3-zoom
```

## Data pipeline

```text
SUBGRAPH (receipts first:500)          RESOLUTION LAYER              SCENE
─────────────────────────             ────────────────              ─────
Receipt{contributor,          ┌─ wallet → login: CONTRIBUTORS.md
 repoId, mode,                 │  (per known repo, server PAT) +
 score, amount}                │  keeper contributorMapping +
        │                      │  grant-issue grantee fields
        │                      │  → fallback: truncated address
        │                      │
        ├─ mode=grant ────────┼─ repoId == keccak("grant",N)?
        │                      │  brute-force N in 0..nextGrantId
        │                      │  → Grant hub node (title from
        │                      │    grant-issue cache / "Grant #N")
        │                      │
        └─ mode=pool/open ────┼─ repoId == keccak("owner/repo")?
                               │  dictionary: connected repos +
                               │  grant source tags + known list
                               │  → Repo hub node
                               │  → unmatched: short-hash node
```

- **Avatars need zero auth**: `https://github.com/<login>.png`. Initials-disc fallback while loading / on error.
- **Node sizing**: contributor radius ∝ `sqrt(totalScore)` (mirrors the payout philosophy); hub radius ∝ total disbursed. Edge width ∝ amount.
- **Colors**: contributors = avatar photo; repo hubs = black disc + white label; grant hubs = accent disc; edges = gray-100, highlight = accent on hover/select.

## Identity resolution (new shared module)

- `lib/identity-resolve.ts` — `resolveLogin(wallet): { login | null, avatarUrl | null }` merging (in order): in-memory cache → funded-grant grantees → CONTRIBUTORS.md mappings (batched per repo) → null.
- Server side: `GET /api/identity/batch?wallets=0x..,0x..` using `GITHUB_SERVER_PAT` — ONE call from the client, not N. Cache 10 min.

## Component architecture

```text
/app/(app)/network/page.tsx        — data orchestration, filter/search state
  <UniverseCanvas/>                — SVG + d3-force sim + d3-zoom, drag nodes
    <ContributorNode/>             — <image> avatar in <clipPath> circle + ring
    <HubNode/>                     — repo/grant disc + label
    <CertEdge/>                    — line, width ∝ amount, tooltip on hover
  <NodePanel/>                     — click a node → profile: score, earned,
                                     receipts timeline, arcscan links
  <UniverseToolbar/>               — search box, filters (repos/grants/people),
                                     physics pause, reset view, Refresh
```

- Sim config: `forceManyBody(strength: -220)`, `forceLink(distance: 90, strength: 0.6)`, `forceCollide` by radius + 8, `forceCenter`, `alphaDecay: 0.03`. Reheat (`alpha(0.6).restart()`) on drag start; freeze on toggle.
- Rendering: one `<g>` per node, positions via `transform` in the sim tick (single update per frame through a ref + direct DOM set — NOT React state per tick, that's the 60fps secret). React re-renders only on data/selection change.

## Interactions (demo choreography)

1. Load → nodes bloom from center (staggered spring, motion primitives).
2. Drag any avatar → neighborhood follows on springs, rest settles.
3. Hover node → connected edges + neighbors highlight, rest dim to 15% opacity.
4. Click contributor → right panel slides in: avatar, login, Flint Score (count-up), earned, every certificate with repo/grant + amount + arcscan link.
5. Search filters to match + neighbors; type toggles isolate layers.
6. **Refresh** → new receipts animate in as fresh edges.

## FPS rules (extends DESIGN_MOTION.md Part 1 rules)

- Sim tick writes `transform` attributes directly, bypassing React renders.
- Cap rendered nodes at ~300 (aggregate tail into an "n more" node if exceeded).
- Avatar `<image>`: only render images for nodes in viewport (check against zoom transform, cheap loop).
- Pause sim when tab hidden (`visibilitychange`) and when physics toggle is off.

## File map (build order)

1. `npm i d3-force d3-zoom` (+ types).
2. `lib/identity-resolve.ts` + `app/api/identity/batch/route.ts`.
3. `components/universe/*` (canvas, nodes, edge, panel, toolbar).
4. `app/(app)/network/page.tsx` + sidebar entry.
5. Receipt→edge builder unit checks (node script like `check-issue-spec.mjs`: keccak vectors for `("grant",N)` and `"owner/repo"`).
6. `tsc` + build + 100-node profiler pass.

## Acceptance

- [ ] Drag/zoom/pan at 60fps with 100+ nodes (profiler, no long tasks >50ms).
- [ ] Every receipt in Studio appears as exactly one edge (cross-check counts).
- [ ] Unknown wallet → initials node, never a broken image.
- [ ] Unmatched repo hash → short-hash hub, never dropped silently.
- [ ] `tsc` clean, build green, bundle delta < 60KB gz.

## Build status (Sept 12 — implemented, tsc + build green)

Built: `lib/identity-resolve.ts`, `app/api/identity/batch/route.ts`,
`lib/universe.ts` (keccak helpers + feed + scene builder + sizing),
`components/universe/{UniverseCanvas,UniverseNodes,NodePanel,UniverseToolbar}.tsx`,
`app/(app)/network/page.tsx`, sidebar entry, `scripts/check-universe-keccak.mjs`.

- `scripts/check-universe-keccak.mjs --grant-max 20` → `keccak vectors OK`
  against live Studio (5 receipts: 1 grant hash matches `keccak("grant",N)`, 4 pool).
- `tsc --noEmit` clean; `next build` green (`/network` + `/api/identity/batch` listed).
- Deviations: bloom is physical (sim reheats from center) rather than CSS stagger;
  `CertEdge` takes a `lineRef` callback instead of DOM querying; zoom reset reuses
  the same behavior instance.
- Still manual (needs browser + more data): 100-node 60fps profiler pass,
  bundle-delta measurement, drag/hover feel check. Live Studio has 5 receipts —
  the 300-node aggregation path is implemented but unexercised.
- Live identity (Sept 12): `lib/live-bus.ts` + webhook `push` handler +
  `/api/live/stream` SSE + `invalidateIdentities()` + `/network` subscription
  (2s debounce, 3-strike fallback to 30s poll, refetch on tab return).
  `scripts/check-live-bus.mjs` 11/11 green. Full loop proven live (Sept 12):
  signed push → webhook 200 → SSE `{"type":"identity",…}` on subscribed client;
  tunnel URL → app 200 end-to-end.
- Empty-universe finding (Sept 12, keccak-verified): Studio pools are
  `flint/receiver-test` (0x03ea…) + one unknown test slug — NONE of the real
  repos (crypto-fraud-attribution, headlamp, anurag_portfolio) has a pool or
  grant on-chain. Repo-scoped universe for those repos is therefore EMPTY by
  design: no nodes exist, so identity updates have nothing visible to change.
  A visible realtime demo needs a funded pool/grant for the demo repo first.

## Demo beat (45 seconds)

*"This is everyone this repo ever paid."* → drag the top contributor → *"every line is a soulbound certificate — can't be bought, can't be faked"* → click → panel with score → *"and every one links to the money on Arc."*
