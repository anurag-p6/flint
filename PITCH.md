# Flint — Pitch Q&A

All key questions, research, and answers compiled from pre-build planning.

---

## Q1: Rate this idea and how feasible is it for ETHOnline?

### Idea Rating: 8/10

**Strengths:**
- The problem is real and well-scoped — the "one human bottleneck" framing is compelling and judges will understand it immediately
- The Ledger device lighting up on camera is an excellent hackathon demo moment — tactile, visual, memorable
- ERC-5484 soulbound receipts as an on-chain OSS resume is a genuinely novel framing, not just a utility feature
- Sponsor integrations are deep, not superficial — Chainlink is doing real work (not just a price feed), Ledger is in the critical path (not bolted on)
- The differentiation table is sharp — Flint wins on every column that matters to judges

**Weaknesses:**
- "AI agent scores contributions" is vague — is this Chainlink Functions + a weighted rubric (fine) or an LLM agent (scope creep)?
- The GitHub identity flow via Gist + Chainlink Functions verification is a second non-trivial Chainlink job that adds risk

### Feasibility with 6 Days: 7.5/10

| Day | Focus | Risk |
|---|---|---|
| Day 1 | Contracts (FlintEscrow, FlintBatch, FlintReceipt) + deploy Sepolia | Low |
| Day 2 | Chainlink Functions — GitHub fetch + scoring rubric | Medium |
| Day 3 | GitHub identity verification + Ledger Key Ring integration | High (buffer absorbed) |
| Day 4 | Frontend — maintainer dashboard + contributor profile | Medium |
| Day 5 | The Graph subgraph + query integration in frontend | Low |
| Day 6 | End-to-end testing, demo polish, video recording | Low |

**What AI agents compress well:**
- Contract boilerplate (ERC-5484, escrow logic, batch payment)
- Subgraph schema + mappings
- Next.js dashboard scaffolding
- Chainlink Functions script first draft

**What AI agents don't compress:**
- Chainlink Functions debugging (sandboxed env, opaque errors, costs LINK per test)
- Ledger Key Ring integration against a physical device
- End-to-end integration testing across all layers

---

## Q2: Winning project or nalla?

### Rating: 7.5/10 — Solid Contender, Not a Guaranteed Winner

**Why it's NOT nalla:**
- Problem is real and relatable — ETHGlobal judges are mostly developers who have felt the OSS payment frustration firsthand
- Three sponsor tracks (Ledger + Chainlink + The Graph) = three separate prize pools
- Ledger device on camera is cinematic — most projects are just clicking browser buttons
- Scoring algorithm is defensible and sophisticated
- ERC-5484 soulbound as on-chain OSS resume is a fresh angle judges will remember

**Why it's NOT a guaranteed main prize winner:**

| Weakness | Reality |
|---|---|
| Not a new concept | SourceCred launched in 2019. GitDrip, Coordinape, Drips all exist |
| Chicken-and-egg problem | Why would maintainers use this? Need a crisp answer ready |
| "AI agent" framing is misleading | It's a weighted rubric — call it what it is or add an actual LLM layer |
| GitHub dependency | Chainlink proves the fetch is tamper-proof but GitHub itself can be gamed upstream |
| Adoption friction | Contributors + maintainers both need to register and trust Flint |

**Prize probability:**
- Sponsor prizes (Ledger / Chainlink / The Graph): **8.5/10** — at least one is very likely
- Main ETHOnline prize: **5/10** — needs infrastructure framing, not product framing

