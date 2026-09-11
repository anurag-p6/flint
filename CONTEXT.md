# Flint — Full Project Context

> Use this file to onboard a new agent session. Contains every decision, architecture detail, algorithm, and contract spec from the pre-build planning phase.

---

## 1. Project Overview

**Flint** is a trustless disbursement protocol for open source contributors and grant programs.

**One-line pitch:** *"Flint is the on-chain reputation primitive for open source — GitHub today, every platform tomorrow."*

**What it does:**
- Maintainers deposit a reward pool or grant
- An AI agent scores GitHub contributions (PRs, reviews, issues) using an LLM
- A Ledger device physically approves the payout (human gate)
- Funds move automatically via smart contracts
- Contributors receive ERC-5484 soulbound tokens as permanent on-chain proof of work
- The Graph indexes everything for a queryable audit trail

**Three modes:**
1. **Program Mode** — structured programs (GSoC, C4GT, LFX). Fixed contributor pool, cycle-based disbursement
2. **Open Mode** — any repo. Anyone contributes, top contributors share the pool at cycle end
3. **Grant Mode** — grant programs (Ethereum Foundation, Arbitrum DAO, Mozilla, etc.). Milestone-based tranche releases

**ETHOnline sponsor tracks:** Ledger, Chainlink, The Graph

---

## 2. Problem Statement

### Core Problem
Every OSS program has one human bottleneck who manually tracks contributions, calculates fairness in spreadsheets, collects wallet addresses via Google Forms, and sends funds one by one. That person is a trust assumption and single point of failure.

### Grant Disbursement Problem (Bigger Market)
Grant programs ($500M+/year in Web3 alone) use Google Forms + Notion + bank wires. Heavy KYC paperwork, SWIFT delays, no milestone verification, no audit trail.

### Stablecoin / Cross-Border Angle
Top OSS contributor countries: India, China, Brazil, Nigeria, Egypt, Bangladesh. Bank wire fees ($25-45), delays (3-5 days), PayPal unavailable in many countries. USDC payment is a genuine 10x improvement for Global South contributors.

### Problem Rating: 8/10
- OSS contributor compensation: 7.5/10 (saved by stablecoin + Global South angle)
- Grant disbursement: 8.5/10 (strongest leg — high stakes, terrible existing tools)
- Developer reputation portability: 7/10 (speculative but high ceiling)

---

## 3. Scoring Algorithm

### Two-Phase Design
- **Phase 1:** Score each contributor (runs via AI agent)
- **Phase 2:** Calculate payout from scores (runs in smart contract)

### Composite Score Formula

```
Composite_Score = (0.45 * PR_Score) + (0.30 * Review_Score) + (0.15 * Issue_Score) + (0.10 * Community_Score)
```

### Tier 1 — PR Score (45%)

```
PR_Score = SUM(for each merged PR):
    base_points * review_depth_multiplier * log_size_factor * recency_decay

base_points             = trivial=1.0, medium=1.5, high=2.0, critical=3.0 (label-based)
review_depth_multiplier = 1 + (0.15 * min(review_comment_rounds, 5))
log_size_factor         = log2(changed_files + additions/100 + 1) / log2(10)
recency_decay           = e^(-0.05 * weeks_since_merge)

HARD RULE: Unmerged PRs score 0.
ANTI-GAMING: Only PRs with >= 1 human review or comment count.
```

### Tier 2 — Review Score (30%)

```
Review_Score = SUM(for each review on others' PRs):
    type_weight * depth_bonus * authority_factor

type_weight      = REQUEST_CHANGES=1.0, COMMENT=0.7, APPROVE=0.5
depth_bonus      = 1 + (0.1 * min(inline_comments, 10))
authority_factor = 1.0 (MEMBER/COLLABORATOR), 0.7 (external CONTRIBUTOR)

Self-reviews excluded.
```

### Tier 3 — Issue Score (15%)

```
Issue_Score = SUM(for each issue opened):
    base_points * resolution_bonus * label_weight * engagement_factor

resolution_bonus = completed=1.5, not_planned=0.5, duplicate=0.2
label_weight     = security/critical=1.5, bug=1.0, enhancement=0.8, question=0.5
engagement_factor = 1 + (0.05 * min(comments_from_others, 20))
```

### Tier 4 — Community Score (10%)

