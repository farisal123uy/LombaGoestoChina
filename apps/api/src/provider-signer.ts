import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { accountKey, type ProviderStore } from "@guardian-wallet/database";
import { databaseValueSchema, hashSchema, offerIdSchema, type DeliveryReceipt, type ServiceQuote } from "@guardian-wallet/shared";
import { deliveryTypedData, escrowDeliveryTypedData, getPaymentId, getServiceOffer, guardianAbi, invoiceId, providerId, quoteTypedData, serviceHash } from "@guardian-wallet/wallet";
import { requireProviderToken } from "./provider-auth.js";
export interface ProviderSignerOptions {
  client: PublicClient; store: ProviderStore; account: Address; guardian: Address; token: Address;
  privateKey: Hex; accessToken: string; confirmations?: number;
}
export async function buildProviderSigner(options: ProviderSignerOptions) {
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] }, bodyLimit: 32768 });
  const signer = privateKeyToAccount(options.privateKey);
  app.addHook("onRequest", async (request) => { if (request.url !== "/health") requireProviderToken(options.accessToken, request.headers.authorization); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "INVALID_PROVIDER_REQUEST" });
    if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)) return reply.code(503).send({ error: `PROVIDER_DATABASE_${error.code}` });
    const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "PROVIDER_REQUEST_FAILED";
    return reply.code(code === "PROVIDER_AUTH_REQUIRED" ? 401 : 409).send({ error: code });
  });
  app.get("/health", async () => ({ status: "ok", service: "provider-signer", modelAccess: false }));
  app.post("/quotes", async (request) => {
    const input = z.strictObject({ requestId: z.string().uuid(), offerId: offerIdSchema }).parse(request.body);
    const offer = getServiceOffer(input.offerId), id = invoiceId(options.account, input.requestId);
    const existing = await options.store.invoice(id);
    if (existing) {
      if (existing.offerId !== offer.id) throw new Error("PROVIDER_REQUEST_ID_CONFLICT");
      return { offer, quote: existing.quote };
    }
    if (await options.client.getChainId() !== 84532) throw new Error("WRONG_CHAIN");
    const policy = await options.client.readContract({ address: options.guardian, abi: guardianAbi, functionName: "getPolicy", args: [options.account] });
    if (!policy.installed || policy.rules.token.toLowerCase() !== options.token.toLowerCase() || policy.rules.quoteSigner.toLowerCase() !== signer.address.toLowerCase()) throw new Error("PROVIDER_REGISTRY_MISMATCH");
    const quote = {
      account: options.account, providerId, invoiceId: id, serviceHash: serviceHash(offer.id), token: options.token,
      recipient: signer.address, amountUnits: offer.amountUnits, validUntil: Math.min(Number(policy.rules.validUntil), Math.floor(Date.now() / 1000) + 900),
    };
    const signed: ServiceQuote = { ...quote, signature: await signer.signTypedData(quoteTypedData(84532, options.guardian, quote)) };
    const saved = await options.store.saveInvoice({ requestId: input.requestId, accountKey: accountKey(84532, options.account), offerId: offer.id, quote: signed });
    return { offer, quote: saved.quote };
  });
  app.post("/provision", async (request) => {
    const input = z.strictObject({ invoiceId: hashSchema, transactionHash: hashSchema }).parse(request.body);
    const invoice = await options.store.invoice(input.invoiceId);
    if (!invoice) throw new Error("PROVIDER_INVOICE_NOT_FOUND");
    const quote = invoice.quote, id = getPaymentId(84532, quote);
    const receipt = await options.client.getTransactionReceipt({ hash: input.transactionHash });
    const [latest, canonical, consumed] = await Promise.all([
      options.client.getBlockNumber({ cacheTime: 0 }), options.client.getBlock({ blockNumber: receipt.blockNumber }),
      options.client.readContract({ address: options.guardian, abi: guardianAbi, functionName: "consumed", args: [options.account, id] }),
    ]);
    if (receipt.status !== "success" || canonical.hash !== receipt.blockHash || latest - receipt.blockNumber + 1n < BigInt(options.confirmations ?? 2) || !consumed) throw new Error("PROVIDER_PAYMENT_NOT_CONFIRMED");
    const events = parseEventLogs({ abi: guardianAbi, eventName: "PaymentSettled", logs: receipt.logs.filter((item) => item.address.toLowerCase() === options.guardian.toLowerCase()) });
    if (!events.some((e) => e.args.account.toLowerCase() === options.account.toLowerCase() && e.args.paymentId === id && e.args.recipient.toLowerCase() === signer.address.toLowerCase() && e.args.amount === BigInt(quote.amountUnits))) throw new Error("PROVIDER_PAYMENT_BINDING_FAILED");
    const offer = getServiceOffer(invoice.offerId);
    const readyAt = Number(canonical.timestamp), expiresAt = readyAt + offer.durationHours * 3600;
    if (expiresAt <= Date.now() / 1000) throw new Error("SERVICE_PERIOD_EXPIRED");
    const namespaceId = randomUUID();
    const unsigned = { account: options.account, invoiceId: quote.invoiceId, paymentId: id, serviceHash: quote.serviceHash, namespaceId, transactionHash: input.transactionHash, readyAt, expiresAt };
    const delivery: DeliveryReceipt = { ...unsigned, signature: await signer.signTypedData(deliveryTypedData(84532, options.guardian, unsigned)) };
    const namespace = await options.store.saveNamespace({ namespaceId, invoiceId: quote.invoiceId, serviceHash: quote.serviceHash, capacityBytes: offer.capacityMb * 1024 * 1024, receipt: delivery });
    return { delivery: namespace.receipt, serviceKind: "postgres-jsonb-namespace", provisioning: "real-postgres-namespace-test-service" };
  });
  app.post("/provision-escrow", async (request) => {
    const input = z.strictObject({ invoiceId: hashSchema, transactionHash: hashSchema }).parse(request.body);
    const invoice = await options.store.invoice(input.invoiceId);
    if (!invoice) throw new Error("PROVIDER_INVOICE_NOT_FOUND");
    const quote = invoice.quote, id = getPaymentId(84532, quote);
    const receipt = await options.client.getTransactionReceipt({ hash: input.transactionHash });
    const [latest, canonical, consumed, escrow] = await Promise.all([
      options.client.getBlockNumber({ cacheTime: 0 }), options.client.getBlock({ blockNumber: receipt.blockNumber }),
      options.client.readContract({ address: options.guardian, abi: guardianAbi, functionName: "consumed", args: [options.account, id] }),
      options.client.readContract({ address: options.guardian, abi: guardianAbi, functionName: "escrows", args: [id] }),
    ]);
    if (receipt.status !== "success" || canonical.hash !== receipt.blockHash || latest - receipt.blockNumber + 1n < BigInt(options.confirmations ?? 2) || !consumed) throw new Error("PROVIDER_ESCROW_LOCK_NOT_CONFIRMED");
    const lockEvents = parseEventLogs({ abi: guardianAbi, eventName: "EscrowLocked", logs: receipt.logs.filter((item) => item.address.toLowerCase() === options.guardian.toLowerCase()) });
    if (!lockEvents.some((event) => event.args.account.toLowerCase() === options.account.toLowerCase() && event.args.paymentId === id
      && event.args.recipient.toLowerCase() === signer.address.toLowerCase() && event.args.amount === BigInt(quote.amountUnits)
      && event.args.refundAfter === escrow.refundAfter) || escrow.account.toLowerCase() !== options.account.toLowerCase()
      || escrow.token.toLowerCase() !== quote.token.toLowerCase() || escrow.quoteSigner.toLowerCase() !== signer.address.toLowerCase()
      || escrow.invoiceId !== quote.invoiceId || escrow.serviceHash !== quote.serviceHash || escrow.amount !== BigInt(quote.amountUnits)
      || escrow.status !== 1) throw new Error("PROVIDER_ESCROW_LOCK_BINDING_FAILED");
    const offer = getServiceOffer(invoice.offerId), readyBlock = await options.client.getBlock();
    const readyAt = Number(readyBlock.timestamp), expiresAt = readyAt + offer.durationHours * 3600;
    if (readyAt > escrow.refundAfter || expiresAt <= readyAt) throw new Error("SERVICE_NOT_READY_BEFORE_ESCROW_DEADLINE");
    const namespaceId = randomUUID();
    const unsigned = { account: options.account, invoiceId: quote.invoiceId, paymentId: id, serviceHash: quote.serviceHash, namespaceId, transactionHash: input.transactionHash, readyAt, expiresAt };
    const delivery: DeliveryReceipt = { ...unsigned, signature: await signer.signTypedData(deliveryTypedData(84532, options.guardian, unsigned)) };
    const namespace = await options.store.saveNamespace({ namespaceId, invoiceId: quote.invoiceId, serviceHash: quote.serviceHash, capacityBytes: offer.capacityMb * 1024 * 1024, receipt: delivery }, false);
    if (namespace.receipt.transactionHash.toLowerCase() !== input.transactionHash.toLowerCase() || namespace.receipt.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error("PROVIDER_NAMESPACE_ESCROW_BINDING_FAILED");
    const attestation = { paymentId: id, account: options.account, invoiceId: quote.invoiceId, serviceHash: quote.serviceHash,
      transactionHash: input.transactionHash, readyAt: namespace.receipt.readyAt, serviceExpiresAt: namespace.receipt.expiresAt };
    return { delivery: namespace.receipt, attestation: { ...attestation, signature: await signer.signTypedData(escrowDeliveryTypedData(84532, options.guardian, attestation)) } };
  });
  app.post("/activate-escrow", async (request) => {
    const input = z.strictObject({ invoiceId: hashSchema, releaseTransactionHash: hashSchema }).parse(request.body);
    const invoice = await options.store.invoice(input.invoiceId);
    if (!invoice) throw new Error("PROVIDER_INVOICE_NOT_FOUND");
    const paymentId_ = getPaymentId(84532, invoice.quote), receipt = await options.client.getTransactionReceipt({ hash: input.releaseTransactionHash });
    const [latest, canonical, escrow] = await Promise.all([
      options.client.getBlockNumber({ cacheTime: 0 }), options.client.getBlock({ blockNumber: receipt.blockNumber }),
      options.client.readContract({ address: options.guardian, abi: guardianAbi, functionName: "escrows", args: [paymentId_] }),
    ]);
    if (receipt.status !== "success" || canonical.hash !== receipt.blockHash || latest - receipt.blockNumber + 1n < BigInt(options.confirmations ?? 2)) throw new Error("PROVIDER_ESCROW_RELEASE_NOT_CONFIRMED");
    const released = parseEventLogs({ abi: guardianAbi, eventName: "EscrowReleased", logs: receipt.logs.filter((log) => log.address.toLowerCase() === options.guardian.toLowerCase()) })
      .some((event) => event.args.account.toLowerCase() === options.account.toLowerCase() && event.args.paymentId === paymentId_);
    if (!released || escrow.account.toLowerCase() !== options.account.toLowerCase() || escrow.status !== 2) throw new Error("PROVIDER_ESCROW_RELEASE_BINDING_FAILED");
    const namespace = await options.store.activateEscrow(input.invoiceId, input.releaseTransactionHash);
    return { ready: true, namespaceId: namespace.namespaceId, releaseTransactionHash: input.releaseTransactionHash };
  });
  app.post("/databases/:id/probe", async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { probeId } = z.strictObject({ probeId: z.string().uuid() }).parse(request.body);
    return options.store.probe(id, probeId);
  });
  app.post("/databases/:id/escrow-probe", async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { probeId } = z.strictObject({ probeId: z.string().uuid() }).parse(request.body);
    return options.store.probe(id, probeId, true);
  });
  app.get("/databases/:id/values", async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { values: await options.store.values(id) };
  });
  app.put("/databases/:id/values", async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = databaseValueSchema.parse(request.body);
    return options.store.put(id, input.key, input.value);
  });
  return app;
}
