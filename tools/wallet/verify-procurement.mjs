import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { erc20Abi, parseEventLogs, verifyTypedData } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { z } from "zod";
import { accountKey, createPostgresPaymentStore } from "@guardian-wallet/database";
import { deliveryReceiptSchema, paymentPlanSchema, serviceQuoteSchema } from "@guardian-wallet/shared";
import { createDevelopmentPublicClient, createProviderServiceClient, deliveryTypedData, entryPoint, getPaymentId, getServiceOffer, guardianAbi, invoiceId, providerId, quoteHash, quoteTypedData, readPolicySnapshot, serviceHash } from "@guardian-wallet/wallet";
import { readEnvironment, root, verifyProject } from "../services/config.mjs";

let database;
const equal = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
function requireCheck(value, code) { if (!value) throw new Error(code); }

try {
  const args = process.argv.slice(2);
  requireCheck(args.every((arg) => ["--record", "--write-read"].includes(arg) || arg.startsWith("--task=")), "INVALID_PROCUREMENT_VERIFICATION_ARGUMENT");
  requireCheck(args.filter((arg) => arg.startsWith("--task=")).length <= 1, "INVALID_TASK_ARGUMENT");
  const requestedId = args.find((arg) => arg.startsWith("--task="))?.slice(7);
  if (requestedId) z.string().uuid().parse(requestedId);
  await verifyProject();
  const api = await readEnvironment("api");
  requireCheck(api.DATABASE_URL && api.BASE_SEPOLIA_RPC_URL && api.OWNER_ADDRESS && api.KERNEL_ACCOUNT_ADDRESS && api.GUARDIAN_ADDRESS, "FINANCIAL_CONFIGURATION_REQUIRED");
  const deployment = JSON.parse(await readFile(join(root, ".local/onboarding/deployment.json"), "utf8"));
  requireCheck(equal(api.OWNER_ADDRESS, deployment.owner) && equal(api.KERNEL_ACCOUNT_ADDRESS, deployment.kernel) && equal(api.GUARDIAN_ADDRESS, deployment.guardian), "DEPLOYMENT_CONFIGURATION_MISMATCH");
  database = createPostgresPaymentStore(api.DATABASE_URL);
  const tasks = await database.store.listTasks(api.OWNER_ADDRESS);
  const task = requestedId ? await database.store.getTask(requestedId, api.OWNER_ADDRESS) : tasks.find((item) => item.status === "completed" && item.offerId);
  requireCheck(task?.status === "completed" && task.delivery && task.offerId && task.requestId, "COMPLETED_PROCUREMENT_TASK_REQUIRED");
  const attempt = await database.store.getAttempt(task.id, api.OWNER_ADDRESS);
  requireCheck(attempt?.status === "confirmed" && attempt.transactionHash, "CONFIRMED_PAYMENT_ATTEMPT_REQUIRED");
  const quote = serviceQuoteSchema.parse(task.quote), plan = paymentPlanSchema.parse(task.plan), delivery = deliveryReceiptSchema.parse(task.delivery);
  const offer = getServiceOffer(task.offerId), id = getPaymentId(84532, quote);
  requireCheck(task.chainId === 84532 && plan.chainId === 84532 && plan.taskId === task.id && equal(plan.account, deployment.kernel) && equal(plan.guardianAddress, deployment.guardian) && equal(quote.account, deployment.kernel) && equal(attempt.sender, deployment.kernel), "PROCUREMENT_ACCOUNT_BINDING_FAILED");
  requireCheck(id === task.paymentId && quote.providerId === providerId && quote.invoiceId === invoiceId(deployment.kernel, task.requestId) && quote.serviceHash === serviceHash(offer.id) && quote.amountUnits === offer.amountUnits && equal(quote.token, deployment.token) && equal(quote.recipient, deployment.recipient), "PROCUREMENT_OFFER_BINDING_FAILED");
  requireCheck(plan.quotes.some((item) => quoteHash(84532, deployment.guardian, item) === quoteHash(84532, deployment.guardian, quote)), "DURABLE_PLAN_QUOTE_MISMATCH");

  const client = createDevelopmentPublicClient(api.BASE_SEPOLIA_RPC_URL);
  requireCheck(await client.getChainId() === 84532, "WRONG_CHAIN");
  const receipt = await client.getTransactionReceipt({ hash: attempt.transactionHash });
  const [block, latest, current] = await Promise.all([
    client.getBlock({ blockNumber: receipt.blockNumber }), client.getBlockNumber({ cacheTime: 0 }),
    readPolicySnapshot(client, deployment.guardian, deployment.kernel),
  ]);
  const confirmations = latest - receipt.blockNumber + 1n;
  requireCheck(receipt.status === "success" && equal(block.hash, receipt.blockHash) && confirmations >= 2n, "PAYMENT_RECEIPT_NOT_CANONICAL_OR_CONFIRMED");
  const operations = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs.filter((log) => equal(log.address, entryPoint.address)) });
  const operation = operations.find((event) => equal(event.args.userOpHash, attempt.userOperationHash));
  requireCheck(operation?.args.success && equal(operation.args.sender, deployment.kernel) && operation.args.nonce === BigInt(attempt.nonce) && equal(operation.args.paymaster, deployment.paymaster), "USER_OPERATION_BINDING_FAILED");
  const settlements = parseEventLogs({ abi: guardianAbi, eventName: "PaymentSettled", logs: receipt.logs.filter((log) => equal(log.address, deployment.guardian)) }).filter((event) => equal(event.args.account, deployment.kernel) && event.args.paymentId === id);
  requireCheck(settlements.length === 1 && equal(settlements[0].args.recipient, quote.recipient) && settlements[0].args.amount === BigInt(quote.amountUnits) && settlements[0].args.policyVersion === BigInt(plan.policyVersion), "SETTLEMENT_BINDING_FAILED");
  const policy = await client.readContract({ address: deployment.guardian, abi: guardianAbi, functionName: "getPolicy", args: [deployment.kernel], blockNumber: receipt.blockNumber });
  requireCheck(equal(task.quoteSigner, policy.rules.quoteSigner) && equal(policy.rules.quoteSigner, deployment.providerSigner) && await verifyTypedData({ ...quoteTypedData(84532, deployment.guardian, quote), address: policy.rules.quoteSigner, signature: quote.signature }), "QUOTE_SIGNATURE_INVALID");
  requireCheck(Number(block.timestamp) <= Math.min(quote.validUntil, plan.validUntil), "PAYMENT_AFTER_PLAN_OR_QUOTE_EXPIRY");
  requireCheck(equal(delivery.account, deployment.kernel) && delivery.invoiceId === quote.invoiceId && delivery.paymentId === id && delivery.serviceHash === quote.serviceHash && equal(delivery.transactionHash, receipt.transactionHash) && delivery.readyAt === Number(block.timestamp) && delivery.expiresAt === delivery.readyAt + offer.durationHours * 3600, "DELIVERY_BINDING_FAILED");
  requireCheck(await verifyTypedData({ ...deliveryTypedData(84532, deployment.guardian, delivery), address: policy.rules.quoteSigner, signature: delivery.signature }), "DELIVERY_SIGNATURE_INVALID");

  // These are block-boundary snapshots, not transaction-local state traces.
  const beforeBlock = receipt.blockNumber - 1n, day = block.timestamp / 86400n;
  const balance = (blockNumber) => client.readContract({ address: deployment.token, abi: erc20Abi, functionName: "balanceOf", args: [deployment.kernel], blockNumber });
  const consumed = (blockNumber) => client.readContract({ address: deployment.guardian, abi: guardianAbi, functionName: "consumed", args: [deployment.kernel, id], ...(blockNumber === undefined ? {} : { blockNumber }) });
  const spent = (blockNumber) => client.readContract({ address: deployment.guardian, abi: guardianAbi, functionName: "spent", args: [deployment.kernel, deployment.token, day], blockNumber });
  const [balanceBefore, balanceAfter, consumedBefore, consumedAfter, consumedNow, spentBefore, spentAfter, nativeBefore, nativeAfter] = await Promise.all([
    balance(beforeBlock), balance(receipt.blockNumber), consumed(beforeBlock), consumed(receipt.blockNumber), consumed(), spent(beforeBlock), spent(receipt.blockNumber),
    client.getBalance({ address: deployment.kernel, blockNumber: beforeBlock }), client.getBalance({ address: deployment.kernel, blockNumber: receipt.blockNumber }),
  ]);
  requireCheck(!consumedBefore && consumedAfter && consumedNow, "CONSUMED_INVOICE_EVIDENCE_FAILED");
  requireCheck(balanceAfter >= policy.rules.protectedBalance && spentAfter <= policy.rules.dailyLimit, "POST_PAYMENT_POLICY_BUDGET_FAILED");

  const active = delivery.expiresAt > Date.now() / 1000;
  let serviceCheck = { status: "expired_not_probed", writeReadVerified: false };
  if (active) {
    requireCheck(api.PROVIDER_SIGNER_URL && api.PROVIDER_SIGNER_TOKEN, "PROVIDER_SERVICE_CONFIGURATION_REQUIRED");
    const service = createProviderServiceClient({ baseUrl: api.PROVIDER_SIGNER_URL, token: api.PROVIDER_SIGNER_TOKEN });
    const probeId = randomUUID(), probe = await service.probe(delivery.namespaceId, probeId);
    requireCheck(probe.probeId === probeId && probe.namespaceId === delivery.namespaceId && probe.serviceHash === delivery.serviceHash && probe.capacityBytes === offer.capacityMb * 1024 * 1024 && probe.expiresAt === delivery.expiresAt && probe.usedBytes <= probe.capacityBytes, "LIVE_SERVICE_PROBE_BINDING_FAILED");
    serviceCheck = { status: "live_probe_verified", probeId, probeCount: probe.probeCount, capacityBytes: probe.capacityBytes, usedBytesAtProbe: probe.usedBytes, writeReadVerified: false };
    if (args.includes("--write-read")) {
      // A new evidence-only key preserves the owner's existing application values.
      const key = `guardian-evidence-${randomUUID()}`, value = `Verified ${task.id} at ${new Date().toISOString()}`;
      await service.put(delivery.namespaceId, key, value);
      const observed = await service.values(delivery.namespaceId);
      requireCheck(observed.values[key] === value, "LIVE_SERVICE_VALUE_WRITE_READ_FAILED");
      serviceCheck = { ...serviceCheck, writeReadVerified: true, evidenceKey: key, valueSha256: createHash("sha256").update(value).digest("hex") };
    }
  } else requireCheck(!args.includes("--write-read"), "SERVICE_EXPIRED_CANNOT_RUN_FRESH_WRITE_READ");

  const sources = Object.fromEntries(await Promise.all([
    "contracts/contracts/GuardianPayments.sol", "apps/api/src/app.ts", "apps/api/src/provider-agent.ts", "apps/api/src/provider-signer.ts", "apps/worker/src/worker.ts",
    "packages/wallet/src/provider-client.ts", "packages/database/src/payment-store.ts", "packages/database/src/provider-store.ts",
  ].map(async (path) => [path, createHash("sha256").update(await readFile(join(root, path))).digest("hex")])));
  const report = {
    verifiedAt: new Date().toISOString(), evidenceType: "public-base-sepolia-procurement-and-provider-delivery", sourceState: "uncommitted-working-tree-with-source-sha256",
    chainId: 84532, taskId: task.id, requestId: task.requestId, taskStatus: task.status, owner: api.OWNER_ADDRESS, kernel: deployment.kernel, guardian: deployment.guardian, token: deployment.token,
    offerId: offer.id, serviceKind: offer.kind, amountUnits: quote.amountUnits, tokenDecimals: 6, tokenLabel: "MockUSD test token", recipient: quote.recipient,
    invoiceId: quote.invoiceId, paymentId: id, serviceHash: quote.serviceHash, quoteSignatureVerified: true, planOrigin: plan.origin, model: plan.model,
    exchange: (task.exchange || []).map(({ actor, stage, modelId, observedAt }) => ({ actor, stage, modelId, observedAt })),
    userOperationHash: attempt.userOperationHash, transactionHash: receipt.transactionHash, explorer: `https://sepolia.basescan.org/tx/${receipt.transactionHash}`,
    blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, settledAt: new Date(Number(block.timestamp) * 1000).toISOString(), confirmations: confirmations.toString(),
    outerTransactionSuccess: true, userOperationSuccess: true, userOperationNonce: attempt.nonce, matchedSettlementEventsInReceipt: settlements.length,
    invoiceConsumedBeforeBlock: consumedBefore, invoiceConsumedAtBlock: consumedAfter, invoiceConsumedNow: consumedNow,
    paymaster: operation.args.paymaster, entryPointGasUsed: operation.args.actualGasUsed.toString(), entryPointGasChargeWei: operation.args.actualGasCost.toString(),
    gasAccountingScope: "EntryPoint UserOperation charge paid by the paymaster; not a measured all-in L1-data/USD cost or project-pricing claim.",
    blockBoundarySnapshots: { beforeBlock: beforeBlock.toString(), afterBlock: receipt.blockNumber.toString(), tokenBalanceBeforeUnits: balanceBefore.toString(), tokenBalanceAfterUnits: balanceAfter.toString(), utcDaySpentBeforeUnits: spentBefore.toString(), utcDaySpentAfterUnits: spentAfter.toString(), kernelNativeBeforeWei: nativeBefore.toString(), kernelNativeAfterWei: nativeAfter.toString() },
    currentPolicy: { observedBlockNumber: current.observedBlockNumber, balanceUnits: current.balanceUnits, protectedBalanceUnits: current.protectedBalanceUnits, perPaymentLimitUnits: current.perPaymentLimitUnits, dailyLimitUnits: current.dailyLimitUnits, spentUnits: current.spentUnits, version: current.policyVersion, modulePaused: current.paused },
    delivery: { namespaceId: delivery.namespaceId, signatureVerified: true, readyAt: delivery.readyAt, expiresAt: delivery.expiresAt, expiresAtIso: new Date(delivery.expiresAt * 1000).toISOString(), deliveryAttempts: task.deliveryAttempts, ...serviceCheck },
    schedulerPaused: await database.store.isPaused(accountKey(84532, deployment.kernel)),
    verificationUserOperationsSubmitted: 0, scope: "Existing public testnet settlement independently checked against canonical receipts/events, signed quote/delivery and consumed-ID state. Live service checks are explicitly labeled; service is an expiring provider-managed PostgreSQL JSONB namespace, not a dedicated cloud instance. Existing application values and all signing credentials are omitted.", sources,
  };
  if (args.includes("--record")) await writeFile(join(root, "docs/evidence/public-procurement.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error && /^[A-Z0-9_]{1,120}$/.test(error.message) ? error.message : "PROCUREMENT_VERIFICATION_FAILED_DETAILS_SUPPRESSED");
  process.exitCode = 1;
} finally { await database?.close(); }
