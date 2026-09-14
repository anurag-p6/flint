// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {IPayoutPolicy} from "../interfaces/IPayoutPolicy.sol";

/// @title EqualPolicy
/// @notice Fixed OSS-program split: every listed contributor gets the same share.
/// @dev Scores are ignored for the split (they still land on the soulbound receipt).
contract EqualPolicy is IPayoutPolicy {
    /// @inheritdoc IPayoutPolicy
    function calculate(
        uint256[] calldata scores,
        uint256 totalPool
    ) external pure override returns (uint256[] memory payouts) {
        uint256 len = scores.length;
        payouts = new uint256[](len);
        if (len == 0) return payouts;

        uint256 share = totalPool / len;
        uint256 distributed;
        for (uint256 i; i < len;) {
            if (i == len - 1) {
                payouts[i] = totalPool - distributed;
            } else {
                payouts[i] = share;
                distributed += share;
            }
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IPayoutPolicy
    function policyName() external pure override returns (string memory) {
        return "Fixed";
    }
}
