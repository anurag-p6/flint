// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {IPayoutPolicy} from "../interfaces/IPayoutPolicy.sol";

/// @title SqrtPolicy
/// @notice Distributes payouts using square root of scores: payout_i = (sqrt(score_i) / sum(sqrt(scores))) * pool
/// @dev Used for Open Mode — compresses gap between top and bottom contributors (inspired by Quadratic Funding)
contract SqrtPolicy is IPayoutPolicy {
    /// @inheritdoc IPayoutPolicy
    function calculate(
        uint256[] calldata scores,
        uint256 totalPool
    ) external pure override returns (uint256[] memory payouts) {
        uint256 len = scores.length;
        payouts = new uint256[](len);

        uint256[] memory sqrtScores = new uint256[](len);
        uint256 totalSqrt;

        for (uint256 i; i < len;) {
            sqrtScores[i] = _sqrt(scores[i]);
            totalSqrt += sqrtScores[i];
            unchecked { ++i; }
        }

        if (totalSqrt == 0) return payouts;

        uint256 distributed;
        for (uint256 i; i < len;) {
            if (i == len - 1) {
                payouts[i] = totalPool - distributed;
            } else {
                payouts[i] = (sqrtScores[i] * totalPool) / totalSqrt;
                distributed += payouts[i];
            }
            unchecked { ++i; }
        }
    }

    /// @notice Babylonian method for integer square root
    /// @param x The input value
    /// @return y The floor of the square root of x
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /// @inheritdoc IPayoutPolicy
    function policyName() external pure override returns (string memory) {
        return "SquareRoot";
    }
}
