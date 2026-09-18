// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Script, console} from "forge-std/Script.sol";
import {EqualPolicy} from "../src/policies/EqualPolicy.sol";

/// Deploy the Fixed (equal-split) payout policy used by Open Mode OSS pools.
contract DeployEqualPolicy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        EqualPolicy policy = new EqualPolicy();
        vm.stopBroadcast();

        console.log("EqualPolicy (Fixed):", address(policy));
    }
}
