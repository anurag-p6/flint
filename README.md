# Flint

> Your commits. Your reputation. Your reward.

Flint is a trustless disbursement protocol for open source contributors and grant programs. An AI agent scores GitHub contributions inside a hardware-isolated enclave (Chainlink CRE Confidential Workflow), a Ledger device proves a human approved, and funds move on-chain automatically. ERC-5484 soulbound tokens record everything as a permanent on-chain resume.

---

## The Problem


### For Grant Programs

Grant programs ($500M+/year in Web3 alone) run on Google Forms for applications, Notion for tracking, Gnosis Safe for payments, and screenshots for proof. Heavy KYC paperwork, SWIFT delays, no milestone verification, no audit trail. That's a $500M/year market running on duct tape.

### For OSS Programs

Every open source program - GSoC, LFX, YC-backed OSS, independent repos — has one human in the middle who manually tracks contributions, calculates fairness in spreadsheets, collects wallet addresses via Google Forms, and sends funds one by one. That person is a bottleneck, a trust assumption, and a single point of failure.

### For Global South Contributors

Top OSS contributor countries: India, China, Brazil, Nigeria, Egypt, Bangladesh. Bank wire fees ($25-45), delays (3-5 days), PayPal unavailable in many countries. Stablecoin payment via Flint is a genuine 10x improvement for cross-border contributor compensation.

---

## The Solution

**For maintainers** — deposit a reward pool, connect your GitHub repo. Flint's AI agent scores contributions inside a TEE enclave — even Flint can't manipulate the results. You only touch one thing: the Ledger device that approves the final payout.

**For contributors** — connect your GitHub and wallet once. Contribute to any Flint-enabled repo. Your Flint Score builds automatically. When a cycle ends, you get paid proportionally — no application, no invoice, no chasing.

**For grant committees** — deposit grant funds into escrow, define milestones on-chain. Chainlink verifies completion automatically. Each tranche requires Ledger-signed approval. The Graph gives you a queryable audit trail for reporting.

---

## How It Works

```
Maintainer deposits pool / Grantor deposits grant
        ↓
Contributors work on GitHub (PRs, issues, reviews, docs)
        ↓
CRE Confidential Workflow fetches GitHub data inside TEE enclave
        ↓
AI agent (xAI Grok) classifies contribution complexity inside TEE
        ↓
Scoring algorithm runs inside TEE — only final scores leave the enclave
        ↓
DON consensus verifies attested enclave output
        ↓
Scores submitted on-chain to FlintEscrow
        ↓
Maintainer reviews scores on dashboard
        ↓
Maintainer physically confirms on Ledger device → signed approval hash
        ↓
Batch payment contract executes payouts
        ↓
ERC-5484 soulbound token minted per contributor (permanent proof of work)
        ↓
The Graph indexes everything → queryable audit trail forever
```

---

## Three Modes

### Program Mode
For structured programs — GSoC, C4GT, LFX, company OSS programs.
- Fixed contributor pool (known participants)
- Cycle-based disbursement (monthly, quarterly)
- Maintainer sets total pool and scoring weights
- AI agent calculates each contributor's share

### Open Mode
For any repo — independent maintainers, YC-backed OSS, AI agent frameworks.
- Anyone can contribute to any Flint-enabled repo
- Maintainer deposits a bounty pool
- Contributors compete on Flint Score
- Top contributors share the pool at cycle end (square root distribution for fairness)

### Grant Mode
For grant programs — Ethereum Foundation, Uniswap Grants, Arbitrum DAO, Mozilla, Linux Foundation, any organization that funds external projects.
- Grantor deposits full grant amount into escrow upfront
- Milestones defined on-chain at creation (e.g., "ship v1", "deploy to mainnet", "reach 100 stars")
- Chainlink verifies milestone completion automatically
- Each milestone releases a tranche — configurable split (e.g., 30/30/40)
- Ledger-signed approval required per tranche
- ERC-5484 minted at each milestone — permanent proof of delivery
- Auto-release timeout: if committee delays approval 14 days after verified milestone, funds release automatically (protects grantees from bureaucracy)
- Grantor can reclaim undisbursed funds if grantee abandons after deadline

---

## Scoring Engine

Contributions are scored inside a Chainlink CRE Confidential Workflow. The scoring algorithm, API keys, and LLM responses run inside a hardware-isolated TEE enclave. Even Flint's operator cannot see or manipulate intermediate data. Only the final scores leave the enclave for DON consensus and on-chain submission.

### Composite Score

```
Composite_Score = (0.45 * PR_Score) + (0.30 * Review_Score) + (0.15 * Issue_Score) + (0.10 * Community_Score)
```

