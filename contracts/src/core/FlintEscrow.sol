// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPayoutPolicy} from "../interfaces/IPayoutPolicy.sol";
import {FlintReceipt} from "./FlintReceipt.sol";

/// @title FlintEscrow
/// @notice Holds reward pools for Program Mode and Open Mode, manages scoring and payouts
/// @dev Scores submitted by authorized scorer (Chainlink consumer), payouts require Ledger signature
contract FlintEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ─── Constants ────────────────────────────────────────────────────────

    uint256 public constant TIMEOUT_DURATION = 30 days;
    uint256 public constant SCORE_SCALE = 1e6;

    // ─── Storage ──────────────────────────────────────────────────────────

    enum PoolStatus { Active, ScoresSubmitted, Approved, Paid, Reclaimed }

    struct Pool {
        address maintainer;
        address token;
        uint256 totalAmount;
        address payoutPolicy;
        address ledgerSigner;       // Expected Ledger address for approval
        uint256 createdAt;
        uint256 cycle;
        PoolStatus status;
        string mode;                // "program" or "open"
    }

    struct ContributorScore {
        address contributor;
        uint256 score;
    }

    /// @notice Pool data by repo ID
    mapping(bytes32 => Pool) public pools;

    /// @notice Scores for each pool: repoId => contributor scores array
    mapping(bytes32 => ContributorScore[]) public poolScores;

    /// @notice Cycle counter per repo
    mapping(bytes32 => uint256) public currentCycle;

    /// @notice Authorized scorers (Chainlink Functions consumer contracts)
    mapping(address => bool) public isScorer;

    /// @notice FlintReceipt contract for minting soulbound tokens
    FlintReceipt public receipt;

    // ─── Events ───────────────────────────────────────────────────────────

    event PoolCreated(
        bytes32 indexed repoId,
        address indexed maintainer,
        address token,
        uint256 amount,
        string mode,
        uint256 cycle
    );

    event ScoresSubmitted(
        bytes32 indexed repoId,
        uint256 indexed cycle,
        uint256 contributorCount
    );

    event PayoutApproved(
        bytes32 indexed repoId,
        uint256 indexed cycle,
        address indexed signer
    );

    event PayoutExecuted(
        bytes32 indexed repoId,
        uint256 indexed cycle,
        address indexed contributor,
        uint256 amount
    );

    event PoolReclaimed(
        bytes32 indexed repoId,
        address indexed maintainer,
        uint256 amount
    );

    event TimeoutPayoutExecuted(
        bytes32 indexed repoId,
        uint256 indexed cycle
    );

    event ScorerUpdated(address indexed scorer, bool status);

    // ─── Errors ───────────────────────────────────────────────────────────

    error PoolAlreadyExists();
    error PoolNotFound();
    error NotMaintainer();
    error NotScorer();
    error InvalidStatus(PoolStatus expected, PoolStatus actual);
    error InvalidSignature();
    error TimeoutNotReached();
    error NoScoresSubmitted();
    error ArrayLengthMismatch();
    error ZeroAmount();
    error ZeroAddress();

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address _owner, address _receipt) Ownable(_owner) {
        receipt = FlintReceipt(_receipt);
    }

    // ─── Maintainer Functions ─────────────────────────────────────────────

    /// @notice Create a reward pool for a repository
    /// @param repoId Unique identifier for the repo (keccak256 of "owner/repo")
    /// @param token ERC-20 token address (e.g., USDC)
    /// @param amount Total pool amount
    /// @param payoutPolicy Address of the IPayoutPolicy contract to use
    /// @param ledgerSigner Expected Ledger address that will approve payouts
    /// @param mode "program" or "open"
    function createPool(
        bytes32 repoId,
        address token,
        uint256 amount,
        address payoutPolicy,
        address ledgerSigner,
        string calldata mode
    ) external nonReentrant {
        if (pools[repoId].maintainer != address(0)) revert PoolAlreadyExists();
        if (amount == 0) revert ZeroAmount();
        if (token == address(0) || payoutPolicy == address(0) || ledgerSigner == address(0)) {
            revert ZeroAddress();
        }

        uint256 cycle = ++currentCycle[repoId];

        pools[repoId] = Pool({
            maintainer: msg.sender,
            token: token,
            totalAmount: amount,
            payoutPolicy: payoutPolicy,
            ledgerSigner: ledgerSigner,
            createdAt: block.timestamp,
            cycle: cycle,
            status: PoolStatus.Active,
            mode: mode
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit PoolCreated(repoId, msg.sender, token, amount, mode, cycle);
    }

    // ─── Scorer Functions (Chainlink) ─────────────────────────────────────

    /// @notice Submit contribution scores for a pool
    /// @param repoId The repository identifier
    /// @param contributors Array of contributor addresses
    /// @param scores Array of scores (scaled by 1e6)
    function submitScores(
        bytes32 repoId,
        address[] calldata contributors,
        uint256[] calldata scores
    ) external {
        if (!isScorer[msg.sender]) revert NotScorer();
        Pool storage pool = pools[repoId];
        if (pool.maintainer == address(0)) revert PoolNotFound();
        if (pool.status != PoolStatus.Active) {
            revert InvalidStatus(PoolStatus.Active, pool.status);
        }
        if (contributors.length != scores.length) revert ArrayLengthMismatch();

        // Clear previous scores
        delete poolScores[repoId];

        for (uint256 i; i < contributors.length;) {
            if (contributors[i] == address(0)) revert ZeroAddress();
            poolScores[repoId].push(ContributorScore({
                contributor: contributors[i],
                score: scores[i]
            }));
            unchecked { ++i; }
        }

        pool.status = PoolStatus.ScoresSubmitted;
        emit ScoresSubmitted(repoId, pool.cycle, contributors.length);
    }

    // ─── Ledger Approval + Payout ─────────────────────────────────────────

    /// @notice Approve and execute payout with Ledger signature
    /// @param repoId The repository identifier
    /// @param signature Ledger ECDSA signature over the approval hash
    function approveAndPayout(
        bytes32 repoId,
        bytes calldata signature
    ) external nonReentrant {
        Pool storage pool = pools[repoId];
        if (pool.maintainer == address(0)) revert PoolNotFound();
        if (pool.status != PoolStatus.ScoresSubmitted) {
            revert InvalidStatus(PoolStatus.ScoresSubmitted, pool.status);
        }

        ContributorScore[] storage scores = poolScores[repoId];
        if (scores.length == 0) revert NoScoresSubmitted();

        // Build arrays for payout policy
        uint256 len = scores.length;
        address[] memory contributors = new address[](len);
        uint256[] memory scoreValues = new uint256[](len);

        for (uint256 i; i < len;) {
            contributors[i] = scores[i].contributor;
            scoreValues[i] = scores[i].score;
            unchecked { ++i; }
        }

        // Compute approval hash
        bytes32 approvalHash = keccak256(
            abi.encodePacked(
                repoId,
                pool.cycle,
                pool.token,
                pool.totalAmount,
                keccak256(abi.encodePacked(contributors)),
                keccak256(abi.encodePacked(scoreValues)),
                block.chainid,
                address(this)
            )
        );

        // Verify Ledger signature
        bytes32 ethSignedHash = approvalHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        if (recovered != pool.ledgerSigner) revert InvalidSignature();

        pool.status = PoolStatus.Approved;
        emit PayoutApproved(repoId, pool.cycle, recovered);

        // Calculate payouts via policy
        uint256[] memory payouts = IPayoutPolicy(pool.payoutPolicy).calculate(
            scoreValues,
            pool.totalAmount
        );

        // Execute payouts and mint receipts
        IERC20 token = IERC20(pool.token);
        for (uint256 i; i < len;) {
            if (payouts[i] > 0) {
                token.safeTransfer(contributors[i], payouts[i]);

                receipt.mint(
                    contributors[i],
                    repoId,
                    pool.cycle,
                    scoreValues[i],
                    payouts[i],
                    pool.mode
                );

                emit PayoutExecuted(repoId, pool.cycle, contributors[i], payouts[i]);
            }
            unchecked { ++i; }
        }

        pool.status = PoolStatus.Paid;
    }

    // ─── Timeout Auto-Release ─────────────────────────────────────────────

    /// @notice Auto-release funds based on scores if maintainer hasn't approved within 30 days
    /// @param repoId The repository identifier
    function timeoutRelease(bytes32 repoId) external nonReentrant {
        Pool storage pool = pools[repoId];
        if (pool.maintainer == address(0)) revert PoolNotFound();
        if (pool.status != PoolStatus.ScoresSubmitted) {
            revert InvalidStatus(PoolStatus.ScoresSubmitted, pool.status);
        }
        if (block.timestamp < pool.createdAt + TIMEOUT_DURATION) revert TimeoutNotReached();

        ContributorScore[] storage scores = poolScores[repoId];
        if (scores.length == 0) revert NoScoresSubmitted();

        uint256 len = scores.length;
        uint256[] memory scoreValues = new uint256[](len);
        address[] memory contributors = new address[](len);

        for (uint256 i; i < len;) {
            contributors[i] = scores[i].contributor;
            scoreValues[i] = scores[i].score;
            unchecked { ++i; }
        }

        uint256[] memory payouts = IPayoutPolicy(pool.payoutPolicy).calculate(
            scoreValues,
            pool.totalAmount
        );

        IERC20 token = IERC20(pool.token);
        for (uint256 i; i < len;) {
            if (payouts[i] > 0) {
                token.safeTransfer(contributors[i], payouts[i]);

                receipt.mint(
                    contributors[i],
                    repoId,
                    pool.cycle,
                    scoreValues[i],
                    payouts[i],
                    pool.mode
                );

                emit PayoutExecuted(repoId, pool.cycle, contributors[i], payouts[i]);
            }
            unchecked { ++i; }
        }

        pool.status = PoolStatus.Paid;
        emit TimeoutPayoutExecuted(repoId, pool.cycle);
    }

    /// @notice Reclaim funds if no scores were submitted and timeout has passed
    /// @param repoId The repository identifier
    function reclaimAfterTimeout(bytes32 repoId) external nonReentrant {
        Pool storage pool = pools[repoId];
        if (pool.maintainer == address(0)) revert PoolNotFound();
        if (msg.sender != pool.maintainer) revert NotMaintainer();
        if (pool.status != PoolStatus.Active) {
            revert InvalidStatus(PoolStatus.Active, pool.status);
        }
        if (block.timestamp < pool.createdAt + TIMEOUT_DURATION) revert TimeoutNotReached();

        pool.status = PoolStatus.Reclaimed;
        IERC20(pool.token).safeTransfer(pool.maintainer, pool.totalAmount);

        emit PoolReclaimed(repoId, pool.maintainer, pool.totalAmount);
    }

    // ─── Admin Functions ──────────────────────────────────────────────────

    /// @notice Set or remove a scorer address (owner only)
    function setScorer(address scorer, bool status) external onlyOwner {
        isScorer[scorer] = status;
        emit ScorerUpdated(scorer, status);
    }

    /// @notice Update the receipt contract address (owner only)
    function setReceipt(address _receipt) external onlyOwner {
        receipt = FlintReceipt(_receipt);
    }

    // ─── View Functions ───────────────────────────────────────────────────

    /// @notice Get scores for a pool
    function getPoolScores(bytes32 repoId) external view returns (ContributorScore[] memory) {
        return poolScores[repoId];
    }

    /// @notice Compute the approval hash for a pool (for Ledger to sign)
    function computeApprovalHash(bytes32 repoId) external view returns (bytes32) {
        Pool storage pool = pools[repoId];
        ContributorScore[] storage scores = poolScores[repoId];

        uint256 len = scores.length;
        address[] memory contributors = new address[](len);
        uint256[] memory scoreValues = new uint256[](len);

        for (uint256 i; i < len;) {
            contributors[i] = scores[i].contributor;
            scoreValues[i] = scores[i].score;
            unchecked { ++i; }
        }

        return keccak256(
            abi.encodePacked(
                repoId,
                pool.cycle,
                pool.token,
                pool.totalAmount,
                keccak256(abi.encodePacked(contributors)),
                keccak256(abi.encodePacked(scoreValues)),
                block.chainid,
                address(this)
            )
        );
    }
}
