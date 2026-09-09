# Flint 🔥

> Trustless disbursement protocol for grants and open source contributions.

---

## The Problem

Disbursing funds — whether for grants or contributor rewards — is still a manual, trust-heavy process:

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

Flint is a trustless disbursement protocol. It handles the full payment flow for any program that needs to move funds based on verified work — grants, contributor rewards, milestone-based payouts.

The AI agent verifies the work inside a confidential enclave. The Ledger device proves a human approved. The blockchain records everything.

No spreadsheets. No Google Forms. No manual transfers. No trust required.

---

## Two Modes

### Grant Mode

For any organization that funds external work: Ethereum Foundation, Uniswap Grants, Arbitrum DAO, Optimism RPGF, Mozilla, Linux Foundation, corporate R&D grants, closed source projects, or any team that wants milestone-based escrow.

- Grantor deposits full amount into escrow upfront
- Milestones defined on-chain at creation
- AI agent verifies milestone completion via GitHub activity scoring inside TEE
- Each milestone releases a tranche after Ledger approval
- Auto-releases after 14 days if the committee delays (protects grantees from bureaucracy)
- Grantor can reclaim undisbursed funds if grantee abandons

### Open Mode

For structured programs and independent maintainers: Google Summer of Code, LFX Mentorship, Outreachy, MLH Fellowship, Season of KDE, YC-backed OSS, AI agent frameworks, independent repos (regional programs like C4GT also supported).

- Admin deposits reward pool for the cycle
- Contributors work on GitHub normally
- AI agent scores all contributions at cycle end
- Square root distribution so smaller contributors are not left with scraps
- Ledger approval before payout executes

---

## How It Works

```
Admin or grantor deposits funds on-chain
        |
Contributors or grantees do the work on GitHub
        |
Flint GitHub App captures all activity via webhooks
        |
Chainlink CRE scores work inside TEE enclave
Gemini Flash classifies PR complexity and detects gaming
        |
Chainlink DON validates attested scores and submits on-chain
        |
Admin or grantor reviews results on the dashboard
        |
Physical confirmation on Ledger device
        |
Funds release to contributors or grantees
        |
ERC-5484 soulbound token minted as permanent proof of work
        |
The Graph indexes everything for a queryable audit trail
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

### Chainlink CRE

- Scoring agent runs inside TEE
- GitHub PAT and Gemini API keys are never exposed outside the enclave
- Only final scores leave for DON consensus
- Anyone can verify what code ran via attestation
- DON consensus verifies attested enclave output before on-chain submission

### Ledger

- Admin or grantor physically confirms each payout on Ledger device before funds move
- ECDSA signature verified on-chain via EIP-191
- Funds cannot move without a physical button press even if the server is compromised
- Signed approval hash stored on-chain alongside every transaction

### The Graph

- Subgraph indexes all payouts, scores, and milestone completions
- Grant committees can query full disbursement history for reporting
- Contributors build a portable on-chain delivery record for future applications

---

## Smart Contracts

Compiled with Solc 0.8.32, Foundry, OpenZeppelin v5.7.0. Deployed on Base Sepolia.

| Contract | Purpose |
|----------|---------|
| FlintRegistry.sol | Protocol entry point for repo and grant registration |
| FlintGrant.sol | Grant mode: milestone escrow, tranche releases, 14-day auto-release |
| FlintEscrow.sol | Open mode: scoring, Ledger approval, batch payout, 30-day timeout |
| FlintBatch.sol | Batch ERC-20 payment with Ledger ECDSA verification |
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

## Architecture

```
Layer 1   Data Ingestion
          GitHub App webhooks, CONTRIBUTORS.md wallet mapping

Layer 2   Confidential Scoring   [Chainlink CRE]
          Gemini Flash inside TEE, complexity scoring,
          gaming detection, only scores leave the enclave

Layer 3   Verification   [Chainlink DON]
          BFT consensus on attested output, on-chain score submission

Layer 4   Human Approval   [Ledger]
          Admin or grantor reviews, physical confirmation, ECDSA on-chain

Layer 5   Disbursement   [Smart Contracts]
          Tranche release, batch payout, ERC-5484 soulbound mint

Layer 6   Audit Trail   [The Graph]
          Subgraph, queryable history, on-chain reputation record
```

---

## Tech Stack

| Part | Technology |
|------|------------|
| Smart Contracts | Foundry, Solc 0.8.32, OpenZeppelin v5.7.0 |
| AI Scoring | Chainlink CRE Confidential Workflow (TypeScript) |
| LLM | Gemini 3.5 Flash Lite inside TEE |
| Trust Layer | Ledger ECDSA verification and physical approval |
| Frontend | Next.js |
| Indexing | The Graph |
| Identity | CONTRIBUTORS.md and EIP-191 wallet signature |
| Chain | Base Sepolia testnet |
| Token | ERC-20 USDC compatible |

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
│   └── script/            Deploy.s.sol
├── chainlink-cre/
│   └── flint-scorer/
│       ├── workflow.ts    TEE handler: fetch, score, submit
│       ├── main.ts
│       └── workflow.yaml
├── frontend/              Next.js dashboard
├── subgraph/              The Graph subgraph
├── ledger/                Ledger integration
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
| Hardware approval gate | Yes | No | No | No | Yes |
| Auto-release timeout | No | No | No | No | Yes |
| Queryable audit trail | No | No | No | No | Yes |
| On-chain reputation record | No | No | No | No | Yes |

---

## One-Line Pitch

Flint is a trustless disbursement protocol for grants and open source — work verified inside a TEE, Ledger proves a human approved, blockchain records everything.

---

*Built for ETHGlobal ETHOnline — Chainlink + Ledger + The Graph tracks*