```
Community_Score = (0.5 * doc_prs_merged) + (0.3 * issues_triaged) + (0.2 * first_contributor_helps)
```

### Payout Formulas (on-chain in smart contract)

**Proportional (Program Mode):**
```
payout_i = (score_i / SUM(all_scores)) * total_pool
```

**Square Root (Open Mode — fairer for long tails, inspired by Quadratic Funding):**
```
payout_i = (sqrt(score_i) / SUM(sqrt(all_scores))) * total_pool
```

### Anti-Gaming Defenses

| Attack | Defense |
|---|---|
| Spam unmerged PRs | merge_bonus = 0 for unmerged |
| Giant meaningless PRs | log_size_factor — diminishing returns |
| Rubber-stamp reviews | APPROVE type_weight = 0.5 |
| Review ring exchanges | Self-reviews excluded; authority_factor |
| Issue spam | duplicate resolution_bonus = 0.2; engagement requires others |
| Historical credit farming | recency_decay — exponential weight loss |

---

## 4. Architecture (6 Layers)

```
+-----------------------------------------------------+
|                    FLINT PROTOCOL                    |
+-----------------------------------------------------+
|  Layer 1 — Data Ingestion                           |
|  GitHub App webhooks, PR diffs, review data         |
+-----------------------------------------------------+
|  Layer 2 — Intelligence  [AI Agent on Phala TEE]    |
|  xAI Grok API, complexity classification,           |
|  gaming detection, scoring payload                  |
+-----------------------------------------------------+
|  Layer 3 — Verification  [Chainlink CRE]            |
|  DON workflow, independent GitHub fetch,             |
|  BFT consensus, on-chain score submission            |
|  (BLOCKER: requires pre-approval from Chainlink)    |
+-----------------------------------------------------+
|  Layer 4 — Human Approval Gate  [Ledger]            |
|  Maintainer reviews, physical confirmation, hash    |
+-----------------------------------------------------+
|  Layer 5 — Disbursement  [Smart Contracts]          |
|  Payout math, batch payment, ERC-5484 mint          |
+-----------------------------------------------------+
|  Layer 6 — Audit Trail  [The Graph]                 |
|  Subgraph, queryable history, contributor resume    |
+-----------------------------------------------------+
```

---

## 5. AI Agent Architecture

### Flow

```
GitHub App webhook
        |
        v
Node.js agent server (VPS or Phala TEE Docker container)
  |-- GitHub API --> fetches PR diffs, reviews, issues
  |-- xAI API (grok-4.6) --> classifies complexity + detects gaming
  |-- Scoring algorithm --> composite score per contributor
  |-- Submits to FlintEscrow.submitScores() via agent wallet (hot key)
        |
        v
FlintEscrow shows scores on dashboard
        |
        v
Maintainer reviews --> clicks "Approve"
        |
        v
Ledger device lights up --> physical button press
        |
        v
Payout executes --> soulbound tokens minted --> The Graph indexes
```

### LLM Integration

```javascript
// xAI API — OpenAI-compatible, one line change
import OpenAI from "openai"

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1"
})

const scoring = await client.chat.completions.create({
  model: "grok-4.6",
  messages: [
    { role: "system", content: "You are a code contribution analyzer..." },
    { role: "user", content: `Analyze PR diff: ${diff}` }
  ],
  response_format: { type: "json_object" }
})
```

### LLM Prompt (for PR analysis)

```
System: You are a code contribution analyzer for open source projects.
Analyze the following PR diff and return a JSON assessment.

User:
Repository: {owner}/{repo}
PR #{number}: {title}
Author: {author} (association: {MEMBER|CONTRIBUTOR|FIRST_TIME_CONTRIBUTOR})
Files changed: {count}
Additions: {additions}, Deletions: {deletions}
Reviews received: {count}
Merged: {true/false}

Diff: ```{diff content, truncated to 4000 tokens if needed}```

Return JSON only:
{
  "complexity": "trivial|medium|high|critical",
  "complexity_reason": "one sentence explanation",
  "quality_indicators": {
    "has_tests": boolean,
    "has_docs": boolean,
    "is_refactor": boolean,
    "is_security_related": boolean
  },
  "gaming_flags": [],
  "suggested_score": 0-100
}
```

### GitHub App Setup

