// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local/testnet fixture only. This token is not USDC or real money.
contract MockUSD is ERC20 {
    constructor(address recipient) ERC20("Mock USD", "mUSD") {
        _mint(recipient, 1_000_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
