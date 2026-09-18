// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {Test, console} from "forge-std/Test.sol";
import {FlintGrant} from "../src/core/FlintGrant.sol";
import {FlintReceipt} from "../src/core/FlintReceipt.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice FlintGrant lifecycle + timeout boundaries (Block 06).
/// Uses MockUSDC — forge cannot simulate Arc's native-USDC compliance
/// precompile, so on-Arc behavior is covered by keeper dry-run + live loop.
contract FlintGrantTest is Test {
    FlintGrant public grant;
    FlintReceipt public receipt;
    MockUSDC public usdc;

    address public grantor = address(0xA11CE);
    address public grantee = address(0xB0B);
    uint256 public approverKey = 0xBEEF;
    address public approver;
    address public verifier = address(0xBE71);

    uint256 constant POOL = 1_000_000; // 1000 USDC

    function setUp() public {
        approver = vm.addr(approverKey);
        vm.deal(grantor, 10 ether);
        receipt = new FlintReceipt(address(this));
        grant = new FlintGrant(address(this), address(receipt));
        usdc = new MockUSDC();
        receipt.setMinter(address(grant), true);
        grant.setVerifier(verifier, true);

        usdc.mint(grantor, POOL);
        vm.startPrank(grantor);
        usdc.approve(address(grant), POOL);
        vm.stopPrank();
    }

    function _descriptions() internal pure returns (string[] memory d) {
        d = new string[](2);
        d[0] = "source: acme/repo#1\nShip auth";
        d[1] = "source: acme/repo#1\nAudit";
    }

    function _bps() internal pure returns (uint256[] memory b) {
        b = new uint256[](2);
        b[0] = 6000;
        b[1] = 4000;
    }

    function _deadlines() internal view returns (uint256[] memory d) {
        d = new uint256[](2);
        d[0] = block.timestamp + 30 days;
        d[1] = block.timestamp + 60 days;
    }

    function _create() internal returns (uint256 id) {
        vm.prank(grantor);
        id = grant.createGrant(grantee, address(usdc), POOL, approver, _descriptions(), _bps(), _deadlines());
    }

    function _signRelease(uint256 approverPk, uint256 id, uint256 mid) internal view returns (bytes memory sig) {
        bytes32 h = grant.computeApprovalHash(id, mid);
        bytes32 eth = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(approverPk, eth);
        sig = abi.encodePacked(r, s, v);
    }

    function testCreateValidation() public {
        // bps must sum to 10000
        uint256[] memory bad = new uint256[](2);
        bad[0] = 5000;
        bad[1] = 4000;
        vm.prank(grantor);
        vm.expectRevert(FlintGrant.InvalidTrancheBps.selector);
        grant.createGrant(grantee, address(usdc), POOL, approver, _descriptions(), bad, _deadlines());

        // needs at least one milestone
        vm.prank(grantor);
        vm.expectRevert(FlintGrant.NoMilestones.selector);
        grant.createGrant(
            grantee, address(usdc), POOL, approver,
            new string[](0), new uint256[](0), new uint256[](0)
        );
    }

    function testVerifyReleaseFlow() public {
        uint256 id = _create();
        vm.prank(verifier);
        grant.verifyMilestone(id, 0);

        uint256 before = usdc.balanceOf(grantee);
        grant.releaseTranche(id, 0, _signRelease(approverKey, id, 0));
        assertEq(usdc.balanceOf(grantee) - before, (POOL * 6000) / 10000, "60% tranche");
        assertEq(receipt.balanceOf(grantee), 1, "receipt minted");

        // double-verify and double-pay revert
        vm.prank(verifier);
        vm.expectRevert(FlintGrant.MilestoneAlreadyVerified.selector);
        grant.verifyMilestone(id, 0);
    }

    function testWrongSignerReverts() public {
        uint256 id = _create();
        vm.prank(verifier);
        grant.verifyMilestone(id, 0);
        bytes memory badSig = _signRelease(0xBADCAFE, id, 0);
        vm.expectRevert(FlintGrant.InvalidSignature.selector);
        grant.releaseTranche(id, 0, badSig);
    }

    function testAutoReleaseBoundary() public {
        uint256 id = _create();
        vm.prank(verifier);
        grant.verifyMilestone(id, 0);
        uint256 verifiedAt = block.timestamp;

        vm.warp(verifiedAt + 14 days - 1);
        vm.expectRevert(FlintGrant.AutoReleaseNotReady.selector);
        grant.autoRelease(id, 0);

        vm.warp(verifiedAt + 14 days + 1);
        uint256 before = usdc.balanceOf(grantee);
        grant.autoRelease(id, 0);
        assertEq(usdc.balanceOf(grantee) - before, (POOL * 6000) / 10000, "auto-released 60%");
    }

    function testReclaim() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 61 days);

        vm.prank(grantee);
        vm.expectRevert(FlintGrant.NotGrantor.selector);
        grant.reclaimUndisbursed(id);

        uint256 before = usdc.balanceOf(grantor);
        vm.prank(grantor);
        grant.reclaimUndisbursed(id);
        assertEq(usdc.balanceOf(grantor) - before, POOL, "full reclaim");
    }
}
