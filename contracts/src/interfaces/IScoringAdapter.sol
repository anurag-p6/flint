// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

/// @title IScoringAdapter
/// @notice Interface for pluggable scoring adapters (GitHub, GitLab, etc.)
/// @dev Implement this to create new data source integrations for Flint
interface IScoringAdapter {
    /// @notice Fetches or returns scores for a set of contributors in a given repo
    /// @param repoId The unique identifier for the repository
    /// @param contributors The addresses of the contributors to score
    /// @return scores The scores for each contributor (scaled by 1e6)
    function getScores(
        bytes32 repoId,
        address[] calldata contributors
    ) external returns (uint256[] memory scores);

    /// @notice Returns the name of this scoring adapter
    function adapterName() external view returns (string memory);
}
