import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, keccak256, toBytes, zeroAddress, TransactionReceiptNotFoundError, type PublicClient } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import type { CreateKernelAccountReturnType } from "@zerodev/sdk";
import { createKernelPaymentDriver, entryPoint, getPaymentId, guardianAbi } from "@guardian-wallet/wallet";
import type { PaymentAttempt, PaymentPlan, ServiceQuote } from "@guardian-wallet/shared";

afterEach(() => vi.unstubAllGlobals());
function fixture(options: { confirmations?: number; reorg?: boolean; nonceMismatch?: boolean; success?: boolean; consumed?: boolean; missingSettlement?: boolean; noEvent?: boolean; nonceAdvanced?: boolean; old?: boolean; windowExceeded?: boolean; headBehind?: boolean; partialBatch?: boolean; bundlerOffline?: boolean; rpcOffline?: boolean; receiptMissing?: boolean; outerFailed?: boolean } = {}) {
  const sender = `0x${"1".repeat(40)}` as const, guardian = `0x${"2".repeat(40)}` as const, recipient = `0x${"3".repeat(40)}` as const;
  const hash = keccak256(toBytes("operation")), tx = keccak256(toBytes("transaction")), blockHash = keccak256(toBytes("canonical-block")), nonce = (1n << 64n) + 5n;
  const q: ServiceQuote = { account: sender, token: recipient, recipient, providerId: hash, invoiceId: keccak256(toBytes("invoice")), serviceHash: hash, amountUnits: "260000", validUntil: Math.floor(Date.now() / 1000) + 3600, signature: `0x${"11".repeat(65)}` };
  const plan: PaymentPlan = { taskId: randomUUID(), chainId: 84532, account: sender, guardianAddress: guardian, policyVersion: "1", observedBlockNumber: "90", observedBlockHash: blockHash, observedAt: Math.floor(Date.now() / 1000), validUntil: q.validUntil, quotes: options.partialBatch ? [q, { ...q, invoiceId: keccak256(toBytes("second-invoice")) }] : [q], summary: "Fixture reconciliation plan.", origin: "deterministic_baseline" };
  const attempt: PaymentAttempt = { taskId: plan.taskId, sender, userOperationHash: hash, nonce: nonce.toString(), nonceKey: "1", status: "unknown", submissionBlock: "90", preparedAt: Date.now() - (options.old ? 300001 : 0), validUntil: q.validUntil };
  const logs = [{ address: entryPoint.address, topics: encodeEventTopics({ abi: entryPoint07Abi, eventName: "UserOperationEvent", args: { userOpHash: hash, sender, paymaster: zeroAddress } }), data: encodeAbiParameters([{ type: "uint256" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }], [options.nonceMismatch ? nonce + 1n : nonce, options.success !== false, 100n, 100n]) },
    ...(options.missingSettlement ? [] : [{ address: guardian, topics: encodeEventTopics({ abi: guardianAbi, eventName: "PaymentSettled", args: { account: sender, paymentId: getPaymentId(84532, q), recipient } }), data: encodeAbiParameters([{ type: "uint256" }, { type: "uint64" }], [260000n, 1n]) }])];
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => functionName === "getNonce" ? nonce + (options.nonceAdvanced ? 1n : 0n) : options.consumed !== false);
  const events = vi.fn(async () => { if (options.rpcOffline) throw new Error("secret-bearing-RPC-url"); return options.noEvent ? [] : [{ transactionHash: tx }]; });
  const client = { chain: { id: 84532, name: "Fixture", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } }, getBlockNumber: async () => options.headBehind ? 89n : options.windowExceeded ? 6000n : BigInt(99 + (options.confirmations ?? 2)), getContractEvents: events,
    getTransactionReceipt: async () => { if (options.receiptMissing) throw new TransactionReceiptNotFoundError({ hash: tx }); return { status: options.outerFailed ? "reverted" : "success", blockNumber: 100n, blockHash, logs }; }, getBlock: async () => ({ hash: options.reorg ? keccak256(toBytes("different-fork")) : blockHash }), readContract } as unknown as PublicClient;
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const rpc = JSON.parse(init!.body as string) as { id: number; method: string };
    expect(rpc.method).toBe("eth_getUserOperationReceipt");
    if (options.bundlerOffline) return new Response("unavailable", { status: 503 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: null }), { headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetcher);
  const account = { address: sender, type: "smart" } as unknown as CreateKernelAccountReturnType<"0.7">;
  const driver = createKernelPaymentDriver({ client, account, guardianAddress: guardian, bundlerUrl: "http://bundler.test", maxGasCostWei: 1000000000000000n, confirmations: 2 });
  return { run: () => driver.reconcile(attempt, plan), events, readContract, fetcher };
}
describe("Reconciliation evidence conflicts (chain/RPC fixtures, no transaction submission)", () => {
  it.each([
    [{ confirmations: 1 }, "pending", undefined],
    [{ reorg: true }, "pending", "REORG_RECONCILING"],
    [{ nonceMismatch: true }, "needs_review", "OPERATION_RECEIPT_MISMATCH"],
    [{ success: false, consumed: false }, "failed", "USER_OPERATION_REVERTED"],
    [{ success: false, consumed: true }, "needs_review", "REVERT_WITH_CONSUMED_INVOICE"],
    [{ missingSettlement: true }, "needs_review", "MISSING_SETTLEMENT_EVIDENCE"],
    [{ consumed: false }, "needs_review", "MISSING_SETTLEMENT_EVIDENCE"],
    [{ partialBatch: true }, "needs_review", "MISSING_SETTLEMENT_EVIDENCE"],
    [{ noEvent: true, nonceAdvanced: true, consumed: false }, "needs_review", "NONCE_ADVANCED_WITHOUT_MATCHED_RECEIPT"],
    [{ noEvent: true, consumed: true }, "needs_review", "INVOICE_CONSUMED_WITHOUT_MATCHED_RECEIPT"],
    [{ noEvent: true, consumed: false, old: true }, "needs_review", "RECONCILIATION_TIMEOUT"],
    [{ windowExceeded: true }, "needs_review", "EVENT_LOOKUP_WINDOW_EXCEEDED"],
    [{ headBehind: true }, "pending", "CHAIN_BEHIND_SUBMISSION_BLOCK"],
    [{ headBehind: true, old: true }, "needs_review", "RECONCILIATION_TIMEOUT"],
    [{ reorg: true, old: true }, "needs_review", "RECONCILIATION_TIMEOUT"],
    [{ confirmations: 1, old: true }, "needs_review", "RECONCILIATION_TIMEOUT"],
    [{ receiptMissing: true }, "pending", "RECEIPT_NOT_FOUND_RECONCILING"],
    [{ rpcOffline: true }, "pending", "RECONCILIATION_RPC_UNAVAILABLE"],
    [{ rpcOffline: true, old: true }, "needs_review", "RECONCILIATION_TIMEOUT"],
    [{ outerFailed: true }, "needs_review", "OUTER_TRANSACTION_FAILED"],
    [{ bundlerOffline: true }, "confirmed", undefined],
    [{ old: true }, "confirmed", undefined],
    [{}, "confirmed", undefined],
  ] as const)("evaluates %j as %s", async (options, status, reason) => {
    const f = fixture(options); expect(await f.run()).toMatchObject({ status, ...(reason ? { reason } : {}) });
    expect(f.fetcher).toHaveBeenCalledOnce();
    if (("headBehind" in options && options.headBehind) || ("windowExceeded" in options && options.windowExceeded)) expect(f.events).not.toHaveBeenCalled();
  });
});
