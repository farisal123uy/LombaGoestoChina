// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply bootstrap fixture. Not USDC, not redeemable dollars.
contract GuardianDemoToken is ERC20 {
    constructor(address account) ERC20("Guardian Mock USD", "MockUSD") {
        _mint(account, 10_000_000);
    }
    function decimals() public pure override returns (uint8) { return 6; }
}
