// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Script, console} from "forge-std/Script.sol";
import {FlintScorerReceiver} from "../src/core/FlintScorerReceiver.sol";

/// @title DeployReceiver
/// @notice Deploys FlintScorerReceiver separately, after core contracts are live
contract DeployReceiver is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address escrow = 0x0D6442af9A6E0Ea494De7f63AA165753588C54F7;

        console.log("Deployer:", deployer);
        console.log("Escrow:", escrow);

        vm.startBroadcast(deployerPrivateKey);

        FlintScorerReceiver receiver = new FlintScorerReceiver(deployer, escrow);
        console.log("FlintScorerReceiver deployed at:", address(receiver));

        vm.stopBroadcast();
    }
}
