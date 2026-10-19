import { z } from "zod";
import { verifyTypedData, type Address } from "viem";
import { deliveryReceiptSchema, serviceProbeSchema, serviceQuoteSchema, type DeliveryReceipt, type OfferId, type PaymentAttempt, type PaymentTask } from "@guardian-wallet/shared";
import { deliveryTypedData, getServiceOffer } from "./services.js";
import { getPaymentId } from "./guardian.js";

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
    probe: async (namespace: string, probeId: string) => serviceProbeSchema.parse(await request(config, `/databases/${namespace}/probe`, { probeId })),
    values: async (namespace: string) => z.object({ values: z.record(z.string(), z.string()) }).parse(await request(config, `/databases/${namespace}/values`)),
    put: async (namespace: string, key: string, value: string) => request(config, `/databases/${namespace}/values`, { key, value }, "PUT"),
  };
}
export interface PaymentFulfillment { fulfill(task: PaymentTask, attempt: PaymentAttempt): Promise<DeliveryReceipt>; }
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
