// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

/// @title IERC5484
/// @notice Interface for ERC-5484 Consensual Soulbound Tokens
interface IERC5484 {
    /// @notice Emitted when a soulbound token is issued
    /// @param from The issuer address
    /// @param to The recipient address
    /// @param tokenId The token identifier
    /// @param burnAuth The burn authorization type
    event Issued(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId,
        BurnAuth burnAuth
    );

    /// @notice Burn authorization types
    enum BurnAuth {
        IssuerOnly,
        OwnerOnly,
        Both,
        Neither
    }

    /// @notice Returns the burn authorization for a given token
    /// @param tokenId The token identifier
    /// @return The burn authorization type
    function burnAuth(uint256 tokenId) external view returns (BurnAuth);
}
