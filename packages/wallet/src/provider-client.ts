import { z } from "zod";
import { verifyTypedData, type Address } from "viem";
import { deliveryReceiptSchema, escrowFulfillmentSchema, serviceProbeSchema, serviceQuoteSchema, type DeliveryReceipt, type EscrowFulfillment, type OfferId, type PaymentAttempt, type PaymentTask } from "@guardian-wallet/shared";
import { deliveryTypedData, getServiceOffer } from "./services.js";
import { escrowDeliveryTypedData, getPaymentId } from "./guardian.js";

export interface ProviderTransport { baseUrl: string; token: string; }
async function request(config: ProviderTransport, path: string, body?: object, method = body ? "POST" : "GET") {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
    method, headers: { authorization: `Bearer ${config.token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(path === "/request" ? 60000 : 20000),
  });
  if (!response.ok) {
    if (response.status === 429) {
      const retry = Math.min(86400, Math.max(1, Number(response.headers.get("retry-after")) || 60));
      throw Object.assign(new Error("QWEN_RATE_LIMITED"), { retryAfterSeconds: retry });
    }
    let code = "PROVIDER_UNAVAILABLE_OR_REJECTED";
    try { const body = await response.json() as { error?: unknown }; if (typeof body.error === "string" && /^(QWEN|PROVIDER|SERVICE)_[A-Z0-9_]{1,80}$/.test(body.error)) code = body.error; } catch { /* Keep transport errors sanitized. */ }
    throw new Error(code);
  }
  return response.json() as Promise<unknown>;
}
const offerReply = z.discriminatedUnion("accepted", [
  z.object({ accepted: z.literal(true), quote: serviceQuoteSchema, reason: z.string().max(500), modelId: z.string().max(120) }),
  z.object({ accepted: z.literal(false), reason: z.string().max(500), modelId: z.string().max(120) }),
]);
export function createProviderAgentClient(config: ProviderTransport) {
  return { requestQuote: async (requestId: string, instruction: string, preferredOfferId: OfferId) => offerReply.parse(await request(config, "/request", { requestId, instruction, preferredOfferId })) };
}
export function createProviderServiceClient(config: ProviderTransport) {
  return {
    provision: async (invoiceId: `0x${string}`, transactionHash: `0x${string}`) => z.object({ delivery: deliveryReceiptSchema }).parse(await request(config, "/provision", { invoiceId, transactionHash })).delivery,
    provisionEscrow: async (invoiceId: `0x${string}`, transactionHash: `0x${string}`) => escrowFulfillmentSchema.parse(await request(config, "/provision-escrow", { invoiceId, transactionHash })),
    activateEscrow: async (invoiceId: `0x${string}`, releaseTransactionHash: `0x${string}`) => z.object({ ready: z.literal(true), namespaceId: z.string().uuid(), releaseTransactionHash: z.string() }).parse(await request(config, "/activate-escrow", { invoiceId, releaseTransactionHash })),
    probe: async (namespace: string, probeId: string) => serviceProbeSchema.parse(await request(config, `/databases/${namespace}/probe`, { probeId })),
    probeEscrow: async (namespace: string, probeId: string) => serviceProbeSchema.parse(await request(config, `/databases/${namespace}/escrow-probe`, { probeId })),
    values: async (namespace: string) => z.object({ values: z.record(z.string(), z.string()) }).parse(await request(config, `/databases/${namespace}/values`)),
    put: async (namespace: string, key: string, value: string) => request(config, `/databases/${namespace}/values`, { key, value }, "PUT"),
  };
}
export interface PaymentFulfillment {
  fulfill(task: PaymentTask, attempt: PaymentAttempt): Promise<DeliveryReceipt>;
  fulfillEscrow?(task: PaymentTask, attempt: PaymentAttempt): Promise<EscrowFulfillment>;
  activateEscrow?(task: PaymentTask, releaseTransactionHash: `0x${string}`, delivery: DeliveryReceipt): Promise<void>;
}
export function createProviderFulfillment(config: ProviderTransport & { guardian: Address; providerSigner: Address }): PaymentFulfillment {
  const service = createProviderServiceClient(config);
  return { async fulfill(task, attempt) {
    if (!task.offerId || attempt.status !== "confirmed" || !attempt.transactionHash) throw new Error("CONFIRMED_PAYMENT_REQUIRED_FOR_DELIVERY");
    const delivery = await service.provision(task.quote.invoiceId, attempt.transactionHash);
    if (delivery.account.toLowerCase() !== task.quote.account.toLowerCase() || delivery.invoiceId !== task.quote.invoiceId || delivery.paymentId !== getPaymentId(task.chainId, task.quote) || delivery.serviceHash !== task.quote.serviceHash || delivery.transactionHash.toLowerCase() !== attempt.transactionHash.toLowerCase() || delivery.expiresAt <= Date.now() / 1000) throw new Error("DELIVERY_BINDING_FAILED");
    if (!await verifyTypedData({ ...deliveryTypedData(task.chainId, config.guardian, delivery), address: task.quoteSigner || config.providerSigner, signature: delivery.signature })) throw new Error("DELIVERY_SIGNATURE_INVALID");
    const probeId = globalThis.crypto.randomUUID(), probe = await service.probe(delivery.namespaceId, probeId);
    if (probe.probeId !== probeId || probe.namespaceId !== delivery.namespaceId || probe.serviceHash !== delivery.serviceHash || probe.capacityBytes !== getServiceOffer(task.offerId).capacityMb * 1024 * 1024 || probe.expiresAt !== delivery.expiresAt || probe.usedBytes > probe.capacityBytes) throw new Error("SERVICE_PROBE_BINDING_FAILED");
    return delivery;
  } };
}

export function createProviderEscrowFulfillment(config: ProviderTransport & { guardian: Address; providerSigner: Address }): PaymentFulfillment {
  const service = createProviderServiceClient(config);
  return { async fulfill() { throw new Error("ESCROW_MODE_REQUIRED"); }, async fulfillEscrow(task, attempt) {
    if (!task.offerId || attempt.status !== "confirmed" || attempt.settlementMode !== "escrow" || !attempt.transactionHash || !task.escrow) throw new Error("CONFIRMED_ESCROW_REQUIRED_FOR_DELIVERY");
    let result: EscrowFulfillment;
    try { result = await service.provisionEscrow(task.quote.invoiceId, attempt.transactionHash); }
    catch (error) { throw new Error(error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "ESCROW_PROVIDER_RESPONSE_INVALID"); }
    const { delivery, attestation } = result;
    if (delivery.account.toLowerCase() !== task.quote.account.toLowerCase() || delivery.invoiceId !== task.quote.invoiceId || delivery.paymentId !== getPaymentId(task.chainId, task.quote)
      || delivery.serviceHash !== task.quote.serviceHash || delivery.transactionHash.toLowerCase() !== attempt.transactionHash.toLowerCase() || delivery.expiresAt <= Date.now() / 1000) throw new Error("DELIVERY_BINDING_FAILED");
    let deliverySignatureValid = false;
    try { deliverySignatureValid = await verifyTypedData({ ...deliveryTypedData(task.chainId, config.guardian, delivery), address: task.quoteSigner || config.providerSigner, signature: delivery.signature }); } catch { /* Invalid typed data is a failed attestation. */ }
    if (!deliverySignatureValid) throw new Error("DELIVERY_SIGNATURE_INVALID");
    if (attestation.paymentId !== getPaymentId(task.chainId, task.quote) || attestation.account.toLowerCase() !== task.quote.account.toLowerCase()
      || attestation.invoiceId !== task.quote.invoiceId || attestation.serviceHash !== task.quote.serviceHash
      || attestation.transactionHash.toLowerCase() !== attempt.transactionHash.toLowerCase() || attestation.readyAt < task.escrow.lockedAt || attestation.readyAt > task.escrow.refundAfter
      || attestation.serviceExpiresAt !== delivery.expiresAt) throw new Error("ESCROW_ATTESTATION_BINDING_FAILED");
    let attestationSignatureValid = false;
    try { attestationSignatureValid = await verifyTypedData({ ...escrowDeliveryTypedData(task.chainId, config.guardian, attestation), address: task.quoteSigner || config.providerSigner, signature: attestation.signature }); } catch { /* Invalid typed data is a failed attestation. */ }
    if (!attestationSignatureValid) throw new Error("ESCROW_ATTESTATION_SIGNATURE_INVALID");
    const probeId = globalThis.crypto.randomUUID();
    let probe;
    try { probe = await service.probeEscrow(delivery.namespaceId, probeId); }
    catch (error) { throw new Error(error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "ESCROW_SERVICE_PROBE_FAILED"); }
    if (probe.probeId !== probeId || probe.namespaceId !== delivery.namespaceId || probe.serviceHash !== delivery.serviceHash
      || probe.capacityBytes !== getServiceOffer(task.offerId).capacityMb * 1024 * 1024 || probe.expiresAt !== delivery.expiresAt || probe.usedBytes > probe.capacityBytes) throw new Error("SERVICE_PROBE_BINDING_FAILED");
    return result;
  }, async activateEscrow(task, releaseTransactionHash, delivery) {
    if (!task.offerId || !task.escrow || task.escrow.status !== "locked") throw new Error("ESCROW_TASK_NOT_LOCKED");
    const response = await service.activateEscrow(task.quote.invoiceId, releaseTransactionHash);
    if (response.namespaceId !== delivery.namespaceId || response.releaseTransactionHash.toLowerCase() !== releaseTransactionHash.toLowerCase()) throw new Error("ESCROW_SERVICE_ACTIVATION_BINDING_FAILED");
  } };
}
