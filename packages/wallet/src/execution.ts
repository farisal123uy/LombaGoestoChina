import type { CreateKernelAccountReturnType } from "@zerodev/sdk";
import { parseEventLogs, type Hex, type PublicClient } from "viem";
import { entryPoint07Abi, formatUserOperationRequest, getUserOperationHash, UserOperationReceiptNotFoundError, type UserOperation } from "viem/account-abstraction";
import { type PaymentAttempt, type PaymentPlan, type PaymentTask, type PolicySnapshot } from "@guardian-wallet/shared";
import { encodeGuardianPayments, getPaymentId, guardianAbi, readPolicySnapshot, validatePaymentPlan } from "./guardian.js";
import { entryPoint } from "./kernel.js";
import { assertPaymaster, deserializeOperation, gasExposure, serializeOperation } from "./user-operation.js";
import { createExecutionClient, type NativeSponsorship } from "./sponsorship.js";

export interface PreparedPayment { attempt: PaymentAttempt; signedPayload: string; }
export type Reconciliation = { status: "pending" | "confirmed" | "failed" | "needs_review"; reason?: string; transactionHash?: Hex };
export interface PaymentExecutionDriver {
  snapshot(task: PaymentTask): Promise<PolicySnapshot>;
  validate(plan: PaymentPlan): Promise<void>;
  prepare(plan: PaymentPlan): Promise<PreparedPayment>;
  submit(payload: string): Promise<Hex>;
  reconcile(attempt: PaymentAttempt, plan: PaymentPlan): Promise<Reconciliation>;
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
}): PaymentExecutionDriver {
  const { client, account, guardianAddress } = options;
  const confirmations = options.confirmations ?? 2;
  if (!Number.isInteger(confirmations) || confirmations < 1 || options.maxGasCostWei <= 0n) throw new Error("INVALID_EXECUTION_CONFIG");
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
      await validatePaymentPlan(client, plan);
      // OP nodes may charge a tiny L1 fee even for eth_call with gasPrice=0.
      // For sponsored mode only, give the simulation native fee balance. This
      // changes no token/account storage or chain state and is never submitted.
      // Actual fee eligibility is verified by the AA/paymaster execution route.
      await client.simulateContract({ address: guardianAddress, abi: guardianAbi, account: account.address, gasPrice: 0n,
        stateOverride: options.sponsorship ? [{ address: account.address, balance: 1000000000000000000n }] : undefined,
        functionName: "executePayments", args: [plan.quotes.map((q) => ({ ...q, amount: BigInt(q.amountUnits) })), plan.quotes.map((q) => q.signature), BigInt(plan.policyVersion), plan.validUntil] });
    },
    async prepare(plan) {
      bind(plan);
      // Re-read after inference, including when called without the worker wrapper.
      await validatePaymentPlan(client, plan);
      const prepared = await bundler.prepareUserOperation({ callData: await account.encodeCalls([{ to: guardianAddress, data: encodeGuardianPayments(plan) }]) });
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
        attempt: { taskId: plan.taskId, sender: account.address, userOperationHash: hash, nonce: operation.nonce.toString(), nonceKey: (operation.nonce >> 64n).toString(), status: "prepared", submissionBlock: (await client.getBlockNumber()).toString(), validUntil: plan.validUntil, preparedAt: Date.now() },
        signedPayload: serializeOperation(operation),
      };
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
      let transactionHash: Hex | undefined;
      try {
        const receipt = await bundler.getUserOperationReceipt({ hash: attempt.userOperationHash });
        transactionHash = receipt.receipt.transactionHash;
      } catch (error) {
        if (!(error instanceof UserOperationReceiptNotFoundError)) throw error;
      }
      const latest = await client.getBlockNumber();
      if (!transactionHash) {
        const from = BigInt(attempt.submissionBlock);
        if (latest - from > 5000n) return { status: "needs_review", reason: "EVENT_LOOKUP_WINDOW_EXCEEDED" };
        const logs = await client.getContractEvents({ address: entryPoint.address, abi: entryPoint07Abi, eventName: "UserOperationEvent", args: { userOpHash: attempt.userOperationHash }, fromBlock: from, toBlock: latest });
        transactionHash = logs[0]?.transactionHash ?? undefined;
      }
      if (transactionHash) {
        const receipt = await client.getTransactionReceipt({ hash: transactionHash });
        if (latest - receipt.blockNumber + 1n < BigInt(confirmations)) return { status: "pending" };
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        if (block.hash !== receipt.blockHash) return { status: "pending", reason: "REORG_RECONCILING" };
        const operationEvent = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs.filter((l) => l.address.toLowerCase() === entryPoint.address.toLowerCase()) }).find((e) => e.args.userOpHash === attempt.userOperationHash);
        if (!operationEvent || operationEvent.args.sender.toLowerCase() !== account.address.toLowerCase() || operationEvent.args.nonce !== BigInt(attempt.nonce)) return { status: "needs_review", reason: "OPERATION_RECEIPT_MISMATCH" };
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
      if (Date.now() - attempt.preparedAt > 300000) return { status: "needs_review", reason: "RECONCILIATION_TIMEOUT" };
      return { status: "pending" };
    },
  };
}
