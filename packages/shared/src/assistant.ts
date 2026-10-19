import { z } from "zod";
import type { PaymentPlan, PaymentTask } from "./payments.js";

export const walletTaskIdsSchema = z.array(z.string().uuid()).min(1).max(10).refine((ids) => new Set(ids).size === ids.length, "Duplicate task IDs");
export const assistantRequestSchema = z.strictObject({
  requestId: z.string().uuid(), instruction: z.string().trim().min(1).max(4000),
  taskIds: walletTaskIdsSchema.optional(),
});
export const executeWalletPlanSchema = z.strictObject({ taskIds: walletTaskIdsSchema, instruction: z.string().trim().min(1).max(4000) });
export const walletIntentSchema = z.strictObject({
  action: z.enum(["asset_overview", "risk_check", "plan_payments", "procure_database", "unsupported"]),
  taskIds: z.array(z.string().uuid()).max(10),
  summary: z.string().min(1).max(500),
});
export type WalletIntent = z.infer<typeof walletIntentSchema>;
export interface WalletAssetMetadata { symbol: string; decimals: number; nativeBalanceWei?: string; }
export interface WalletOverview {
  account: `0x${string}`; chainId: number;
  token: { address: `0x${string}`; symbol: string; decimals: number; balanceUnits: string; formattedBalance: string };
  nativeBalanceWei?: string;
  protectedBalanceUnits: string; spendableBalanceUnits: string; perPaymentLimitUnits: string;
  dailyLimitUnits: string; spentUnits: string; remainingDailyUnits: string;
  committedUnits: string; availableToPlanUnits: string; queuedTaskCount: number; draftTaskCount: number;
  schedulerPaused: boolean; policyVersion: string; observedAt: number; observedBlockNumber: string; observedBlockHash: `0x${string}`;
}
export interface WalletRiskCheck { code: string; severity: "info" | "warning" | "critical"; message: string; taskId?: string; }
export interface WalletRiskReport {
  level: "low" | "medium" | "high"; scope: "wallet-policy-and-payment-operations";
  checks: WalletRiskCheck[]; observedAt: number;
}
export interface WalletPaymentReview {
  status: "ready" | "blocked"; taskIds: string[]; totalUnits: string;
  balanceAfterUnits: string; remainingDailyAfterUnits: string;
  blockers: WalletRiskCheck[];
  items: { taskId: string; recipient: string; amountUnits: string; invoiceId: string }[];
}
export interface WalletAssistantResponse {
  intent: WalletIntent["action"]; interpretation: string; origin: "live_model"; modelId: string;
  overview: WalletOverview; risk: WalletRiskReport;
  paymentReview?: WalletPaymentReview; task?: PaymentTask;
}
export interface WalletExecutionResponse {
  status: "queued" | "already_submitted" | "blocked";
  tasks: PaymentTask[]; schedulerPaused: boolean; review?: WalletPaymentReview;
}
export interface ReviewedWalletPlans { review: WalletPaymentReview; plans: PaymentPlan[]; }
