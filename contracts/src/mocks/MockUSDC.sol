// SPDX-License-Identifier: MIT
pragma solidity ^0.8.32;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Mock ERC-20 token for testing. 6 decimals like real USDC.
contract MockUSDC is ERC20 {
    uint8 private constant _DECIMALS = 6;

    constructor() ERC20("USD Coin (Mock)", "USDC") {
        _mint(msg.sender, 10_000_000 * 10 ** _DECIMALS); // 10M USDC
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Public mint for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
