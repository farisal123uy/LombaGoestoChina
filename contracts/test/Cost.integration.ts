import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { network } from "hardhat";
import { keccak256, parseEventLogs, toBytes, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { entryPoint07Abi, getUserOperationHash, toPackedUserOperation, type UserOperation } from "viem/account-abstraction";
import { createOwnerKernel, createAgentKernel, getGuardianSessionAuthorization, encodeGuardianInstall, encodeGuardianPolicyData, encodeGuardianPayments, entryPoint, getPaymentId, quoteTypedData, readPolicySnapshot, createKernelPaymentDriver } from "@guardian-wallet/wallet";
import { BoundedPaymentPlanner } from "@guardian-wallet/planner";
import { PaymentStore, accountKey, type QueryDatabase } from "@guardian-wallet/database";
import type { PaymentTask, ServiceQuote } from "@guardian-wallet/shared";
import { PaymentWorker } from "../../apps/worker/src/worker.js";
import { applyTestMigrations } from "../../tests/helpers/migrations.js";

it("COST-01: actual Kernel worker single vs 4/7 invoice batches from identical warm snapshots", { skip: !process.env.KERNEL_FORK_RPC_URL, timeout: 240000 }, async (t) => {
  const connection = await network.create("kernelFork"); t.after(() => connection.close());
  const client = await connection.viem.getPublicClient({ cacheTime: 0, pollingInterval: 20 });
  const [relayer, recipient] = await connection.viem.getWalletClients(); assert(relayer && recipient);
  const owner = privateKeyToAccount(generatePrivateKey()), signer = privateKeyToAccount(generatePrivateKey()), provider = privateKeyToAccount(generatePrivateKey());
  const guardian = await connection.viem.deployContract("GuardianPayments"), token = await connection.viem.deployContract("MockUSD", [relayer.account.address]);
  const now = Number((await client.getBlock()).timestamp), until = now + 3 * 86400;
  const rules = { token: token.address, quoteSigner: provider.address, pauseGuardian: owner.address, protectedBalance: 6000000n, perPaymentLimit: 1000000n, dailyLimit: 2000000n, validAfter: now - 1, validUntil: until };
  const ownerAccount = await createOwnerKernel(client, owner, [encodeGuardianInstall(guardian.address, encodeGuardianPolicyData(rules, [recipient.account.address]))], 9417n);
  const factory = await ownerAccount.getFactoryArgs(); assert(factory.factory && factory.factoryData);
  await client.waitForTransactionReceipt({ hash: await relayer.sendTransaction({ to: factory.factory, data: factory.factoryData, gas: 5000000n }) });
  await token.write.transfer([ownerAccount.address, 10000000n]);
  await connection.provider.request({ method: "hardhat_setBalance", params: [ownerAccount.address, "0xDE0B6B3A7640000"] });
  const auth = await getGuardianSessionAuthorization(client, ownerAccount.address, owner.address, signer.address, guardian.address, until);
  const enabling = await createAgentKernel(client, ownerAccount.address, signer, guardian.address, until, await owner.signTypedData(auth.typedData));
  async function quote(label: string): Promise<ServiceQuote> {
    const q = { account: ownerAccount.address, providerId: keccak256(toBytes("cost-provider")), invoiceId: keccak256(toBytes(label)), serviceHash: keccak256(toBytes("database-small-1h")), token: token.address, recipient: recipient!.account.address, amountUnits: "260000", validUntil: until };
    return { ...q, signature: await provider.signTypedData(quoteTypedData(84532, guardian.address, q)) };
  }
  const planner = new BoundedPaymentPlanner();
  const warmQuote = await quote("warmup-previous-UTC-day");
  const warmTask: PaymentTask = { id: randomUUID(), chainId: 84532, owner: owner.address, paymentId: getPaymentId(84532, warmQuote), quote: warmQuote, instruction: "Warm permission with an allowed fixture payment.", status: "queued", createdAt: new Date().toISOString() };
  const warmPlan = await planner.plan(warmTask, await readPolicySnapshot(client, guardian.address, ownerAccount.address)); assert.equal(warmPlan.status, "planned");
  if (warmPlan.status !== "planned") throw new Error("WARM_PLAN_REQUIRED");
  const warmOperation: UserOperation<"0.7"> = { sender: enabling.address, nonce: await enabling.getNonce(), callData: await enabling.encodeCalls([{ to: guardian.address, data: encodeGuardianPayments(warmPlan.plan) }]), callGasLimit: 5000000n, verificationGasLimit: 2500000n, preVerificationGas: 100000n, maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n, signature: "0x" };
  warmOperation.signature = await enabling.signUserOperation(warmOperation);
  const warmHash = getUserOperationHash({ userOperation: warmOperation, entryPointAddress: entryPoint.address, entryPointVersion: "0.7", chainId: 84532 });
  const warmReceipt = await client.waitForTransactionReceipt({ hash: await relayer.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "handleOps", args: [[toPackedUserOperation(warmOperation)], relayer.account.address], gas: 15000000n }) });
  const warmEvent = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: warmReceipt.logs }).find((event) => event.args.userOpHash === warmHash); assert(warmEvent?.args.success);
  // Restore the token fixture through a real transfer, then wait for a genuine UTC
  // window boundary. No policy/counter/consumed storage is overwritten.
  await token.write.transfer([ownerAccount.address, 260000n]);
  const nextDay = (Number((await client.getBlock()).timestamp) / 86400 | 0) * 86400 + 86400;
  await connection.provider.request({ method: "evm_setNextBlockTimestamp", params: [nextDay] });
  await connection.provider.request({ method: "evm_mine", params: [] });
  await connection.provider.request({ method: "hardhat_setBalance", params: [ownerAccount.address, "0xDE0B6B3A7640000"] });
  const agent = await createAgentKernel(client, ownerAccount.address, signer, guardian.address, until);

  type Observed = { hash: Hex; transactionHash: Hex; operationGas: bigint; chargeWei: bigint; transactionGas: bigint; calldataBytes: number };
  let observations: Observed[] = [];
  const rpc = createServer(async (request, response) => {
    try {
      let text = ""; for await (const chunk of request) text += String(chunk);
      const body = JSON.parse(text) as { id: number; method: string; params: unknown[] };
      let result: unknown;
      if (body.method === "eth_chainId") result = "0x14a34";
      else if (body.method === "eth_estimateUserOperationGas") result = { preVerificationGas: "0x186a0", verificationGasLimit: "0x2625a0", callGasLimit: "0x4c4b40" };
      else if (body.method === "eth_getUserOperationReceipt") result = null;
      else if (body.method === "eth_sendUserOperation") {
        const numbers = new Set(["nonce", "callGasLimit", "verificationGasLimit", "preVerificationGas", "maxFeePerGas", "maxPriorityFeePerGas"]);
        const operation = JSON.parse(JSON.stringify(body.params[0]), (key, value: unknown) => numbers.has(key) ? BigInt(String(value)) : value) as UserOperation<"0.7">;
        const hash = getUserOperationHash({ userOperation: operation, entryPointAddress: entryPoint.address, entryPointVersion: "0.7", chainId: 84532 });
        await connection.provider.request({ method: "hardhat_setNextBlockBaseFeePerGas", params: ["0x3b9aca00"] });
        const receipt = await client.waitForTransactionReceipt({ hash: await relayer.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "handleOps", args: [[toPackedUserOperation(operation)], relayer.account.address], gas: 15000000n, maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n }) });
        const event = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs }).find((entry) => entry.args.userOpHash === hash);
        assert.equal(receipt.status, "success"); assert(event?.args.success);
        observations.push({ hash, transactionHash: receipt.transactionHash, operationGas: event.args.actualGasUsed, chargeWei: event.args.actualGasCost, transactionGas: receipt.gasUsed, calldataBytes: (operation.callData.length - 2) / 2 });
        result = hash;
      } else throw new Error("UNSUPPORTED_COST_FIXTURE_RPC");
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    } catch { response.statusCode = 500; response.end('{"error":"COST_FIXTURE_FAILED"}'); }
  });
  await new Promise<void>((resolve) => rpc.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => { rpc.close(() => resolve()); rpc.closeAllConnections(); }));
  const endpoint = rpc.address(); assert(endpoint && typeof endpoint !== "string");
  const db = new PGlite(); t.after(() => db.close()); await applyTestMigrations(db);
  function wrap(sql: PGlite | Transaction): QueryDatabase {
    return { query: async <T extends object>(statement: string, params: (string | number | boolean | null)[] = []) => (await sql.query<T>(statement, params)).rows,
      transaction: async (body) => { if (!(sql instanceof PGlite)) throw new Error("NESTED_TRANSACTION"); return sql.transaction((tx) => body(wrap(tx))); } };
  }
  const pricedClient = { ...client, estimateFeesPerGas: async () => ({ maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n }) } as typeof client;
  const driver = createKernelPaymentDriver({ client: pricedClient, account: agent, guardianAddress: guardian.address, bundlerUrl: `http://127.0.0.1:${endpoint.port}`, maxGasCostWei: 100000000000000000n, confirmations: 1 });
  const results = [];
  let snapshot = await connection.provider.request({ method: "evm_snapshot", params: [] });
  for (const count of [4, 7]) {
    const quotes = await Promise.all(Array.from({ length: count }, (_, i) => quote(`COST-01-${count}-${i}`)));
    const samples: { repeat: number; mode: "single" | "batch"; settledInvoices: number; operationCount: number; elapsedMs: number; entryPointGasUsed: string; entryPointChargeWei: string; enclosingTransactionGasUsed: string; calldataBytes: number; tokenBalanceAfterUnits: string; spentAfterUnits: string }[] = [];
    for (let repeat = 0; repeat < 3; repeat++) for (const mode of ["single", "batch"] as const) {
      assert.equal(await connection.provider.request({ method: "evm_revert", params: [snapshot] }), true);
      snapshot = await connection.provider.request({ method: "evm_snapshot", params: [] });
      await db.exec("TRUNCATE escrow_operations,payment_attempt_members,payment_attempts,payment_tasks,execution_locks,worker_controls;"); observations = [];
      const store = new PaymentStore(wrap(db)), key = accountKey(84532, agent.address), state = await readPolicySnapshot(client, guardian.address, agent.address);
      assert.equal(state.balanceUnits, "10000000"); assert.equal(state.spentUnits, "0");
      for (const q of quotes) {
        const task: PaymentTask = { id: randomUUID(), chainId: 84532, owner: owner.address, paymentId: getPaymentId(84532, q), quote: q, instruction: "Pay the authenticated database invoice.", status: "queued", createdAt: new Date().toISOString() };
        const planned = await planner.plan(task, state); assert.equal(planned.status, "planned");
        if (planned.status !== "planned") throw new Error("COST_PLAN_REQUIRED"); await store.createTask({ ...task, status: "planned", plan: planned.plan });
      }
      await store.setPaused(key, false);
      const start = performance.now();
      const worker = new PaymentWorker(store, planner, driver, key, randomUUID(), undefined, { maxBatchSize: mode === "single" ? 1 : count, clock: () => state.observedAt * 1000 + performance.now() - start });
      for (let tick = 0; tick < count * 3 + 2; tick++) if (await worker.runOnce() === "idle") break;
      const elapsedMs = Math.round(performance.now() - start), tasks = await store.listTasks(owner.address);
      assert.equal(tasks.length, count); assert(tasks.every((task) => task.status === "paid"));
      assert.equal(observations.length, mode === "single" ? count : 1);
      for (const q of quotes) assert.equal(await guardian.read.consumed([agent.address, getPaymentId(84532, q)]), true);
      const after = await readPolicySnapshot(client, guardian.address, agent.address);
      assert.equal(after.balanceUnits, (10000000n - BigInt(count) * 260000n).toString()); assert.equal(after.spentUnits, (BigInt(count) * 260000n).toString());
      const sum = (field: "operationGas" | "chargeWei" | "transactionGas") => observations.reduce((total, item) => total + item[field], 0n);
      samples.push({ repeat: repeat + 1, mode, settledInvoices: count, operationCount: observations.length, elapsedMs, entryPointGasUsed: sum("operationGas").toString(), entryPointChargeWei: sum("chargeWei").toString(), enclosingTransactionGasUsed: sum("transactionGas").toString(), calldataBytes: observations.reduce((n, item) => n + item.calldataBytes, 0), tokenBalanceAfterUnits: after.balanceUnits, spentAfterUnits: after.spentUnits });
    }
    const median = (mode: "single" | "batch", field: "entryPointGasUsed" | "enclosingTransactionGasUsed" | "entryPointChargeWei") => samples.filter((row) => row.mode === mode).map((row) => BigInt(row[field])).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)[1]!;
    const singleGas = median("single", "entryPointGasUsed"), batchGas = median("batch", "entryPointGasUsed");
    const txSingle = median("single", "enclosingTransactionGasUsed"), txBatch = median("batch", "enclosingTransactionGasUsed");
    results.push({ invoiceCount: count, invoiceAmountUnits: "260000", totalServiceAmountUnits: (BigInt(count) * 260000n).toString(), repetitionsPerMode: 3, singleMedianEntryPointGas: singleGas.toString(), batchMedianEntryPointGas: batchGas.toString(), entryPointGasReductionPercent: Number((singleGas - batchGas) * 10000n / singleGas) / 100,
      singleMedianEnclosingTransactionGas: txSingle.toString(), batchMedianEnclosingTransactionGas: txBatch.toString(), enclosingTransactionGasReductionPercent: Number((txSingle - txBatch) * 10000n / txSingle) / 100,
      singleMedianEntryPointChargeWei: median("single", "entryPointChargeWei").toString(), batchMedianEntryPointChargeWei: median("batch", "entryPointChargeWei").toString(), samples });
  }
  const sourcePaths = ["apps/worker/src/worker.ts", "packages/database/src/payment-store.ts", "packages/planner/src/batching.ts", "packages/wallet/src/execution.ts", "contracts/test/Cost.integration.ts"];
  const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [path, createHash("sha256").update(await readFile(new URL(`../../${path}`, import.meta.url))).digest("hex")])));
  const report = { measuredAt: new Date().toISOString(), caseId: "COST-01", evidenceType: "isolated-local-base-sepolia-fork-actual-kernel-worker", forkBlock: 48189742, chainId: 84532, kernelVersion: "0.3.1", entryPointVersion: "0.7", initialTokenBalanceUnits: "10000000", protectedBalanceUnits: "6000000", dailyLimitUnits: "2000000", permissionState: "already-enabled-identical-EVM-snapshot-per-mode", warmup: { previousDayAllowedPaymentUnits: "260000", firstEnableOperationGas: warmEvent.args.actualGasUsed.toString(), excludedFromSteadyStateComparison: true },
    payer: "locally-prefunded-Kernel-EntryPoint-native-gas; ephemeral-fork-assets", bundler: "local-stub-static-100000-preVerificationGas-2500000-verificationGasLimit-5000000-callGasLimit", gasPricing: { baseFeeWei: "1000000000", maxFeePerGasWei: "2000000000", priorityFeeWei: "1000000000" }, inference: "deterministic-baseline-for-both-modes; inference-cost-excluded", results,
    limitations: ["No public-chain transactions or real-money purchases.", "EntryPoint actualGasUsed includes the stub's fixed preVerificationGas; enclosing transaction EVM gas is reported separately.", "OP L1-data fees, commercial bundler/paymaster pricing, production congestion, model/hosting/electricity costs are not measured.", "Elapsed time is local test-harness processing; configured batching wait, owner interactions and production RPC latency are excluded.", "Scheduler savings apply equally to baseline and model-approved invoices; not attributed to AI intelligence."], sources };
  if (process.env.RECORD_COST_EVIDENCE === "true") await writeFile(new URL("../../docs/evidence/cost-fork.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  t.diagnostic(JSON.stringify(report));
});
