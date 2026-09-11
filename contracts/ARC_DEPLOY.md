# Flint → Arc Testnet: Deploy Runbook

Goal: all Flint contracts live on Arc Testnet in under 2 hrs.
All commands run from `~/flint/contracts` inside WSL.

---

## 1. Chain facts (copy-paste ready)

| Item | Value |
|---|---|
| Network | Arc Testnet (Circle L1, EVM-compatible) |
| Chain ID | `5042002` (`0x4cef52`) |
| RPC (primary) | `https://rpc.testnet.arc.network` |
| RPC (fallback) | `https://rpc.testnet.arc.io` |
| Explorer | `https://testnet.arcscan.app` |
| Gas tracker | `https://testnet.arcscan.app/gas-tracker` |
| Faucet | `https://faucet.circle.com` |
| Gas token | **USDC** (fees are dollar-denominated, no ETH needed) |
| USDC address | `0x3600000000000000000000000000000000000000` (system address, ERC-20, 6 decimals) |
| Finality | Sub-second, deterministic — no need to wait for confirmations |

## 2. Wallet setup (10 min)

1. Claim testnet USDC at **faucet.circle.com** → enter your deployer address.
   You need enough for gas (deploys ~9 contracts) + a test pool. Claim twice if it rate-limits you.
2. Add Arc Testnet to MetaMask → Settings → Networks → Add manually:
   - Network name: `Arc Testnet`
   - RPC URL: `https://rpc.testnet.arc.network`
   - Chain ID: `5042002`
   - Currency symbol: `USDC`
   - Explorer: `https://testnet.arcscan.app`
3. Confirm funds:
   ```bash
   cast balance <YOUR_ADDRESS> --rpc-url https://rpc.testnet.arc.network
   ```
   Balance is returned in USDC base units (6 decimals). Anything > ~5 USDC is comfortable.

## 3. Env + config (10 min)

Add to `contracts/.env` (PRIVATE_KEY line already exists — keep it):

```bash
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
```

Add to `contracts/foundry.toml` under `[rpc_endpoints]`:

```toml
arc_testnet = "${ARC_TESTNET_RPC_URL}"
```

One-change note for `script/Deploy.s.sol`: it currently logs
`USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
The address is only logged, not used in deployment — but update the log line to the
Arc USDC address above so the output isn't misleading.

Compiler note (from Arc ecosystem projects): if a deploy fails with an
opcode/EVM error, set `evm_version = "paris"` in `foundry.toml` and retry.
Standard OZ contracts deploy clean otherwise.

## 4. Deploy (20 min)

```bash
cd ~/flint/contracts
source .env   # loads PRIVATE_KEY + ARC_TESTNET_RPC_URL

forge script script/Deploy.s.sol \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Save every address from the `=== Deployment Summary ===` output.
Verify each contract on `testnet.arcscan.app` (Contract tab → Verify;
if auto-verify flags don't work, use the explorer's manual verify with
Solc 0.8.32 + optimizer 200 runs + via_ir).

## 5. Frontend repoint (20 min)

In `frontend/lib/contracts.ts`:
- `CHAIN_ID = 5042002`
- `USDC_ADDRESS = "0x3600000000000000000000000000000000000000"`
- Replace all addresses with the new deploy output.

In `frontend/lib/wagmi.ts`: add Arc Testnet as a custom chain
(nativeCurrency `{ name: "USDC", symbol: "USDC", decimals: 6 }`,
rpcUrls `https://rpc.testnet.arc.network`, blockExplorers `testnet.arcscan.app`).

Delete nothing Base-related — keep Base Sepolia config for the bridge demo.

## 6. Smoke test on Arc (30 min)

1. `cast balance` deployer — still funded.
2. From the UI (or cast): `createPool` / `createGrant` with 1–5 test USDC.
3. Scorer submits scores → maintainer approves → payout lands → receipt SBT mints.
4. Check every tx on `testnet.arcscan.app`. Sub-second finality — if a tx
   isn't visible in 5 seconds, it's stuck, not slow.

## 7. Useful contract addresses (CCTP V2, same on every chain)

| Contract | Address |
|---|---|
| TokenMessenger (CCTP V2) | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitter (CCTP V2) | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| Arc CCTP domain | `26` |
| ETH Sepolia USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (domain 0) |
| Base Sepolia USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (domain 6) |

