// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IGuardianAccount {
    function isModuleInstalled(uint256 moduleType, address module, bytes calldata context) external view returns (bool);
    function executeFromExecutor(bytes32 mode, bytes calldata executionCalldata) external payable returns (bytes[] memory);
}

/// @notice ERC-7579 executor for Kernel 0.3.1. Install/admin calls require the
/// account's owner route; the agent session must allow ONLY executePayments.
/// No assets or approvals are held by this module. Native gas is separate.
contract GuardianPayments is EIP712, ReentrancyGuard {
    uint256 public constant MAX_BATCH_SIZE = 10;
    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "ServiceQuote(address account,bytes32 providerId,bytes32 invoiceId,bytes32 serviceHash,address token,address recipient,uint256 amount,uint48 validUntil)"
    );

    struct PolicyInput {
        address token;
        address quoteSigner;
        address pauseGuardian;
        uint256 protectedBalance;
        uint256 perPaymentLimit;
        uint256 dailyLimit;
        uint48 validAfter;
        uint48 validUntil;
    }

    struct Policy {
        PolicyInput rules;
        uint64 version;
        bool installed;
        bool paused;
    }

    struct ServiceQuote {
        address account;
        bytes32 providerId;
        bytes32 invoiceId;
        bytes32 serviceHash;
        address token;
        address recipient;
        uint256 amount;
        uint48 validUntil;
    }

    mapping(address account => Policy) private policies;
    mapping(address account => mapping(address recipient => uint64)) private recipientVersions;
    mapping(address account => mapping(address token => mapping(uint256 day => uint256))) public spent;
    mapping(address account => mapping(bytes32 paymentId => bool)) public consumed;

    error NotInstalled();
    error AlreadyInstalled();
    error InvalidPolicy();
    error Unauthorized();
    error Paused();
    error Expired();
    error StalePolicy();
    error InvalidBatch();
    error InvalidQuote();
    error RecipientDenied();
    error PaymentLimit();
    error DailyLimit();
    error ProtectedBalance();
    error DuplicatePayment();
    error InvalidTransfer();

    event PolicyConfigured(address indexed account, uint64 version, address indexed token);
    event PauseChanged(address indexed account, bool paused);
    event ModuleDisabled(address indexed account);
    event PaymentSettled(address indexed account, bytes32 indexed paymentId, address indexed recipient, uint256 amount, uint64 policyVersion);

    constructor() EIP712("GuardianPayments", "1") {}

    function isModuleType(uint256 moduleType) external pure returns (bool) {
        return moduleType == 2;
    }

    function isInitialized(address account) external view returns (bool) {
        return policies[account].installed;
    }

    function onInstall(bytes calldata data) external nonReentrant {
        if (policies[msg.sender].installed) revert AlreadyInstalled();
        if (msg.sender.code.length == 0 || !IGuardianAccount(msg.sender).isModuleInstalled(2, address(this), "")) {
            revert Unauthorized();
        }
        (PolicyInput memory rules, address[] memory recipients) = abi.decode(data, (PolicyInput, address[]));
        policies[msg.sender].installed = true;
        // Reinstalling does not clear spending, replay protection, or an emergency pause.
        _configure(msg.sender, rules, recipients);
    }

    function onUninstall(bytes calldata) external nonReentrant {
        _installed(msg.sender);
        policies[msg.sender].installed = false;
        policies[msg.sender].paused = true;
        emit ModuleDisabled(msg.sender);
    }

    /// @dev msg.sender is the smart account. Session call policy MUST exclude this selector.
    function configurePolicy(PolicyInput calldata rules, address[] calldata recipients) external nonReentrant {
        _installed(msg.sender);
        _configure(msg.sender, rules, recipients);
    }

    function setPaused(address account, bool pause) external nonReentrant {
        Policy storage policy = _installed(account);
        if (msg.sender != account && !(pause && msg.sender == policy.rules.pauseGuardian)) revert Unauthorized();
        policy.paused = pause;
        emit PauseChanged(account, pause);
    }

    function getPolicy(address account) external view returns (Policy memory) {
        return policies[account];
    }

    function isRecipientAllowed(address account, address recipient) external view returns (bool) {
        Policy storage policy = policies[account];
        return policy.installed && recipientVersions[account][recipient] == policy.version;
    }

    function paymentId(ServiceQuote calldata quote) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, quote.account, quote.providerId, quote.invoiceId));
    }

    function quoteDigest(ServiceQuote calldata quote) external view returns (bytes32) {
        return _quoteDigest(quote);
    }

    function executePayments(
        ServiceQuote[] calldata quotes,
        bytes[] calldata signatures,
        uint64 expectedPolicyVersion,
        uint48 validUntil
    ) external nonReentrant {
        address account = msg.sender;
        Policy storage policy = _installed(account);
        if (policy.paused) revert Paused();
        if (policy.version != expectedPolicyVersion) revert StalePolicy();
        if (block.timestamp < policy.rules.validAfter || block.timestamp > policy.rules.validUntil || block.timestamp > validUntil) revert Expired();
        uint256 count = quotes.length;
        if (count == 0 || count > MAX_BATCH_SIZE || count != signatures.length) revert InvalidBatch();

        uint256 total;
        for (uint256 i; i < count; ++i) {
            ServiceQuote calldata quote = quotes[i];
            if (quote.account != account || quote.token != policy.rules.token || quote.providerId == bytes32(0) || quote.invoiceId == bytes32(0)) revert InvalidQuote();
            if (block.timestamp > quote.validUntil) revert Expired();
            if (recipientVersions[account][quote.recipient] != policy.version) revert RecipientDenied();
            if (quote.amount == 0 || quote.amount > policy.rules.perPaymentLimit) revert PaymentLimit();
            if (ECDSA.recover(_quoteDigest(quote), signatures[i]) != policy.rules.quoteSigner) revert InvalidQuote();
            bytes32 id = paymentId(quote);
            if (consumed[account][id]) revert DuplicatePayment();
            // Effects precede all external calls; duplicates inside one batch also fail.
            consumed[account][id] = true;
            total += quote.amount;
        }
        uint256 day = block.timestamp / 1 days;
        uint256 newSpent = spent[account][policy.rules.token][day] + total;
        if (newSpent > policy.rules.dailyLimit) revert DailyLimit();
        IERC20 token = IERC20(policy.rules.token);
        uint256 beforeBalance = token.balanceOf(account);
        if (beforeBalance < policy.rules.protectedBalance + total) revert ProtectedBalance();
        spent[account][policy.rules.token][day] = newSpent;

        for (uint256 i; i < count; ++i) {
            ServiceQuote calldata quote = quotes[i];
            bytes[] memory results = IGuardianAccount(account).executeFromExecutor(
                bytes32(0), // SINGLE CALL, DEFAULT (atomic/revert), zero value.
                abi.encodePacked(address(token), uint256(0), abi.encodeCall(IERC20.transfer, (quote.recipient, quote.amount)))
            );
            // SafeERC20 return semantics, with the token CALL made by the account.
            if (results.length != 1 || (results[0].length != 0 && (results[0].length != 32 || !abi.decode(results[0], (bool))))) revert InvalidTransfer();
            emit PaymentSettled(account, paymentId(quote), quote.recipient, quote.amount, policy.version);
        }
        uint256 afterBalance = token.balanceOf(account);
        if (afterBalance < policy.rules.protectedBalance) revert ProtectedBalance();
        if (afterBalance > beforeBalance || beforeBalance - afterBalance != total) revert InvalidTransfer();
    }

    function _installed(address account) private view returns (Policy storage policy) {
        policy = policies[account];
        if (!policy.installed) revert NotInstalled();
    }

    function _configure(address account, PolicyInput memory rules, address[] memory recipients) private {
        if (rules.token.code.length == 0 || rules.quoteSigner == address(0) || rules.perPaymentLimit == 0 || rules.dailyLimit == 0 || rules.validUntil <= block.timestamp || rules.validAfter >= rules.validUntil || recipients.length == 0 || recipients.length > 32) revert InvalidPolicy();
        Policy storage policy = policies[account];
        policy.rules = rules;
        policy.version += 1;
        for (uint256 i; i < recipients.length; ++i) {
            if (recipients[i] == address(0) || recipients[i] == account || recipients[i] == address(this)) revert InvalidPolicy();
            recipientVersions[account][recipients[i]] = policy.version;
        }
        emit PolicyConfigured(account, policy.version, rules.token);
    }

    function _quoteDigest(ServiceQuote calldata quote) private view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(QUOTE_TYPEHASH, quote.account, quote.providerId, quote.invoiceId, quote.serviceHash, quote.token, quote.recipient, quote.amount, quote.validUntil)));
    }
}
