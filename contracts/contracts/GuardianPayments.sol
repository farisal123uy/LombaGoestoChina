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

/// @notice ERC-7579 executor for Kernel 0.3.1. Owner installation/admin calls use
/// the account's owner route; an agent session is selector-scoped. The legacy
/// executePayments route transfers directly. The experimental lockPayment route
/// temporarily holds ERC-20 escrow until provider attestation or timeout refund.
/// Native gas is separate.
contract GuardianPayments is EIP712, ReentrancyGuard {
    uint256 public constant MAX_BATCH_SIZE = 10;
    uint48 public constant MAX_ESCROW_WINDOW = 1 days;
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

    enum EscrowStatus { None, Locked, Released, Refunded }
    struct Escrow {
        address account;
        address token;
        address recipient;
        address quoteSigner;
        bytes32 invoiceId;
        bytes32 serviceHash;
        uint256 amount;
        uint256 utcDay;
        uint48 lockedAt;
        uint48 refundAfter;
        uint64 policyVersion;
        EscrowStatus status;
    }

    mapping(address account => Policy) private policies;
    mapping(address account => mapping(address recipient => uint64)) private recipientVersions;
    mapping(address account => mapping(address token => mapping(uint256 day => uint256))) public spent;
    mapping(address account => mapping(bytes32 paymentId => bool)) public consumed;
    mapping(bytes32 paymentId => Escrow) public escrows;
    mapping(address account => uint256) public pendingEscrows;

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
    error InvalidEscrowWindow();
    error EscrowNotFound();
    error EscrowNotExpired();
    error InvalidDeliveryAttestation();
    error PendingEscrows();

    event PolicyConfigured(address indexed account, uint64 version, address indexed token);
    event PauseChanged(address indexed account, bool paused);
    event ModuleDisabled(address indexed account);
    event PaymentSettled(address indexed account, bytes32 indexed paymentId, address indexed recipient, uint256 amount, uint64 policyVersion);
    event EscrowLocked(address indexed account, bytes32 indexed paymentId, address indexed recipient, uint256 amount, uint48 refundAfter, uint64 policyVersion);
    event EscrowReleased(address indexed account, bytes32 indexed paymentId, bytes32 indexed transactionHash, uint48 readyAt, uint48 serviceExpiresAt);
    event EscrowRefunded(address indexed account, bytes32 indexed paymentId, uint256 amount);

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
        if (pendingEscrows[msg.sender] != 0) revert PendingEscrows();
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

    /// @notice Move one authenticated invoice into Guardian custody. The configured
    /// provider signer can release it with a signed delivery attestation; anyone
    /// may return it to the account after the bounded deadline.
    function lockPayment(
        ServiceQuote calldata quote,
        bytes calldata signature,
        uint64 expectedPolicyVersion,
        uint48 validUntil,
        uint48 refundAfter
    ) external nonReentrant {
        address account = msg.sender;
        Policy storage policy = _installed(account);
        if (policy.paused) revert Paused();
        if (policy.version != expectedPolicyVersion) revert StalePolicy();
        if (block.timestamp < policy.rules.validAfter || block.timestamp > policy.rules.validUntil || block.timestamp > validUntil) revert Expired();
        if (refundAfter <= block.timestamp || refundAfter > block.timestamp + MAX_ESCROW_WINDOW) revert InvalidEscrowWindow();
        if (quote.account != account || quote.token != policy.rules.token || quote.providerId == bytes32(0) || quote.invoiceId == bytes32(0) || quote.amount == 0) revert InvalidQuote();
        if (block.timestamp > quote.validUntil) revert Expired();
        if (recipientVersions[account][quote.recipient] != policy.version) revert RecipientDenied();
        if (quote.amount > policy.rules.perPaymentLimit) revert PaymentLimit();
        if (ECDSA.recover(_quoteDigest(quote), signature) != policy.rules.quoteSigner) revert InvalidQuote();
        bytes32 id = paymentId(quote);
        if (consumed[account][id] || escrows[id].status != EscrowStatus.None) revert DuplicatePayment();

        uint256 day = block.timestamp / 1 days;
        uint256 newSpent = spent[account][policy.rules.token][day] + quote.amount;
        if (newSpent > policy.rules.dailyLimit) revert DailyLimit();
        if (IERC20(policy.rules.token).balanceOf(account) < policy.rules.protectedBalance + quote.amount) revert ProtectedBalance();

        // Effects before token interaction. Any failed transfer reverts these writes.
        consumed[account][id] = true;
        spent[account][policy.rules.token][day] = newSpent;
        escrows[id] = Escrow({
            account: account, token: policy.rules.token, recipient: quote.recipient,
            quoteSigner: policy.rules.quoteSigner, invoiceId: quote.invoiceId,
            serviceHash: quote.serviceHash, amount: quote.amount, utcDay: day, lockedAt: uint48(block.timestamp),
            refundAfter: refundAfter, policyVersion: policy.version, status: EscrowStatus.Locked
        });
        pendingEscrows[account] += 1;

        _pullIntoEscrow(account, policy.rules.token, quote.amount, policy.rules.protectedBalance);

        emit EscrowLocked(account, id, quote.recipient, quote.amount, refundAfter, policy.version);
    }

    /// @notice Release a locked invoice to its configured provider recipient. The
    /// provider receipt must attest that service became ready before the deadline.
    function releaseEscrow(
        bytes32 paymentId_,
        bytes32 transactionHash,
        uint48 readyAt,
        uint48 serviceExpiresAt,
        bytes calldata signature
    ) external nonReentrant {
        Escrow storage escrow = escrows[paymentId_];
        if (escrow.status != EscrowStatus.Locked) revert EscrowNotFound();
        if (block.timestamp > escrow.refundAfter || readyAt < escrow.lockedAt || readyAt > block.timestamp || readyAt > escrow.refundAfter || serviceExpiresAt <= block.timestamp || transactionHash == bytes32(0)) revert InvalidDeliveryAttestation();
        bytes32 structHash = keccak256(abi.encode(
            keccak256("EscrowDelivery(bytes32 paymentId,address account,bytes32 invoiceId,bytes32 serviceHash,bytes32 transactionHash,uint48 readyAt,uint48 serviceExpiresAt)"),
            paymentId_, escrow.account, escrow.invoiceId, escrow.serviceHash, transactionHash, readyAt, serviceExpiresAt
        ));
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != escrow.quoteSigner) revert InvalidDeliveryAttestation();

        escrow.status = EscrowStatus.Released;
        pendingEscrows[escrow.account] -= 1;
        _transferEscrow(escrow.token, escrow.recipient, escrow.amount);
        emit EscrowReleased(escrow.account, paymentId_, transactionHash, readyAt, serviceExpiresAt);
    }

    /// @notice Anyone may refund an undelivered locked invoice to the originating
    /// smart account once its bounded service deadline has passed.
    function refundEscrow(bytes32 paymentId_) external nonReentrant {
        Escrow storage escrow = escrows[paymentId_];
        if (escrow.status != EscrowStatus.Locked) revert EscrowNotFound();
        if (block.timestamp <= escrow.refundAfter) revert EscrowNotExpired();

        escrow.status = EscrowStatus.Refunded;
        pendingEscrows[escrow.account] -= 1;
        if (block.timestamp / 1 days == escrow.utcDay) spent[escrow.account][escrow.token][escrow.utcDay] -= escrow.amount;
        _transferEscrow(escrow.token, escrow.account, escrow.amount);
        emit EscrowRefunded(escrow.account, paymentId_, escrow.amount);
    }

    function _transferEscrow(address tokenAddress, address recipient, uint256 amount) private {
        IERC20 token = IERC20(tokenAddress);
        uint256 beforeBalance = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(recipient);
        if (beforeBalance < amount || !token.transfer(recipient, amount)) revert InvalidTransfer();
        uint256 afterBalance = token.balanceOf(address(this));
        uint256 recipientAfter = token.balanceOf(recipient);
        if (beforeBalance - afterBalance != amount || recipientAfter - recipientBefore != amount) revert InvalidTransfer();
    }

    function _pullIntoEscrow(address account, address tokenAddress, uint256 amount, uint256 protectedBalance) private {
        IERC20 token = IERC20(tokenAddress);
        uint256 accountBefore = token.balanceOf(account);
        uint256 escrowBefore = token.balanceOf(address(this));
        if (accountBefore < protectedBalance + amount) revert ProtectedBalance();
        bytes[] memory results = IGuardianAccount(account).executeFromExecutor(
            bytes32(0),
            abi.encodePacked(tokenAddress, uint256(0), abi.encodeCall(IERC20.transfer, (address(this), amount)))
        );
        if (results.length != 1 || (results[0].length != 0 && (results[0].length != 32 || !abi.decode(results[0], (bool))))) revert InvalidTransfer();
        uint256 accountAfter = token.balanceOf(account);
        uint256 escrowAfter = token.balanceOf(address(this));
        if (accountAfter < protectedBalance || accountBefore - accountAfter != amount || escrowAfter - escrowBefore != amount) revert InvalidTransfer();
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
