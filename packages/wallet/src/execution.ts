import type { CreateKernelAccountReturnType } from "@zerodev/sdk";
import { encodeFunctionData, parseEventLogs, TransactionReceiptNotFoundError, verifyTypedData, type Hex, type PublicClient } from "viem";
import { entryPoint07Abi, formatUserOperationRequest, getUserOperationHash, type UserOperation } from "viem/account-abstraction";
import { type DeliveryReceipt, type EscrowActionAttempt, type EscrowDeliveryAttestation, type PaymentAttempt, type PaymentPlan, type PaymentTask, type PolicySnapshot } from "@guardian-wallet/shared";
import { encodeGuardianEscrowPayment, encodeGuardianPayments, escrowDeliveryTypedData, getPaymentId, guardianAbi, readPolicySnapshot, validatePaymentPlan } from "./guardian.js";
import { entryPoint } from "./kernel.js";
import { assertPaymaster, deserializeOperation, gasExposure, serializeOperation } from "./user-operation.js";
import { createExecutionClient, type NativeSponsorship } from "./sponsorship.js";

export interface PreparedPayment { attempt: PaymentAttempt; signedPayload: string; }
export type Reconciliation = { status: "pending" | "confirmed" | "failed" | "needs_review"; reason?: string; transactionHash?: Hex; escrowLockedAt?: number };
export type EscrowAction = { kind: "release"; attestation: EscrowDeliveryAttestation; delivery: DeliveryReceipt; lockTransactionHash: Hex } | { kind: "refund"; paymentId: Hex };
export interface PaymentExecutionDriver {
  snapshot(task: PaymentTask): Promise<PolicySnapshot>;
  validate(plan: PaymentPlan): Promise<void>;
  prepare(plan: PaymentPlan): Promise<PreparedPayment>;
  submit(payload: string): Promise<Hex>;
  reconcile(attempt: PaymentAttempt, plan: PaymentPlan): Promise<Reconciliation>;
  prepareEscrowAction?(plan: PaymentPlan, action: EscrowAction): Promise<{ attempt: EscrowActionAttempt; signedPayload: string }>;
  reconcileEscrowAction?(attempt: EscrowActionAttempt, plan: PaymentPlan): Promise<Reconciliation>;
}

