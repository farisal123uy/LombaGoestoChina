import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import Fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { reviewNetworkRuntime } from "./network-runtime.mjs";
import { keccak256, toBytes, parseEventLogs } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { entryPoint07Abi, getUserOperationHash, toPackedUserOperation } from "viem/account-abstraction";
import { PaymentStore, ProviderStore, accountKey } from "@guardian-wallet/database";
import { QwenClient, BoundedPaymentPlanner, createQwenPlanner } from "@guardian-wallet/planner";
import { createOwnerKernel, createAgentKernel, getGuardianSessionAuthorization, encodeGuardianInstall, encodeGuardianPolicyData, encodeGuardianPayments, entryPoint, quoteTypedData, getPaymentId, readPolicySnapshot, validatePaymentPlan, createKernelPaymentDriver, createProviderAgentClient, createProviderServiceClient, createProviderFulfillment } from "@guardian-wallet/wallet";
import { buildApp } from "../../apps/api/dist/app.js";
import { buildProviderAgent } from "../../apps/api/dist/provider-agent.js";
import { buildProviderSigner } from "../../apps/api/dist/provider-signer.js";
import { PaymentWorker } from "../../apps/worker/dist/worker.js";

// This runtime deliberately never loads owner .env/.local configuration. Every
// key, wallet and gas balance below belongs exclusively to a disposable local fork.
export async function createReviewWorkspace(qwenOptions = {}, diagnostics = {}) {
  const selectedModel = new QwenClient(qwenOptions);
  const began = performance.now();
  const trace = (stage) => diagnostics.observeStage?.({ stage, elapsedMs: Math.round(performance.now() - began), ...process.memoryUsage() });
  trace("module-baseline");
  const resources = []; let stopped = false, wake, loop, closing;
  function close() {
    closing ||= (async () => {
      stopped = true; wake?.(); await loop?.catch(() => {});
      let failed = false;
      for (const cleanup of [...resources].reverse()) { try { await cleanup(); } catch { failed = true; } }
      if (failed) throw new Error("REVIEW_WORKSPACE_CLEANUP_FAILED");
    })();
    return closing;
  }
  try {
    const { network } = await reviewNetworkRuntime();
    const connection = await network.create("kernelFork"); resources.push(() => connection.close());
    trace("fork-created");
    const client = await connection.viem.getPublicClient({ cacheTime: 0, pollingInterval: 20 });
    const [relayer] = await connection.viem.getWalletClients(); assert(relayer);
    const providerKey = generatePrivateKey();
    const owner = privateKeyToAccount(generatePrivateKey()), provider = privateKeyToAccount(providerKey), signer = privateKeyToAccount(generatePrivateKey());
    const guardian = await connection.viem.deployContract("GuardianPayments");
    const token = await connection.viem.deployContract("MockUSD", [relayer.account.address]);
    const firstTime = Number((await client.getBlock()).timestamp), until = Math.floor(Date.now() / 1000) + 86400;
    const rules = { token: token.address, quoteSigner: provider.address, pauseGuardian: owner.address, protectedBalance: 6000000n, perPaymentLimit: 1000000n, dailyLimit: 2000000n, validAfter: firstTime - 1, validUntil: until };
    const ownerAccount = await createOwnerKernel(client, owner, [encodeGuardianInstall(guardian.address, encodeGuardianPolicyData(rules, [provider.address]))], BigInt(`0x${randomBytes(8).toString("hex")}`));
    const factory = await ownerAccount.getFactoryArgs(); assert(factory.factory && factory.factoryData);
    await client.waitForTransactionReceipt({ hash: await relayer.sendTransaction({ to: factory.factory, data: factory.factoryData, gas: 5000000n }) });
    await token.write.transfer([ownerAccount.address, 10000000n]);
    trace("contracts-and-account-deployed");
    await connection.provider.request({ method: "hardhat_setBalance", params: [ownerAccount.address, "0xDE0B6B3A7640000"] });
    const auth = await getGuardianSessionAuthorization(client, ownerAccount.address, owner.address, signer.address, guardian.address, until);
    const enabling = await createAgentKernel(client, ownerAccount.address, signer, guardian.address, until, await owner.signTypedData(auth.typedData));
    // Enable the restricted session using a genuine 1-base-unit setup payment on
    // the historical fork day, then restore tokens and advance to today's UTC day.
    const q = { account: ownerAccount.address, providerId: keccak256(toBytes("review-bootstrap")), invoiceId: keccak256(toBytes(randomUUID())), serviceHash: keccak256(toBytes("review-bootstrap")), token: token.address, recipient: provider.address, amountUnits: "1", validUntil: until };
    const quote = { ...q, signature: await provider.signTypedData(quoteTypedData(84532, guardian.address, q)) };
    const baseline = new BoundedPaymentPlanner();
    const warm = await baseline.plan({ id: randomUUID(), chainId: 84532, owner: owner.address, paymentId: getPaymentId(84532, quote), instruction: "Initialize the disposable review session.", quote, status: "queued", createdAt: new Date().toISOString() }, await readPolicySnapshot(client, guardian.address, ownerAccount.address));
    assert.equal(warm.status, "planned");
    const operation = { sender: enabling.address, nonce: await enabling.getNonce(), callData: await enabling.encodeCalls([{ to: guardian.address, data: encodeGuardianPayments(warm.plan) }]), callGasLimit: 3000000n, verificationGasLimit: 2500000n, preVerificationGas: 100000n, maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n, signature: "0x" };
    operation.signature = await enabling.signUserOperation(operation);
    const warmReceipt = await client.waitForTransactionReceipt({ hash: await relayer.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "handleOps", args: [[toPackedUserOperation(operation)], relayer.account.address], gas: 12000000n }) });
    assert(parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: warmReceipt.logs }).some((event) => event.args.success));
    await token.write.transfer([ownerAccount.address, 1n]);
    const wallTime = Math.floor(Date.now() / 1000);
    if (Math.floor(wallTime / 86400) <= Math.floor(firstTime / 86400)) throw new Error("REVIEW_FORK_DATE_MUST_PRECEDE_TODAY");
    await connection.provider.request({ method: "evm_setNextBlockTimestamp", params: [wallTime] });
    await connection.provider.request({ method: "evm_mine", params: [] });
    const agent = await createAgentKernel(client, ownerAccount.address, signer, guardian.address, until);
    trace("session-enabled-before-database");
    const db = new PGlite(diagnostics.databaseProfile !== "default" ? {
      initialMemory: 128 * 1024 * 1024,
      postgresqlconf: "shared_buffers = '16MB'\nwork_mem = '1MB'\nmaintenance_work_mem = '16MB'\nmax_connections = 10\n",
    } : {}); resources.push(() => db.close());
    const migrations = new URL("../../packages/database/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()) await db.exec(await readFile(new URL(file, migrations), "utf8"));
    trace("database-migrated");
    function wrap(sql, transactional = false) {
      return { query: async (statement, parameters = []) => (await sql.query(statement, parameters)).rows,
        transaction: async (body) => { if (transactional) throw new Error("NESTED_TRANSACTION"); return sql.transaction((tx) => body(wrap(tx, true))); } };
    }
    const database = wrap(db), store = new PaymentStore(database), providerStore = new ProviderStore(database);
    const providerToken = randomBytes(32).toString("hex"), agentToken = randomBytes(32).toString("hex");
    const seller = await buildProviderSigner({ client, store: providerStore, account: agent.address, guardian: guardian.address, token: token.address, privateKey: providerKey, accessToken: providerToken, confirmations: 1 });
    resources.push(() => seller.close());
    await seller.listen({ host: "127.0.0.1", port: 0 });
    const signerUrl = `http://127.0.0.1:${seller.server.address().port}`;
    const sellerAgent = await buildProviderAgent({ accessToken: agentToken, signerToken: providerToken, signerUrl, qwen: qwenOptions });
    resources.push(() => sellerAgent.close()); await sellerAgent.listen({ host: "127.0.0.1", port: 0 });
    const agentUrl = `http://127.0.0.1:${sellerAgent.server.address().port}`;
    const bundler = Fastify({ logger: false, bodyLimit: 65536 }); resources.push(() => bundler.close());
    bundler.post("/", async (request) => {
      const body = request.body; let result;
      if (body.method === "eth_chainId") result = "0x14a34";
      else if (body.method === "eth_estimateUserOperationGas") result = { preVerificationGas: "0x186a0", verificationGasLimit: "0x2625a0", callGasLimit: "0x2dc6c0" };
      else if (body.method === "eth_getUserOperationReceipt") result = null;
      else if (body.method === "eth_sendUserOperation") {
        const numbers = new Set(["nonce", "callGasLimit", "verificationGasLimit", "preVerificationGas", "maxFeePerGas", "maxPriorityFeePerGas"]);
        const op = JSON.parse(JSON.stringify(body.params[0]), (key, value) => numbers.has(key) ? BigInt(String(value)) : value);
        if (op.sender.toLowerCase() !== agent.address.toLowerCase()) throw new Error("REVIEW_SENDER_MISMATCH");
        result = getUserOperationHash({ userOperation: op, entryPointAddress: entryPoint.address, entryPointVersion: "0.7", chainId: 84532 });
        await client.waitForTransactionReceipt({ hash: await relayer.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "handleOps", args: [[toPackedUserOperation(op)], relayer.account.address], gas: 15000000n }) });
      } else return { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Unsupported isolated bundler method" } };
      return { jsonrpc: "2.0", id: body.id, result };
    });
    await bundler.listen({ host: "127.0.0.1", port: 0 });
    const key = accountKey(84532, agent.address), readPolicy = () => readPolicySnapshot(client, guardian.address, agent.address);
    assert.equal((await readPolicy()).balanceUnits, "10000000"); assert.equal((await readPolicy()).spentUnits, "0");
    const financial = await buildApp("http://localhost", {
      ownerAddress: owner.address, accountAddress: agent.address, guardianAddress: guardian.address, chainId: 84532, authDomain: "guardian-review-local-fork", store,
      planner: createQwenPlanner(qwenOptions), assistant: { qwen: new QwenClient(qwenOptions) }, readPolicy,
      readAssetMetadata: async (state) => ({ symbol: await token.read.symbol(), decimals: await token.read.decimals(), nativeBalanceWei: (await client.getBalance({ address: agent.address, blockNumber: BigInt(state.observedBlockNumber) })).toString() }),
      validatePlan: async (plan) => { await validatePaymentPlan(client, plan); },
      procurement: { qwen: new QwenClient(qwenOptions), provider: createProviderAgentClient({ baseUrl: agentUrl, token: agentToken }), service: createProviderServiceClient({ baseUrl: signerUrl, token: providerToken }), modelId: selectedModel.modelId },
    }, { provider: selectedModel.provider, modelId: selectedModel.modelId });
    resources.push(() => financial.close());
    const challenge = (await financial.inject({ method: "POST", url: "/auth/nonce", payload: { address: owner.address } })).json();
    const login = await financial.inject({ method: "POST", url: "/auth/verify", payload: { address: owner.address, nonce: challenge.nonce, signature: await owner.signMessage({ message: challenge.message }) } });
    assert.equal(login.statusCode, 200);
    trace("api-ready");
    const driver = createKernelPaymentDriver({ client, account: agent, guardianAddress: guardian.address, bundlerUrl: `http://127.0.0.1:${bundler.server.address().port}`, maxGasCostWei: 100000000000000000n, confirmations: 1 });
    const worker = new PaymentWorker(store, baseline, driver, key, randomUUID(), createProviderFulfillment({ baseUrl: signerUrl, token: providerToken, guardian: guardian.address, providerSigner: provider.address }), { maxBatchSize: 7, batchWindowMs: 1000 });
    await store.setPaused(key, true);
    loop = (async () => {
      while (!stopped) {
        try {
          const block = await client.getBlock(), now = Math.floor(Date.now() / 1000);
          if (BigInt(now) > block.timestamp) { await connection.provider.request({ method: "evm_setNextBlockTimestamp", params: [now] }); await connection.provider.request({ method: "evm_mine", params: [] }); }
          await worker.runOnce();
        } catch { await store.setPaused(key, true).catch(() => {}); }
        if (!stopped) await new Promise((resolve) => { const timer = setTimeout(resolve, 1000); wake = () => { clearTimeout(timer); resolve(); }; });
      }
    })();
    return { api: financial, token: login.json().token, ownerAddress: owner.address, accountAddress: agent.address, close };
  } catch (error) { await close(); throw error; }
}
