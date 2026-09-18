# Block 01 — Grant Release Signing Fix (DONE)

> Status: DONE. `lib/privy/grant.ts` created, `ReleaseTrancheButton` rewritten
> with sign → verify → submit phases, `tsc` + `npm run build` green.
> Remaining acceptance (live Arc click-through) moves to Block 06 checklist.

## Problem

`ReleaseTrancheButton` in `frontend/app/(app)/grant/page.tsx:485` calls
`releaseTranche(grantId, milestoneId, "0x")`. The contract recovers the signer
from the signature and reverts `InvalidSignature` — grant release can never
succeed. The escrow side already solved this exact problem in
`components/privy-approve-panel.tsx` + `lib/privy/tokens.ts`. Mirror it.

## Files

- NEW `frontend/lib/privy/grant.ts` — encoders + hash helpers for FlintGrant
- EDIT `frontend/app/(app)/grant/page.tsx` — rewrite `ReleaseTrancheButton`
- READ FIRST `components/privy-approve-panel.tsx` lines 81–217 (phase machine),
  `lib/privy/tokens.ts` (provider interface, sign/send helpers)

## Steps

1. Read the rest of `privy-approve-panel.tsx` (lines 81–217). Copy the phase
   machine shape: `idle → signing → verifying → submitting → success | error`.
2. Create `lib/privy/grant.ts`:
   - `encodeReleaseTranche(grantId: bigint, milestoneId: bigint, signature: Hex): Hex`
     via `encodeFunctionData` with `FlintGrant.json` ABI (`@/lib/abi/FlintGrant.json`).
   - Reuse `privyPersonalSign` and `privySendTransaction` from `./tokens`
     (same EIP-191 flow the escrow path uses — the contract verifies with
     `toEthSignedMessageHash().recover()`, so signing is identical).
   - Export `GRANT_ADDRESS = addresses.grant as Hex`.
3. Rewrite `ReleaseTrancheButton`:
   - `useReadContract` on `FlintGrant.computeApprovalHash(grantId, milestoneId)`
     (exists in contract, `FlintGrant.sol:330`) for the hash to sign.
   - `signing`: `personal_sign` the hash with the active Privy wallet
     (embedded email wallet first, fallback `wallets[0]` — same as approve panel).
   - `verifying`: `recoverMessageAddress({ message: <EIP-191 prefixed hash>, signature })`
     and compare to the grant's `ledgerApprover` (read from `grants(grantId)`).
     Mismatch → error state, no transaction sent.
   - `submitting`: `privySendTransaction` with `{ from, to: GRANT_ADDRESS, data }`.
   - `success`: show truncated tx hash + link to
     `https://testnet.arcscan.app/tx/<hash>`.
   - Pass the grant's `ledgerApprover` down from the page (already fetched as
     `grant[?]` in `GrantPage` — check tuple index against the `Grant` struct:
     grantor, grantee, token, totalAmount, amountPaid, ledgerApprover, createdAt, status).
4. Keep the button visible only when `chainStatus === "Verified"` (unchanged).

## Acceptance

- [ ] `npx tsc --noEmit` clean in `frontend/`.
- [ ] On Arc Testnet with a Verified test milestone: click → wallet signs →
      `TrancheReleased` on arcscan, grantee USDC increases.
- [ ] Wrong-signer wallet shows the mismatch error without sending any tx.
- [ ] `npm run build` passes.

## Depends on

Nothing. Do first.