**Permissions (read-only):**
- `pull_requests: read` — PR data, diffs, merge status
- `issues: read` — issue events, labels, close reasons
- `contents: read` — file diffs for AI analysis
- `metadata: read` — repo info

**Webhook events:**
- `pull_request` (opened, closed, merged)
- `pull_request_review` (submitted)
- `pull_request_review_comment` (created)
- `issues` (opened, closed, labeled)
- `issue_comment` (created)

### Who Pays for What

| Cost | Who Pays | Amount |
|---|---|---|
| LLM API calls (xAI grok-4.6) | Flint (your API key) | ~$2/1M tokens |
| Server hosting | Flint | ~$5-20/month |
| Chainlink CRE (LINK) | Maintainer | ~0.2 LINK per submission |
| Gas for on-chain tx | Maintainer's pool | Minimal on Sepolia |

---

## 6. Smart Contracts (COMPLETED — Day 1 Done)

All contracts compile successfully with **Solc 0.8.32**, **Foundry**, **OpenZeppelin v5.7.0**, `via_ir = true`.

### Contract File Tree

```
contracts/
  src/
    core/
      FlintRegistry.sol     — Permissionless protocol entry point, repo + grant registration
      FlintEscrow.sol       — Program/Open mode escrow, scoring, Ledger approval, batch payout, 30-day timeout
      FlintGrant.sol        — Milestone-based grant escrow, tranche releases, 14-day auto-release, grantor reclaim
      FlintBatch.sol        — Batch ERC-20 payment executor with Ledger ECDSA signature verification
      FlintReceipt.sol      — ERC-5484 soulbound NFT, fully on-chain JSON metadata (Base64)
    interfaces/
      IScoringAdapter.sol   — Pluggable scoring adapter interface (GitHub, GitLab, etc.)
      IPayoutPolicy.sol     — Pluggable payout distribution interface
      IERC5484.sol          — ERC-5484 Consensual Soulbound Token interface
    policies/
      ProportionalPolicy.sol — Linear: score_i / sum * pool
      SqrtPolicy.sol         — Quadratic: sqrt(score_i) / sum(sqrt) * pool (Babylonian method)
    identity/
      FlintIdentity.sol     — GitHub username <-> wallet mapping, EIP-191 signature verification
    mocks/
      MockUSDC.sol          — 6-decimal mock ERC-20 for testing
  script/
    Deploy.s.sol            — Full deployment script (all contracts + wiring)
  foundry.toml              — Solc 0.8.32, optimizer 200 runs, via_ir, OZ remappings
```

### Key Contract Functions

**FlintEscrow.sol:**
- `createPool(repoId, token, amount, payoutPolicy, ledgerSigner, mode)` — maintainer deposits
- `submitScores(repoId, contributors[], scores[])` — called by authorized scorer (agent)
- `approveAndPayout(repoId, signature)` — Ledger ECDSA verification + batch payout + receipt mint
- `timeoutRelease(repoId)` — 30-day auto-release if maintainer doesn't approve
- `reclaimAfterTimeout(repoId)` — maintainer reclaims if no scores submitted

**FlintGrant.sol:**
- `createGrant(grantee, token, totalAmount, ledgerApprover, descriptions[], trancheBps[], deadlines[])` — grantor deposits
- `verifyMilestone(grantId, milestoneId)` — called by Chainlink/verifier
- `releaseTranche(grantId, milestoneId, signature)` — Ledger-signed tranche release
- `autoRelease(grantId, milestoneId)` — 14-day timeout after verified but unpaid
- `reclaimUndisbursed(grantId)` — grantor recovery after last deadline passes

**FlintReceipt.sol (ERC-5484):**
- `mint(to, repoId, cycle, score, amount, mode)` — soulbound receipt with on-chain JSON metadata
- `getTotalScore(contributor)` — aggregate Flint Score across all receipts
- `getTotalEarned(contributor)` — aggregate earnings across all receipts
- Transfers blocked via `_update()` override — truly soulbound

**FlintBatch.sol:**
- `executeBatch(token, recipients[], amounts[], signer, signature)` — single-tx multi-transfer
- `computeApprovalHash(token, recipients[], amounts[])` — for Ledger to sign

