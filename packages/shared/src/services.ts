import { z } from "zod";
import { addressSchema, hashSchema, signatureSchema, timestampSchema } from "./payments.js";

export const offerIdSchema = z.enum(["database-small-1h", "database-standard-4h"]);
export type OfferId = z.infer<typeof offerIdSchema>;
export const serviceCatalog = [
  { id: "database-small-1h", name: "Small database", kind: "postgres-jsonb-namespace", capacityMb: 1, durationHours: 1, amountUnits: "260000" },
  { id: "database-standard-4h", name: "Standard database", kind: "postgres-jsonb-namespace", capacityMb: 4, durationHours: 4, amountUnits: "520000" },
] as const;
export const procureSchema = z.strictObject({ requestId: z.string().uuid(), instruction: z.string().trim().min(1).max(4000) });
export interface AgentExchange {
  actor: "astra" | "provider_agent" | "provider_signer";
  stage: string;
  summary: string;
  modelId?: string;
  observedAt: string;
}
export const deliveryReceiptSchema = z.strictObject({
  account: addressSchema, invoiceId: hashSchema, paymentId: hashSchema, serviceHash: hashSchema,
  namespaceId: z.string().uuid(), transactionHash: hashSchema,
  readyAt: timestampSchema, expiresAt: timestampSchema, signature: signatureSchema,
});
export type DeliveryReceipt = z.infer<typeof deliveryReceiptSchema>;
export const serviceProbeSchema = z.strictObject({
  namespaceId: z.string().uuid(), serviceHash: hashSchema, probeId: z.string().uuid(),
  ready: z.literal(true), probeCount: z.number().int().positive(),
  capacityBytes: z.number().int().positive(), usedBytes: z.number().int().nonnegative(), expiresAt: timestampSchema,
});
export const databaseValueSchema = z.strictObject({ key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/), value: z.string().max(4096) });
