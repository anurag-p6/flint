// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IERC5484} from "../interfaces/IERC5484.sol";

/// @title FlintReceipt
/// @notice ERC-5484 Soulbound Token — permanent, non-transferable proof of contribution
/// @dev Minted after each payout cycle or grant milestone. Stores repo, cycle, score, amount on-chain.
contract FlintReceipt is ERC721URIStorage, Ownable, IERC5484 {
    using Strings for uint256;
    using Strings for address;

    // ─── Storage ──────────────────────────────────────────────────────────

    uint256 private _nextTokenId;

    /// @notice Authorized minters (FlintEscrow, FlintGrant contracts)
    mapping(address => bool) public isMinter;

    /// @notice Receipt metadata stored on-chain
    struct ReceiptData {
        bytes32 repoId;
        uint256 cycle;
        uint256 score;
        uint256 amount;
        uint256 timestamp;
        string mode; // "program", "open", "grant"
    }

    /// @notice Token ID to receipt data
    mapping(uint256 => ReceiptData) public receipts;

    /// @notice All token IDs owned by a contributor
    mapping(address => uint256[]) public contributorTokens;

    // ─── Events ───────────────────────────────────────────────────────────

    event ReceiptMinted(
        address indexed contributor,
        uint256 indexed tokenId,
        bytes32 indexed repoId,
        uint256 cycle,
        uint256 score,
        uint256 amount,
        string mode
    );
    event MinterUpdated(address indexed minter, bool status);

    // ─── Errors ───────────────────────────────────────────────────────────

    error NotMinter();
    error SoulboundTransferBlocked();

    // ─── Modifiers ────────────────────────────────────────────────────────

    modifier onlyMinter() {
        if (!isMinter[msg.sender]) revert NotMinter();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address _owner) ERC721("Flint Receipt", "FLINT-SBT") Ownable(_owner) {}

    // ─── External Functions ───────────────────────────────────────────────

    /// @notice Mint a soulbound receipt token to a contributor
    /// @param to The contributor address
    /// @param repoId The repository identifier
    /// @param cycle The disbursement cycle number
    /// @param score The contributor's score (scaled by 1e6)
    /// @param amount The payout amount received
    /// @param mode The mode: "program", "open", or "grant"
    /// @return tokenId The minted token ID
    function mint(
        address to,
        bytes32 repoId,
        uint256 cycle,
        uint256 score,
        uint256 amount,
        string calldata mode
    ) external onlyMinter returns (uint256 tokenId) {
        tokenId = _nextTokenId++;

        _safeMint(to, tokenId);

        receipts[tokenId] = ReceiptData({
            repoId: repoId,
            cycle: cycle,
            score: score,
            amount: amount,
            timestamp: block.timestamp,
            mode: mode
        });

        contributorTokens[to].push(tokenId);

        // Generate on-chain JSON metadata
        string memory uri = _generateTokenURI(tokenId, to, repoId, cycle, score, amount, mode);
        _setTokenURI(tokenId, uri);

        emit Issued(address(this), to, tokenId, BurnAuth.Neither);
        emit ReceiptMinted(to, tokenId, repoId, cycle, score, amount, mode);
    }

    /// @notice Set or remove a minter address (owner only)
    function setMinter(address minter, bool status) external onlyOwner {
        isMinter[minter] = status;
        emit MinterUpdated(minter, status);
    }

    // ─── IERC5484 Implementation ──────────────────────────────────────────

    /// @inheritdoc IERC5484
    function burnAuth(uint256 /* tokenId */) external pure override returns (BurnAuth) {
        return BurnAuth.Neither;
    }

    // ─── View Functions ───────────────────────────────────────────────────

    /// @notice Get all token IDs for a contributor
    function getContributorTokens(address contributor) external view returns (uint256[] memory) {
        return contributorTokens[contributor];
    }

    /// @notice Get the total Flint Score across all receipts for a contributor
    function getTotalScore(address contributor) external view returns (uint256 totalScore) {
        uint256[] memory tokens = contributorTokens[contributor];
        for (uint256 i; i < tokens.length;) {
            totalScore += receipts[tokens[i]].score;
            unchecked { ++i; }
        }
    }

    /// @notice Get the total amount received across all receipts for a contributor
    function getTotalEarned(address contributor) external view returns (uint256 totalEarned) {
        uint256[] memory tokens = contributorTokens[contributor];
        for (uint256 i; i < tokens.length;) {
            totalEarned += receipts[tokens[i]].amount;
            unchecked { ++i; }
        }
    }

    // ─── Internal Overrides ───────────────────────────────────────────────

    /// @dev Block all transfers — soulbound tokens cannot be transferred
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Allow minting (from == address(0)), block all transfers
        if (from != address(0) && to != address(0)) {
            revert SoulboundTransferBlocked();
        }
        return super._update(to, tokenId, auth);
    }

    /// @dev Generate on-chain JSON metadata as a data URI
    function _generateTokenURI(
        uint256 tokenId,
        address contributor,
        bytes32 repoId,
        uint256 cycle,
        uint256 score,
        uint256 amount,
        string memory mode
    ) internal view returns (string memory) {
        string memory json = string(
            abi.encodePacked(
                '{"name":"Flint Receipt #',
                tokenId.toString(),
                '","description":"Soulbound proof of open source contribution via Flint Protocol"',
                ',"attributes":[',
                '{"trait_type":"Repo ID","value":"',
                _bytes32ToHex(repoId),
                '"},',
                '{"trait_type":"Cycle","display_type":"number","value":',
                cycle.toString(),
                '},',
                '{"trait_type":"Score","display_type":"number","value":',
                score.toString(),
                '},',
                '{"trait_type":"Amount","display_type":"number","value":',
                amount.toString(),
                '},',
                '{"trait_type":"Mode","value":"',
                mode,
                '"},',
                '{"trait_type":"Timestamp","display_type":"number","value":',
                block.timestamp.toString(),
                '},',
                '{"trait_type":"Contributor","value":"',
                contributor.toHexString(),
                '"}]}'
            )
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            )
        );
    }

    /// @dev Convert bytes32 to hex string
    function _bytes32ToHex(bytes32 data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(66);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i; i < 32;) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
            unchecked { ++i; }
        }
        return string(str);
    }
}
