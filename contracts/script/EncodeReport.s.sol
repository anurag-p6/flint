// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Script, console} from "forge-std/Script.sol";

/// @notice Local-only helper: prints abi.encode(repoId, contributors, scores)
/// exactly as the CRE DON report payload must look for onReport().
/// No state access, no broadcast — safe for local simulation.
contract EncodeReport is Script {
    function run() external pure {
        address[] memory contributors = new address[](2);
        contributors[0] = address(0x1111111111111111111111111111111111111111);
        contributors[1] = address(0x2222222222222222222222222222222222222222);
        uint256[] memory scores = new uint256[](2);
        scores[0] = 4_000_000;
        scores[1] = 1_000_000;
        console.logBytes(abi.encode(keccak256("flint/receiver-test"), contributors, scores));
    }
}
