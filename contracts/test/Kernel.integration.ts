import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { network } from "hardhat";
import { KernelV3_1AccountAbi } from "@zerodev/sdk";
import { encodeFunctionData, parseEventLogs, keccak256, toBytes, hashMessage, erc20Abi, zeroAddress, BaseError, ContractFunctionRevertedError, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { entryPoint07Abi, getUserOperationHash, toPackedUserOperation, type UserOperation } from "viem/account-abstraction";
import { createOwnerKernel, getGuardianSessionAuthorization, createAgentKernel, encodeGuardianInstall, encodeGuardianPolicyData, encodeRevokeSessions, entryPoint, kernelVersion, guardianAbi, quoteTypedData, toContractQuote, getPaymentId, createKernelPaymentDriver, readPolicySnapshot } from "@guardian-wallet/wallet";
import { PaymentStore, accountKey, type QueryDatabase } from "@guardian-wallet/database";
import { BoundedPaymentPlanner } from "@guardian-wallet/planner";
import { PaymentWorker } from "../../apps/worker/src/worker.js";
import type { ServiceQuote, PaymentTask } from "@guardian-wallet/shared";
import { applyTestMigrations } from "../../tests/helpers/migrations.js";

// Opt-in: this is real deployed Kernel/EntryPoint code on a LOCAL chain fork,
// not a public Base Sepolia transaction and not a unit account harness.
it("Kernel 0.3.1 / EntryPoint 0.7: restricted session, signed quote, bypass rejection and revoke", {
  skip: !process.env.KERNEL_FORK_RPC_URL, timeout: 240000,
}, async (t) => {
  const connection = await network.create("kernelFork");
  t.after(() => connection.close());
  const client = await connection.viem.getPublicClient();
  const [relayer, recipient] = await connection.viem.getWalletClients();
  assert(relayer && recipient);
  const bundler = relayer;
  const owner = privateKeyToAccount(generatePrivateKey());
  const sessionSigner = privateKeyToAccount(generatePrivateKey());
  const provider = privateKeyToAccount(generatePrivateKey());
  const guardian = await connection.viem.deployContract("GuardianPayments");
  const token = await connection.viem.deployContract("MockUSD", [relayer.account.address]);
  const now = Number((await client.getBlock()).timestamp);
  const until = now + 3600;
  const policyData = encodeGuardianPolicyData({
    token: token.address, quoteSigner: provider.address, pauseGuardian: owner.address,
    protectedBalance: 6000000n, perPaymentLimit: 1000000n, dailyLimit: 2000000n, validAfter: now - 1, validUntil: until,
  }, [recipient.account.address]);
  const ownerAccount = await createOwnerKernel(client, owner, [encodeGuardianInstall(guardian.address, policyData)], 7341n);
  const factory = await ownerAccount.getFactoryArgs();
  assert(factory.factory && factory.factoryData);
  const deployHash = await relayer.sendTransaction({ to: factory.factory, data: factory.factoryData, gas: 5000000n });
  assert.equal((await client.waitForTransactionReceipt({ hash: deployHash })).status, "success");
  assert.equal(await client.readContract({ address: ownerAccount.address, abi: KernelV3_1AccountAbi, functionName: "accountId" }), "kernel.advanced.v0.3.1");
  await token.write.transfer([ownerAccount.address, 10000000n]);
  await connection.provider.request({ method: "hardhat_setBalance", params: [ownerAccount.address, "0xDE0B6B3A7640000"] });

  const authorization = await getGuardianSessionAuthorization(client, ownerAccount.address, owner.address, sessionSigner.address, guardian.address, until);
  const enableSignature = await owner.signTypedData(authorization.typedData);
  const enablingAccount = await createAgentKernel(client, ownerAccount.address, sessionSigner, guardian.address, until, enableSignature);
  type Account = typeof ownerAccount;
  const evidence: { label: string; userOperationHash: Hex; transactionHash?: Hex; success: boolean; rejection?: string }[] = [];
  async function send(account: Account, callData: Hex, label: string) {
    const operation: UserOperation<"0.7"> = {
      sender: account.address, nonce: await account.getNonce(), callData,
      callGasLimit: 2000000n, verificationGasLimit: 2500000n, preVerificationGas: 100000n,
      maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n, signature: "0x",
    };
    const hash = getUserOperationHash({ userOperation: operation, entryPointAddress: entryPoint.address, entryPointVersion: "0.7", chainId: 84532 });
    operation.signature = await account.signUserOperation(operation);
    let tx: Hex;
    try {
      tx = await bundler.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "handleOps", args: [[toPackedUserOperation(operation)], bundler.account.address], gas: 10000000n });
    } catch (error) {
      const cause = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
      // Only a decoded EntryPoint rejection counts as rejection evidence. RPC
      // timeouts, missing telemetry and other infrastructure errors fail the test.
      if (!(cause instanceof ContractFunctionRevertedError) || !["FailedOp", "FailedOpWithRevert"].includes(cause.data?.errorName ?? "")) throw error;
      evidence.push({ label, userOperationHash: hash, success: false, rejection: cause.data!.errorName });
      return { success: false, receipt: undefined, event: undefined };
    }
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    const events = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs });
    const event = events.find((e) => e.args.userOpHash.toLowerCase() === hash.toLowerCase());
    const success = receipt.status === "success" && event?.args.success === true;
    evidence.push({ label, userOperationHash: hash, transactionHash: tx, success });
    return { success, receipt, event };
  }
  let invoice = 0;
  async function quote(amount = 260000n): Promise<ServiceQuote> {
    const q = { account: ownerAccount.address, providerId: keccak256(toBytes("cloud-demo")), invoiceId: keccak256(toBytes(`fork-${++invoice}`)), serviceHash: keccak256(toBytes("database")), token: token.address, recipient: recipient!.account.address, amountUnits: amount.toString(), validUntil: until };
    return { ...q, signature: await provider.signTypedData(quoteTypedData(84532, guardian.address, q)) };
  }
  const paymentData = (q: ServiceQuote) => encodeFunctionData({ abi: guardianAbi, functionName: "executePayments", args: [[toContractQuote(q)], [q.signature], 1n, until] });
  const allowed = await quote();
  const first = await send(enablingAccount, await enablingAccount.encodeCalls([{ to: guardian.address, data: paymentData(allowed) }]), "allowed-session-payment");
  assert.equal(first.success, true, "first session operation must enable permission and settle");
  assert.equal(await token.read.balanceOf([ownerAccount.address]), 9740000n);
  assert.equal(await token.read.balanceOf([guardian.address]), 0n);

  // Worker-style account: session signer only, no owner signer or enable signature.
  const agent = await createAgentKernel(client, ownerAccount.address, sessionSigner, guardian.address, until);
  for (const [name, target, data] of [
    ["direct-transfer-denied", token.address, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient.account.address, 1n] })],
    ["infinite-approval-denied", token.address, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [recipient.account.address, 2n ** 256n - 1n] })],
    ["policy-admin-denied", guardian.address, encodeFunctionData({ abi: guardianAbi, functionName: "setPaused", args: [ownerAccount.address, false] })],
  ] as const) {
    assert.equal((await send(agent, await agent.encodeCalls([{ to: target, data }]), name)).success, false);
  }
  const malicious = await quote(10000000n);
  const drain = await send(agent, await agent.encodeCalls([{ to: guardian.address, data: paymentData(malicious) }]), "SEC-01-compromised-planner-fixture");
  assert.equal(drain.receipt?.status, "success", "outer bundler tx succeeds while the UserOperation execution reverts");
  assert.equal(drain.event?.args.success, false);
  assert.equal(await token.read.balanceOf([ownerAccount.address]), 9740000n);
  assert.equal(await guardian.read.consumed([ownerAccount.address, getPaymentId(84532, malicious)]), false);
  assert.equal(await token.read.allowance([ownerAccount.address, recipient.account.address]), 0n);

  // A mixed batch cannot hide an approval behind an otherwise allowed call.
  assert.equal((await send(agent, await agent.encodeCalls([
    { to: guardian.address, data: paymentData(await quote()) },
    { to: token.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [recipient.account.address, 1n] }) },
  ]), "mixed-batch-bypass-denied")).success, false);
  const signatureMessage = "permit-like arbitrary authorization";
  const signature = await agent.signMessage({ message: signatureMessage });
  await assert.rejects(client.readContract({ address: ownerAccount.address, abi: KernelV3_1AccountAbi, functionName: "isValidSignature", args: [hashMessage(signatureMessage), signature] }), (error: unknown) => {
    const cause = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
    assert(cause instanceof ContractFunctionRevertedError);
    assert.equal(cause.data?.errorName, "PermissionNotAlllowedForSignature");
    return true;
  });

  // Real SDK -> signed operation -> EntryPoint -> Kernel -> Guardian, using a
  // local bundler stub with explicit static gas estimates. Deliberately lose
  // the send response AFTER inclusion; the real driver must recover via logs.
  let sends = 0;
  const rpc = createServer(async (request, response) => {
    try {
      let text = "";
      for await (const chunk of request) text += String(chunk);
      const body = JSON.parse(text) as { id: number; method: string; params: unknown[] };
      let result: unknown;
      if (body.method === "eth_chainId") result = "0x14a34";
      else if (body.method === "eth_estimateUserOperationGas") result = { preVerificationGas: "0x186a0", verificationGasLimit: "0x2625a0", callGasLimit: "0x1e8480" };
      else if (body.method === "eth_getUserOperationReceipt") result = null;
      else if (body.method === "eth_sendUserOperation") {
        const numericFields = new Set(["nonce", "callGasLimit", "verificationGasLimit", "preVerificationGas", "maxFeePerGas", "maxPriorityFeePerGas"]);
        const operation = JSON.parse(JSON.stringify(body.params[0]), (name, value: unknown) => numericFields.has(name) ? BigInt(String(value)) : value) as UserOperation<"0.7">;
        const tx = await bundler.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "handleOps", args: [[toPackedUserOperation(operation)], bundler.account.address], gas: 10000000n });
        await client.waitForTransactionReceipt({ hash: tx });
        sends += 1;
        response.destroy();
        return;
      } else throw new Error("UNSUPPORTED_TEST_BUNDLER_METHOD");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    } catch {
      response.statusCode = 500;
      response.end('{"error":"TEST_BUNDLER_FAILED"}');
    }
  });
  await new Promise<void>((resolve) => { rpc.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise<void>((resolve, reject) => rpc.close((error) => error ? reject(error) : resolve())));
  const address = rpc.address();
  assert(address && typeof address !== "string");
  const sql = new PGlite();
  t.after(() => sql.close());
  await applyTestMigrations(sql);
  function wrap(db: PGlite | Transaction): QueryDatabase {
    return {
      query: async <T extends object>(statement: string, parameters: (string | number | boolean | null)[] = []) => (await db.query<T>(statement, parameters)).rows,
      transaction: async (body) => {
        if (!(db instanceof PGlite)) throw new Error("NESTED_TRANSACTION");
        return db.transaction((tx) => body(wrap(tx)));
      },
    };
  }
  const store = new PaymentStore(wrap(sql));
  const taskQuote = await quote();
  const task: PaymentTask = { id: randomUUID(), chainId: 84532, owner: owner.address, paymentId: getPaymentId(84532, taskQuote), instruction: "Buy database capacity.", quote: taskQuote, status: "queued", createdAt: new Date().toISOString() };
  const planner = new BoundedPaymentPlanner();
  const planned = await planner.plan(task, await readPolicySnapshot(client, guardian.address, ownerAccount.address));
  assert.equal(planned.status, "planned");
  if (planned.status !== "planned") throw new Error("EXPECTED_PLAN");
  await store.createTask({ ...task, status: "planned", plan: planned.plan });
  const key = accountKey(84532, ownerAccount.address);
  await store.setPaused(key, false);
  const driver = createKernelPaymentDriver({ client, account: agent, guardianAddress: guardian.address, bundlerUrl: `http://127.0.0.1:${address.port}`, maxGasCostWei: 100000000000000000n, confirmations: 1 });
  const worker = new PaymentWorker(store, planner, driver, key, randomUUID());
  assert.equal(await worker.runOnce(), "unknown");
  assert.equal((await store.getAttempt(task.id, owner.address))?.status, "unknown");
  const restarted = new PaymentWorker(store, planner, driver, key, randomUUID());
  assert.equal(await restarted.runOnce(), "confirmed");
  assert.equal((await store.getTask(task.id, owner.address))?.status, "paid");
  assert.equal(sends, 1, "restart must not resubmit or sign a second operation");
  const recovered = await store.getAttempt(task.id, owner.address);
  t.diagnostic(JSON.stringify({ evidenceType: "local-fork-with-PGlite-and-stub-bundler-static-gas", case: "REL-02", status: "paid", sends, userOperationHash: recovered?.userOperationHash, transactionHash: recovered?.transactionHash }));

  const nonce = await client.readContract({ address: ownerAccount.address, abi: KernelV3_1AccountAbi, functionName: "currentNonce" });
  assert.equal((await send(ownerAccount, encodeRevokeSessions(nonce), "owner-revokes-sessions")).success, true);
  assert.equal((await send(agent, await agent.encodeCalls([{ to: guardian.address, data: paymentData(await quote()) }]), "revoked-session-denied")).success, false);
  assert.equal(await token.read.balanceOf([ownerAccount.address]), 9480000n);
  t.diagnostic(JSON.stringify({ evidenceType: "local-fork-not-public-transactions", forkBlock: 48189742, kernelVersion, entryPoint: entryPoint.address, account: ownerAccount.address, guardian: guardian.address, token: token.address, evidence }));
  assert.notEqual(guardian.address, zeroAddress as Address);
});
