// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Test} from "forge-std/Test.sol";
import {EqualPolicy} from "../src/policies/EqualPolicy.sol";

contract EqualPolicyTest is Test {
    EqualPolicy policy;

    function setUp() public {
        policy = new EqualPolicy();
    }

    function test_equalSplitIgnoresScores() public view {
        uint256[] memory scores = new uint256[](3);
        scores[0] = 9_000_000;
        scores[1] = 1_000_000;
        scores[2] = 0;
        uint256[] memory payouts = policy.calculate(scores, 100e6);
        assertEq(payouts[0], 33_333333);
        assertEq(payouts[1], 33_333333);
        assertEq(payouts[2], 33_333334);
        assertEq(payouts[0] + payouts[1] + payouts[2], 100e6);
    }

    function test_singlePayeeGetsAll() public view {
        uint256[] memory scores = new uint256[](1);
        scores[0] = 1;
        uint256[] memory payouts = policy.calculate(scores, 50e6);
        assertEq(payouts[0], 50e6);
    }

    function test_emptyScores() public view {
        uint256[] memory scores = new uint256[](0);
        uint256[] memory payouts = policy.calculate(scores, 50e6);
        assertEq(payouts.length, 0);
    }

    function test_policyName() public view {
        assertEq(policy.policyName(), "Fixed");
    }
}
