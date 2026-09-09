// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FlintEscrow} from "./FlintEscrow.sol";

/// @title FlintScorerReceiver
/// @notice Receives CRE DON reports and forwards decoded scores to FlintEscrow
contract FlintScorerReceiver is Ownable {

    FlintEscrow public escrow;
    mapping(address => bool) public allowedForwarders;

    event ReportProcessed(bytes32 indexed repoId, uint256 contributorCount);
    event ForwarderUpdated(address indexed forwarder, bool allowed);

    error UnauthorizedForwarder();

    constructor(address _owner, address _escrow) Ownable(_owner) {
        escrow = FlintEscrow(_escrow);
    }

    /// @notice Called by Chainlink DON Forwarder after consensus
    function onReport(bytes calldata, bytes calldata report) external {
        if (!allowedForwarders[msg.sender]) revert UnauthorizedForwarder();

        (bytes32 repoId, address[] memory contributors, uint256[] memory scores) =
            abi.decode(report, (bytes32, address[], uint256[]));

        escrow.submitScores(repoId, contributors, scores);

        emit ReportProcessed(repoId, contributors.length);
    }

    function setForwarder(address forwarder, bool allowed) external onlyOwner {
        allowedForwarders[forwarder] = allowed;
        emit ForwarderUpdated(forwarder, allowed);
    }

    function setEscrow(address _escrow) external onlyOwner {
        escrow = FlintEscrow(_escrow);
    }
}
