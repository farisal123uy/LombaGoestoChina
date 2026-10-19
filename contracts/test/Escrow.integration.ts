import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { network } from "hardhat";
import { encodeFunctionData, keccak256, parseEventLogs, toBytes } from "viem";
import { entryPoint07Abi, getUserOperationHash, toPackedUserOperation, type UserOperation } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createOwnerKernel, createAgentKernel, getGuardianSessionAuthorization, encodeGuardianInstall, encodeGuardianPolicyData, entryPoint, guardianAbi, quoteTypedData, toContractQuote, getPaymentId, escrowDeliveryTypedData } from "@guardian-wallet/wallet";
import type { ServiceQuote } from "@guardian-wallet/shared";

it("locks a quote in Guardian escrow, releases only with provider attestation, and refunds after timeout", { skip: !process.env.KERNEL_FORK_RPC_URL, timeout: 240000 }, async (t) => {
  const connection = await network.create("kernelFork"); t.after(() => connection.close());
  const client = await connection.viem.getPublicClient({ cacheTime: 0, pollingInterval: 20 });
  const [relayer] = await connection.viem.getWalletClients(); assert(relayer);
  const payer = relayer;
  const owner = privateKeyToAccount(generatePrivateKey()), sessionSigner = privateKeyToAccount(generatePrivateKey()), provider = privateKeyToAccount(generatePrivateKey()), wrongProvider = privateKeyToAccount(generatePrivateKey());
  const guardian = await connection.viem.deployContract("GuardianPayments"), token = await connection.viem.deployContract("MockUSD", [payer.account.address]);
  const chainNow = Number((await client.getBlock()).timestamp), validUntil = chainNow + 3600;
  const rules = { token: token.address, quoteSigner: provider.address, pauseGuardian: owner.address, protectedBalance: 6000000n, perPaymentLimit: 1000000n, dailyLimit: 2000000n, validAfter: chainNow - 1, validUntil };
  const policy = encodeGuardianPolicyData(rules, [provider.address]);
  const ownerAccount = await createOwnerKernel(client, owner, [encodeGuardianInstall(guardian.address, policy)], BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`));
  const factory = await ownerAccount.getFactoryArgs(); assert(factory.factory && factory.factoryData);
  await client.waitForTransactionReceipt({ hash: await payer.sendTransaction({ to: factory.factory, data: factory.factoryData, gas: 5000000n }) });
  await token.write.transfer([ownerAccount.address, 10000000n]);
  await connection.provider.request({ method: "hardhat_setBalance", params: [ownerAccount.address, "0xDE0B6B3A7640000"] });
  const sessionAuth = await getGuardianSessionAuthorization(client, ownerAccount.address, owner.address, sessionSigner.address, guardian.address, validUntil, true);
  const enableSignature = await owner.signTypedData(sessionAuth.typedData);
  const agent = await createAgentKernel(client, ownerAccount.address, sessionSigner, guardian.address, validUntil, enableSignature, true);
  let invoice = 0;

  async function makeQuote(): Promise<ServiceQuote> {
    const unsigned = { account: ownerAccount.address, providerId: keccak256(toBytes("escrow-poc-provider")), invoiceId: keccak256(toBytes(`escrow-poc-invoice-${++invoice}`)), serviceHash: keccak256(toBytes("database-small-1h")), token: token.address, recipient: provider.address, amountUnits: "260000", validUntil };
    return { ...unsigned, signature: await provider.signTypedData(quoteTypedData(84532, guardian.address, unsigned)) };
  }

  async function submitLock(quote: ServiceQuote, refundAfter: number) {
    const data = encodeFunctionData({ abi: guardianAbi, functionName: "lockPayment", args: [toContractQuote(quote), quote.signature, 1n, validUntil, refundAfter] });
    const operation: UserOperation<"0.7"> = { sender: agent.address, nonce: await agent.getNonce(), callData: await agent.encodeCalls([{ to: guardian.address, data }]), callGasLimit: 3500000n, verificationGasLimit: 2500000n, preVerificationGas: 100000n, maxFeePerGas: 2000000000n, maxPriorityFeePerGas: 1000000000n, signature: "0x" };
    const userOpHash = getUserOperationHash({ userOperation: operation, entryPointAddress: entryPoint.address, entryPointVersion: "0.7", chainId: 84532 });
    operation.signature = await agent.signUserOperation(operation);
    const transactionHash = await payer.writeContract({ address: entryPoint.address, abi: entryPoint07Abi, functionName: "handleOps", args: [[toPackedUserOperation(operation)], payer.account.address], gas: 15000000n });
    const receipt = await client.waitForTransactionReceipt({ hash: transactionHash }); assert.equal(receipt.status, "success");
    const operationEvent = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs }).find((event) => event.args.userOpHash.toLowerCase() === userOpHash.toLowerCase());
    assert.equal(operationEvent?.args.success, true, "escrow locking UserOperation must succeed");
    return receipt;
  }

  const first = await makeQuote(), firstId = getPaymentId(84532, first), firstRefundAfter = chainNow + 600;
  const lockReceipt = await submitLock(first, firstRefundAfter);
  assert.equal(await token.read.balanceOf([ownerAccount.address]), 9740000n);
  assert.equal(await token.read.balanceOf([guardian.address]), 260000n);
  assert.equal(await token.read.balanceOf([provider.address]), 0n);
  assert.equal((await guardian.read.escrows([firstId]))[11], 1);
  assert.equal(await guardian.read.pendingEscrows([ownerAccount.address]), 1n);
  t.diagnostic(JSON.stringify({ phase: "locked", paymentId: firstId, lockTransactionHash: lockReceipt.transactionHash, accountBalance: "9740000", escrowBalance: "260000", providerBalance: "0", refundAfter: firstRefundAfter }));

  const readyAt = Number((await client.getBlock()).timestamp), serviceExpiresAt = readyAt + 3600;
  const attestation = { paymentId: firstId, account: ownerAccount.address, invoiceId: first.invoiceId, serviceHash: first.serviceHash, transactionHash: lockReceipt.transactionHash, readyAt, serviceExpiresAt };
  const invalidSignature = await wrongProvider.signTypedData(escrowDeliveryTypedData(84532, guardian.address, attestation));
  await assert.rejects(guardian.write.releaseEscrow([firstId, lockReceipt.transactionHash, readyAt, serviceExpiresAt, invalidSignature]));
  assert.equal((await guardian.read.escrows([firstId]))[11], 1, "invalid attestation leaves funds locked");
  const validSignature = await provider.signTypedData(escrowDeliveryTypedData(84532, guardian.address, attestation));
  const releaseHash = await guardian.write.releaseEscrow([firstId, lockReceipt.transactionHash, readyAt, serviceExpiresAt, validSignature]);
  await client.waitForTransactionReceipt({ hash: releaseHash });
  assert.equal((await guardian.read.escrows([firstId]))[11], 2);
  assert.equal(await guardian.read.pendingEscrows([ownerAccount.address]), 0n);
  assert.equal(await token.read.balanceOf([guardian.address]), 0n);
  assert.equal(await token.read.balanceOf([provider.address]), 260000n);
  t.diagnostic(JSON.stringify({ phase: "released", paymentId: firstId, transactionHash: releaseHash, providerBalance: "260000" }));

  const second = await makeQuote(), secondId = getPaymentId(84532, second), secondRefundAfter = Number((await client.getBlock()).timestamp) + 120;
  await submitLock(second, secondRefundAfter);
  assert.equal(await token.read.balanceOf([ownerAccount.address]), 9480000n);
  assert.equal(await token.read.balanceOf([guardian.address]), 260000n);
  await assert.rejects(guardian.write.refundEscrow([secondId]));
  await connection.provider.request({ method: "evm_setNextBlockTimestamp", params: [secondRefundAfter + 1] });
  await connection.provider.request({ method: "evm_mine", params: [] });
  const refundHash = await guardian.write.refundEscrow([secondId]); await client.waitForTransactionReceipt({ hash: refundHash });
  assert.equal((await guardian.read.escrows([secondId]))[11], 3);
  assert.equal(await guardian.read.pendingEscrows([ownerAccount.address]), 0n);
  assert.equal(await token.read.balanceOf([guardian.address]), 0n);
  assert.equal(await token.read.balanceOf([ownerAccount.address]), 9740000n, "refund restores the account balance and reserve");
  assert.equal(await guardian.read.spent([ownerAccount.address, token.address, BigInt(Math.floor(chainNow / 86400))]), 260000n, "same-day refund releases only the refunded daily budget");
  await assert.rejects(guardian.write.releaseEscrow([secondId, lockReceipt.transactionHash, readyAt, serviceExpiresAt, validSignature]));
  t.diagnostic(JSON.stringify({ phase: "refunded", paymentId: secondId, transactionHash: refundHash, accountBalance: "9740000", spentToday: "260000", guardianBalance: "0" }));
});
