import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import { network } from "hardhat";
import { encodeAbiParameters, encodeFunctionData, erc20Abi, keccak256, toBytes, zeroAddress, BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { guardianAbi, getPaymentId, quoteTypedData, toContractQuote } from "@guardian-wallet/wallet";
import type { ServiceQuote } from "@guardian-wallet/shared";

export const policyComponents = [
  { name: "token", type: "address" }, { name: "quoteSigner", type: "address" }, { name: "pauseGuardian", type: "address" },
  { name: "protectedBalance", type: "uint256" }, { name: "perPaymentLimit", type: "uint256" }, { name: "dailyLimit", type: "uint256" },
  { name: "validAfter", type: "uint48" }, { name: "validUntil", type: "uint48" },
] as const;

async function fixture(t: TestContext, balance = 10000000n, adversarial = false) {
  const connection = await network.create();
  t.after(() => connection.close());
  const { viem } = connection;
  const client = await viem.getPublicClient();
  const [owner, recipient, recipient2, pauseGuardian, stranger] = await viem.getWalletClients();
  assert(owner && recipient && recipient2 && pauseGuardian && stranger);
  const signer = privateKeyToAccount(generatePrivateKey());
  const token = adversarial
    ? await viem.deployContract("AdversarialToken", [owner.account.address])
    : await viem.deployContract("MockUSD", [owner.account.address]);
  const guardian = await viem.deployContract("GuardianPayments");
  const account = await viem.deployContract("AccountHarness", [owner.account.address]);
  const now = Number((await client.getBlock()).timestamp);
  const rules = { token: token.address, quoteSigner: signer.address, pauseGuardian: pauseGuardian.account.address, protectedBalance: 6000000n, perPaymentLimit: 1000000n, dailyLimit: 2000000n, validAfter: now - 1, validUntil: now + 86400 };
  const recipients = [recipient.account.address, recipient2.account.address];
  const data = () => encodeAbiParameters([{ type: "tuple", components: policyComponents }, { type: "address[]" }], [rules, recipients]);
  await account.write.install([guardian.address, data()]);
  await owner.writeContract({ address: token.address, abi: erc20Abi, functionName: "transfer", args: [account.address, balance] });
  let sequence = 0;
  const chainId = await client.getChainId();
  async function quote(amount = 260000n, target: Address = recipient!.account.address): Promise<ServiceQuote> {
    const q = {
      account: account.address, providerId: keccak256(toBytes("provider-demo")), invoiceId: keccak256(toBytes(`invoice-${++sequence}`)),
      serviceHash: keccak256(toBytes("database:small:1h")), token: token.address, recipient: target,
      amountUnits: amount.toString(), validUntil: now + 600,
    };
    return { ...q, signature: await signer.signTypedData(quoteTypedData(chainId, guardian.address, q)) };
  }
  const callData = (quotes: ServiceQuote[], version = 1n, deadline = now + 600) => encodeFunctionData({ abi: guardianAbi, functionName: "executePayments", args: [quotes.map(toContractQuote), quotes.map((q) => q.signature), version, deadline] });
  const pay = (quotes: ServiceQuote[], version = 1n, deadline = now + 600) => account.write.callAsAccount([guardian.address, callData(quotes, version, deadline)]);
  async function reject(quotes: ServiceQuote[], errorName: string, version = 1n, deadline = now + 600) {
    const before = await token.read.balanceOf([account.address]);
    await assert.rejects(client.simulateContract({ address: guardian.address, abi: guardianAbi, account: account.address, functionName: "executePayments", args: [quotes.map(toContractQuote), quotes.map((q) => q.signature), version, deadline] }), (error: unknown) => {
      const cause = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
      assert(cause instanceof ContractFunctionRevertedError);
      assert.equal(cause.data?.errorName, errorName);
      return true;
    });
    await assert.rejects(pay(quotes, version, deadline));
    assert.equal(await token.read.balanceOf([account.address]), before);
  }
  return { connection, client, viem, owner, recipient, recipient2, pauseGuardian, stranger, signer, token, guardian, account, rules, recipients, now, chainId, quote, callData, pay, reject, data };
}

describe("GuardianPayments execution invariants (account harness, not Kernel evidence)", () => {
  it("settles 0.26 from account custody and matches the off-chain payment ID", async (t) => {
    const f = await fixture(t);
    const q = await f.quote();
    const hash = await f.pay([q]);
    assert.equal((await f.client.waitForTransactionReceipt({ hash })).status, "success");
    assert.equal(await f.token.read.balanceOf([f.account.address]), 9740000n);
    assert.equal(await f.token.read.balanceOf([f.recipient.account.address]), 260000n);
    assert.equal(await f.token.read.balanceOf([f.guardian.address]), 0n);
    assert.equal(await f.guardian.read.consumed([f.account.address, getPaymentId(f.chainId, q)]), true);
  });
  it("SEC-01 rejects a signed compromised-planner all-funds proposal", async (t) => {
    const f = await fixture(t);
    await f.reject([await f.quote(10000000n)], "PaymentLimit");
  });
  it("SEC-03 sums eight individually allowed invoices and rolls back replay IDs", async (t) => {
    const f = await fixture(t);
    const quotes = await Promise.all(Array.from({ length: 8 }, () => f.quote()));
    await f.reject(quotes, "DailyLimit");
    for (const q of quotes) assert.equal(await f.guardian.read.consumed([f.account.address, getPaymentId(f.chainId, q)]), false);
    await f.pay(quotes.slice(0, 7));
    await f.reject(quotes.slice(7), "DailyLimit");
  });
  it("SEC-04 isolates protected balance and permits an exact-floor payment", async (t) => {
    const f = await fixture(t, 6200000n);
    await f.reject([await f.quote()], "ProtectedBalance");
    await f.pay([await f.quote(200000n)]);
    assert.equal(await f.token.read.balanceOf([f.account.address]), 6000000n);
    await f.reject([await f.quote(1n)], "ProtectedBalance");
  });
  it("rejects duplicate IDs within a batch and across policy/session lifetimes", async (t) => {
    const f = await fixture(t);
    const q = await f.quote();
    await f.reject([q, q], "DuplicatePayment");
    await f.pay([q]);
    const configure = encodeFunctionData({ abi: guardianAbi, functionName: "configurePolicy", args: [f.rules, f.recipients] });
    await f.account.write.callAsAccount([f.guardian.address, configure]);
    await f.reject([q], "DuplicatePayment", 2n);
    const day = (await f.client.getBlock()).timestamp / 86400n;
    assert.equal(await f.guardian.read.spent([f.account.address, f.token.address, day]), 260000n);
    await f.account.write.uninstall();
    await f.account.write.install([f.guardian.address, f.data()]);
    const policy = await f.guardian.read.getPolicy([f.account.address]);
    assert.equal(policy.version, 3n);
    assert.equal(policy.paused, true);
    assert.equal(await f.guardian.read.consumed([f.account.address, getPaymentId(f.chainId, q)]), true);
  });
  it("checks exact per-payment limit, limit+1, batch size and policy version", async (t) => {
    const f = await fixture(t);
    await f.reject([await f.quote(1000001n)], "PaymentLimit");
    await f.reject([], "InvalidBatch");
    await f.reject(await Promise.all(Array.from({ length: 11 }, () => f.quote(100000n))), "InvalidBatch");
    await f.reject([await f.quote()], "StalePolicy", 2n);
    await f.pay([await f.quote(1000000n), await f.quote(1000000n)]);
    await f.reject([await f.quote(1n)], "DailyLimit");
  });
  it("rejects wrong recipient, forged signature, altered account and expired plan", async (t) => {
    const f = await fixture(t);
    await f.reject([await f.quote(260000n, f.stranger.account.address)], "RecipientDenied");
    const q = await f.quote();
    await f.reject([{ ...q, amountUnits: "270000" }], "InvalidQuote");
    await f.reject([{ ...q, account: f.owner.account.address }], "InvalidQuote");
    await f.reject([q], "Expired", 1n, f.now - 1);
    await f.connection.provider.request({ method: "evm_setNextBlockTimestamp", params: [f.now + 601] });
    await f.connection.provider.request({ method: "evm_mine", params: [] });
    await f.reject([q], "Expired", 1n, f.now + 700);
  });
  it("SEC-07 separates pause-only guardian from account unpause", async (t) => {
    const f = await fixture(t);
    const module = await f.viem.getContractAt("GuardianPayments", f.guardian.address, { client: { wallet: f.pauseGuardian } });
    await module.write.setPaused([f.account.address, true]);
    await f.reject([await f.quote()], "Paused");
    await assert.rejects(module.write.setPaused([f.account.address, false]));
    await f.account.write.callAsAccount([f.guardian.address, encodeFunctionData({ abi: guardianAbi, functionName: "setPaused", args: [f.account.address, false] })]);
    await f.pay([await f.quote()]);
  });
  it("REL-03 rolls back prior transfers and all counters when a token returns false", async (t) => {
    const f = await fixture(t, 10000000n, true);
    const bad = await f.viem.getContractAt("AdversarialToken", f.token.address);
    await bad.write.configure([f.recipient2.account.address, false, zeroAddress, "0x"]);
    const quotes = [await f.quote(), await f.quote(260000n, f.recipient2.account.address)];
    await f.reject(quotes, "InvalidTransfer");
    assert.equal(await f.token.read.balanceOf([f.recipient.account.address]), 0n);
    assert.equal(await f.guardian.read.consumed([f.account.address, getPaymentId(f.chainId, quotes[0]!)]), false);
  });
  it("checks the actual post-transfer outflow, including unsupported extra debits", async (t) => {
    const f = await fixture(t, 10000000n, true);
    const bad = await f.viem.getContractAt("AdversarialToken", f.token.address);
    await bad.write.configure([zeroAddress, true, zeroAddress, "0x"]);
    await f.reject([await f.quote()], "InvalidTransfer");
  });
  it("SEC-05 blocks cross-entry reentrancy during token interaction", async (t) => {
    const f = await fixture(t, 10000000n, true);
    const bad = await f.viem.getContractAt("AdversarialToken", f.token.address);
    const recursive = await f.quote();
    await f.account.write.setCallbackToken([f.token.address]);
    await bad.write.configure([zeroAddress, false, f.account.address, encodeFunctionData({ abi: f.account.abi, functionName: "callback", args: [f.guardian.address, f.callData([recursive])] })]);
    await f.pay([await f.quote()]);
    assert.equal(await bad.read.reentrySucceeded(), false);
    assert.equal(await f.guardian.read.consumed([f.account.address, getPaymentId(f.chainId, recursive)]), false);
  });
  it("retains cumulative usage over a policy update and resets only at UTC epoch", async (t) => {
    const f = await fixture(t);
    await f.pay([await f.quote(1000000n)]);
    const next = (Number((await f.client.getBlock()).timestamp) / 86400 | 0) * 86400 + 86400;
    // Extend policy/quote validity explicitly as the owner for the next UTC day.
    const rules = { ...f.rules, validUntil: next + 3600 };
    await f.account.write.callAsAccount([f.guardian.address, encodeFunctionData({ abi: guardianAbi, functionName: "configurePolicy", args: [rules, f.recipients] })]);
    await f.reject([await f.quote(1000001n)], "PaymentLimit", 2n);
    await f.pay([await f.quote(1000000n)], 2n);
    await f.reject([await f.quote(1n)], "DailyLimit", 2n);
    await f.connection.provider.request({ method: "evm_setNextBlockTimestamp", params: [next] });
    await f.connection.provider.request({ method: "evm_mine", params: [] });
    assert.equal(await f.guardian.read.spent([f.account.address, f.token.address, BigInt(next / 86400)]), 0n);
    const fresh = { ...await f.quote(), validUntil: next + 600 };
    fresh.signature = await f.signer.signTypedData(quoteTypedData(f.chainId, f.guardian.address, fresh));
    await f.pay([fresh], 2n, next + 600);
    assert.equal(await f.guardian.read.spent([f.account.address, f.token.address, BigInt(next / 86400)]), 260000n);
  });
});