**FlintRegistry.sol:**
- `registerRepo(repoId, escrow)` — permissionless repo registration
- `registerGrant(grantId, grantContract, grantee)` — permissionless grant registration
- `setProtocolContracts(escrow, grant, batch, receipt, identity)` — admin

**FlintIdentity.sol:**
- `register(githubUsername, signature)` — EIP-191 signed identity claim
- `verify(wallet)` — called by Chainlink/verifier after Gist verification
- `getWallet(githubUsername)` — lookup

### Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Scores | uint256 scaled by 1e6 | Avoids floating point in Solidity |
| Ledger verification | ECDSA ecrecover on EIP-191 signed hashes | Standard, no custom crypto |
| Soulbound enforcement | _update() override blocks transfers | Only minting allowed |
| Timeout: Escrow | 30 days | Protects contributors from free labor |
| Timeout: Grant auto-release | 14 days after verified milestone | Protects grantees from bureaucracy |
| Rounding dust | Last recipient gets totalPool - distributed | No dust left in contract |
| Token | Generic IERC20 | Works with USDC, USDT, any ERC-20 |
| Compiler | Solc 0.8.32 + via_ir | Needed for stack-too-deep in FlintReceipt metadata |

### Deploy Command

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
```

Deploy script handles: deploy all contracts, authorize Escrow + Grant as receipt minters, register protocol contracts in Registry.

---

## 7. Infrastructure Framing (Protocol, Not Product)

### Pluggable Interfaces

**IScoringAdapter** — any data source can plug in:
```solidity
interface IScoringAdapter {
    function getScores(bytes32 repoId, address[] contributors) external returns (uint256[] scores);
}
```
GitHub is adapter #1. GitLab, Jira, Discord can follow.

**IPayoutPolicy** — any distribution curve:
```solidity
interface IPayoutPolicy {
    function calculate(uint256[] scores, uint256 totalPool) external pure returns (uint256[] payouts);
}
```
ProportionalPolicy and SqrtPolicy implemented. DAOs can deploy custom policies.

### Flint Score as Portable Identity

ERC-5484 soulbound receipts accumulate into a queryable on-chain reputation:
- DeFi protocols: undercollateralized loans for Flint Score > 500
- DAOs: voting weight proportional to Flint Score
- Hiring platforms: query Flint Score instead of resume
- Grant committees: eligibility criteria

---

## 8. Tech Stack Decisions

| Component | Choice | Why |
|---|---|---|
| Smart contracts | Foundry (Solc 0.8.32) | Faster testing, gas optimization |
| Contract library | OpenZeppelin v5.7.0 | ERC721, ECDSA, SafeERC20, ReentrancyGuard, Ownable |
| LLM | xAI API (grok-4.6) | OpenAI-compatible, fast, cheap, function calling |
| Agent server | Node.js on VPS | Webhook receiver + scoring agent |
| TEE (optional) | Phala dstack | Hardware-attested Docker containers, no approval needed |
| Frontend | Next.js | Maintainer dashboard + contributor profile |
| Indexing | The Graph | Subgraph for all contract events |
| Chain | Ethereum Sepolia testnet | Standard ETHGlobal target |
| Token | ERC-20 (USDC compatible) | MockUSDC for testing |

---

## 9. Critical Findings

### Chainlink Functions is DEAD
- Sunset June 30, 2026
- Replaced by **Chainlink Runtime Environment (CRE)**
- CRE requires explicit approval from Chainlink team to deploy (`cre account access`)
- Local simulation works without approval, but live deployment is blocked without approval
- README references to "Chainlink Functions" need updating to CRE

### Galadriel EVM L1 is Dead
- Never made it to mainnet
- Website now sells GPU cloud rentals
- New product "Sentience" is a different thing (TEE-backed LLM attestation SDK)

### Ritual Infernet is Deprecated
- Replaced by Ritual Chain (Chain ID 1979) with native precompiles
- ZeroClaw / Hermes are agent harnesses on Ritual (testnet only, no public repos)
- OpenClaw is a config spec, not a framework

### No Competitors at ETHGlobal
- SourceCred: Protocol Labs grant (2018), not ETHGlobal
- GitDrip: GenLayer Builder Portal (2026), not ETHGlobal
- Coordinape: Yearn Finance internal (2021), not ETHGlobal
- Drips: Radicle core team (2022), not ETHGlobal
- The ETHGlobal OSS funding prize shelf is empty

---

## 10. Build Plan (6 Days)

| Day | Focus | Status |
|---|---|---|
| **Day 1** | Smart Contracts — all contracts written + compiled on Sepolia | DONE |
| **Day 2** | AI Agent + GitHub App — webhook server, xAI integration, scoring logic | TODO |
| **Day 3** | Ledger Key Ring + Backend API — approval flow, dashboard API routes | TODO |
| **Day 4** | Frontend (Next.js) — maintainer dashboard, contributor profile, wallet connect | TODO |
| **Day 5** | The Graph + Integration — subgraph, query integration, end-to-end testing | TODO |
| **Day 6** | Buffer — polish, demo video, submission write-up | TODO |

---

## 11. Current Repo Structure

```
flint/
  .git/
  .gitignore
  .gitmodules
  README.md                          — Project README (updated with Grant Mode)
  PITCH.md                           — All pitch Q&A from planning phase
  CONTEXT.md                         — This file
  contracts/
    foundry.toml                     — Solc 0.8.32, OZ remappings, via_ir
    foundry.lock
    lib/
      forge-std/                     — Foundry test framework
      openzeppelin-contracts/        — OpenZeppelin v5.7.0
    src/
      core/
        FlintRegistry.sol
        FlintEscrow.sol
        FlintBatch.sol
        FlintGrant.sol
        FlintReceipt.sol
      interfaces/
        IScoringAdapter.sol
        IPayoutPolicy.sol
        IERC5484.sol
      policies/
        ProportionalPolicy.sol
        SqrtPolicy.sol
      identity/
        FlintIdentity.sol
      mocks/
        MockUSDC.sol
    script/
      Deploy.s.sol
    test/                            — Empty (tests not written yet)
  frontend/                          — Empty (Day 4)
  chainlink/                         — Empty (Day 2-3, CRE workflow)
  subgraphs/                         — Empty (Day 5)
  ledger/                            — Empty (Day 3)
