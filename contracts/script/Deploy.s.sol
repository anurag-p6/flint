// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Script, console} from "forge-std/Script.sol";
import {FlintRegistry} from "../src/core/FlintRegistry.sol";
import {FlintReceipt} from "../src/core/FlintReceipt.sol";
import {FlintEscrow} from "../src/core/FlintEscrow.sol";
import {FlintGrant} from "../src/core/FlintGrant.sol";
import {FlintBatch} from "../src/core/FlintBatch.sol";
import {FlintIdentity} from "../src/identity/FlintIdentity.sol";
import {ProportionalPolicy} from "../src/policies/ProportionalPolicy.sol";
import {SqrtPolicy} from "../src/policies/SqrtPolicy.sol";
/// @title Deploy
/// @notice Deploys all Flint protocol contracts
contract Deploy is Script {
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying Flint Protocol...");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy FlintReceipt (soulbound token) — needed by Escrow and Grant
        FlintReceipt receipt = new FlintReceipt(deployer);
        console.log("FlintReceipt deployed at:", address(receipt));

        // 2. Deploy core contracts
        FlintEscrow escrow = new FlintEscrow(deployer, address(receipt));
        console.log("FlintEscrow deployed at:", address(escrow));

        FlintGrant grant_ = new FlintGrant(deployer, address(receipt));
        console.log("FlintGrant deployed at:", address(grant_));

        FlintBatch batch = new FlintBatch();
        console.log("FlintBatch deployed at:", address(batch));

        // 3. Deploy identity
        FlintIdentity identity = new FlintIdentity(deployer);
        console.log("FlintIdentity deployed at:", address(identity));

        // 4. Deploy payout policies
        ProportionalPolicy proportional = new ProportionalPolicy();
        console.log("ProportionalPolicy deployed at:", address(proportional));

        SqrtPolicy sqrt = new SqrtPolicy();
        console.log("SqrtPolicy deployed at:", address(sqrt));

        // 5. Deploy registry and set protocol contracts
        FlintRegistry registry = new FlintRegistry(deployer);
        registry.setProtocolContracts(
            address(escrow),
            address(grant_),
            address(batch),
            address(receipt),
            address(identity)
        );
        console.log("FlintRegistry deployed at:", address(registry));

        // 6. Authorize Escrow and Grant as receipt minters
        receipt.setMinter(address(escrow), true);
        receipt.setMinter(address(grant_), true);
        console.log("Escrow and Grant authorized as receipt minters");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("FlintRegistry:      ", address(registry));
        console.log("FlintEscrow:        ", address(escrow));
        console.log("FlintGrant:         ", address(grant_));
        console.log("FlintBatch:         ", address(batch));
        console.log("FlintReceipt:       ", address(receipt));
        console.log("FlintIdentity:      ", address(identity));
        console.log("ProportionalPolicy: ", address(proportional));
        console.log("SqrtPolicy:         ", address(sqrt));
        console.log("USDC (Base Sepolia):", USDC_BASE_SEPOLIA);
    }
}
