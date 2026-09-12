# Design Motion Plan — Flint Frontend

## Decisions (locked)

- Feed updates: **refresh-on-action only** (user clicks refresh after a tx; animated insert). Auto-poll comes post-demo.
- Palette: **existing theme only** — white/grays/black + `--color-accent: #2563EB`. No new colors.

## Install (one dependency)

```bash
npm i motion
```

## Tokens (`app/globals.css`, append to `@theme`)

```css
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--animate-flash-row: flash-row 1.2s ease-out forwards;
--animate-pulse-dot: pulse-dot 2s ease-in-out infinite;
@keyframes flash-row { from { background: rgba(37,99,235,.08); } to { background: transparent; } }
@keyframes pulse-dot { 0%,100% { opacity: 1; transform: scale(1);} 50% { opacity: .45; transform: scale(.8);} }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
.tnum { font-variant-numeric: tabular-nums; }
```

## New file: `components/motion-primitives.tsx`

Shared `Reveal` (inView rise-in), `CountUp` (motion `animate`, 900ms easeOut), `Donut` (hand SVG, `stroke-dashoffset` spring, accent + gray ramp), `FeedRow` (enter spring `{opacity: 0, y: -14, scale: 0.98}`, accent flash). Springs: default `stiffness: 320, damping: 30`; feed rows `400/26`.

## Wiring order

1. Tokens + install → `tsc` + build gate.
2. Primitives file.
3. `/explorer` feed (`AnimatePresence popLayout` + `layout` FLIP on list; manual Refresh button triggers re-fetch → new rows spring in).
4. Reputation card (count-ups + donut + staggered receipts).
5. Grant timeline (verified-dot pulse, countdown crossfade keyed per 30s bucket, `.tnum` on figures).
6. Primary buttons: `whileTap={{ scale: 0.97 }}`.
7. Perf pass: profiler on 100-row feed insert, 60fps target, bundle delta < 40KB gz.

## FPS rules

Transform + opacity only · `content-visibility: auto` on rows · `prefers-reduced-motion` respected · no height animations · countdowns tick per 30s bucket.

## Acceptance

- [ ] Live payout → Refresh → row springs in, no layout jump (video footage).
- [ ] 60fps on mid-tier laptop, no long tasks >50ms.
- [ ] Reduced-motion kills everything.
- [ ] `tsc` clean, `npm run build` green.

