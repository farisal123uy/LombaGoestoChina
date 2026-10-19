import { describe, expect, it } from "vitest";
import type { PaymentAttempt, PaymentTask } from "@guardian-wallet/shared";
import { batchPresentation, displayTokenAmount, operationHashes, validOperationHash } from "../components/financial-dashboard";

const hash = `0x${"1".repeat(64)}` as const;
const address = `0x${"2".repeat(40)}` as const;
function task(id: string, status: PaymentTask["status"]): PaymentTask {
  return { id, chainId: 84532, owner: address, paymentId: hash, instruction: "Fixture", status, createdAt: "2026-10-19T00:00:00.000Z", quote: { account: address, providerId: hash, invoiceId: hash, serviceHash: hash, token: address, recipient: address, amountUnits: "260000", validUntil: 1792368000, signature: `0x${"3".repeat(130)}` } };
}
const tasks = [task("one", "planned"), task("two", "executing"), task("three", "paid"), task("four", "completed")] as [PaymentTask, PaymentTask, PaymentTask, PaymentTask];
const operation: PaymentAttempt = { taskId: "one", taskIds: tasks.map((task) => task.id), sender: address, userOperationHash: hash, nonce: "1", nonceKey: "0", status: "submitted", submissionBlock: "1", preparedAt: 0, validUntil: 1792368000 };

describe("batchPresentation", () => {
  it("retains complete member state and exact integer total", () => {
    expect(batchPresentation(tasks, tasks[0], operation)).toMatchObject({ memberCount: 4, totalUnits: "1040000", role: "leader", operation, members: tasks });
    expect(batchPresentation(tasks, tasks[1], { ...operation, leaderTaskId: "one" })?.role).toBe("follower");
  });
  it("keeps authoritative batch identity with partial or invalid amount data", () => {
    expect(batchPresentation(tasks.slice(0, 2), tasks[0], operation)).toMatchObject({ memberCount: 4, members: tasks.slice(0, 2), totalUnits: undefined, role: "leader", operation });
    expect(batchPresentation([{ ...tasks[0], quote: { ...tasks[0].quote, amountUnits: "invalid" } } as PaymentTask, ...tasks.slice(1)], tasks[0], operation)?.totalUnits).toBeUndefined();
    expect(displayTokenAmount("invalid")).toBe("Amount unavailable");
  });
  it("admits only complete operation hashes", () => {
    expect(validOperationHash(hash)).toBe(true);
    expect(validOperationHash("0x1234")).toBe(false);
    expect(operationHashes(operation)).toEqual({ userOperationHash: hash, transactionHash: undefined });
    expect(operationHashes({ ...operation, userOperationHash: "invalid" as `0x${string}`, transactionHash: "0x1234" as `0x${string}` })).toEqual({ userOperationHash: undefined, transactionHash: undefined });
  });
  it("preserves single-payment fallback and rejects invalid metadata", () => {
    expect(batchPresentation(tasks, tasks[0], undefined)).toBeUndefined();
    expect(batchPresentation(tasks, tasks[0], { ...operation, taskIds: ["one"] })).toBeUndefined();
    expect(batchPresentation(tasks, tasks[0], { ...operation, taskIds: ["one", "one"] })).toBeUndefined();
    expect(batchPresentation(tasks, tasks[0], { ...operation, leaderTaskId: "missing" })).toBeUndefined();
  });
});
