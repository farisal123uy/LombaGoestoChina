import { z } from "zod";
import type { AgentExchange, DeliveryReceipt, OfferId } from "./services.js";

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`);
export const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((v) => v as `0x${string}`);
export const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform((v) => v as `0x${string}`);
export const unitsSchema = z.string().max(78).regex(/^(0|[1-9][0-9]*)$/)
  .pipe(z.string().refine((v) => BigInt(v) < 2n ** 256n, "uint256 overflow"));
export const positiveUnitsSchema = unitsSchema.refine((v) => BigInt(v) > 0n, "Amount must be positive");
export const timestampSchema = z.number().int().min(1).max(2 ** 48 - 1);
export const serviceQuoteSchema = z.strictObject({
  account: addressSchema,
  providerId: hashSchema,
  invoiceId: hashSchema,
  serviceHash: hashSchema,
  token: addressSchema,
  recipient: addressSchema,
  amountUnits: positiveUnitsSchema,
  validUntil: timestampSchema,
  signature: signatureSchema,
});
export type ServiceQuote = z.infer<typeof serviceQuoteSchema>;

export const paymentPlanSchema = z.strictObject({
  taskId: z.string().uuid(),
  chainId: z.number().int().positive(),
  guardianAddress: addressSchema,
  account: addressSchema,
  policyVersion: unitsSchema.refine((v) => BigInt(v) > 0n && BigInt(v) < 2n ** 64n),
  observedBlockNumber: unitsSchema,
  observedBlockHash: hashSchema,
  observedAt: timestampSchema,
  validUntil: timestampSchema,
  quotes: z.array(serviceQuoteSchema).min(1).max(10),
  summary: z.string().min(1).max(1000),
  origin: z.enum(["deterministic_baseline", "live_model", "adversarial_fixture"]),
  model: z.strictObject({ provider: z.enum(["ollama", "groq"]), id: z.string().min(1).max(120) }).optional(),
  batchTaskIds: z.array(z.string().uuid()).min(1).max(10).optional(),
});
export type PaymentPlan = z.infer<typeof paymentPlanSchema>;

export const paymentTaskStatuses = ["draft", "queued", "planned", "waiting", "needs_owner", "rejected", "executing", "paid", "service_pending", "completed", "cancelled"] as const;
export type PaymentTaskStatus = typeof paymentTaskStatuses[number];
export const operationStatuses = ["prepared", "submitting", "submitted", "unknown", "confirmed", "failed", "needs_review"] as const;
export type OperationStatus = typeof operationStatuses[number];
export interface PaymentTask {
  id: string;
  chainId: number;
  owner: `0x${string}`;
  paymentId: `0x${string}`;
  instruction: string;
  quote: ServiceQuote;
  status: PaymentTaskStatus;
  plan?: PaymentPlan;
  reason?: string;
  createdAt: string;
  requestId?: string;
  offerId?: OfferId;
  exchange?: AgentExchange[];
  delivery?: DeliveryReceipt;
  deliveryAttempts?: number;
  deliveryTotalAttempts?: number;
  deliveryRetryCycles?: number;
  quoteSigner?: `0x${string}`;
}

export interface PaymentAttempt {
  taskId: string;
  taskIds?: string[];
  leaderTaskId?: string;
  sender: `0x${string}`;
  userOperationHash: `0x${string}`;
  nonce: string;
  nonceKey: string;
  status: OperationStatus;
  submissionBlock: string;
  preparedAt: number;
  validUntil: number;
  transactionHash?: `0x${string}`;
  reason?: string;
}

export interface PolicySnapshot {
  chainId: number;
  account: `0x${string}`;
  guardianAddress: `0x${string}`;
  token: `0x${string}`;
  quoteSigner: `0x${string}`;
  policyVersion: string;
  balanceUnits: string;
  protectedBalanceUnits: string;
  perPaymentLimitUnits: string;
  dailyLimitUnits: string;
  spentUnits: string;
  validAfter: number;
  validUntil: number;
  installed: boolean;
  paused: boolean;
  observedBlockNumber: string;
  observedBlockHash: `0x${string}`;
  observedAt: number;
}

export const createPaymentTaskSchema = z.strictObject({
  instruction: z.string().trim().min(1).max(4000),
  quote: serviceQuoteSchema,
});
