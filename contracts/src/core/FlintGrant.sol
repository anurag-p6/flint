// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FlintReceipt} from "./FlintReceipt.sol";

/// @title FlintGrant
/// @notice Milestone-based grant escrow for Web2/Web3 grant programs
/// @dev Grantor deposits full amount upfront. Milestones release tranches via Ledger-signed approval.
contract FlintGrant is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ─── Constants ────────────────────────────────────────────────────────

    uint256 public constant AUTO_RELEASE_DELAY = 14 days;
    uint256 public constant BASIS_POINTS = 10_000;

    // ─── Storage ──────────────────────────────────────────────────────────

    enum MilestoneStatus { Pending, Verified, Paid }
    enum GrantStatus { Active, Completed, Cancelled }

    struct Milestone {
        string description;
        uint256 trancheBps;         // Basis points (e.g., 3000 = 30%)
        uint256 deadline;           // Unix timestamp deadline
        MilestoneStatus status;
        uint256 verifiedAt;         // Timestamp when verified
        uint256 paidAt;             // Timestamp when paid
    }

    struct Grant {
        address grantor;
        address grantee;
        address token;
        uint256 totalAmount;
        uint256 amountPaid;
        address ledgerApprover;     // Grant committee Ledger address
        uint256 createdAt;
        GrantStatus status;
    }

    uint256 public nextGrantId;

    /// @notice Grant data by ID
    mapping(uint256 => Grant) public grants;

    /// @notice Milestones for each grant
    mapping(uint256 => Milestone[]) public grantMilestones;

    /// @notice Authorized verifiers (Chainlink consumer contracts)
    mapping(address => bool) public isVerifier;

    /// @notice FlintReceipt contract for minting soulbound tokens
    FlintReceipt public receipt;

    // ─── Events ───────────────────────────────────────────────────────────

    event GrantCreated(
        uint256 indexed grantId,
        address indexed grantor,
        address indexed grantee,
        address token,
        uint256 totalAmount,
        uint256 milestoneCount
    );

    event MilestoneVerified(
        uint256 indexed grantId,
        uint256 indexed milestoneId,
        uint256 verifiedAt
    );

    event TrancheReleased(
        uint256 indexed grantId,
        uint256 indexed milestoneId,
        address indexed grantee,
        uint256 amount
    );

    event TrancheAutoReleased(
        uint256 indexed grantId,
        uint256 indexed milestoneId,
        uint256 amount
    );

    event GrantReclaimed(
        uint256 indexed grantId,
        address indexed grantor,
        uint256 amount
    );

    event GrantCompleted(uint256 indexed grantId);
    event VerifierUpdated(address indexed verifier, bool status);

    // ─── Errors ───────────────────────────────────────────────────────────

    error GrantNotFound();
    error NotGrantor();
    error NotVerifier();
    error InvalidMilestoneId();
    error InvalidStatus();
    error MilestoneNotVerified();
    error MilestoneAlreadyVerified();
    error MilestoneAlreadyPaid();
    error InvalidSignature();
    error AutoReleaseNotReady();
    error GrantNotExpired();
    error InvalidTrancheBps();
    error ZeroAmount();
    error ZeroAddress();
    error NoMilestones();

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address _owner, address _receipt) Ownable(_owner) {
        receipt = FlintReceipt(_receipt);
    }

    // ─── Grantor Functions ────────────────────────────────────────────────

    /// @notice Create a new grant with milestones
    /// @param grantee The grant recipient address
    /// @param token ERC-20 token address (e.g., USDC)
    /// @param totalAmount Total grant amount
    /// @param ledgerApprover Grant committee Ledger address
    /// @param descriptions Array of milestone descriptions
    /// @param trancheBps Array of tranche basis points (must sum to 10000)
    /// @param deadlines Array of milestone deadlines (unix timestamps)
    /// @return grantId The created grant ID
    function createGrant(
        address grantee,
        address token,
        uint256 totalAmount,
        address ledgerApprover,
        string[] calldata descriptions,
        uint256[] calldata trancheBps,
        uint256[] calldata deadlines
    ) external nonReentrant returns (uint256 grantId) {
        if (grantee == address(0) || token == address(0) || ledgerApprover == address(0)) {
            revert ZeroAddress();
        }
        if (totalAmount == 0) revert ZeroAmount();

        uint256 len = descriptions.length;
        if (len == 0) revert NoMilestones();
        if (len != trancheBps.length || len != deadlines.length) revert InvalidMilestoneId();

        // Validate tranche BPS sum to 10000
        uint256 totalBps;
        for (uint256 i; i < len;) {
            totalBps += trancheBps[i];
            unchecked { ++i; }
        }
        if (totalBps != BASIS_POINTS) revert InvalidTrancheBps();

        grantId = nextGrantId++;

        grants[grantId] = Grant({
            grantor: msg.sender,
            grantee: grantee,
            token: token,
            totalAmount: totalAmount,
            amountPaid: 0,
            ledgerApprover: ledgerApprover,
            createdAt: block.timestamp,
            status: GrantStatus.Active
        });

        for (uint256 i; i < len;) {
            grantMilestones[grantId].push(Milestone({
                description: descriptions[i],
                trancheBps: trancheBps[i],
                deadline: deadlines[i],
                status: MilestoneStatus.Pending,
                verifiedAt: 0,
                paidAt: 0
            }));
            unchecked { ++i; }
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        emit GrantCreated(grantId, msg.sender, grantee, token, totalAmount, len);
    }

    // ─── Verifier Functions (Chainlink) ───────────────────────────────────

    /// @notice Verify a milestone has been completed
    /// @param grantId The grant identifier
    /// @param milestoneId The milestone index
    function verifyMilestone(
        uint256 grantId,
        uint256 milestoneId
    ) external {
        if (!isVerifier[msg.sender]) revert NotVerifier();

        Grant storage grant_ = grants[grantId];
        if (grant_.grantor == address(0)) revert GrantNotFound();
        if (grant_.status != GrantStatus.Active) revert InvalidStatus();

        Milestone[] storage milestones = grantMilestones[grantId];
        if (milestoneId >= milestones.length) revert InvalidMilestoneId();

        Milestone storage milestone = milestones[milestoneId];
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneAlreadyVerified();

        milestone.status = MilestoneStatus.Verified;
        milestone.verifiedAt = block.timestamp;

        emit MilestoneVerified(grantId, milestoneId, block.timestamp);
    }

    // ─── Ledger Approval + Tranche Release ────────────────────────────────

    /// @notice Release a tranche for a verified milestone with Ledger signature
    /// @param grantId The grant identifier
    /// @param milestoneId The milestone index
    /// @param signature Ledger ECDSA signature over the approval hash
    function releaseTranche(
        uint256 grantId,
        uint256 milestoneId,
        bytes calldata signature
    ) external nonReentrant {
        Grant storage grant_ = grants[grantId];
        if (grant_.grantor == address(0)) revert GrantNotFound();
        if (grant_.status != GrantStatus.Active) revert InvalidStatus();

        Milestone[] storage milestones = grantMilestones[grantId];
        if (milestoneId >= milestones.length) revert InvalidMilestoneId();

        Milestone storage milestone = milestones[milestoneId];
        if (milestone.status != MilestoneStatus.Verified) revert MilestoneNotVerified();

        // Compute approval hash
        bytes32 approvalHash = _computeMilestoneApprovalHash(grantId, milestoneId);

        // Verify Ledger signature
        bytes32 ethSignedHash = approvalHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        if (recovered != grant_.ledgerApprover) revert InvalidSignature();

        // Calculate and release tranche
        _releaseTranche(grantId, milestoneId);
    }

    // ─── Auto-Release (Timeout Protection for Grantee) ────────────────────

    /// @notice Auto-release tranche if committee hasn't approved within 14 days of verification
    /// @param grantId The grant identifier
    /// @param milestoneId The milestone index
    function autoRelease(
        uint256 grantId,
        uint256 milestoneId
    ) external nonReentrant {
        Grant storage grant_ = grants[grantId];
        if (grant_.grantor == address(0)) revert GrantNotFound();
        if (grant_.status != GrantStatus.Active) revert InvalidStatus();

        Milestone[] storage milestones = grantMilestones[grantId];
        if (milestoneId >= milestones.length) revert InvalidMilestoneId();

        Milestone storage milestone = milestones[milestoneId];
        if (milestone.status != MilestoneStatus.Verified) revert MilestoneNotVerified();
        if (block.timestamp < milestone.verifiedAt + AUTO_RELEASE_DELAY) {
            revert AutoReleaseNotReady();
        }

        _releaseTranche(grantId, milestoneId);
        emit TrancheAutoReleased(grantId, milestoneId, _trancheAmount(grant_.totalAmount, milestone.trancheBps));
    }

    // ─── Grantor Reclaim ──────────────────────────────────────────────────

    /// @notice Reclaim undisbursed funds after the grant's last milestone deadline has passed
    /// @param grantId The grant identifier
    function reclaimUndisbursed(uint256 grantId) external nonReentrant {
        Grant storage grant_ = grants[grantId];
        if (grant_.grantor == address(0)) revert GrantNotFound();
        if (msg.sender != grant_.grantor) revert NotGrantor();
        if (grant_.status != GrantStatus.Active) revert InvalidStatus();

        // Check that the last milestone's deadline has passed
        Milestone[] storage milestones = grantMilestones[grantId];
        uint256 lastDeadline = milestones[milestones.length - 1].deadline;
        if (block.timestamp < lastDeadline) revert GrantNotExpired();

        uint256 remaining = grant_.totalAmount - grant_.amountPaid;
        if (remaining == 0) revert ZeroAmount();

        grant_.status = GrantStatus.Cancelled;
        IERC20(grant_.token).safeTransfer(grant_.grantor, remaining);

        emit GrantReclaimed(grantId, grant_.grantor, remaining);
    }

    // ─── Admin Functions ──────────────────────────────────────────────────

    /// @notice Set or remove a verifier address (owner only)
    function setVerifier(address verifier, bool status) external onlyOwner {
        isVerifier[verifier] = status;
        emit VerifierUpdated(verifier, status);
    }

    /// @notice Update the receipt contract address (owner only)
    function setReceipt(address _receipt) external onlyOwner {
        receipt = FlintReceipt(_receipt);
    }

    // ─── View Functions ───────────────────────────────────────────────────

    /// @notice Get all milestones for a grant
    function getMilestones(uint256 grantId) external view returns (Milestone[] memory) {
        return grantMilestones[grantId];
    }

    /// @notice Get the milestone count for a grant
    function getMilestoneCount(uint256 grantId) external view returns (uint256) {
        return grantMilestones[grantId].length;
    }

    /// @notice Compute the approval hash for a milestone (for Ledger to sign)
    function computeApprovalHash(
        uint256 grantId,
        uint256 milestoneId
    ) external view returns (bytes32) {
        return _computeMilestoneApprovalHash(grantId, milestoneId);
    }

    // ─── Internal Functions ───────────────────────────────────────────────

    function _releaseTranche(uint256 grantId, uint256 milestoneId) internal {
        Grant storage grant_ = grants[grantId];
        Milestone[] storage milestones = grantMilestones[grantId];
        Milestone storage milestone = milestones[milestoneId];

        uint256 amount = _trancheAmount(grant_.totalAmount, milestone.trancheBps);

        milestone.status = MilestoneStatus.Paid;
        milestone.paidAt = block.timestamp;
        grant_.amountPaid += amount;

        IERC20(grant_.token).safeTransfer(grant_.grantee, amount);

        // Mint soulbound receipt
        bytes32 grantIdHash = keccak256(abi.encodePacked("grant", grantId));
        receipt.mint(
            grant_.grantee,
            grantIdHash,
            milestoneId,
            milestone.trancheBps,
            amount,
            "grant"
        );

        emit TrancheReleased(grantId, milestoneId, grant_.grantee, amount);

        // Check if all milestones are paid
        bool allPaid = true;
        for (uint256 i; i < milestones.length;) {
            if (milestones[i].status != MilestoneStatus.Paid) {
                allPaid = false;
                break;
            }
            unchecked { ++i; }
        }
        if (allPaid) {
            grant_.status = GrantStatus.Completed;
            emit GrantCompleted(grantId);
        }
    }

    function _trancheAmount(uint256 total, uint256 bps) internal pure returns (uint256) {
        return (total * bps) / BASIS_POINTS;
    }

    function _computeMilestoneApprovalHash(
        uint256 grantId,
        uint256 milestoneId
    ) internal view returns (bytes32) {
        Grant storage grant_ = grants[grantId];
        Milestone storage milestone = grantMilestones[grantId][milestoneId];

        return keccak256(
            abi.encodePacked(
                grantId,
                milestoneId,
                grant_.grantee,
                grant_.token,
                _trancheAmount(grant_.totalAmount, milestone.trancheBps),
                milestone.verifiedAt,
                block.chainid,
                address(this)
            )
        );
    }
}
