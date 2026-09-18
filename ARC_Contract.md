# Flint Contracts on Arc Testnet

Live deployment record with scanner links. Full runbook: `contracts/ARC_DEPLOY.md`.

| Item | Value |
|---|---|
| Network | Arc Testnet (Circle L1, EVM-compatible) |
| Chain ID | `5042002` (`0x4cef52`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |
| Gas token | USDC (dollar-denominated fees, no ETH needed) |
| USDC address | `0x3600000000000000000000000000000000000000` |
| Deployer | `0x225Fd0b9D011C8BBffd0f0c6f854Cd23b99B6aF7` |
| Deploy block | `61595122` (all contracts, `run-latest.json`) |

## Contracts

| Contract | Address | Scanner |
|---|---|---|
| FlintRegistry | `0xA663178892B6Be3e07051D413F5017f7169904B9` | https://testnet.arcscan.app/address/0xA663178892B6Be3e07051D413F5017f7169904B9 |
| FlintEscrow | `0xA6872e0f927926CA850c970fdb06E9AD3B03FE12` | https://testnet.arcscan.app/address/0xA6872e0f927926CA850c970fdb06E9AD3B03FE12 |
| FlintGrant | `0x850fB024B03310A17888EC5174B93dDB90Fa91ed` | https://testnet.arcscan.app/address/0x850fB024B03310A17888EC5174B93dDB90Fa91ed |
| FlintBatch | `0xecd871b154af1D72C3915d04eb7A10F18858581B` | https://testnet.arcscan.app/address/0xecd871b154af1D72C3915d04eb7A10F18858581B |
| FlintReceipt | `0xD1758e1205f79C4F2dAc8f6b7D32A2E517835851` | https://testnet.arcscan.app/address/0xD1758e1205f79C4F2dAc8f6b7D32A2E517835851 |
| FlintIdentity | `0x01590A36b357cc54d4c4DCA16631596e943c29FD` | https://testnet.arcscan.app/address/0x01590A36b357cc54d4c4DCA16631596e943c29FD |
| FlintScorerReceiver | `0x34244c939061da16Db12AFD5E57ccf9775e3E0B4` | https://testnet.arcscan.app/address/0x34244c939061da16Db12AFD5E57ccf9775e3E0B4 |
| ProportionalPolicy | `0x86c5deA9296E47EDd97498Ee216a7F52c0177AA0` | https://testnet.arcscan.app/address/0x86c5deA9296E47EDd97498Ee216a7F52c0177AA0 |
| SqrtPolicy | `0x763B23d97471436C5a08b99eFB3c591A887d5335` | https://testnet.arcscan.app/address/0x763B23d97471436C5a08b99eFB3c591A887d5335 |

## Stewardship

- This file is the canonical address sheet. If contracts are redeployed, update this table first, then `contracts/ARC_DEPLOY.md` §9, then `frontend/lib/contracts.ts`.
- Subgraph data sources (`subgraphs/subgraph.yaml`) pin these addresses with `startBlock: 61595122`.
