import { accountKey, createPostgresPaymentStore } from "@guardian-wallet/database";
import { assessWalletRisk, buildWalletOverview, StructuredModelClient, modelRuntimeOptions } from "@guardian-wallet/planner";
import { walletIntentSchema } from "@guardian-wallet/shared";
import { createDevelopmentPublicClient, readPolicySnapshot } from "@guardian-wallet/wallet";
import { readEnvironment, verifyProject } from "../services/config.mjs";

// Read-only diagnosis. Optional --ai makes one inference request; never signs or changes the queue.
let database;
try {
  if (process.argv.slice(2).some((arg) => arg !== "--ai")) throw new Error("INVALID_DIAGNOSIS_ARGUMENT");
  await verifyProject();
  const api = await readEnvironment("api");
  if (!api.DATABASE_URL || !api.BASE_SEPOLIA_RPC_URL || !api.OWNER_ADDRESS || !api.KERNEL_ACCOUNT_ADDRESS || !api.GUARDIAN_ADDRESS) throw new Error("FINANCIAL_CONFIGURATION_REQUIRED");
  database = createPostgresPaymentStore(api.DATABASE_URL);
  const key = accountKey(84532, api.KERNEL_ACCOUNT_ADDRESS);
  const [state, tasks, attempts, paused, all] = await Promise.all([
    readPolicySnapshot(createDevelopmentPublicClient(api.BASE_SEPOLIA_RPC_URL), api.GUARDIAN_ADDRESS, api.KERNEL_ACCOUNT_ADDRESS),
    database.store.listAccountTasks(api.OWNER_ADDRESS, key), database.store.listActiveAttempts(key),
    database.store.isPaused(key), database.store.listTasks(api.OWNER_ADDRESS),
  ]);
  const overview = buildWalletOverview(state, tasks, { symbol: "MockUSD", decimals: 6 }, paused);
  const providers = {};
  for (const [name, base] of [["agent", api.PROVIDER_AGENT_URL], ["signer", api.PROVIDER_SIGNER_URL]]) {
    try { providers[name] = base && (await fetch(`${base.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(5000) })).ok ? "reachable" : "unavailable"; }
    catch { providers[name] = "unavailable"; }
  }
  let ai = { status: "not_queried", requests: 0 };
  if (process.argv.includes("--ai")) {
    try {
      const client = new StructuredModelClient(modelRuntimeOptions(api));
      const result = await client.generate(walletIntentSchema, "Classify the wallet request. Asset balance questions use action asset_overview and taskIds []. Return a short summary; do not invent balances.", JSON.stringify({ instruction: "Tampilkan aset wallet saya." }));
      ai = { status: "reachable", requests: 1, modelId: client.modelId, intent: result.value.action };
    } catch (error) {
      ai = { status: error instanceof Error && /^QWEN_[A-Z_]+$/.test(error.message) ? error.message : "AI_CHECK_FAILED", requests: 1,
        ...(typeof error?.retryAfterSeconds === "number" ? { retryAfterSeconds: error.retryAfterSeconds } : {}) };
    }
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), state, overview, risk: assessWalletRisk(state, overview, tasks, attempts),
    otherAccountTaskCount: all.filter((task) => accountKey(task.chainId, task.quote.account) !== key).length,
    tasks: tasks.map((task) => ({ id: task.id, status: task.status, reason: task.reason, amountUnits: task.quote.amountUnits, invoiceExpiresAt: new Date(task.quote.validUntil * 1000).toISOString() })),
    activeOperations: attempts.map((attempt) => ({ taskId: attempt.taskId, status: attempt.status })),
    providers, ai, aiQuota: "AI quota is separate from the on-chain UTC-day payment budget.", transactionsSubmitted: 0,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error && /^[A-Z0-9_]{1,120}$/.test(error.message) ? error.message : "WALLET_DIAGNOSIS_FAILED_CHECK_DATABASE_AND_RPC");
  process.exitCode = 1;
} finally { await database?.close(); }
