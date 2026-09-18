# Scorer Agent Wallet on Arc Testnet (Circle Agent Stack)

The scorer submits `submitScores()` from a Circle Agent Wallet — MPC custody,
spending policy allowlisting only Flint contracts, gas sponsored. This is the
Agentic-bounty leg: the agent holds a wallet and settles work in USDC.

## Setup (you run these — OTP goes to your email)

```bash
npm install -g @circle-fin/cli

# Testnet session (separate from mainnet, expires after 28 days)
circle wallet login you@example.com --testnet

# Agent wallets are auto-created on all supported chains
circle wallet list --type agent --chain ARC-TESTNET
# → copy the wallet address below as AGENT_WALLET

# Fund 20 test USDC from the Circle faucet
circle wallet fund --address AGENT_WALLET --chain ARC-TESTNET

# Confirm
circle wallet balance --address AGENT_WALLET --chain ARC-TESTNET
```

## Lock it down (spending policy)

In Circle Console (or `circle wallet policy` — see `circle --help` for exact
flags on your CLI version):

- Daily USDC transfer limit: small (e.g. 50 USDC testnet)
- Recipient/contract allowlist — ONLY these Arc Testnet addresses:
  - FlintScorerReceiver: `0x34244c939061da16Db12AFD5E57ccf9775e3E0B4`
  - FlintEscrow: `0xA6872e0f927926CA850c970fdb06E9AD3B03FE12`
  - FlintGrant: `0x850fB024B03310A17888EC5174B93dDB90Fa91ed`
  - USDC (gas + token): `0x3600000000000000000000000000000000000000`

The agent can then only ever touch Flint contracts — even a compromised
scorer key can't drain funds elsewhere.

## How scores get submitted

Preferred: scorer server calls the Agent Wallet via Circle CLI / API to send
`submitScores(contributors, scores)` to the receiver above, which forwards to
`FlintEscrow` (already authorized as scorer on-chain — verified in the deploy
log: "FlintScorerReceiver authorized as scorer").

Fallback for the demo: submit the same calldata from any funded key with
`cast send` — the authorization check is on the receiver address, and the
flow is identical on-chain.

## Why not via the CRE DON?

Both paths now work. The primary path is the CRE DON: `workflow.yaml`
targets the `arc-testnet` write-target and the DON forwarder is allowlisted
on the receiver (see `contracts/ARC_DEPLOY.md` §9). This Agent Wallet path
remains as the fallback / Agentic-bounty story — the authorization check is
on the receiver address, and the on-chain flow is identical either way.