Needed later for the App Kit bridge demo (fund pool from Base/ETH Sepolia → spend on Arc).

## 8. After this: Mainnet kicker

Arc Mainnet launches ~Sept 16, 2026. The $2.5k-per-bounty bonus requires
the same project on Arc Mainnet by **Sept 30**. Redeploy = same script,
mainnet RPC + funded key. Put a calendar reminder now.

---

**Time budget:** wallet+faucet 10 · config 10 · deploy 20 · frontend 20 · smoke test 30 ≈ **90 min**, 30 min buffer for faucet/RPC flakiness.

---

## 9. Live deployment record (Sept 11, 2026)

Deployer: `0x225Fd0b9D011C8BBffd0f0c6f854Cd23b99B6aF7`

| Contract | Arc Testnet address |
|---|---|
| FlintRegistry | `0xA663178892B6Be3e07051D413F5017f7169904B9` |
| FlintEscrow | `0xA6872e0f927926CA850c970fdb06E9AD3B03FE12` |
| FlintGrant | `0x850fB024B03310A17888EC5174B93dDB90Fa91ed` |
| FlintBatch | `0xecd871b154af1D72C3915d04eb7A10F18858581B` |
| FlintReceipt | `0xD1758e1205f79C4F2dAc8f6b7D32A2E517835851` |
| FlintIdentity | `0x01590A36B357cc54d4c4DCA16631596E943C29FD` |
| FlintScorerReceiver | `0x34244c939061da16Db12AFD5E57ccf9775e3E0B4` |
| ProportionalPolicy | `0x86c5deA9296E47EDd97498Ee216a7F52c0177AA0` |
| SqrtPolicy | `0x763B23d97471436C5a08b99eFB3c591A887d5335` |

Broadcast log: `contracts/broadcast/Deploy.s.sol/5042002/run-latest.json`

E2E smoke test (10 USDC pool, 2 contributors, sqrt policy): createPool →
submitScores → approveAndPayout all `status 0x1`. Escrow leftover 0, one
receipt SBT each, Flint Scores exact (4,000,000 / 1,000,000).

Receiver-mediated test (the exact DON path, second pool `flint/receiver-test`):
`setForwarder` → `onReport(0x, abi.encode(repoId, contributors, scores))` →
`approveAndPayout` all `status 0x1`, escrow leftover 0. The report payload
was generated with the same `abi.encode(bytes32, address[], uint256[])`
scheme the TEE workflow emits (`EncodeReport.s.sol` reproduces it), so the
DON leg needs no code changes — only the write-target in `workflow.yaml`.

CRE status: fully wired for Arc. `chainlink-cre/.env` points at the Arc
receiver; `workflow.yaml` (staging + production) and `project.yaml` RPCs use
the `arc-testnet` write-target (selector `3034092155422581607`, confirmed via
`cre workflow supported-chains`); the DON forwarder
`0x76c9cf548b4179F8901cda1f8623568b58215E62` is allowlisted on the receiver
(`allowedForwarders` → 1); `cre workflow build` compiles clean. Remaining
step is `cre workflow deploy` (your login + LINK/fees) — optionally dry-run
first with `cre workflow simulate --broadcast` against the mock forwarder
`0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` (allowlist it first via
`setForwarder`, then remove).

## 10. Arc quirks discovered (read before scripting)

1. **Foundry local simulation cannot execute the `isBlocklisted` compliance
   precompile** (`0x1800...0001`) — any forge script touching
   `transferFrom` on native USDC reverts locally with StackUnderflow, and
   `--skip-simulation` does not bypass it. **Broadcast with `cast send`
   instead** — node-side estimation handles the precompile fine.
2. **`balanceOf` on the USDC system address returns mirror-scaled values**
   (reads don't match the 6-decimal ledger 1:1). Conservation holds
   (escrow 10M in → 0 out), so rely on `PayoutExecuted` events + the
   frontend preview math for displayed amounts, not raw `balanceOf`.
3. **Direct EOA `transferFrom` with from == sender checks the wrong
   allowance** (`allowance[from][msg.sender]`, standard ERC20) — always call
   through the escrow/grant contract as the real flow does.
4. Native gas uses **18-decimal** units (per Circle's chain definition), even
   though USDC the token is 6-decimal. Wagmi config reflects this.
