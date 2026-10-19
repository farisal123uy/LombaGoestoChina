import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { erc20Abi, parseEventLogs, verifyTypedData } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { createPostgresPaymentStore, createPostgresQueryDatabase } from "@guardian-wallet/database";
import { deliveryReceiptSchema, serviceQuoteSchema } from "@guardian-wallet/shared";
import { createDevelopmentPublicClient, deliveryTypedData, entryPoint, getPaymentId, getServiceOffer, guardianAbi, quoteTypedData } from "@guardian-wallet/wallet";
import { readEnvironment, root, verifyProject } from "../services/config.mjs";

const equal = (left, right) => typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
function requireCheck(value, code) { if (!value) throw new Error(code); }
function entryPointEvent(receipt, userOperationHash) {
  return parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs.filter((log) => equal(log.address, entryPoint.address)) })
    .find((event) => equal(event.args.userOpHash, userOperationHash));
}
async function canonicalConfirmed(client, hash) {
  const receipt = await client.getTransactionReceipt({ hash });
  const [latest, block] = await Promise.all([client.getBlockNumber({ cacheTime: 0 }), client.getBlock({ blockNumber: receipt.blockNumber })]);
  const confirmations = latest - receipt.blockNumber + 1n;
  requireCheck(receipt.status === "success" && equal(block.hash, receipt.blockHash) && confirmations >= 2n, "ESCROW_RECEIPT_NOT_CANONICAL_OR_CONFIRMED");
  return { receipt, block, confirmations };
}

