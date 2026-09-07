// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FlintBatch
/// @notice Executes batch ERC-20 payments to multiple contributors in a single transaction
/// @dev Verifies Ledger-signed approval hash before executing any payout
contract FlintBatch is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ─── Events ───────────────────────────────────────────────────────────

    event BatchExecuted(
        bytes32 indexed approvalHash,
        address indexed token,
        address indexed signer,
        uint256 totalAmount,
        uint256 recipientCount
    );

    event PayoutExecuted(
        address indexed recipient,
        uint256 amount,
        bytes32 indexed approvalHash
    );

    // ─── Errors ───────────────────────────────────────────────────────────

    error ArrayLengthMismatch();
    error EmptyBatch();
    error InvalidSignature();
    error ZeroAmount();
    error ZeroAddress();

    // ─── External Functions ───────────────────────────────────────────────

    /// @notice Execute a batch payment to multiple recipients
    /// @param token The ERC-20 token to distribute
    /// @param recipients Array of recipient addresses
    /// @param amounts Array of amounts for each recipient
    /// @param signer The expected Ledger signer address
    /// @param signature Ledger ECDSA signature over the approval hash
    /// @dev The caller must have approved this contract to spend the total amount
    function executeBatch(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts,
        address signer,
        bytes calldata signature
    ) external nonReentrant {
        uint256 len = recipients.length;
        if (len == 0) revert EmptyBatch();
        if (len != amounts.length) revert ArrayLengthMismatch();

        // Compute approval hash from batch parameters
        bytes32 approvalHash = keccak256(
            abi.encodePacked(token, recipients, amounts, block.chainid, address(this))
        );

        // Verify Ledger signature
        bytes32 ethSignedHash = approvalHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        if (recovered != signer) revert InvalidSignature();

        // Execute transfers
        uint256 totalAmount;
        IERC20 tokenContract = IERC20(token);

        for (uint256 i; i < len;) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();

            tokenContract.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
            totalAmount += amounts[i];

            emit PayoutExecuted(recipients[i], amounts[i], approvalHash);
            unchecked { ++i; }
        }

        emit BatchExecuted(approvalHash, token, signer, totalAmount, len);
    }

    /// @notice Compute the approval hash that needs to be signed by the Ledger
    /// @param token The ERC-20 token address
    /// @param recipients Array of recipient addresses
    /// @param amounts Array of amounts for each recipient
    /// @return The approval hash to be signed
    function computeApprovalHash(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(token, recipients, amounts, block.chainid, address(this))
        );
    }
}
