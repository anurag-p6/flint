// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Script, console} from "forge-std/Script.sol";
import {FlintEscrow} from "../src/core/FlintEscrow.sol";
import {FlintReceipt} from "../src/core/FlintReceipt.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice End-to-end smoke test on Arc Testnet:
/// createPool -> submitScores (deployer as stand-in scorer) ->
/// approveAndPayout (deployer as ledgerSigner) -> verify payouts + receipts.
/// Broadcasts real transactions.
contract SmokeTestArc is Script {
    address constant ESCROW = 0xA6872e0f927926CA850c970fdb06E9AD3B03FE12;
    address constant RECEIPT = 0xD1758e1205f79C4F2dAc8f6b7D32A2E517835851;
    address constant SQRT_POLICY = 0x763B23d97471436C5a08b99eFB3c591A887d5335;
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        bytes32 repoId = keccak256("flint/smoke-test");
        uint256 poolAmount = 10_000_000; // 10 USDC (6 decimals)

        address alice = address(0x1111111111111111111111111111111111111111);
        address bob = address(0x2222222222222222222222222222222222222222);

        vm.startBroadcast(deployerKey);

        // 1. Approve + create pool (deployer is maintainer AND ledgerSigner)
        IERC20(USDC).approve(ESCROW, poolAmount);
        FlintEscrow(ESCROW).createPool(repoId, USDC, poolAmount, SQRT_POLICY, deployer, "open");
        console.log("Pool created");

        // 2. Authorize deployer as scorer (stand-in for the Agent Wallet) + submit
        FlintEscrow(ESCROW).setScorer(deployer, true);
        address[] memory contributors = new address[](2);
        contributors[0] = alice;
        contributors[1] = bob;
        uint256[] memory scores = new uint256[](2);
        scores[0] = 4_000_000; // 4.0
        scores[1] = 1_000_000; // 1.0
        FlintEscrow(ESCROW).submitScores(repoId, contributors, scores);
        console.log("Scores submitted");

        vm.stopBroadcast();

        // 3. Sign approval hash off-chain (EIP-191, same as Privy personal_sign)
        bytes32 approvalHash = FlintEscrow(ESCROW).computeApprovalHash(repoId);
        bytes32 ethSigned = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", approvalHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(deployerKey, ethSigned);
        bytes memory sig = abi.encodePacked(r, s, v);

        // 4. Execute payout
        vm.startBroadcast(deployerKey);
        FlintEscrow(ESCROW).approveAndPayout(repoId, sig);
        vm.stopBroadcast();

        // 5. Verify
        uint256 aliceBal = IERC20(USDC).balanceOf(alice);
        uint256 bobBal = IERC20(USDC).balanceOf(bob);
        console.log("Alice payout (sqrt favors long tail):", aliceBal);
        console.log("Bob payout:", bobBal);
        console.log("Alice Flint Score:", FlintReceipt(RECEIPT).getTotalScore(alice));
        require(aliceBal + bobBal == poolAmount, "pool not fully distributed");
        console.log("SMOKE TEST PASSED");
    }
}
