import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { network } from "hardhat";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { erc20Abi, parseEventLogs, keccak256, toBytes } from "viem";
import { entryPoint07Abi, toPackedUserOperation, type UserOperation } from "viem/account-abstraction";
import { createAgentKernel, createKernelPaymentDriver, entryPoint, guardianAbi, operationHash, quoteTypedData, readPolicySnapshot } from "@guardian-wallet/wallet";
import { BoundedPaymentPlanner } from "@guardian-wallet/planner";
import type { PaymentTask } from "@guardian-wallet/shared";
import { OnboardingJournal, OnboardingService, buildOnboardingApp } from "../../apps/api/src/onboarding.js";

it("sponsored owner bootstrap + scoped worker payment with zero owner/account ETH", { skip: !process.env.KERNEL_FORK_RPC_URL, timeout: 240000 }, async (t) => {
  const connection = await network.create("kernelFork");
  t.after(() => connection.close());
  const client = await connection.viem.getPublicClient({ cacheTime: 0, pollingInterval: 20 });
  const [relayer] = await connection.viem.getWalletClients();
  assert(relayer);
  const bundler = relayer;
  const owner = privateKeyToAccount(generatePrivateKey()), provider = privateKeyToAccount(generatePrivateKey()), session = privateKeyToAccount(generatePrivateKey()), attacker = privateKeyToAccount(generatePrivateKey());
  const paymaster = await connection.viem.deployContract("TestNativePaymaster", [entryPoint.address]);
  await bundler.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "depositTo", args: [paymaster.address], value: 500000000000000000n });
  const { artifacts } = await import("hardhat");
  const guardian = await artifacts.readArtifact("GuardianPayments"), token = await artifacts.readArtifact("GuardianDemoToken");
  let sendCount = 0;
  let loseFirstResponse = true;
  const quoteModes: boolean[] = [];
  const rpc = createServer(async (request, response) => {
    try {
      let text = ""; for await (const chunk of request) text += String(chunk);
      const body = JSON.parse(text) as { id: number; method: string; params: unknown[] };
      let result: unknown;
      if (body.method === "eth_chainId") result = "0x14a34";
      else if (body.method === "eth_getUserOperationReceipt") result = null;
      else if (body.method === "eth_estimateUserOperationGas") result = { preVerificationGas: "0x186a0", verificationGasLimit: "0x2625a0", callGasLimit: "0x4c4b40", paymasterVerificationGasLimit: "0xf4240", paymasterPostOpGasLimit: "0x186a0" };
      else if (body.method === "zd_sponsorUserOperation") {
        const options = body.params[0] as { shouldConsume: boolean };
        quoteModes.push(options.shouldConsume);
        result = { preVerificationGas: "0x186a0", verificationGasLimit: "0x2625a0", callGasLimit: "0x4c4b40", paymaster: paymaster.address, paymasterData: "0x", paymasterVerificationGasLimit: "0xf4240", paymasterPostOpGasLimit: "0x186a0" };
      } else if (body.method === "eth_sendUserOperation") {
        const numbers = new Set(["nonce", "callGasLimit", "verificationGasLimit", "preVerificationGas", "maxFeePerGas", "maxPriorityFeePerGas", "paymasterVerificationGasLimit", "paymasterPostOpGasLimit"]);
        const op = JSON.parse(JSON.stringify(body.params[0]), (key, value: unknown) => numbers.has(key) ? BigInt(String(value)) : value) as UserOperation<"0.7">;
        const tx = await bundler.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "handleOps", args: [[toPackedUserOperation(op)], bundler.account.address], gas: 15000000n });
        const receipt = await client.waitForTransactionReceipt({ hash: tx });
        const event = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs }).find((e) => e.args.userOpHash === operationHash(op, 84532));
        if (!event?.args.success) throw new Error("EXPECTED_SUCCESSFUL_USER_OPERATION");
        sendCount++;
        if (loseFirstResponse) { loseFirstResponse = false; response.destroy(); return; }
        result = operationHash(op, 84532);
      } else throw new Error("UNSUPPORTED_TEST_METHOD");
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    } catch { response.statusCode = 500; response.end('{"error":"SPONSORED_TEST_RPC_FAILED"}'); }
  });
  await new Promise<void>((resolve) => rpc.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => rpc.close((error) => error ? reject(error) : resolve())));
  const endpoint = rpc.address(); assert(endpoint && typeof endpoint !== "string");
  const url = `http://127.0.0.1:${endpoint.port}`;
  const directory = await mkdtemp(join(tmpdir(), "guardian-owner-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const journal = new OnboardingJournal(join(directory, "operations.json"));
  let synchronized = 0;
  const options = {
    client, configuration: { owner: owner.address, providerSigner: provider.address, recipient: provider.address, sessionSigner: session.address, validUntil: Number((await client.getBlock()).timestamp) + 86400, guardianBytecode: guardian.bytecode, tokenBytecode: token.bytecode },
    bundlerUrl: url, sponsorship: { approvedPaymaster: paymaster.address }, maxGasCostWei: 100000000000000000n, confirmations: 1,
    journal, syncRuntime: async () => { synchronized++; },
  };
  const service = new OnboardingService(options);
  const app = await buildOnboardingApp(service, owner.address);
  t.after(() => app.close());
  assert.equal((await app.inject({ method: "POST", url: "/prepare", headers: { origin: "https://attacker.example" }, payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/prepare", payload: {} })).statusCode, 401);
  const challenge = (await app.inject({ method: "POST", url: "/auth/nonce", payload: { address: owner.address } })).json<{ nonce: string; message: string }>();
  const login = (await app.inject({ method: "POST", url: "/auth/verify", payload: { address: owner.address, nonce: challenge.nonce, signature: await owner.signMessage({ message: challenge.message }) } })).json<{ token: string }>();
  const headers = { authorization: `Bearer ${login.token}` };
  const before = await service.status();
  assert.equal(await client.getBalance({ address: owner.address }), 0n);
  assert.equal(await client.getBalance({ address: before.kernel }), 0n);
  const prepared = await service.prepare();
  assert(prepared.operation);
  assert.equal(quoteModes.includes(false), true);
  assert.equal(quoteModes.includes(true), true);
  const bad = await attacker.signMessage({ message: { raw: prepared.operation.hash } });
  await assert.rejects(service.submit(prepared.operation.id, bad), /ONBOARDING_OWNER_SIGNATURE_INVALID/);
  assert.equal(sendCount, 0);
  const signature = await owner.signMessage({ message: { raw: prepared.operation.hash } });
  assert.equal((await app.inject({ method: "POST", url: "/submit", headers, payload: { id: prepared.operation.id, signature, callData: "0xdeadbeef" } })).statusCode, 400);
  const sent = await service.submit(prepared.operation.id, signature);
  assert.equal(sent.operation?.status, "unknown");
  const restarted = new OnboardingService(options);
  const confirmed = await restarted.reconcile();
  assert.equal(confirmed.operation?.status, "confirmed");
  assert.equal(confirmed.ready, true);
  await restarted.submit(prepared.operation.id, signature);
  assert.equal(sendCount, 1, "duplicate request/restart must not send again");
  assert.equal(await client.getBalance({ address: confirmed.kernel }), 0n);
  assert.equal(await client.getBalance({ address: owner.address }), 0n);
  assert.equal(await client.readContract({ address: confirmed.token, abi: erc20Abi, functionName: "balanceOf", args: [confirmed.kernel] }), 10000000n);
  const policy = await client.readContract({ address: confirmed.guardian, abi: guardianAbi, functionName: "getPolicy", args: [confirmed.kernel] });
  assert.equal(policy.rules.protectedBalance, 6000000n);
  assert.equal(policy.rules.dailyLimit, 2000000n);
  const browserAuthorization = await app.inject({ method: "POST", url: "/session/authorization", headers, payload: {} });
  assert.equal(browserAuthorization.statusCode, 200);
  assert.equal(typeof browserAuthorization.json<{ typedData: { domain: { chainId: unknown } } }>().typedData.domain.chainId !== "bigint", true);
  const jsonAuthorization = JSON.parse(browserAuthorization.body) as Awaited<ReturnType<typeof restarted.authorization>>;
  const enableSignature = await owner.signTypedData(jsonAuthorization.typedData);
  const delegated = await restarted.authorizeSession(enableSignature);
  assert.equal(delegated.runtimeConfigured, true);
  assert.equal(synchronized, 1);
  const view = JSON.stringify(delegated);
  assert.equal(view.includes(enableSignature), false);
  assert.equal(view.includes("paymasterData"), false);

  const q = { account: confirmed.kernel, providerId: keccak256(toBytes("provider")), invoiceId: keccak256(toBytes(randomUUID())), serviceHash: keccak256(toBytes("database")), token: confirmed.token, recipient: provider.address, amountUnits: "260000", validUntil: options.configuration.validUntil };
  const quote = { ...q, signature: await provider.signTypedData(quoteTypedData(84532, confirmed.guardian, q)) };
  const task: PaymentTask = { id: randomUUID(), chainId: 84532, owner: owner.address, paymentId: keccak256(toBytes("payment")), instruction: "Buy database", quote, status: "queued", createdAt: new Date().toISOString() };
  const outcome = await new BoundedPaymentPlanner().plan(task, await readPolicySnapshot(client, confirmed.guardian, confirmed.kernel));
  assert.equal(outcome.status, "planned"); if (outcome.status !== "planned") throw new Error("EXPECTED_PLAN");
  const account = await createAgentKernel(client, confirmed.kernel, session, confirmed.guardian, options.configuration.validUntil, enableSignature);
  const driver = createKernelPaymentDriver({ client, account, guardianAddress: confirmed.guardian, bundlerUrl: url, sponsorship: { approvedPaymaster: paymaster.address }, maxGasCostWei: 100000000000000000n, confirmations: 1 });
  await driver.validate(outcome.plan);
  const payment = await driver.prepare(outcome.plan);
  assert.equal(await driver.submit(payment.signedPayload), payment.attempt.userOperationHash);
  const result = await driver.reconcile(payment.attempt, outcome.plan);
  assert.equal(result.status, "confirmed");
  assert.equal(await client.readContract({ address: confirmed.token, abi: erc20Abi, functionName: "balanceOf", args: [confirmed.kernel] }), 9740000n);
  assert.equal(await client.getBalance({ address: confirmed.kernel }), 0n);
  assert.equal(await client.getBalance({ address: owner.address }), 0n);
  t.diagnostic(JSON.stringify({ evidenceType: "local-fork-with-fixture-paymaster-not-public-sponsorship", bootstrapTransactionHash: confirmed.operation?.transactionHash, workerTransactionHash: result.transactionHash, ownerEth: "0", kernelEth: "0", kernelMockUsdUnits: "9740000", sends: sendCount }));
});
