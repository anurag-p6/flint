# Block 07 — Docs / Diagram / Video Assets (DONE, minus video recording)

> Status: DONE except the actual video recording (needs live-loop footage).
> PITCH beats + disclosures appended; GITHUB_APP_INSTALL deferral noted;
> README pipeline + Privy sections added; ARC_DEPLOY §11 live record added.
> Remaining: record video after Block 06 live loop (shot list in PITCH beats).

## Goal

Submission-ready narrative. State clearly which bounties: Arc Best DeFi/Onchain
Finance + Best Agentic Economy with Circle Agent Stack.

## Files

- EDIT `README.md` — replace the 6-layer architecture + How-It-Works with the
  grant-pipeline flow below; add sponsor section (Arc, USDC-as-gas, App Kit
  bridge, Agent Wallets / keeper, CCTP).
- EDIT `PITCH.md` — add the ghosting-backstop demo beat + quirk disclosures.
- EDIT `GITHUB_APP_INSTALL.md` — prepend note: App flow deferred; current
  auth is PAT + webhook secret (this build).
- EDIT `contracts/ARC_DEPLOY.md` — append keeper + verifier + receiver-test
  record (already has §§9–10; extend, don't rewrite).
- Mark each `blocks/0X-*.md` done (append `Status: DONE + date` line at top).

## Canonical flow diagram (use in README + video)

```text
Maintainer opens flint issue (sub-milestones + release % + grantee)
        |
GitHub webhook → verified → issue listed as PENDING grant with timeline
        |
Maintainer reviews on site → one signature → USDC escrowed on Arc
        |
Grantee links PRs via closes #N → merged PRs shown, CRE LLM scores work
        |
Keeper: all linked PRs merged → verifyMilestone (verifier key)
        |
Maintainer reviews score → Privy-signed releaseTranche → USDC + SBT
        |
Ghosting backstop: verified + 14d with no release → keeper autoRelease
        |
Grantor reclaim after last deadline (dashboard button, grantor-only)
```

## Submission checklist mapping

- Functional MVP + diagram: app + keeper + this diagram.
- Video must name: Arc, native USDC gas, App Kit bridge, Agent Wallet/keeper,
  CCTP, 14-day backstop. Include dry-run output + one live release.
- State bounty names explicitly. Link repo.
- Disclose honestly: keeper key is committee-operated (verifier EOA), DON path
  covers batch scoring; 14-day wait proven by unit test + dry-run, not live wait.

## Acceptance

- [ ] README flow matches the shipped code (no aspirational steps).
- [ ] All blocks marked DONE.
- [ ] Sept 16–30 calendar reminder: redeploy to Arc Mainnet for the $2.5k kickers.

## Depends on

Block 06. Do last.
