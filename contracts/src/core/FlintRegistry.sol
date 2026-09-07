// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title FlintRegistry
/// @notice Permissionless protocol entry point — registers repos, grants, and protocol contracts
/// @dev Acts as the central discovery layer for The Graph subgraph indexing
contract FlintRegistry is Ownable {
    // ─── Storage ──────────────────────────────────────────────────────────

    struct RepoRecord {
        address escrow;         // FlintEscrow contract managing this repo's pool
        address maintainer;
        uint256 registeredAt;
        bool active;
    }

    struct GrantRecord {
        address grantContract;  // FlintGrant contract managing this grant
        address grantor;
        address grantee;
        uint256 registeredAt;
        bool active;
    }

    /// @notice Repo records by repo ID (keccak256 of "owner/repo")
    mapping(bytes32 => RepoRecord) public repos;

    /// @notice Grant records by grant ID
    mapping(uint256 => GrantRecord) public grantRecords;

    /// @notice All registered repo IDs
    bytes32[] public repoIds;

    /// @notice All registered grant IDs
    uint256[] public grantIds;

    /// @notice Protocol contract addresses
    address public escrowImpl;
    address public grantImpl;
    address public batchImpl;
    address public receiptImpl;
    address public identityImpl;

    // ─── Events ───────────────────────────────────────────────────────────

    event RepoRegistered(
        bytes32 indexed repoId,
        address indexed escrow,
        address indexed maintainer
    );

    event GrantRegistered(
        uint256 indexed grantId,
        address indexed grantContract,
        address indexed grantor,
        address grantee
    );

    event RepoDeactivated(bytes32 indexed repoId);
    event GrantDeactivated(uint256 indexed grantId);

    event ProtocolContractsUpdated(
        address escrow,
        address grant_,
        address batch,
        address receipt_,
        address identity
    );

    // ─── Errors ───────────────────────────────────────────────────────────

    error RepoAlreadyRegistered();
    error GrantAlreadyRegistered();
    error RepoNotFound();
    error GrantNotFound();
    error NotMaintainer();
    error NotGrantor();
    error ZeroAddress();

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ─── Registration Functions ───────────────────────────────────────────

    /// @notice Register a repository with its escrow contract
    /// @param repoId Unique identifier (keccak256 of "owner/repo")
    /// @param escrow The FlintEscrow contract address managing this repo
    function registerRepo(bytes32 repoId, address escrow) external {
        if (escrow == address(0)) revert ZeroAddress();
        if (repos[repoId].active) revert RepoAlreadyRegistered();

        repos[repoId] = RepoRecord({
            escrow: escrow,
            maintainer: msg.sender,
            registeredAt: block.timestamp,
            active: true
        });

        repoIds.push(repoId);
        emit RepoRegistered(repoId, escrow, msg.sender);
    }

    /// @notice Register a grant with its grant contract
    /// @param grantId The grant identifier
    /// @param grantContract The FlintGrant contract address
    /// @param grantee The grant recipient address
    function registerGrant(
        uint256 grantId,
        address grantContract,
        address grantee
    ) external {
        if (grantContract == address(0) || grantee == address(0)) revert ZeroAddress();
        if (grantRecords[grantId].active) revert GrantAlreadyRegistered();

        grantRecords[grantId] = GrantRecord({
            grantContract: grantContract,
            grantor: msg.sender,
            grantee: grantee,
            registeredAt: block.timestamp,
            active: true
        });

        grantIds.push(grantId);
        emit GrantRegistered(grantId, grantContract, msg.sender, grantee);
    }

    // ─── Deactivation Functions ───────────────────────────────────────────

    /// @notice Deactivate a repo registration (maintainer only)
    function deactivateRepo(bytes32 repoId) external {
        RepoRecord storage repo = repos[repoId];
        if (!repo.active) revert RepoNotFound();
        if (msg.sender != repo.maintainer) revert NotMaintainer();

        repo.active = false;
        emit RepoDeactivated(repoId);
    }

    /// @notice Deactivate a grant registration (grantor only)
    function deactivateGrant(uint256 grantId) external {
        GrantRecord storage grant_ = grantRecords[grantId];
        if (!grant_.active) revert GrantNotFound();
        if (msg.sender != grant_.grantor) revert NotGrantor();

        grant_.active = false;
        emit GrantDeactivated(grantId);
    }

    // ─── Admin Functions ──────────────────────────────────────────────────

    /// @notice Set protocol contract addresses (owner only)
    function setProtocolContracts(
        address _escrow,
        address _grant,
        address _batch,
        address _receipt,
        address _identity
    ) external onlyOwner {
        escrowImpl = _escrow;
        grantImpl = _grant;
        batchImpl = _batch;
        receiptImpl = _receipt;
        identityImpl = _identity;

        emit ProtocolContractsUpdated(_escrow, _grant, _batch, _receipt, _identity);
    }

    // ─── View Functions ───────────────────────────────────────────────────

    /// @notice Get the total number of registered repos
    function getRepoCount() external view returns (uint256) {
        return repoIds.length;
    }

    /// @notice Get the total number of registered grants
    function getGrantCount() external view returns (uint256) {
        return grantIds.length;
    }

    /// @notice Check if a repo is registered and active
    function isRepoActive(bytes32 repoId) external view returns (bool) {
        return repos[repoId].active;
    }

    /// @notice Check if a grant is registered and active
    function isGrantActive(uint256 grantId) external view returns (bool) {
        return grantRecords[grantId].active;
    }
}