```

---

## 12. Open Questions for Next Sessions

1. **Chainlink CRE access** — has it been requested? If not, fallback to Phala-only for verification
2. **xAI API key** — needed for agent server (grok-4.6 model)
3. **GitHub App registration** — needs to be created at github.com/settings/apps
4. **VPS provider** — Railway, Fly.io, DigitalOcean? Where does the agent server run?
5. **Phala TEE** — wrapping agent in Phala Docker? Or just plain VPS for hackathon?
6. **Sepolia only or also Base Sepolia?** — Base is popular with ETHOnline judges
7. **Tests** — contract tests not written yet. Need FlintEscrow.t.sol, FlintGrant.t.sol at minimum
8. **The Graph subgraph schema** — events are all emitted in contracts, subgraph needs to be designed
9. **Frontend auth** — GitHub OAuth + wallet connect (wagmi/viem) setup

---

## 13. Competitive Landscape

| Project | Origin | Flint Differentiator |
|---|---|---|
| SourceCred | Protocol Labs grant, 2018. Dormant since 2022 | Flint has on-chain payouts, Ledger approval, soulbound receipts |
| GitDrip | GenLayer Builder Portal, 2026 | Flint has hardware signing, ERC-5484, three modes, audit trail |
| Coordinape | Yearn Finance internal, 2021 | Flint is GitHub-based (not peer allocation), has grant mode |
| Gnosis Safe | ConsenSys, widely used for grants | Flint adds scoring, milestone verification, soulbound receipts |
| Disperse.app | Simple batch sender | Flint adds scoring, approval gate, audit trail, identity |

---

## 14. Pitch Essentials

**Idea rating:** 8/10
**Feasibility (6 days):** 7.5/10
**Sponsor prize probability:** 8.5/10 (at least one of Ledger/Chainlink/The Graph)
**Main prize probability:** 5/10 (needs infrastructure framing to compete with DeFi/ZK projects)

**Winning demo moment:** Ledger device lighting up on camera with physical button press.

**Infrastructure pitch:** *"Flint is the on-chain reputation primitive for open source — GitHub today, every platform tomorrow."*

**Grant pitch:** *"Every Web3 grant program runs on Google Forms and Gnosis Safe. Flint replaces both."*

**Demo closer:** *"No manager. No spreadsheet. No bank. No trust required. Just the Ledger."*
