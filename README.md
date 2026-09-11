# Flint 🔥

[![Arc Testnet](https://img.shields.io/badge/Arc_Testnet-5042002-2775CA?style=flat-square)](https://testnet.arcscan.app)
[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE_TEE-375BD2?style=flat-square)](https://docs.chain.link/cre)
[![The Graph](https://img.shields.io/badge/The_Graph-audit_trail-6F4CFF?style=flat-square)](https://thegraph.com)
[![Open Source](https://img.shields.io/badge/open_source-ETHOnline_2026-22C55E?style=flat-square)](https://ethglobal.com/events/ethonline2026)

> Trustless disbursement protocol for grants and open source contributions.

---

## The Problem

Disbursing funds for grants or contributor rewards is still a manual, trust-heavy process:

**For grant programs** (Ethereum Foundation, Uniswap Grants, Arbitrum DAO, Optimism RPGF, Mozilla, any organization that funds external work):
- Milestones tracked in Notion, payments via Gnosis Safe, proof via screenshots
- No automated milestone verification
- No audit trail
- Grantees ghost after receiving funds with zero accountability

**For OSS programs** (Google Summer of Code, LFX Mentorship, Outreachy, MLH Fellowship, Season of KDE, and similar):
- Wallet addresses collected via Google Forms
- Contributor shares calculated manually in spreadsheets
- Funds sent one by one with no on-chain proof

In both cases there is always one human in the middle who is a bottleneck, a trust assumption, and a single point of failure.

Flint removes that person.

---

## The Solution

Flint is a trustless disbursement protocol. It handles the full payment flow for any program that needs to move funds based on verified work: grants, contributor rewards, milestone-based payouts.

The AI agent verifies the work inside a confidential enclave. The maintainer approves with one click. The blockchain records everything.

No spreadsheets. No Google Forms. No manual transfers. No trust required.

---

## Two Modes

### Grant Mode

Built for any organization that funds external work (Ethereum Foundation, Uniswap Grants, Arbitrum DAO, Optimism RPGF, Mozilla, Linux Foundation, corporate R&D grants, closed source projects, or any team that wants milestone-based escrow).

- Grantor deposits full amount into escrow upfront
- Milestones defined on-chain at creation
- AI agent verifies milestone completion via GitHub activity scoring inside TEE
- Each milestone releases a tranche after maintainer approval
- Auto-releases after 14 days if the committee delays (protects grantees from bureaucracy)
- Grantor can reclaim undisbursed funds if grantee abandons

### Open Mode

For structured programs and independent maintainers: Google Summer of Code, LFX Mentorship, Outreachy, MLH Fellowship, Season of KDE, YC-backed OSS, AI agent frameworks, independent repos (regional programs like C4GT also supported).

- Admin deposits reward pool for the cycle
- Contributors work on GitHub normally
- AI agent scores all contributions at cycle end
- Square root distribution so smaller contributors are not left with scraps
- Maintainer approval before payout executes

---

## How It Works

```
Maintainer opens a Flint issue (sub-milestones plus release percent plus grantee)
        |
GitHub webhook verifies it, issue listed as PENDING grant with timeline
        |
Maintainer reviews on site, one signature, USDC escrowed on Arc
        |
Grantee links PRs with closes #N, merged PRs get scored by the CRE agent
        |
Keeper verifies all linked PRs merged (verifier key)
        |
Maintainer reviews the score, signs the release, USDC plus soulbound receipt go out
        |
Ghosting backstop: verified plus 14 days with no release, keeper auto-releases
        |
Grantor reclaims after the last deadline (dashboard button, grantor only)
```

---

## Scoring Engine

All scoring runs inside a Chainlink CRE Confidential Workflow (TEE enclave). GitHub data, API keys, and AI responses never leave the enclave. Only final scores are submitted on-chain.

### Score Formula

```
Score = (0.45 x PR Score) + (0.30 x Review Score) + (0.15 x Issue Score) + (0.10 x Community Score)
```

| Signal | Weight | Why |
|--------|--------|-----|
| Merged PRs | 45% | Peer reviewed and accepted, strongest quality signal |
| Code reviews | 30% | Undervalued in most systems, we over-index it deliberately |
| Issue resolutions | 15% | Problem identification and resolution |
| Community engagement | 10% | Docs, triage, mentoring new contributors |

### AI Classification

Each merged PR is analyzed by Gemini Flash inside the enclave:
- Classifies complexity: trivial / medium / high / critical
- Detects spam PRs, rubber-stamp reviews, self-reviews
- Checks if tests and docs are included

### Anti-Gaming Rules

| Attack | Defense |
|--------|---------|
| Spam unmerged PRs | Score 0 |
| Giant meaningless PRs | Logarithmic size factor |
| Rubber-stamp reviews | Lowest weight 0.5x |
| Self-reviews | Excluded entirely |
| Old contribution farming | Exponential recency decay |

---

## Sponsor Integrations

### Arc

Flint lives on Arc Testnet. All 9 contracts are deployed and verified there, and the full loop already ran on chain: pool created, scores submitted, payout approved, receipts minted, zero leftovers. Addresses plus the runbook live in `contracts/ARC_DEPLOY.md`.

Gas is USDC, so fees show up in dollars. No ETH needed. That matters for contributors receiving their first payout.

Money gets in from anywhere. The dashboard has a built-in CCTP bridge (Circle App Kit) that moves USDC from Base Sepolia to Arc with no wrapped tokens. About 5 to 15 minutes on testnet (`frontend/components/bridge-funds.tsx`).

The scorer is a Circle Agent Wallet with a spending policy locked to Flint contract addresses only. Even if that key leaks, it cannot send funds anywhere else. Setup: `AGENT_WALLET_ARC.md`.

Next step on the roadmap: same deploy on Arc Mainnet before September 30.

### Chainlink CRE

Scores are computed inside a Chainlink CRE confidential workflow. It runs in a TEE, so GitHub data and API keys never leave the enclave. Only final scores come out.

Submission goes through DON consensus into `FlintScorerReceiver`, which forwards to escrow. The write target is already set to `arc-testnet` in `chainlink-cre/flint-scorer/workflow.yaml`, and the DON forwarder is allowlisted on the receiver. Workflow code: `chainlink-cre/flint-scorer/workflow.ts`. The deploy step (`cre workflow deploy`) runs with the team login plus LINK.

### The Graph

Every state change in Flint is an on-chain event: pools, scores, payouts, receipts, milestones, tranches. That event log is the audit trail. A grant committee can reconstruct any disbursement from events alone, since each one carries the IDs needed to join them (repo, cycle, contributor, grant).

The subgraph schema maps one to one to these events, so indexing is a straight codegen step, not a redesign. Watch `subgraphs/` for the build.

---

## Smart Contracts

Compiled with Solc 0.8.32, Foundry, OpenZeppelin v5.7.0. Live on Arc Testnet (deployed and verified, see `contracts/ARC_DEPLOY.md` for addresses). The earlier Base Sepolia deploy now serves as the CCTP bridge origin.

| Contract | Purpose |
|----------|---------|
| FlintRegistry.sol | Protocol entry point for repo and grant registration |
| FlintGrant.sol | Grant mode: milestone escrow, tranche releases, 14-day auto-release |
| FlintEscrow.sol | Open mode: scoring, maintainer approval, batch payout, 30-day timeout |
| FlintBatch.sol | Batch ERC-20 payment with approver ECDSA verification |
| FlintReceipt.sol | ERC-5484 soulbound NFT as permanent proof of work or delivery |
| FlintIdentity.sol | GitHub username to wallet address mapping |

---

## GitHub Identity

Contributors add their wallet to CONTRIBUTORS.md in the repo:

```
| GitHub Username | Wallet Address   |
|-----------------|------------------|
| anurag-p6       | 0x1234...abcd    |
```

Flint webhook detects the change and verifies the mapping on-chain via Chainlink. No login. No OAuth. No friction.

Security rule: only the row matching the commit author is trusted. Nobody can change another contributor's wallet address.

---

## Flint Score

Every payout mints an ERC-5484 soulbound token. These accumulate into a Flint Score:

```
0xanurag.eth   3 milestones delivered   12 repos contributed   Flint Score: 847
```

Future grant applications can point to this instead of a portfolio. DAOs can use it for voting weight. Hiring teams can verify work history without asking for a resume.

---

## Tech Stack

| Part | Technology |
|------|------------|
| Smart Contracts | Foundry, Solc 0.8.32, OpenZeppelin v5.7.0 |
| AI Scoring | Chainlink CRE Confidential Workflow (TypeScript) |
| LLM | Gemini 3.5 Flash Lite inside TEE |
| Trust Layer | Approver ECDSA verification (EIP-191) |
| Frontend | Next.js (Arc Testnet default chain) |
| Indexing | On-chain event log (The Graph ready schema) |
| Identity | CONTRIBUTORS.md and EIP-191 wallet signature |
| Chain | Arc Testnet (live), Base Sepolia (bridge origin) |
| Token | USDC (native gas on Arc) |

---

## Repo Structure

```
flint/
├── contracts/
│   ├── src/
│   │   ├── core/          FlintGrant, FlintEscrow, FlintBatch, FlintReceipt, FlintRegistry
│   │   ├── interfaces/    IScoringAdapter, IPayoutPolicy, IERC5484
│   │   ├── policies/      ProportionalPolicy, SqrtPolicy
│   │   ├── identity/      FlintIdentity
│   │   └── mocks/         MockUSDC
│   └── script/            Deploy.s.sol, SmokeTest_Arc.s.sol
├── chainlink-cre/
│   └── flint-scorer/
│       ├── workflow.ts    TEE handler: fetch, score, submit
│       ├── main.ts
│       └── workflow.yaml
├── blocks/                  48h execution plan (numbered build blocks)
├── AGENT_WALLET_ARC.md      Circle Agent Wallet setup for the scorer
├── contracts/ARC_DEPLOY.md  Arc Testnet deploy runbook plus live addresses
├── frontend/              Next.js dashboard (Arc Testnet default chain)
├── subgraphs/             The Graph subgraph (schema next, events ship the data today)
└── README.md
```

---

## What Makes Flint Different

| | Gnosis Safe | Gitcoin | SourceCred | Disperse.app | Flint |
|---|---|---|---|---|---|
| Works for any grant program | No | No | No | No | Yes |
| Works for OSS contributor programs | No | No | Yes | No | Yes |
| Milestone verification | No | No | No | No | Yes |
| TEE attested scoring | No | No | No | No | Yes |
| Approval gate (no unilateral moves) | Yes | No | No | No | Yes |
| Auto-release timeout | No | No | No | No | Yes |
| Queryable audit trail | No | No | No | No | Yes |
| On-chain reputation record | No | No | No | No | Yes |

---

## One-Line Pitch

Flint is a trustless disbursement protocol for grants and open source: work verified inside a TEE, the maintainer's signature approves every payout, blockchain records everything.

---

*Built for ETHGlobal ETHOnline 2026: Arc, Chainlink and The Graph tracks*