| Signal | Weight | Why |
|--------|--------|-----|
| Merged PRs | 45% | Strongest quality signal — peer-reviewed, accepted, AI-classified complexity |
| Code review participation | 30% | Systematically undervalued in naive systems — we over-index it deliberately |
| Issue resolutions | 15% | Problem identification and resolution |
| Community engagement | 10% | Documentation, triage, mentoring first-time contributors |

### AI Complexity Classification

Each merged PR is analyzed by xAI Grok inside the TEE enclave:
- **Complexity**: trivial / medium / high / critical (maps to base score multiplier)
- **Gaming detection**: flags suspicious patterns (rubber-stamp reviews, spam PRs)
- **Quality indicators**: tests included, docs updated, security-related

### Anti-Gaming Defenses

| Attack | Defense |
|--------|---------|
| Spam unmerged PRs | Unmerged PRs score 0 |
| Giant meaningless PRs | Logarithmic size factor — diminishing returns |
| Rubber-stamp reviews | APPROVE type_weight = 0.5 (lowest) |
| Review ring exchanges | Self-reviews excluded, authority factor penalizes external circles |
| Issue spam | Duplicate resolution bonus = 0.2, engagement requires others to comment |
| Historical credit farming | Exponential recency decay — old contributions lose weight |

### What We Explicitly Ignore
- Raw commit count (gameable)
- Lines of code added (favors bloat)
- Stars received (vanity metric)

---

## Sponsor Integrations

### Chainlink CRE — Confidential AI Scoring

The AI scoring agent runs as a Chainlink CRE Confidential Workflow inside a TEE (Trusted Execution Environment):
- GitHub API credentials and xAI API keys are released by the Vault DON only into attested enclaves
- PR diffs, LLM responses, and intermediate scoring data remain confidential inside the enclave
- Only the final contributor scores leave the TEE for DON consensus
- The workflow binary is publicly verifiable via attestation — anyone can verify exactly what code produced the scores
- Not even Flint's operator can manipulate scores or exfiltrate API credentials

### Ledger — Human Approval Gate

- Maintainer physically confirms payout on Ledger device before any funds move
- ECDSA signature verification on-chain — EIP-191 signed approval hashes
- Even if the server is compromised, funds cannot move without a physical button press
- Signed approval hash stored on-chain alongside transaction — permanent audit trail

### The Graph — Queryable Audit Trail

