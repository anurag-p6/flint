// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title FlintIdentity
/// @notice Links GitHub usernames to wallet addresses with signature verification
/// @dev Contributors prove ownership via signed messages; verified later by Chainlink Functions
contract FlintIdentity is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ─── Storage ──────────────────────────────────────────────────────────

    /// @notice Mapping from GitHub username hash to wallet address
    mapping(bytes32 => address) public githubToWallet;

    /// @notice Mapping from wallet address to GitHub username
    mapping(address => string) public walletToGithub;

    /// @notice Whether a wallet has been registered
    mapping(address => bool) public isRegistered;

    /// @notice Authorized verifiers (Chainlink consumer contracts)
    mapping(address => bool) public isVerifier;

    /// @notice Whether an identity has been verified by Chainlink
    mapping(address => bool) public isVerified;

    // ─── Events ───────────────────────────────────────────────────────────

    event IdentityRegistered(address indexed wallet, string githubUsername);
    event IdentityVerified(address indexed wallet, string githubUsername);
    event IdentityRemoved(address indexed wallet, string githubUsername);
    event VerifierUpdated(address indexed verifier, bool status);

    // ─── Errors ───────────────────────────────────────────────────────────

    error AlreadyRegistered();
    error NotRegistered();
    error UsernameAlreadyClaimed();
    error InvalidSignature();
    error NotVerifier();
    error EmptyUsername();

    // ─── Modifiers ────────────────────────────────────────────────────────

    modifier onlyVerifier() {
        if (!isVerifier[msg.sender]) revert NotVerifier();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ─── External Functions ───────────────────────────────────────────────

    /// @notice Register a GitHub identity by providing a username and signature
    /// @param githubUsername The GitHub username to link
    /// @param signature EIP-191 signature of: "I am github.com/{username} — wallet: {address}"
    function register(
        string calldata githubUsername,
        bytes calldata signature
    ) external {
        if (bytes(githubUsername).length == 0) revert EmptyUsername();
        if (isRegistered[msg.sender]) revert AlreadyRegistered();

        bytes32 usernameHash = keccak256(abi.encodePacked(githubUsername));
        if (githubToWallet[usernameHash] != address(0)) revert UsernameAlreadyClaimed();

        // Verify the caller signed the identity claim message
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "I am github.com/",
                githubUsername,
                " - wallet: ",
                _toAsciiString(msg.sender)
            )
        );
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedHash.recover(signature);
        if (recovered != msg.sender) revert InvalidSignature();

        githubToWallet[usernameHash] = msg.sender;
        walletToGithub[msg.sender] = githubUsername;
        isRegistered[msg.sender] = true;

        emit IdentityRegistered(msg.sender, githubUsername);
    }

    /// @notice Verify an identity (called by Chainlink Functions consumer after Gist verification)
    /// @param wallet The wallet address to verify
    function verify(address wallet) external onlyVerifier {
        if (!isRegistered[wallet]) revert NotRegistered();
        isVerified[wallet] = true;
        emit IdentityVerified(wallet, walletToGithub[wallet]);
    }

    /// @notice Remove your own identity registration
    function removeIdentity() external {
        if (!isRegistered[msg.sender]) revert NotRegistered();

        string memory username = walletToGithub[msg.sender];
        bytes32 usernameHash = keccak256(abi.encodePacked(username));

        delete githubToWallet[usernameHash];
        delete walletToGithub[msg.sender];
        delete isRegistered[msg.sender];
        delete isVerified[msg.sender];

        emit IdentityRemoved(msg.sender, username);
    }

    /// @notice Set or remove a verifier address (owner only)
    /// @param verifier The address to update
    /// @param status Whether the address should be a verifier
    function setVerifier(address verifier, bool status) external onlyOwner {
        isVerifier[verifier] = status;
        emit VerifierUpdated(verifier, status);
    }

    // ─── View Functions ───────────────────────────────────────────────────

    /// @notice Get the wallet address for a GitHub username
    /// @param githubUsername The GitHub username
    /// @return wallet The linked wallet address (address(0) if not registered)
    function getWallet(string calldata githubUsername) external view returns (address) {
        return githubToWallet[keccak256(abi.encodePacked(githubUsername))];
    }

    // ─── Internal Functions ───────────────────────────────────────────────

    /// @dev Converts an address to its ASCII string representation (lowercase, checksumless)
    function _toAsciiString(address addr) internal pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = "0";
        s[1] = "x";
        for (uint256 i; i < 20;) {
            uint8 b = uint8(uint160(addr) >> (8 * (19 - i)));
            s[2 + i * 2] = _toHexChar(b >> 4);
            s[3 + i * 2] = _toHexChar(b & 0x0f);
            unchecked { ++i; }
        }
        return string(s);
    }

    function _toHexChar(uint8 b) internal pure returns (bytes1) {
        return b < 10 ? bytes1(b + 0x30) : bytes1(b + 0x57);
    }
}
