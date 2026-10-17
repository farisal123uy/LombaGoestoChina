// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Local-fork fixture ONLY. No eligibility/signature policy, never a production paymaster.
contract TestNativePaymaster {
    address public immutable entryPoint;
    struct PackedUserOperation {
        address sender; uint256 nonce; bytes initCode; bytes callData;
        bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees;
        bytes paymasterAndData; bytes signature;
    }
    constructor(address ep) { entryPoint = ep; }
    function validatePaymasterUserOp(PackedUserOperation calldata, bytes32, uint256) external view returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint);
        return ("", 0);
    }
    function postOp(uint8, bytes calldata, uint256, uint256) external view { require(msg.sender == entryPoint); }
}