- Subgraph indexes all disbursement events, contributor scores, payout history, grant milestones
- Any maintainer can query: "show all payouts to this contributor across all programs"
- Grant committees get a queryable audit trail for reporting obligations
- Contributors build a portable on-chain open source resume via Flint Score
- Fully queryable, forever, by anyone

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FLINT PROTOCOL                    │
├─────────────────────────────────────────────────────┤
│  Layer 1 — Data Ingestion                           │
│  GitHub App webhooks · PR diffs · review data       │
├─────────────────────────────────────────────────────┤
│  Layer 2 — Intelligence  [CRE Confidential Workflow]│
│  xAI Grok inside TEE · complexity classification    │
│  gaming detection · scoring algorithm               │
├─────────────────────────────────────────────────────┤
│  Layer 3 — Verification  [Chainlink DON]            │
│  BFT consensus on attested enclave output           │
│  on-chain score submission                          │
├─────────────────────────────────────────────────────┤
│  Layer 4 — Human Approval Gate  [Ledger]            │
│  Maintainer reviews · physical confirmation · ECDSA │
├─────────────────────────────────────────────────────┤
│  Layer 5 — Disbursement  [Smart Contracts]          │
│  Payout math · batch payment · ERC-5484 mint        │
├─────────────────────────────────────────────────────┤
│  Layer 6 — Audit Trail  [The Graph]                 │
│  Subgraph · queryable history · contributor resume  │
└─────────────────────────────────────────────────────┘
```

---

## Smart Contracts

All contracts compiled with Solc 0.8.32, Foundry, OpenZeppelin v5.7.0, `via_ir = true`. Deployed on Ethereum Sepolia testnet.

### Core Contracts

| Contract | Purpose |
|----------|---------|
| **FlintRegistry.sol** | Permissionless protocol entry point — repo and grant registration |
| **FlintEscrow.sol** | Program/Open mode escrow — scoring, Ledger approval, batch payout, 30-day timeout |
| **FlintGrant.sol** | Milestone-based grant escrow — tranche releases, 14-day auto-release, grantor reclaim |
| **FlintBatch.sol** | Batch ERC-20 payment executor with Ledger ECDSA signature verification |
| **FlintReceipt.sol** | ERC-5484 soulbound NFT — fully on-chain JSON metadata (Base64) |
| **FlintIdentity.sol** | GitHub username to wallet mapping — EIP-191 signature verification |

### Pluggable Interfaces

| Interface | Purpose |
|-----------|---------|
| **IScoringAdapter** | Any data source can plug in — GitHub today, GitLab/Jira/Discord tomorrow |
| **IPayoutPolicy** | Any distribution curve — ProportionalPolicy and SqrtPolicy implemented |

### Payout Policies

**Proportional (Program Mode):** `payout_i = (score_i / sum_scores) * pool`

**Square Root (Open Mode):** `payout_i = (sqrt(score_i) / sum_sqrt) * pool` — compresses the gap so lower contributors aren't left with scraps (inspired by Quadratic Funding)

---

## Flint Score — Portable On-Chain Reputation

ERC-5484 soulbound receipts accumulate into a queryable on-chain reputation:

```
contributor 0xABC → Flint Score: 847 (across 12 repos, 3 cycles)
```

Other protocols can compose on it:
- **DeFi**: Undercollateralized loans for Flint Score > 500
- **DAOs**: Voting weight proportional to Flint Score
- **Hiring**: Query Flint Score instead of asking for a resume
- **Grants**: Eligibility criteria based on proven contribution history

---

## GitHub Identity Verification

Contributors prove their GitHub identity on-chain:
1. Sign a message with their wallet: `"I am github.com/{username} — wallet: {address}"`
2. Post the signature as a GitHub Gist
3. Flint verifies the Gist via Chainlink on-chain
4. Mapping stored: `githubUsername → walletAddress`

This prevents anyone from claiming another person's contributions.

---

## Tech Stack

```
Smart Contracts:  Foundry (Solc 0.8.32) + OpenZeppelin v5.7.0
AI Agent:         Chainlink CRE Confidential Workflow (TypeScript → WASM)
LLM:              xAI Grok API — PR complexity classification inside TEE
Trust Layer:      Ledger — ECDSA signature verification, physical approval gate
Frontend:         Next.js — maintainer dashboard, contributor profile
Indexing:         The Graph — subgraph for all on-chain events
Identity:         GitHub OAuth + EIP-191 wallet signature
Chain:            Ethereum Sepolia testnet
Token:            ERC-20 (USDC compatible)
```

---

## Repo Structure

```
flint/
├── contracts/                    # Foundry project — all smart contracts
│   ├── src/
│   │   ├── core/                 # FlintEscrow, FlintGrant, FlintBatch, FlintReceipt, FlintRegistry
│   │   ├── interfaces/           # IScoringAdapter, IPayoutPolicy, IERC5484
│   │   ├── policies/             # ProportionalPolicy, SqrtPolicy
│   │   ├── identity/             # FlintIdentity
│   │   └── mocks/                # MockUSDC
│   └── script/                   # Deploy.s.sol
├── chainlink-cre/                # Chainlink CRE Confidential Workflow
│   ├── project.yaml              # RPC config
│   ├── secrets.yaml              # Secret ID mapping
│   └── flint-scorer/             # Workflow source (TypeScript → WASM)
│       ├── workflow.ts           # TEE handler — GitHub fetch, LLM scoring, on-chain submission
│       ├── main.ts               # Runner entry point
│       └── workflow.yaml         # Workflow settings
├── frontend/                     # Next.js dashboard
├── subgraphs/                    # The Graph subgraph
├── ledger/                       # Ledger integration
├── CONTEXT.md                    # Full technical context
└── PITCH.md                      # Pitch Q&A and business case
```

---

## What Makes Flint Different

| | Disperse.app | SourceCred | GitDrip | Gnosis Safe | **Flint** |
|---|---|---|---|---|---|
| AI scoring | - | Yes | Yes | - | Yes |
| TEE-attested scoring | - | - | - | - | Yes |
| On-chain proof | - | - | Yes | - | Yes |
| Human approval | - | - | - | Yes | Yes |
| Hardware signing | - | - | - | Yes | Yes |
| Queryable audit trail | - | - | - | - | Yes |
| Any repo | Yes | Yes | Yes | Yes | Yes |
| Structured programs | - | - | - | - | Yes |
| Grant programs | - | - | - | - | Yes |
| Milestone-based tranches | - | - | - | - | Yes |
| Cross-border (stablecoin) | - | - | - | Yes | Yes |

---

## Market

| Segment | Size | Flint Mode |
|---------|------|------------|
| Web3 grant programs | $500M+/year | Grant Mode |
| Web2 FOSS grants (GSoC, Mozilla, Linux Foundation) | $100M+/year | Grant Mode |
| OSS contributor rewards | $50M+/year | Program Mode |
| Repo bounty pools | Growing | Open Mode |

---

> Flint is the on-chain reputation primitive for open source — GitHub today, every platform tomorrow.

*Built for ETHGlobal ETHOnline — Chainlink + Ledger + The Graph*
