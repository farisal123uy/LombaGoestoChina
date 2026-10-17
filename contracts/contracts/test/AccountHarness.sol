// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITestModule {
    function onInstall(bytes calldata data) external;
    function onUninstall(bytes calldata data) external;
}

/// @notice Unit-test adapter ONLY. Kernel/EntryPoint evidence uses the fork suite.
contract AccountHarness {
    address public immutable owner;
    address public module;
    address public callbackToken;
    constructor(address _owner) { owner = _owner; }

    function install(address _module, bytes calldata data) external {
        require(msg.sender == owner);
        module = _module;
        ITestModule(module).onInstall(data);
    }
    function uninstall() external {
        require(msg.sender == owner);
        ITestModule(module).onUninstall("");
        module = address(0);
    }
    function isModuleInstalled(uint256 kind, address candidate, bytes calldata) external view returns (bool) {
        return kind == 2 && candidate == module;
    }
    function callAsAccount(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner);
        return _call(target, data);
    }
    function setCallbackToken(address token) external { require(msg.sender == owner); callbackToken = token; }
    function callback(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == callbackToken);
        return _call(target, data);
    }
    function executeFromExecutor(bytes32 mode, bytes calldata data) external payable returns (bytes[] memory results) {
        require(msg.sender == module && mode == bytes32(0));
        address target = address(bytes20(data[0:20]));
        require(uint256(bytes32(data[20:52])) == 0);
        results = new bytes[](1);
        results[0] = _call(target, data[52:]);
    }
    function _call(address target, bytes memory data) private returns (bytes memory result) {
        (bool success, bytes memory value) = target.call(data);
        if (!success) assembly { revert(add(value, 32), mload(value)) }
        return value;
    }
}
