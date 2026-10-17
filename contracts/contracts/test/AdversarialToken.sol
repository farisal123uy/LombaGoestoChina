// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Unsupported token fixture for rollback/postcondition/reentrancy tests.
contract AdversarialToken is ERC20 {
    address public failRecipient;
    bool public burnExtra;
    address public callbackTarget;
    bytes public callbackData;
    bool public reentrySucceeded;
    constructor(address recipient) ERC20("Adversarial fixture", "BAD") { _mint(recipient, 10000000); }
    function configure(address failTo, bool burn, address target, bytes calldata data) external {
        failRecipient = failTo; burnExtra = burn; callbackTarget = target; callbackData = data;
    }
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (to == failRecipient) return false;
        if (callbackTarget != address(0)) (reentrySucceeded,) = callbackTarget.call(callbackData);
        super.transfer(to, amount);
        if (burnExtra) _burn(msg.sender, 1);
        return true;
    }
}
