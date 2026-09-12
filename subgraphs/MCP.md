# Flint NLP Layer — Maintainer Asks, Graph Answers (Subgraph MCP)

Plain-English questions over live indexed data. No GraphQL written by hand:
the MCP server exposes our subgraphs as tools, the client's LLM turns the
question into queries, runs them, and answers with tx hashes.

## How it connects (all that exists)

- Hosted MCP endpoint: `https://subgraphs.mcp.thegraph.com/sse`
- Client config (Claude Desktop / Cursor / Cline — same shape):
  ```json
  {
    "mcpServers": {
      "subgraph": {
        "command": "npx",
        "args": ["mcp-remote", "--header", "Authorization:${AUTH_HEADER}", "https://subgraphs.mcp.thegraph.com/sse"],
        "env": { "AUTH_HEADER": "Bearer <GATEWAY_API_KEY>" }
      }
    }
  }
  ```
- Needs: `<GATEWAY_API_KEY>` from Subgraph Studio (see "Needed from you").
- Tools the agent gets: search subgraphs, fetch schema by subgraph ID,
  execute query by subgraph ID. Reference queries live in `QUERIES.graphql`;
  schema it reads is `schema.graphql`.

## Question bank (demo + UI copy)

### Reputation — "who is this contributor?"
1. "What is 0x…'s Flint Score and total earned?" → `ContributorProfile`
2. "Show me every receipt 0x… holds, newest first." → `contributor.receipts`
3. "How many programs and grants has 0x… completed?" →
   `programsCompleted`, `grantsCompleted`

### Pool audit — "where did the pool money go?"
4. "What is the status of pool <repoId>? Active, approved, paid, or reclaimed?"
5. "List every payout from pool <repoId> with amounts and contributors."
6. "Do the payout amounts in pool <repoId> add up to the pool total?"

### Grant audit — "did the grantee deliver?"
7. "Grant <id>: which milestones are verified, which are paid?"
8. "Was any tranche of grant <id> auto-released? Which milestone?"
9. "Has grant <id> been reclaimed? How much is left undisbursed?"

### Cross-protocol — the prize beat (needs the standard leg, Step 6)
10. "flint says grantee 0x… earned <X> USDC — do their on-chain USDC
    inflows agree?" → flint receipts + standard token subgraph flows.
11. "Show me grant <id>'s tranches next to the grantee's USDC balance
    movements." → one answer, two subgraphs.

## Network visibility finding (Sept 12, confirmed live)

The hosted Subgraph MCP (`subgraphs.mcp.thegraph.com`) serves the
**decentralized network only**. `flint` is a **Studio-private** deployment
(Studio ID `1760164`, NOT a network subgraph ID), so keyword search, schema,
and execute-by-ID all return "not found" there. The Studio endpoint itself
works fine (verified via direct queries). IPFS build hash
`QmeaLHc4hLQbZF469Bgs694cyvdpuTsAdCQvZBac2Qunqo` exists but no network
indexer serves it — don't send the agent down that path.

Cross-protocol flow therefore = **Studio-direct for flint** (agent POSTs to
the query URL with its own fetch tool, no auth) + **MCP tools for the
standard leg** (those subgraphs ARE on the network). Prize rules explicitly
accept Studio as a live provider, so this still qualifies.

Going fully on-network (Studio → Publish, onchain tx + GRT signal for
indexer pickup) is possible but costs real funds with uncertain pickup on
Arc Testnet — not recommended for the hackathon.

## Demo script (30 seconds)

1. Paste the "agent brief" below, then ask Q10 in chat with the MCP connected.
2. Agent POSTs flint queries to Studio directly → uses MCP tools for the
   standard subgraph → answers with both numbers + arcscan links.
3. Screenshot the transcript → `subgraphs/` → submission form.

### Agent brief (paste into chat)

> Flint is a Subgraph Studio deployment, not on the decentralized network —
> stop searching for it there. Query it directly with HTTP POST to
> https://api.studio.thegraph.com/query/1760164/flint/0.0.1 (no auth).
> Schema: Contributor(id, totalScore, totalEarned, receiptCount,
> programsCompleted, grantsCompleted, receipts), Pool, Receipt, Grant,
> Milestone, Tranche. Full query set: ask me for `QUERIES.graphql`.
> For the second leg, use your subgraph tools to find a standard
> token/USDC subgraph on the network.

## Live endpoints (deployed Sept 12)

- Studio page: `https://thegraph.com/studio/subgraph/flint`
- Query URL: `https://api.studio.thegraph.com/query/1760164/flint/0.0.1`
- Subgraph ID: `1760164`, version `0.0.1`
- Verified: 2 pools (both Paid), grant #0, 5 receipts, contributor totals
  exact (4,000,000 / 1,000,000 smoke scores, no double-count).
- Frontend already points here via `NEXT_PUBLIC_SUBGRAPH_URL` in
  `frontend/.env` (gitignored, local only).

## Needed from you — RECEIVED Sept 12 (keys live in chat only, never in repo)

1. ~~Deploy Key~~ ✅ used for `graph auth` + deploy.
2. ~~Gateway API Key~~ ✅ goes in the MCP client config `Bearer` token —
   paste it into the config below on YOUR machine (Claude/Cursor settings);
   it must not be committed to the repo.

Nothing else. No new contracts, no schema changes, no local services.