**The one thing that could push it to 9/10:**
Show one real maintainer (even a friend's repo) using it during the demo with actual GitHub data. Judges can smell fake demos.

---

## Q3: Scoring & Payout Algorithm

### Two-Phase Design

- **Phase 1:** Score each contributor — runs via Chainlink Functions
- **Phase 2:** Calculate payout from scores — runs in the smart contract

### Phase 1 — Composite Score

```
Composite_Score = (0.45 × PR_Score)
                + (0.30 × Review_Score)
                + (0.15 × Issue_Score)
                + (0.10 × Community_Score)
```

**Why these weights?** Research from SourceCred, Drips Wave, and CHAOSS all agree that code review is systematically undervalued in naive systems. We deliberately over-index it at 30%.

---

#### Tier 1 — PR Score (45%)

```
PR_Score = Σ (for each merged PR):
    base_points
  × review_depth_multiplier
  × log_size_factor
  × recency_decay

Where:
  base_points             = trivial  = 1.0  (typos, docs)
                            medium   = 1.5  (standard features)
                            high     = 2.0  (architecture, integrations)
                            critical = 3.0  (security, breaking changes)
                            default  = 1.0  (no label = trivial)

  review_depth_multiplier = 1 + (0.15 × min(review_comment_rounds, 5))

  log_size_factor         = log2(changed_files + additions/100 + 1) / log2(10)
                            1 file ≈ 0.3 | 100+ files ≈ 1.0

  recency_decay           = e^(-0.05 × weeks_since_merge)
                            half-weight at ~14 weeks, near-zero at ~1 year

HARD RULE: Unmerged PRs score 0.
ANTI-GAMING: Only PRs with >= 1 human review or comment count.
```

---

#### Tier 2 — Review Score (30%)

```
Review_Score = Σ (for each review on others' PRs):
    type_weight × depth_bonus × authority_factor

Where:
  type_weight      = REQUEST_CHANGES = 1.0
                     COMMENT         = 0.7
                     APPROVE         = 0.5

  depth_bonus      = 1 + (0.1 × min(inline_comments, 10))

  authority_factor = 1.0 (MEMBER/COLLABORATOR)
                     0.7 (external CONTRIBUTOR)

ANTI-GAMING: Self-reviews excluded. Reviews on your own PRs score 0.
```

---

#### Tier 3 — Issue Score (15%)

```
Issue_Score = Σ (for each issue opened):
    base_points × resolution_bonus × label_weight × engagement_factor

Where:
  base_points      = 1.0

  resolution_bonus = completed   = 1.5
                     not_planned = 0.5
                     duplicate   = 0.2

  label_weight     = security/critical = 1.5
                     bug              = 1.0
                     enhancement      = 0.8
                     question         = 0.5
                     no label         = 0.7

  engagement_factor = 1 + (0.05 × min(comments_from_others, 20))
```

---

#### Tier 4 — Community Score (10%)

```
Community_Score =
    (0.5 × doc_prs_merged)
  + (0.3 × issues_triaged)
  + (0.2 × first_contributor_helps)
```

---

### Phase 2 — Payout Calculation (on-chain in smart contract)

#### Proportional (Program Mode — default)

```
payout_i = (score_i / Σ all_scores) × total_pool

Example:
  Alice = 450 pts, Bob = 350 pts, Carol = 200 pts
  Pool = 10,000 USDC

  Alice → $4,500 | Bob → $3,500 | Carol → $2,000
```

#### Square Root Distribution (Open Mode — fairer for long tails)

```
payout_i = (√score_i / Σ √all_scores) × total_pool

Same example:
  √450 = 21.2 | √350 = 18.7 | √200 = 14.1 | Sum = 54.0

  Alice → $3,926 | Bob → $3,463 | Carol → $2,611
```

Compresses the gap — top contributor still earns most but lower contributors aren't left with scraps.

#### Minimum Floor (optional)

```
if (payout_i > 0 && payout_i < floor):
    payout_i = floor
    // remaining pool redistributed proportionally to others
```

---

### What Runs Where

| Step | Where | Why |
|---|---|---|
| Fetch GitHub API data | Chainlink Functions | Tamper-proof off-chain data |
| Calculate tier scores | Chainlink Functions | Done with fetched data |
| Store raw scores on-chain | Smart contract | Permanent, auditable |
| Payout formula | Smart contract | Pure math, no external data |
| Ledger signs batch | Ledger Key Ring | Human approval gate |
| Events indexed | The Graph | Audit trail |

**Implementation note:** Store scores as `uint256` scaled by `1e6` — keeps floating point math clean in Solidity.

---

### Anti-Gaming Summary

| Attack | Defense |
|---|---|
| Spam unmerged PRs | `merge_bonus = 0` for unmerged |
| Giant meaningless PRs | `log_size_factor` — diminishing returns |
| Rubber-stamp reviews | `APPROVE type_weight = 0.5` |
| Review ring exchanges | Self-reviews excluded; authority_factor penalizes external circles |
| Issue spam | `duplicate resolution_bonus = 0.2`; engagement requires others to comment |
| Historical credit farming | `recency_decay` — old contributions lose weight exponentially |

---

## Q4: How to make Flint infrastructure, not a product?

### The Core Shift

**Product:** "Maintainers use our dashboard to pay contributors."

**Infrastructure:** "Any platform, DAO, or protocol can plug into Flint's scoring and payout primitives."

### Architectural Additions

**1. `FlintRegistry.sol` — Permissionless Protocol Entry Point**

```solidity
FlintRegistry.registerRepo(
  bytes32 repoId,
  address treasury,
  IScoringAdapter scoringAdapter,
  IPayoutPolicy payoutPolicy
)
```

Same move ENS made — single on-chain registry anyone can write to.

---

**2. `IScoringAdapter` Interface — Pluggable Scoring**

```solidity
interface IScoringAdapter {
  function getScore(address contributor, bytes32 repoId)
    external view returns (uint256);
}
```

- `GitHubScoringAdapter` — what you're building via Chainlink Functions
- Tomorrow: `GitLabScoringAdapter`, `JiraScoringAdapter`, `DiscordScoringAdapter`
- Flint becomes the rails. Others build the adapters.

---

**3. `IPayoutPolicy` Interface — Pluggable Distribution**

```solidity
interface IPayoutPolicy {
  function calculate(uint256[] scores, uint256 pool)
    external pure returns (uint256[] payouts);
}
```

- `ProportionalPolicy`
- `SqrtPolicy`
- `EqualSharePolicy`
- DAOs deploy their own custom policies

---

**4. Flint Score as Portable On-Chain Identity**

The ERC-5484 soulbound token becomes a queryable on-chain reputation:

```
contributor 0xABC → Flint Score: 847 (across 12 repos, 3 cycles)
```

Other protocols compose on it:
- DeFi protocol gives undercollateralized loans to Flint Score > 500
- DAO assigns voting weight proportional to Flint Score
- Hiring platform queries Flint Score instead of asking for a resume
- Grant committee uses Flint Score as eligibility criteria

---

### Positioning Shift

| | Product Framing | Infrastructure Framing |
|---|---|---|
| Who uses it | Maintainers with a dashboard | Developers building compensation systems |
| Core value | Automates OSS payments | Portable on-chain developer reputation |
| Moat | UX | Network effects from score data |
| Comparable | Disperse.app | Uniswap / ENS |
| Judge pitch | "Tool for GSoC" | "Reputation layer for all of open source" |

### Hackathon Execution (half a day of extra work)

1. Add `IScoringAdapter` and `IPayoutPolicy` interfaces to contracts
2. `FlintRegistry.sol` as the permissionless entry point
3. In demo: show the interface and say "GitHub is our first adapter. GitLab, Discord, Jira — same interface."
4. Show one external query of Flint Score via The Graph

---

### Pitch Upgrade

**Before:** *"Flint is the trustless compensation layer for open source."*

**After:** *"Flint is the on-chain reputation primitive for open source — GitHub today, every platform tomorrow."*

---

## Q5: Do any competitors exist at ETHGlobal?

### Short Answer: No. The shelf is empty.

| Project | Built at ETHGlobal? | Actual Origin | ETHGlobal Connection |
|---|---|---|---|
| SourceCred | No | Protocol Labs / EF grant, ~2018 | Co-founder judged at ETHAmsterdam 2022 |
| GitDrip (YoneCode) | No | GenLayer Builder Portal, 2026 | None — different ecosystem entirely |
| Coordinape | No | Yearn Finance internal tool, 2021 | Yearn was a prize sponsor, never submitted |
| Drips (Radicle) | No | Radicle core team, ~2022 | Radicle sponsored prize tracks, never submitted |

### What This Means

The ETHGlobal OSS funding / contributor reputation prize shelf is essentially unclaimed. Nobody has shipped a GitHub reputation + trustless payout protocol at ETHGlobal and won with it.

### Closest Competition: GitDrip on GenLayer

A project called `YoneCode/GitDrip` solves nearly the same problem using GenLayer's AI validator network. If a judge has seen it, they'll compare. Flint's differentiators:

| | GitDrip (GenLayer) | Flint |
|---|---|---|
| Human approval gate | None | Ledger hardware signing |
| Data source | GenLayer validators | Chainlink Functions (tamper-proof) |
| Portable identity | None | ERC-5484 soulbound token |
| Contribution modes | Single mode | Program Mode + Open Mode |
| Audit trail | None | The Graph subgraph |

### Sponsors Active in This Space at Past ETHGlobal Events

- **Radicle** — prize sponsor at ETHAmsterdam 2022 ($3,000) and ETHNewYork 2022 ($3,000)
- **SkillWallet** — prize sponsor at ETHAmsterdam 2022 ($8,000) for DAO contributor identity
- **Superfluid** — prize sponsor for contributor payment streams

This history confirms judges in this space exist and have funded adjacent ideas before.

---

## Q6: Grant Programs as a Third Mode

### The Insight

Grant programs — both Web3 and Web2 — are a bigger market than OSS contributor rewards. They have the exact same problem but with higher stakes and more paperwork.

**Web3 grant programs running manually today:**
- Ethereum Foundation (~$30M+/year)
- Uniswap Grants Program
- Arbitrum DAO grants (~$50M+/year)
- Optimism RetroPGF (~$100M+/year)
- Aave Grants, Compound Grants, ENS Ecosystem Fund

**Web2 FOSS grant programs running manually today:**
- Google Summer of Code
- Mozilla Open Source Support (MOSS)
- Microsoft FOSS Fund
- Linux Foundation grants
- Apache Foundation project grants
- Ford Foundation Digital Infrastructure grants

**Current reality for all of them:**
- Google Forms for applications
- Notion/spreadsheets for milestone tracking
- Bank wires / SWIFT for payments (heavy KYC, days of latency)
- Manual Gnosis Safe transactions for Web3 (still no milestone verification)
- Screenshots as "proof" of milestone completion
- Grant committee members as single points of failure and trust

### Grant Mode: How Flint Solves It

**On-chain grant agreement — no lawyers, no paperwork:**

```
FlintGrant.createGrant(
  address grantee,
  uint256 totalAmount,
  Milestone[] milestones,   // { description, verificationFn, tranchePercent }
  address ledgerApprover
)
```

**Milestone verification options (via Chainlink Functions):**

| Milestone Type | How Chainlink Verifies |
|---|---|
| Ship v1 / tag a release | GitHub releases API — check tag exists |
| Deploy to mainnet | Etherscan API — verify contract address |
| Reach N GitHub stars | GitHub repo API — check stargazers_count |
| Complete audit | Fetch audit report URL, verify it exists |
| Hit N active users | Dune Analytics API or on-chain event count |
| Manual milestone | Falls back to Ledger-signed approval only |

**Tranche disbursement flow:**

```
Grant created → 30% released immediately (upfront)
     ↓
Milestone 1 completed → Chainlink verifies on-chain
     ↓
Grant committee reviews → Ledger signs approval
     ↓
30% tranche released → ERC-5484 minted (proof of milestone 1)
     ↓
Milestone 2 (final) completed → same flow
     ↓
40% released → final ERC-5484 minted
     ↓
The Graph indexes entire grant history
```

**Timeout protection (both directions):**
- If grantee abandons: grantor can reclaim undisbursed funds after deadline
- If committee delays approval after verified milestone: funds auto-release after 14 days (protects grantee from bureaucracy)

### Why This is Stronger Than Just Contributor Rewards

| | Contributor Rewards | Grant Programs |
|---|---|---|
| Market size | Medium (OSS bounties) | Large (billions/year in grants) |
| Pain intensity | Annoying | High — legal, fiduciary, cross-border |
| Ledger fit | Good | Excellent — grant committees have fiduciary duty |
| Audit trail need | Nice to have | Required — grant reporting obligations |
| Chainlink fit | Good (scoring) | Excellent (milestone verification) |
| Differentiation | Several competitors | Near zero competitors |

### New Contract: `FlintGrant.sol`

Key additions beyond `FlintEscrow.sol`:
- `Milestone[]` struct with on-chain milestone definitions
- `verifyMilestone(uint256 milestoneId)` — triggers Chainlink Functions job
- `releaseTranche(uint256 milestoneId, bytes ledgerSignature)` — releases % of pool
- `autoRelease(uint256 milestoneId)` — timeout fallback after 14 days of verified-but-unpaid
- `reclaimUndisbursed()` — grantor reclaim if grantee abandons

---

## One-Line Pitches

**Product pitch:** *"Flint automates OSS contributor payments — GitHub reputation becomes crypto, Ledger proves a human approved, blockchain records everything."*

**Infrastructure pitch:** *"Flint is the trustless disbursement layer for open source and grants — reputation scores contributors, milestones unlock grant tranches, Ledger proves a human approved, blockchain records everything."*

**Grant pitch:** *"Every Web3 grant program runs on Google Forms and Gnosis Safe. Flint replaces both — milestones on-chain, Chainlink verifies completion, Ledger approves disbursement, no bank required."*

**Demo closer:** *"No manager. No spreadsheet. No bank. No trust required. Just the Ledger."*

---

## Market Size (Updated)

| Segment | Volume | Current Tool | Flint Mode |
|---|---|---|---|
| Web3 grant programs | ~$500M+/year | Gnosis Safe + Notion | Grant Mode |
| Web2 FOSS grants | ~$100M+/year | Bank wire + Google Forms | Grant Mode |
| OSS contributor rewards (GSoC etc.) | ~$50M+/year | Spreadsheets + PayPal | Program Mode |
| Repo bounty pools | Growing | Disperse.app | Open Mode |

The grant market alone dwarfs the contributor reward market by 10x.

---

## Business Case — Market Numbers for Judges

### Total Addressable Market

| Segment | Annual Size | Why Flint Wins |
|---------|------------|----------------|
| **Web3 grants** | $500M+/year (EF, Arbitrum, Optimism, Uniswap, Gitcoin) | They all use Google Forms + Gnosis Safe. No milestone verification, no audit trail. Flint replaces both. |
| **OSS programs** | GSoC (1800 contributors/yr), LFX, C4GT, Outreachy | Every program has one human manually tracking + paying. Flint automates it. |
| **Cross-border payments** | Top OSS countries: India, Brazil, Nigeria, Bangladesh | SWIFT fees $25-45, 3-5 day delays, PayPal unavailable. USDC via Flint is a 10x improvement. |
| **Stablecoin B2B payments** | $2.8T stablecoin volume in 2025 | Flint is a real use case for stablecoin — not speculation, actual payroll. |

### Revenue Model

```
Free tier:    Open Mode — any repo, up to 10 contributors, 0% fee
Growth tier:  Program Mode — 1-2% protocol fee on disbursements
Enterprise:   Grant Mode — flat monthly fee for grant programs
              (EF, Arbitrum DAO, etc. manage dozens of grants)

Example: Arbitrum DAO disbursed ~$50M in grants in 2024
         1% protocol fee = $500K ARR from ONE customer
```

### Wedge Strategy (Go-to-Market)

```
Phase 1 (now):    Free tool for small OSS repos → adoption
Phase 2:          GSoC/LFX programs adopt → credibility
Phase 3:          Web3 grant programs pay for Grant Mode → revenue
Phase 4:          Flint Score becomes the on-chain reputation primitive
                  → DeFi integrations, DAO voting, hiring platforms
```

### Numbers for the Pitch Deck / Demo

- **$500M+** in Web3 grants disbursed annually with zero on-chain tooling
- **18,000+** GSoC contributors since inception — all paid via manual bank wire
- **40%** of top OSS contributors are in countries where PayPal doesn't work
- **$0** existing solutions that combine scoring + hardware approval + audit trail
- **1 click** to replace a process that currently takes a program manager 20+ hours per cycle

### The Killer Slide

> "Every grant program in Web3 runs on the same stack: Google Forms for applications, Notion for tracking, Gnosis Safe for payments, screenshots for proof. That's a $500M/year market running on duct tape. Flint replaces all four."

### Strongest Angle for Judges

Lead with **Grant Mode** — it's the biggest market ($500M+), the pain is obvious (everyone's seen terrible grant processes), and the revenue model is clear (% fee on disbursements). OSS programs are the wedge, grants are the business.
