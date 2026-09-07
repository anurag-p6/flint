// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

/// @title IPayoutPolicy
/// @notice Interface for pluggable payout distribution strategies
/// @dev Implement this to create custom distribution curves (proportional, sqrt, equal, etc.)
interface IPayoutPolicy {
    /// @notice Calculates payout amounts given scores and a total pool
    /// @param scores Array of contributor scores (scaled by 1e6)
    /// @param totalPool Total token amount to distribute
    /// @return payouts Array of payout amounts for each contributor
    function calculate(
        uint256[] calldata scores,
        uint256 totalPool
    ) external pure returns (uint256[] memory payouts);

    /// @notice Returns the name of this payout policy
    function policyName() external pure returns (string memory);
}
