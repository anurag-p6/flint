// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {IPayoutPolicy} from "../interfaces/IPayoutPolicy.sol";

/// @title ProportionalPolicy
/// @notice Distributes payouts proportionally to scores: payout_i = (score_i / totalScores) * pool
/// @dev Used for Program Mode — straightforward linear distribution
contract ProportionalPolicy is IPayoutPolicy {
    /// @inheritdoc IPayoutPolicy
    function calculate(
        uint256[] calldata scores,
        uint256 totalPool
    ) external pure override returns (uint256[] memory payouts) {
        uint256 len = scores.length;
        payouts = new uint256[](len);

        uint256 totalScores;
        for (uint256 i; i < len;) {
            totalScores += scores[i];
            unchecked { ++i; }
        }

        if (totalScores == 0) return payouts;

        uint256 distributed;
        for (uint256 i; i < len;) {
            if (i == len - 1) {
                // Last contributor gets remainder to avoid dust from rounding
                payouts[i] = totalPool - distributed;
            } else {
                payouts[i] = (scores[i] * totalPool) / totalScores;
                distributed += payouts[i];
            }
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPayoutPolicy
    function policyName() external pure override returns (string memory) {
        return "Proportional";
    }
}
