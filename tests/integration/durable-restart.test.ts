import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { join } from "node:path";
import { once } from "node:events";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { expect, it, vi } from "vitest";
import { PaymentStore, accountKey, type QueryDatabase } from "@guardian-wallet/database";
import { BoundedPaymentPlanner } from "@guardian-wallet/planner";
import { getPaymentId, type PaymentExecutionDriver } from "@guardian-wallet/wallet";
import type { PaymentTask, PolicySnapshot } from "@guardian-wallet/shared";
import { PaymentWorker } from "../../apps/worker/src/worker.js";
import { applyTestMigrations } from "../helpers/migrations.js";

async function runChild(script: string, args: string[]) {
  const child = spawn(process.execPath, ["--import", "tsx", script, ...args], { cwd: fileURLToPath(new URL("../../", import.meta.url)), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill(), 30000), [code] = await once(child, "exit"); clearTimeout(timeout);
  if (code !== 0) throw new Error(`DURABLE_WORKER_CHILD_FAILED:${stderr.slice(0, 200)}`);
  const line = stdout.split(/\r?\n/).find((value) => value.startsWith("{"));
  if (!line) throw new Error("DURABLE_WORKER_CHILD_NO_RESULT");
  return JSON.parse(line);
}

it("reopens an actual disk database after a lost send response and reconciles without a second signed payment", async () => {
  const parent = fileURLToPath(new URL("../../.local/backend-tests/", import.meta.url)); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "durable-")); let db: PGlite | undefined;
  function wrap(connection: PGlite | Transaction): QueryDatabase {
    return { query: async <T extends object>(statement: string, parameters: (string | number | boolean | null)[] = []) => (await connection.query<T>(statement, parameters)).rows,
      transaction: (body) => { if (!(connection instanceof PGlite)) throw new Error("NESTED_TRANSACTION"); return connection.transaction((tx) => body(wrap(tx))); } };
  }
  const account = `0x${"1".repeat(40)}` as const, guardian = `0x${"2".repeat(40)}` as const, token = `0x${"3".repeat(40)}` as const, hash = `0x${"ab".repeat(32)}` as const;
  const now = Math.floor(Date.now() / 1000), key = accountKey(84532, account);
  const state: PolicySnapshot = { chainId: 84532, account, guardianAddress: guardian, token, quoteSigner: account, policyVersion: "1", balanceUnits: "10000000", protectedBalanceUnits: "6000000", perPaymentLimitUnits: "1000000", dailyLimitUnits: "2000000", spentUnits: "0", installed: true, paused: false, validAfter: now - 1, validUntil: now + 3600, observedBlockNumber: "100", observedBlockHash: hash, observedAt: now };
  const quote = { account, token, recipient: account, providerId: hash, invoiceId: hash, serviceHash: hash, amountUnits: "260000", validUntil: now + 3600, signature: `0x${"11".repeat(65)}` as const };
  const task: PaymentTask = { id: randomUUID(), chainId: 84532, owner: account, paymentId: getPaymentId(84532, quote), quote, instruction: "Pay the authenticated fixture invoice.", status: "queued", createdAt: new Date().toISOString() };
  const driver: PaymentExecutionDriver = { snapshot: async () => state, validate: async () => {}, prepare: vi.fn(async (plan) => ({ attempt: { taskId: plan.taskId, sender: account, userOperationHash: hash, nonce: "18446744073709551616", nonceKey: "1", status: "prepared", submissionBlock: "100", preparedAt: Date.now(), validUntil: plan.validUntil }, signedPayload: "private-fixture-payload" })), submit: vi.fn(async () => { throw new Error("lost response after inclusion"); }), reconcile: vi.fn(async () => ({ status: "confirmed", transactionHash: hash })) };
  try {
    db = new PGlite(directory); await applyTestMigrations(db);
    let store = new PaymentStore(wrap(db)); await store.createTask(task); await store.setPaused(key, false);
    expect(await new PaymentWorker(store, new BoundedPaymentPlanner(), driver, key, "before-restart").runOnce()).toBe("unknown");
    const before = await store.getAttempt(task.id, account); expect(before?.status).toBe("unknown");
    await db.close(); db = undefined;
    db = new PGlite(directory); store = new PaymentStore(wrap(db));
    expect(await store.getAttempt(task.id, account)).toEqual(before);
    await store.setPaused(key, true);
    expect(await new PaymentWorker(store, new BoundedPaymentPlanner(), driver, key, "after-restart").runOnce()).toBe("confirmed");
    expect((await store.getTask(task.id, account))?.status).toBe("paid");
    expect(driver.prepare).toHaveBeenCalledOnce(); expect(driver.submit).toHaveBeenCalledOnce();
    expect(await store.isPaused(key)).toBe(true);
  } finally { await db?.close(); await rm(directory, { recursive: true, force: true }); }
}, 30000);

it("persists the payment attempt across an actual worker-process restart and prevents a second send", async () => {
  const parent = fileURLToPath(new URL("../../.local/backend-tests/", import.meta.url)); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "worker-process-restart-")); let db: PGlite | undefined;
  const sends = join(directory, "send-count.private.txt"), account = `0x${"1".repeat(40)}` as const, token = `0x${"3".repeat(40)}` as const, hash = `0x${"ab".repeat(32)}` as const;
  try {
    db = new PGlite(directory); await applyTestMigrations(db);
    function wrap(connection: PGlite | Transaction): QueryDatabase {
      return { query: async <T extends object>(statement: string, params: (string | number | boolean | null)[] = []) => (await connection.query<T>(statement, params)).rows,
        transaction: async (body) => { if (!(connection instanceof PGlite)) throw new Error("NESTED_TRANSACTION"); return connection.transaction((tx) => body(wrap(tx))); } };
    }
    const now = Math.floor(Date.now() / 1000), quote = { account, token, recipient: account, providerId: hash, invoiceId: hash, serviceHash: hash, amountUnits: "260000", validUntil: now + 3600, signature: `0x${"11".repeat(65)}` as const };
    const task: PaymentTask = { id: randomUUID(), chainId: 84532, owner: account, paymentId: getPaymentId(84532, quote), quote, instruction: "Durable restart test invoice.", status: "queued", createdAt: new Date().toISOString() };
    const store = new PaymentStore(wrap(db)); await store.createTask(task); await store.setPaused(accountKey(84532, account), false); await db.close(); db = undefined;
    const childScript = fileURLToPath(new URL("../helpers/durable-worker-child.mjs", import.meta.url));
    const send = await runChild(childScript, [directory, "send", sends]); expect(send).toMatchObject({ phase: "send", outcome: "unknown", taskStatus: "executing", attemptStatus: "unknown" });
    const beforeRestart = await readFile(sends, "utf8"); expect(beforeRestart.trim().split(/\r?\n/)).toHaveLength(1);
    const reconcile = await runChild(childScript, [directory, "reconcile", sends]); expect(reconcile).toMatchObject({ phase: "reconcile", outcome: "confirmed", taskStatus: "paid", attemptStatus: "confirmed" });
    expect((await readFile(sends, "utf8")).trim().split(/\r?\n/)).toHaveLength(1);
  } finally { await db?.close(); await rm(directory, { recursive: true, force: true }); }
}, 60000);
