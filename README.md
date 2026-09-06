# Flint 🔥

> Your commits. Your reputation. Your reward.

Flint is a trustless reputation-based reward protocol for open source contributors. No manager. No spreadsheet. No trust required — the protocol scores your GitHub contributions, Ledger proves a human approved, and funds move on-chain automatically.

---

## The Problem

Every open source project — GSoC, C4GT, LFX, YC-backed OSS, independent repos — has the same unsolved problem:

There is always **one human in the middle** whose job is to:
- Track who contributed what
- Calculate fairness manually in spreadsheets
- Collect wallet addresses via Google Forms
- Send funds one by one or via basic multisender tools
- Record proof manually with screenshots

That person is a bottleneck, a trust assumption, and a single point of failure. Flint eliminates them entirely.

---

## The Solution

Flint is a two-sided protocol:

**For maintainers** — deposit a reward pool, connect your GitHub repo, set scoring rules. Flint handles everything. You only touch one thing: the Ledger device that approves the final payout.

**For contributors** — connect your GitHub and wallet once. Contribute to any Flint-enabled repo. Your reputation score builds automatically. When a cycle ends, you get paid proportionally — no application, no invoice, no chasing.

---

## How It Works

```
Maintainer deposits pool
        ↓
Contributors work on GitHub (PRs, issues, reviews, docs)
        ↓
Chainlink Functions fetches GitHub data on-chain (tamper-proof)
        ↓
AI agent scores contributions using weighted rubric
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

## Two Modes

### Program Mode
For structured programs — GSoC, C4GT, LFX, company OSS grants.
- Fixed contributor pool (known participants)
- Cycle-based disbursement (monthly, quarterly)
- Maintainer sets total pool and scoring weights
- Agent calculates each contributor's share

### Open Mode
For any repo — independent maintainers, YC-backed OSS, AI agent frameworks.
- Anyone can contribute to any Flint-enabled repo
- Maintainer deposits a bounty pool
- Contributors compete on reputation score
- Top contributors share the pool at cycle end

---

## Scoring Engine

Contributions are scored on-chain via **Chainlink Functions** fetching GitHub API data. Nobody can manipulate the score — not Flint, not the maintainer.

### Signals (weighted):

| Signal | Weight | Why |
|--------|--------|-----|
| Merged PRs | 35% | Strongest quality signal — peer-reviewed and accepted |
| Issue resolutions | 25% | Problem-solving, not just code volume |
| Code review participation | 20% | Community health, knowledge sharing |
| Documentation contributions | 10% | Often ignored, critical for adoption |
| Community engagement | 10% | Issues opened, discussions, mentoring |

### What we explicitly ignore:
- Raw commit count (gameable)
- Lines of code added (favors bloat)
- Stars received (vanity metric)

---

## Sponsor Integrations

### Ledger — Trust Layer
- Treasury private key lives in `wallet-cli ring` (Ledger Key Ring) — never in a `.env`
- Agent gets a scoped capability to sign only the approved batch
- Maintainer physically confirms payout on Ledger device before any funds move
- Signed approval hash stored on-chain alongside transaction — permanent audit trail
- Even if server is compromised, keys cannot be exfiltrated

### Chainlink — Tamper-proof Scoring
- Chainlink Functions fetches GitHub API data on-chain
- Scoring happens on-chain, not in Flint's backend
- Nobody can accuse the platform of manipulating contributor scores
- Verifiable, decentralized, trustless data source

### The Graph — Audit Trail
- Subgraph indexes all disbursement events, contributor scores, payout history
- Any maintainer can query: "show all payouts to this contributor across all programs"
- Contributors build a portable on-chain open source resume
- Fully queryable, forever, by anyone

---

## Tech Stack

```
Frontend:        Next.js — maintainer dashboard, contributor profile
Smart Contracts: Solidity — escrow contract, batch payment, ERC-5484 soulbound token
Scoring:         Chainlink Functions — on-chain GitHub data fetching
Trust Layer:     Ledger Key Ring (wallet-cli ring) — treasury key management
Auth:            GitHub OAuth + wallet signature (identity verification)
Indexing:        The Graph — subgraph for all on-chain events
Chain:           Ethereum Sepolia testnet
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FLINT PROTOCOL                    │
├─────────────────────────────────────────────────────┤
│  Layer 1 — Data Ingestion                           │
│  GitHub API · wallet addresses · program config     │
├─────────────────────────────────────────────────────┤
│  Layer 2 — Scoring  [Chainlink Functions]           │
│  On-chain GitHub fetch · weighted rubric · scores   │
├─────────────────────────────────────────────────────┤
│  Layer 3 — Human Approval Gate  [Ledger]            │
│  Maintainer reviews · physical confirmation · hash  │
├─────────────────────────────────────────────────────┤
│  Layer 4 — Disbursement                             │
│  Batch payment contract · ERC-5484 soulbound mint   │
├─────────────────────────────────────────────────────┤
│  Layer 5 — Audit Trail  [The Graph]                 │
│  Subgraph · queryable history · contributor resume  │
└─────────────────────────────────────────────────────┘
```

---

## Smart Contracts

### FlintEscrow.sol
- Maintainer deposits reward pool
- Holds funds until Ledger-signed approval is verified
- Auto-release timeout: if maintainer doesn't approve within 30 days, funds release based on agent scores
- Protects contributors from maintainers using free labor with no payout intent

### FlintBatch.sol
- Executes batch payments to all contributors in one transaction
- Verifies Ledger-signed approval hash before executing
- Emits events for The Graph to index

### FlintReceipt.sol (ERC-5484)
- Mints soulbound token per contributor per cycle
- Non-transferable, permanent proof of contribution
- Metadata: repo, cycle, score, amount received
- Becomes contributor's on-chain open source resume

---

## GitHub Identity Verification

Contributors prove their GitHub identity on-chain via:
1. Sign a message with their wallet: `"I am github.com/{username} — wallet: {address}"`
2. Post the signature as a GitHub Gist
3. Flint verifies the Gist via Chainlink Functions on-chain
4. Mapping stored: `githubUsername → walletAddress`

This prevents anyone from claiming another person's contributions.

---

## Repo Structure

```
flint/
├── contracts/
│   ├── FlintEscrow.sol
│   ├── FlintBatch.sol
│   └── FlintReceipt.sol
├── chainlink/
│   └── scoring-function.js     # Chainlink Functions source
├── subgraph/
│   ├── schema.graphql
│   ├── subgraph.yaml
│   └── src/mappings.ts
├── frontend/
│   ├── app/
│   │   ├── dashboard/           # Maintainer dashboard
│   │   ├── contributor/         # Contributor profile
│   │   └── program/[id]/        # Program page
│   └── components/
├── ledger/
│   └── setup.md                 # Ledger Key Ring setup guide
└── README.md
```

---

## Build Order (4 Days)

### Day 1 — Contracts + Identity
- [ ] `FlintEscrow.sol` — deposit, hold, timeout logic
- [ ] `FlintBatch.sol` — batch payment with approval verification
- [ ] `FlintReceipt.sol` — ERC-5484 soulbound token
- [ ] GitHub identity verification flow
- [ ] Deploy on Sepolia

### Day 2 — Chainlink Scoring
- [ ] Chainlink Functions job — fetch GitHub API
- [ ] Scoring rubric implementation
- [ ] On-chain score storage
- [ ] Test with real GitHub repos

### Day 3 — Ledger + Frontend
- [ ] Ledger Key Ring setup (`wallet-cli ring`)
- [ ] Hook Ledger confirmation into disbursement flow
- [ ] Next.js dashboard — maintainer flow
- [ ] Contributor profile page
- [ ] Connect wallet + GitHub OAuth

### Day 4 — The Graph + Demo Polish
- [ ] Subgraph schema and mappings
- [ ] Deploy subgraph
- [ ] Query integration in dashboard
- [ ] End-to-end demo flow
- [ ] Demo video recording

---

## Demo Flow (for video)

1. Maintainer deposits 1000 USDC into escrow for `test-repo`
2. Show 3 contributors with merged PRs on GitHub
3. Click "Calculate scores" — Chainlink fetches data live
4. Scores appear: Alice 45%, Bob 35%, Charlie 20%
5. Maintainer clicks "Approve payout"
6. **Ledger device lights up — physical button press on camera**
7. Transaction executes — Alice, Bob, Charlie receive funds
8. Soulbound tokens minted in each wallet
9. Open The Graph — query full payout history

---

## What Makes Flint Different

| | Disperse.app | SourceCred | GitDrip | **Flint** |
|---|---|---|---|---|
| AI scoring | ❌ | ✅ | ✅ | ✅ |
| On-chain proof | ❌ | ❌ | ✅ | ✅ |
| Human approval | ❌ | ❌ | ❌ | ✅ |
| Hardware signing | ❌ | ❌ | ❌ | ✅ |
| Audit trail | ❌ | ❌ | ❌ | ✅ |
| Any repo | ✅ | ✅ | ✅ | ✅ |
| Structured programs | ❌ | ❌ | ❌ | ✅ |

---

## One-Line Pitch

> Flint is the trustless compensation layer for open source — GitHub reputation becomes crypto, agents calculate, Ledger proves, blockchain records.

---

*Built for ETHGlobal ETHOnline — Ledger + Chainlink + The Graph tracks*
