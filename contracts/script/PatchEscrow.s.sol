// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Script, console} from "forge-std/Script.sol";
import {FlintEscrow} from "../src/core/FlintEscrow.sol";
import {FlintReceipt} from "../src/core/FlintReceipt.sol";

/// Redeploy escrow with resubmit-before-approve, wire receipt + keeper scorer.
contract PatchEscrow is Script {
    address constant RECEIPT = 0xD1758e1205f79C4F2dAc8f6b7D32A2E517835851;
    address constant RECEIVER = 0x34244c939061da16Db12AFD5E57ccf9775e3E0B4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        FlintEscrow escrow = new FlintEscrow(deployer, RECEIPT);
        FlintReceipt(RECEIPT).setMinter(address(escrow), true);
        escrow.setScorer(deployer, true);
        escrow.setScorer(RECEIVER, true);

        vm.stopBroadcast();

        console.log("FlintEscrow (patched):", address(escrow));
        console.log("Scorer (deployer):    ", deployer);
    }
}