/** Predeployed, prefunded account only. This runtime accepts no owner credential. */
export function createKernelPaymentDriver(options: {
  client: PublicClient;
  account: CreateKernelAccountReturnType<"0.7">;
  guardianAddress: Hex;
  bundlerUrl: string;
  maxGasCostWei: bigint;
  confirmations?: number;
  sponsorship?: NativeSponsorship;
  settlementMode?: "direct" | "escrow";
  escrowWindowSeconds?: number;
  sessionValidUntil?: number;
}): PaymentExecutionDriver {
  const { client, account, guardianAddress } = options;
  const confirmations = options.confirmations ?? 2;
  const settlementMode = options.settlementMode ?? "direct", escrowWindowSeconds = options.escrowWindowSeconds ?? 600;
  if (!Number.isInteger(confirmations) || confirmations < 1 || options.maxGasCostWei <= 0n) throw new Error("INVALID_EXECUTION_CONFIG");
  if (!Number.isInteger(escrowWindowSeconds) || escrowWindowSeconds < 30 || escrowWindowSeconds > 86400) throw new Error("INVALID_ESCROW_WINDOW");
  const bundler = createExecutionClient(client, account, options.bundlerUrl, options.sponsorship);
  const bind = (plan: PaymentPlan) => {
    if (plan.account.toLowerCase() !== account.address.toLowerCase() || plan.guardianAddress.toLowerCase() !== guardianAddress.toLowerCase()) throw new Error("EXECUTOR_BINDING");
  };
  return {
    async snapshot(task) {
      if (task.quote.account.toLowerCase() !== account.address.toLowerCase() || task.chainId !== await client.getChainId()) throw new Error("EXECUTOR_BINDING");
      return readPolicySnapshot(client, guardianAddress, account.address);
    },
    async validate(plan) {
      bind(plan);
      const currentPolicy = await validatePaymentPlan(client, plan);
      // OP nodes may charge a tiny L1 fee even for eth_call with gasPrice=0.
      // For sponsored mode only, give the simulation native fee balance. This
      // changes no token/account storage or chain state and is never submitted.
      // Actual fee eligibility is verified by the AA/paymaster execution route.
      const stateOverride = options.sponsorship ? [{ address: account.address, balance: 1000000000000000000n }] : undefined;
      if (settlementMode === "escrow") {
        if (plan.quotes.length !== 1) throw new Error("ESCROW_REQUIRES_SINGLE_INVOICE");
        const refundAfter = Math.floor(Date.now() / 1000) + escrowWindowSeconds;
        if (currentPolicy.validUntil < refundAfter || (options.sessionValidUntil !== undefined && options.sessionValidUntil < refundAfter)) throw new Error("ESCROW_REFUND_WINDOW_EXCEEDS_AUTHORITY");
        await client.simulateContract({ address: guardianAddress, abi: guardianAbi, account: account.address, gasPrice: 0n, stateOverride,
          functionName: "lockPayment", args: [{ ...plan.quotes[0]!, amount: BigInt(plan.quotes[0]!.amountUnits) }, plan.quotes[0]!.signature, BigInt(plan.policyVersion), plan.validUntil, refundAfter] });
      } else {
        await client.simulateContract({ address: guardianAddress, abi: guardianAbi, account: account.address, gasPrice: 0n, stateOverride,
          functionName: "executePayments", args: [plan.quotes.map((q) => ({ ...q, amount: BigInt(q.amountUnits) })), plan.quotes.map((q) => q.signature), BigInt(plan.policyVersion), plan.validUntil] });
      }
    },
    async prepare(plan) {
      bind(plan);
      // Re-read after inference, including when called without the worker wrapper.
      const currentPolicy = await validatePaymentPlan(client, plan);
      if (settlementMode === "escrow" && plan.quotes.length !== 1) throw new Error("ESCROW_REQUIRES_SINGLE_INVOICE");
      const escrowRefundAfter = settlementMode === "escrow" ? Math.floor(Date.now() / 1000) + escrowWindowSeconds : undefined;
      if (escrowRefundAfter !== undefined && (currentPolicy.validUntil < escrowRefundAfter || (options.sessionValidUntil !== undefined && options.sessionValidUntil < escrowRefundAfter))) throw new Error("ESCROW_REFUND_WINDOW_EXCEEDS_AUTHORITY");
      if (escrowRefundAfter !== undefined) {
        await client.simulateContract({ address: guardianAddress, abi: guardianAbi, account: account.address, gasPrice: 0n,
          stateOverride: options.sponsorship ? [{ address: account.address, balance: 1000000000000000000n }] : undefined,
          functionName: "lockPayment", args: [{ ...plan.quotes[0]!, amount: BigInt(plan.quotes[0]!.amountUnits) }, plan.quotes[0]!.signature, BigInt(plan.policyVersion), plan.validUntil, escrowRefundAfter] });
      }
      const callData = settlementMode === "escrow"
        ? encodeGuardianEscrowPayment(plan, escrowRefundAfter!)
        : encodeGuardianPayments(plan);
      const prepared = await bundler.prepareUserOperation({ callData: await account.encodeCalls([{ to: guardianAddress, data: callData }]) });
      if (prepared.factory) throw new Error("ACCOUNT_MUST_ALREADY_BE_DEPLOYED");
      assertPaymaster(prepared, options.sponsorship?.approvedPaymaster);
      const upperGas = gasExposure(prepared);
      if (upperGas > options.maxGasCostWei) throw new Error("WAITING_FEE");
      // Explicit fields only: persist the exact signed operation, not a client object.
      const operation: UserOperation<"0.7"> = {
        sender: account.address, nonce: prepared.nonce, callData: prepared.callData,
        callGasLimit: prepared.callGasLimit, verificationGasLimit: prepared.verificationGasLimit,
        preVerificationGas: prepared.preVerificationGas, maxFeePerGas: prepared.maxFeePerGas,
        maxPriorityFeePerGas: prepared.maxPriorityFeePerGas, signature: "0x",
        paymaster: prepared.paymaster, paymasterData: prepared.paymasterData,
        paymasterVerificationGasLimit: prepared.paymasterVerificationGasLimit, paymasterPostOpGasLimit: prepared.paymasterPostOpGasLimit,
      };
      operation.signature = await account.signUserOperation(operation);
      const hash = getUserOperationHash({ userOperation: operation, entryPointAddress: entryPoint.address, entryPointVersion: "0.7", chainId: plan.chainId });
      return {
        attempt: { taskId: plan.taskId, sender: account.address, userOperationHash: hash, nonce: operation.nonce.toString(), nonceKey: (operation.nonce >> 64n).toString(), status: "prepared", submissionBlock: (await client.getBlockNumber()).toString(), validUntil: plan.validUntil, preparedAt: Date.now(), settlementMode, ...(escrowRefundAfter ? { escrowRefundAfter } : {}) },
        signedPayload: serializeOperation(operation),
      };
    },
    async prepareEscrowAction(plan, action) {
      bind(plan);
      if (plan.quotes.length !== 1) throw new Error("ESCROW_REQUIRES_SINGLE_INVOICE");
      const quote = plan.quotes[0]!, paymentId = getPaymentId(plan.chainId, quote);
      const data = action.kind === "release"
        ? encodeFunctionData({ abi: guardianAbi, functionName: "releaseEscrow", args: [
            action.attestation.paymentId, action.attestation.transactionHash, action.attestation.readyAt,
            action.attestation.serviceExpiresAt, action.attestation.signature,
          ] })
        : encodeFunctionData({ abi: guardianAbi, functionName: "refundEscrow", args: [action.paymentId] });
      if (action.kind === "release" && action.attestation.paymentId.toLowerCase() !== paymentId.toLowerCase()) throw new Error("ESCROW_ATTESTATION_BINDING");
      if (action.kind === "refund" && action.paymentId.toLowerCase() !== paymentId.toLowerCase()) throw new Error("ESCROW_REFUND_BINDING");
      const [escrow, block] = await Promise.all([
        client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "escrows", args: [paymentId] }),
        client.getBlock(),
      ]);
      if (escrow.account.toLowerCase() !== account.address.toLowerCase() || escrow.token.toLowerCase() !== quote.token.toLowerCase()
        || escrow.recipient.toLowerCase() !== quote.recipient.toLowerCase() || escrow.invoiceId !== quote.invoiceId
        || escrow.serviceHash !== quote.serviceHash || escrow.amount !== BigInt(quote.amountUnits) || escrow.status !== 1) throw new Error("ESCROW_STATE_BINDING");
      if (action.kind === "release") {
        const attestation = action.attestation;
        if (attestation.account.toLowerCase() !== escrow.account.toLowerCase() || attestation.invoiceId !== escrow.invoiceId
          || attestation.serviceHash !== escrow.serviceHash || attestation.transactionHash.toLowerCase() !== action.lockTransactionHash.toLowerCase()
          || attestation.readyAt < escrow.lockedAt
          || attestation.readyAt > escrow.refundAfter || attestation.serviceExpiresAt <= Number(block.timestamp)) throw new Error("ESCROW_ATTESTATION_BINDING");
        if (!await verifyTypedData({ ...escrowDeliveryTypedData(plan.chainId, guardianAddress, attestation), address: escrow.quoteSigner, signature: attestation.signature })) throw new Error("ESCROW_ATTESTATION_SIGNATURE_INVALID");
      } else if (block.timestamp <= BigInt(escrow.refundAfter)) throw new Error("ESCROW_REFUND_NOT_MATURE");
      const prepared = await bundler.prepareUserOperation({ callData: await account.encodeCalls([{ to: guardianAddress, data }]) });
      if (prepared.factory) throw new Error("ACCOUNT_MUST_ALREADY_BE_DEPLOYED");
      assertPaymaster(prepared, options.sponsorship?.approvedPaymaster);
      if (gasExposure(prepared) > options.maxGasCostWei) throw new Error("WAITING_FEE");
      const operation: UserOperation<"0.7"> = {
        sender: account.address, nonce: prepared.nonce, callData: prepared.callData,
        callGasLimit: prepared.callGasLimit, verificationGasLimit: prepared.verificationGasLimit,
        preVerificationGas: prepared.preVerificationGas, maxFeePerGas: prepared.maxFeePerGas,
        maxPriorityFeePerGas: prepared.maxPriorityFeePerGas, signature: "0x",
        paymaster: prepared.paymaster, paymasterData: prepared.paymasterData,
        paymasterVerificationGasLimit: prepared.paymasterVerificationGasLimit, paymasterPostOpGasLimit: prepared.paymasterPostOpGasLimit,
      };
      operation.signature = await account.signUserOperation(operation);
      const hash = getUserOperationHash({ userOperation: operation, entryPointAddress: entryPoint.address, entryPointVersion: "0.7", chainId: plan.chainId });
      const attempt: EscrowActionAttempt = {
        taskId: plan.taskId, sender: account.address, userOperationHash: hash,
        nonce: operation.nonce.toString(), nonceKey: (operation.nonce >> 64n).toString(),
        status: "prepared", submissionBlock: (await client.getBlockNumber()).toString(),
        validUntil: options.sessionValidUntil ?? plan.quotes[0]!.validUntil, preparedAt: Date.now(),
        settlementMode: "escrow", action: action.kind,
        ...(action.kind === "release" ? { delivery: action.delivery } : {}),
      };
      return { attempt, signedPayload: serializeOperation(operation) };
    },
    async submit(payload) {
      const operation = deserializeOperation(payload);
      if (operation.sender.toLowerCase() !== account.address.toLowerCase()) throw new Error("EXECUTOR_BINDING");
      assertPaymaster(operation, options.sponsorship?.approvedPaymaster);
      return bundler.request({ method: "eth_sendUserOperation", params: [formatUserOperationRequest(operation), entryPoint.address] });
    },
    async reconcile(attempt, plan) {
      bind(plan);
      if (attempt.sender.toLowerCase() !== account.address.toLowerCase() || attempt.taskId !== plan.taskId) throw new Error("ATTEMPT_BINDING");
      const pending = (reason?: string): Reconciliation => Date.now() - attempt.preparedAt > 300000
        ? { status: "needs_review", reason: "RECONCILIATION_TIMEOUT" }
        : { status: "pending", ...(reason ? { reason } : {}) };
      try {
      let transactionHash: Hex | undefined;
      try {
        const receipt = await bundler.getUserOperationReceipt({ hash: attempt.userOperationHash });
        transactionHash = receipt.receipt.transactionHash;
      } catch { /* Bundler outage is not settlement evidence. Continue via canonical EntryPoint logs. */ }
      const latest = await client.getBlockNumber();
      if (!transactionHash) {
        const from = BigInt(attempt.submissionBlock);
        if (latest < from) return pending("CHAIN_BEHIND_SUBMISSION_BLOCK");
        if (latest - from > 5000n) return { status: "needs_review", reason: "EVENT_LOOKUP_WINDOW_EXCEEDED" };
        const logs = await client.getContractEvents({ address: entryPoint.address, abi: entryPoint07Abi, eventName: "UserOperationEvent", args: { userOpHash: attempt.userOperationHash }, fromBlock: from, toBlock: latest });
        transactionHash = logs[0]?.transactionHash ?? undefined;
      }
      if (transactionHash) {
        const receipt = await client.getTransactionReceipt({ hash: transactionHash });
        if (latest - receipt.blockNumber + 1n < BigInt(confirmations)) return pending();
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        if (block.hash !== receipt.blockHash) return pending("REORG_RECONCILING");
        if (receipt.status !== "success") return { status: "needs_review", reason: "OUTER_TRANSACTION_FAILED" };
        const operationEvent = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs.filter((l) => l.address.toLowerCase() === entryPoint.address.toLowerCase()) }).find((e) => e.args.userOpHash === attempt.userOperationHash);
        if (!operationEvent || operationEvent.args.sender.toLowerCase() !== account.address.toLowerCase() || operationEvent.args.nonce !== BigInt(attempt.nonce)) return { status: "needs_review", reason: "OPERATION_RECEIPT_MISMATCH" };
         if (attempt.settlementMode === "escrow") {
           const quote = plan.quotes[0]!;
           if (plan.quotes.length !== 1) return { status: "needs_review", reason: "ESCROW_BATCH_NOT_SUPPORTED" };
           const id = getPaymentId(plan.chainId, quote);
           if (!operationEvent.args.success) return { status: "failed", transactionHash, reason: "ESCROW_LOCK_REVERTED" };
           const locked = parseEventLogs({ abi: guardianAbi, eventName: "EscrowLocked", logs: receipt.logs.filter((l) => l.address.toLowerCase() === guardianAddress.toLowerCase()) })
             .some((e) => e.args.account.toLowerCase() === account.address.toLowerCase() && e.args.paymentId === id && e.args.recipient.toLowerCase() === quote.recipient.toLowerCase() && e.args.amount === BigInt(quote.amountUnits) && e.args.policyVersion === BigInt(plan.policyVersion) && e.args.refundAfter === attempt.escrowRefundAfter);
           const consumed = await client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "consumed", args: [account.address, id] });
           const escrow = await client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "escrows", args: [id] });
            if (!locked || !consumed || escrow.account.toLowerCase() !== account.address.toLowerCase() || escrow.token.toLowerCase() !== quote.token.toLowerCase() || escrow.invoiceId !== quote.invoiceId || escrow.serviceHash !== quote.serviceHash || escrow.recipient.toLowerCase() !== quote.recipient.toLowerCase() || escrow.amount !== BigInt(quote.amountUnits) || escrow.refundAfter !== attempt.escrowRefundAfter || escrow.status !== 1) return { status: "needs_review", reason: "ESCROW_LOCK_EVIDENCE_MISMATCH" };
            return { status: "confirmed", transactionHash, escrowLockedAt: escrow.lockedAt };
         }
         const events = parseEventLogs({ abi: guardianAbi, eventName: "PaymentSettled", logs: receipt.logs.filter((l) => l.address.toLowerCase() === guardianAddress.toLowerCase()) });
        const consumed = await Promise.all(plan.quotes.map((q) => client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "consumed", args: [account.address, getPaymentId(plan.chainId, q)] })));
        if (!operationEvent.args.success) return consumed.some(Boolean) ? { status: "needs_review", reason: "REVERT_WITH_CONSUMED_INVOICE" } : { status: "failed", transactionHash, reason: "USER_OPERATION_REVERTED" };
        const matches = plan.quotes.every((q, index) => consumed[index] && events.some((e) => e.args.account.toLowerCase() === account.address.toLowerCase() && e.args.paymentId === getPaymentId(plan.chainId, q) && e.args.recipient.toLowerCase() === q.recipient.toLowerCase() && e.args.amount === BigInt(q.amountUnits) && e.args.policyVersion === BigInt(plan.policyVersion)));
        if (!matches) return { status: "needs_review", reason: "MISSING_SETTLEMENT_EVIDENCE" };
        return { status: "confirmed", transactionHash };
      }
      const nonce = await client.readContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "getNonce", args: [account.address, BigInt(attempt.nonceKey)] });
      const consumedWithoutReceipt = await Promise.all(plan.quotes.map((q) => client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "consumed", args: [account.address, getPaymentId(plan.chainId, q)] })));
      if (consumedWithoutReceipt.some(Boolean)) return { status: "needs_review", reason: "INVOICE_CONSUMED_WITHOUT_MATCHED_RECEIPT" };
      if (nonce > BigInt(attempt.nonce)) return { status: "needs_review", reason: "NONCE_ADVANCED_WITHOUT_MATCHED_RECEIPT" };
      return pending();
      } catch (error) {
        return pending(error instanceof TransactionReceiptNotFoundError ? "RECEIPT_NOT_FOUND_RECONCILING" : "RECONCILIATION_RPC_UNAVAILABLE");
      }
    },
    async reconcileEscrowAction(attempt, plan) {
      bind(plan);
      if (plan.quotes.length !== 1 || attempt.sender.toLowerCase() !== account.address.toLowerCase() || attempt.taskId !== plan.taskId || attempt.settlementMode !== "escrow") return { status: "needs_review", reason: "ESCROW_ACTION_BINDING" };
      const quote = plan.quotes[0]!, id = getPaymentId(plan.chainId, quote);
      const pending = (reason?: string): Reconciliation => Date.now() - attempt.preparedAt > 300000 ? { status: "needs_review", reason: "ESCROW_ACTION_TIMEOUT" } : { status: "pending", ...(reason ? { reason } : {}) };
      try {
        let transactionHash: Hex | undefined;
        try { transactionHash = (await bundler.getUserOperationReceipt({ hash: attempt.userOperationHash })).receipt.transactionHash; } catch { /* Use canonical EntryPoint logs below. */ }
        const latest = await client.getBlockNumber();
        if (!transactionHash) {
          const from = BigInt(attempt.submissionBlock);
          if (latest < from) return pending("CHAIN_BEHIND_SUBMISSION_BLOCK");
          if (latest - from > 5000n) return { status: "needs_review", reason: "ESCROW_EVENT_WINDOW_EXCEEDED" };
          const logs = await client.getContractEvents({ address: entryPoint.address, abi: entryPoint07Abi, eventName: "UserOperationEvent", args: { userOpHash: attempt.userOperationHash }, fromBlock: from, toBlock: latest });
          transactionHash = logs[0]?.transactionHash ?? undefined;
        }
        if (transactionHash) {
          const receipt = await client.getTransactionReceipt({ hash: transactionHash });
          if (latest - receipt.blockNumber + 1n < BigInt(confirmations)) return pending();
          const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
          if (canonical.hash !== receipt.blockHash) return pending("REORG_RECONCILING");
          if (receipt.status !== "success") return { status: "needs_review", reason: "ESCROW_OUTER_TRANSACTION_FAILED" };
          const op = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs.filter((l) => l.address.toLowerCase() === entryPoint.address.toLowerCase()) }).find((e) => e.args.userOpHash.toLowerCase() === attempt.userOperationHash.toLowerCase());
          if (!op || op.args.sender.toLowerCase() !== account.address.toLowerCase() || op.args.nonce !== BigInt(attempt.nonce)) return { status: "needs_review", reason: "ESCROW_ACTION_RECEIPT_MISMATCH" };
          const escrow = await client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "escrows", args: [id] });
          if (!op.args.success) return { status: "failed", transactionHash, reason: "ESCROW_ACTION_REVERTED" };
          const released = attempt.action === "release"
            ? parseEventLogs({ abi: guardianAbi, eventName: "EscrowReleased", logs: receipt.logs.filter((l) => l.address.toLowerCase() === guardianAddress.toLowerCase()) }).some((e) => e.args.account.toLowerCase() === account.address.toLowerCase() && e.args.paymentId === id)
            : parseEventLogs({ abi: guardianAbi, eventName: "EscrowRefunded", logs: receipt.logs.filter((l) => l.address.toLowerCase() === guardianAddress.toLowerCase()) }).some((e) => e.args.account.toLowerCase() === account.address.toLowerCase() && e.args.paymentId === id && e.args.amount === BigInt(quote.amountUnits));
          const expectedStatus = attempt.action === "release" ? 2 : 3;
          if (!released || escrow.status !== expectedStatus) return { status: "needs_review", reason: "ESCROW_ACTION_EVENT_MISMATCH" };
          return { status: "confirmed", transactionHash };
        }
        const nonce = await client.readContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "getNonce", args: [account.address, BigInt(attempt.nonceKey)] });
        if (nonce > BigInt(attempt.nonce)) return { status: "needs_review", reason: "ESCROW_NONCE_ADVANCED_WITHOUT_EVENT" };
        return pending();
      } catch (error) {
        return pending(error instanceof TransactionReceiptNotFoundError ? "ESCROW_RECEIPT_NOT_FOUND" : "ESCROW_RECONCILIATION_RPC_UNAVAILABLE");
      }
    },
  };
}
