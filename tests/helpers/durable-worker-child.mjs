import { appendFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { keccak256, toBytes } from "viem";
import { PaymentStore, accountKey } from "@guardian-wallet/database";
import { BoundedPaymentPlanner } from "@guardian-wallet/planner";
import { PaymentWorker } from "../../apps/worker/src/worker.ts";

const [directory, phase, sendCounter] = process.argv.slice(2);
if (!directory || !["send", "reconcile"].includes(phase) || !sendCounter) throw new Error("INVALID_DURABLE_WORKER_CHILD_ARGUMENTS");
const db = new PGlite(directory), now = Date.now(), account = `0x${"1".repeat(40)}`, key = accountKey(84532, account);
function wrap(connection, nested = false) {
  return { query: async (statement, parameters = []) => (await connection.query(statement, parameters)).rows,
    transaction: async (body) => { if (nested) throw new Error("NESTED_TRANSACTION"); return connection.transaction((tx) => body(wrap(tx, true))); } };
}
const store = new PaymentStore(wrap(db));
const driver = {
  snapshot: async () => ({ chainId: 84532, account, guardianAddress: `0x${"2".repeat(40)}`, token: `0x${"3".repeat(40)}`, quoteSigner: account, policyVersion: "1", balanceUnits: "10000000", protectedBalanceUnits: "6000000", perPaymentLimitUnits: "1000000", dailyLimitUnits: "2000000", spentUnits: "0", installed: true, paused: false, validAfter: Math.floor(now / 1000) - 5, validUntil: Math.floor(now / 1000) + 3600, observedBlockNumber: "100", observedBlockHash: keccak256(toBytes("restart-block")), observedAt: Math.floor(now / 1000) }),
  validate: async () => {},
  prepare: async (plan) => ({ attempt: { taskId: plan.taskId, sender: account, userOperationHash: `0x${"aa".repeat(32)}`, nonce: "18446744073709551616", nonceKey: "1", status: "prepared", submissionBlock: "100", preparedAt: now, validUntil: plan.validUntil }, signedPayload: "PRIVATE_DURABLE_TEST_PAYLOAD" }),
  submit: async () => { if (phase !== "send") throw new Error("SECOND_SEND_MUST_NOT_HAPPEN"); await appendFile(sendCounter, "send\n"); throw new Error("lost response after inclusion"); },
  reconcile: async () => { if (phase !== "reconcile") throw new Error("RECONCILE_UNEXPECTED_BEFORE_RESTART"); return { status: "confirmed", transactionHash: `0x${"bb".repeat(32)}` }; },
};
try {
  const worker = new PaymentWorker(store, new BoundedPaymentPlanner(), driver, key, `restart-${phase}`);
  const outcome = await worker.runOnce(), tasks = await store.listTasks(account), task = tasks[0], attempt = await store.getAttempt(task.id, account);
  console.log(JSON.stringify({ phase, outcome, taskStatus: task.status, attemptStatus: attempt?.status }));
  await db.close();
} catch (error) { await db.close(); console.error(error instanceof Error ? error.message : "DURABLE_CHILD_FAILED"); process.exitCode = 1; }