let payments, query;
try {
  const args = process.argv.slice(2);
  requireCheck(args.every((arg) => arg === "--record" || arg.startsWith("--task=")), "INVALID_ESCROW_VERIFICATION_ARGUMENT");
  requireCheck(args.filter((arg) => arg.startsWith("--task=")).length <= 1, "INVALID_ESCROW_TASK_ARGUMENT");
  const requestedTask = args.find((arg) => arg.startsWith("--task="))?.slice(7);
  if (requestedTask) requireCheck(/^[0-9a-f-]{36}$/i.test(requestedTask), "INVALID_ESCROW_TASK_ID");
  await verifyProject();
  const api = await readEnvironment("api"), database = await readEnvironment("database");
  const databaseUrl = api.DATABASE_URL || database.DATABASE_URL;
  requireCheck(api.OWNER_ADDRESS && api.BASE_SEPOLIA_RPC_URL && databaseUrl, "FINANCIAL_CONFIGURATION_REQUIRED");
  const deployment = JSON.parse(await readFile(join(root, ".local/onboarding/deployment.json"), "utf8"));
  requireCheck(deployment.settlementMode === "escrow" && deployment.chainId === 84532, "ESCROW_DEPLOYMENT_REQUIRED");
  requireCheck(equal(api.OWNER_ADDRESS, deployment.owner) && equal(api.KERNEL_ACCOUNT_ADDRESS, deployment.kernel) && equal(api.GUARDIAN_ADDRESS, deployment.guardian), "DEPLOYMENT_CONFIGURATION_MISMATCH");

  payments = createPostgresPaymentStore(databaseUrl);
  query = createPostgresQueryDatabase(databaseUrl);
  const tasks = await payments.store.listTasks(api.OWNER_ADDRESS);
  const task = requestedTask
    ? await payments.store.getTask(requestedTask, api.OWNER_ADDRESS)
    : tasks.find((item) => item.status === "completed" && item.escrow?.status === "released");
  requireCheck(task?.status === "completed" && task.escrow?.status === "released" && task.offerId, "RELEASED_ESCROW_TASK_REQUIRED");
  const quote = serviceQuoteSchema.parse(task.quote), delivery = deliveryReceiptSchema.parse(task.delivery);
  const lockAttempt = await payments.store.getAttempt(task.id, api.OWNER_ADDRESS);
  const releaseOperation = await payments.store.getEscrowOperation(task.id, api.OWNER_ADDRESS);
  requireCheck(lockAttempt?.status === "confirmed" && lockAttempt.settlementMode === "escrow" && lockAttempt.transactionHash, "ESCROW_LOCK_ATTEMPT_REQUIRED");
  requireCheck(releaseOperation?.action === "release" && releaseOperation.record.status === "confirmed" && releaseOperation.record.transactionHash && releaseOperation.record.delivery, "ESCROW_RELEASE_ATTEMPT_REQUIRED");
  requireCheck(equal(task.escrow.lockTransactionHash, lockAttempt.transactionHash) && equal(task.escrow.releaseTransactionHash, releaseOperation.record.transactionHash), "ESCROW_TASK_RECEIPT_BINDING_FAILED");

  const client = createDevelopmentPublicClient(api.BASE_SEPOLIA_RPC_URL);
  requireCheck(await client.getChainId() === 84532, "WRONG_CHAIN");
  const paymentId = getPaymentId(84532, quote);
  requireCheck(equal(paymentId, task.paymentId), "ESCROW_PAYMENT_ID_MISMATCH");
  const [lock, release] = await Promise.all([
    canonicalConfirmed(client, lockAttempt.transactionHash),
    canonicalConfirmed(client, releaseOperation.record.transactionHash),
  ]);
  const [lockEvent, releaseEvent] = [
    entryPointEvent(lock.receipt, lockAttempt.userOperationHash),
    entryPointEvent(release.receipt, releaseOperation.record.userOperationHash),
  ];
  requireCheck(lockEvent?.args.success && equal(lockEvent.args.sender, deployment.kernel) && lockEvent.args.nonce === BigInt(lockAttempt.nonce), "ESCROW_LOCK_USER_OPERATION_MISMATCH");
  requireCheck(releaseEvent?.args.success && equal(releaseEvent.args.sender, deployment.kernel) && releaseEvent.args.nonce === BigInt(releaseOperation.record.nonce), "ESCROW_RELEASE_USER_OPERATION_MISMATCH");

  const policy = await client.readContract({ address: deployment.guardian, abi: guardianAbi, functionName: "getPolicy", args: [deployment.kernel] });
  requireCheck(equal(quote.token, deployment.token) && equal(quote.recipient, deployment.recipient) && equal(quote.account, deployment.kernel), "ESCROW_QUOTE_DEPLOYMENT_MISMATCH");
  requireCheck(await verifyTypedData({ ...quoteTypedData(84532, deployment.guardian, quote), address: policy.rules.quoteSigner, signature: quote.signature }), "ESCROW_QUOTE_SIGNATURE_INVALID");
  requireCheck(await verifyTypedData({ ...deliveryTypedData(84532, deployment.guardian, delivery), address: policy.rules.quoteSigner, signature: delivery.signature }), "ESCROW_DELIVERY_SIGNATURE_INVALID");
  requireCheck(equal(delivery.account, deployment.kernel) && delivery.invoiceId === quote.invoiceId && delivery.paymentId === paymentId && delivery.serviceHash === quote.serviceHash && equal(delivery.transactionHash, lockAttempt.transactionHash), "ESCROW_DELIVERY_BINDING_FAILED");

  const lockedEvents = parseEventLogs({ abi: guardianAbi, eventName: "EscrowLocked", logs: lock.receipt.logs.filter((log) => equal(log.address, deployment.guardian)) });
  const lockedEvent = lockedEvents.find((event) => equal(event.args.account, deployment.kernel) && equal(event.args.paymentId, paymentId));
  requireCheck(lockedEvent && equal(lockedEvent.args.recipient, quote.recipient) && lockedEvent.args.amount === BigInt(quote.amountUnits) && lockedEvent.args.refundAfter === lockAttempt.escrowRefundAfter, "ESCROW_LOCK_EVENT_MISMATCH");

  const releasedEvents = parseEventLogs({ abi: guardianAbi, eventName: "EscrowReleased", logs: release.receipt.logs.filter((log) => equal(log.address, deployment.guardian)) });
  const releasedEvent = releasedEvents.find((event) => equal(event.args.account, deployment.kernel) && equal(event.args.paymentId, paymentId));
  requireCheck(releasedEvent && equal(releasedEvent.args.transactionHash, lockAttempt.transactionHash) && releasedEvent.args.readyAt === delivery.readyAt && releasedEvent.args.serviceExpiresAt === delivery.expiresAt, "ESCROW_RELEASE_EVENT_MISMATCH");

  const [onchainEscrow, consumed, balance, spent] = await Promise.all([
    client.readContract({ address: deployment.guardian, abi: guardianAbi, functionName: "escrows", args: [paymentId] }),
    client.readContract({ address: deployment.guardian, abi: guardianAbi, functionName: "consumed", args: [deployment.kernel, paymentId] }),
    client.readContract({ address: deployment.token, abi: erc20Abi, functionName: "balanceOf", args: [deployment.kernel] }),
    client.readContract({ address: deployment.guardian, abi: guardianAbi, functionName: "spent", args: [deployment.kernel, deployment.token, lock.block.timestamp / 86400n] }),
  ]);
  requireCheck(onchainEscrow.status === 2 && consumed && equal(onchainEscrow.invoiceId, quote.invoiceId) && onchainEscrow.amount === BigInt(quote.amountUnits), "ESCROW_FINAL_STATE_MISMATCH");
  const [namespace] = await query.database.query("SELECT namespace_id,ready,activated_by_transaction,probe_count FROM provider_databases WHERE invoice_id=$1", [quote.invoiceId]);
  requireCheck(namespace?.ready && equal(namespace.namespace_id, delivery.namespaceId) && equal(namespace.activated_by_transaction, release.receipt.transactionHash) && namespace.probe_count > 0, "ESCROW_NAMESPACE_ACTIVATION_MISMATCH");

  const offer = getServiceOffer(task.offerId);
  const sourcePaths = ["contracts/contracts/GuardianPayments.sol", "apps/api/src/provider-signer.ts", "apps/worker/src/worker.ts", "packages/wallet/src/execution.ts", "packages/database/src/provider-store.ts"];
  const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [path, createHash("sha256").update(await readFile(join(root, path))).digest("hex")])));
  const report = {
    verifiedAt: new Date().toISOString(), evidenceType: "public-base-sepolia-escrow-procurement-and-provider-delivery",
    sourceState: "uncommitted-working-tree-with-source-sha256", chainId: 84532, settlementMode: "escrow", kernelIndex: deployment.kernelIndex,
    taskId: task.id, taskStatus: task.status, owner: api.OWNER_ADDRESS, kernel: deployment.kernel, guardian: deployment.guardian, token: deployment.token,
    offerId: task.offerId, serviceKind: offer.kind, amountUnits: quote.amountUnits, tokenDecimals: 6, tokenLabel: "MockUSD test token", recipient: quote.recipient,
    invoiceId: quote.invoiceId, paymentId, serviceHash: quote.serviceHash, quoteSignatureVerified: true,
    planOrigin: task.plan?.origin ?? "not_recorded", model: task.plan?.model,
    lock: { userOperationHash: lockAttempt.userOperationHash, transactionHash: lock.receipt.transactionHash, explorer: `https://base-sepolia.blockscout.com/tx/${lock.receipt.transactionHash}`, blockNumber: lock.receipt.blockNumber.toString(), blockHash: lock.receipt.blockHash, confirmations: lock.confirmations.toString(), outerTransactionSuccess: true, userOperationSuccess: true, eventMatched: true, refundAfter: Number(onchainEscrow.refundAfter), lockedAt: Number(onchainEscrow.lockedAt) },
    release: { userOperationHash: releaseOperation.record.userOperationHash, transactionHash: release.receipt.transactionHash, explorer: `https://base-sepolia.blockscout.com/tx/${release.receipt.transactionHash}`, blockNumber: release.receipt.blockNumber.toString(), blockHash: release.receipt.blockHash, confirmations: release.confirmations.toString(), outerTransactionSuccess: true, userOperationSuccess: true, eventMatched: true, providerDeliverySignatureVerified: true, providerAttestationAcceptedByGuardian: true },
    escrowStatus: "released", consumedInvoice: consumed, tokenBalanceAfterUnits: balance.toString(), utcDaySpentUnits: spent.toString(),
    delivery: { namespaceId: delivery.namespaceId, providerReceiptSignatureVerified: true, readyAt: delivery.readyAt, expiresAt: delivery.expiresAt, activatedByReleaseTransaction: namespace.activated_by_transaction, namespaceReady: namespace.ready, internalProbeCount: namespace.probe_count },
    limitations: "Base Sepolia public testnet evidence using MockUSD. Guardian accepted the provider's EIP-712 delivery attestation and the namespace was staged, probed and activated after release. This records the provider attestation; it does not independently prove service quality or uptime.",
    sources,
  };
  if (args.includes("--record")) await writeFile(join(root, "docs/evidence/public-escrow-procurement.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error && /^[A-Z0-9_]{1,120}$/.test(error.message) ? error.message : "ESCROW_PROCUREMENT_VERIFICATION_FAILED_DETAILS_SUPPRESSED");
  process.exitCode = 1;
} finally {
  await payments?.close();
  await query?.close();
}
