import type { ActionPlan, FinancialState } from "@guardian-wallet/shared";
export * from "./payments.js";
export * from "./procurement.js";
export * from "./batching.js";
export * from "./wallet-assistant.js";
export { qwenRuntimeOptions, freeCloudQwenModel } from "./qwen.js";
export { StructuredModelClient, modelRuntimeOptions, type ModelOptions, type ModelMetrics } from "./qwen.js";
export * from "./model-profiles.js";
export { QwenRateLimitError } from "./cloud-quota.js";

export interface PlanningRequest {
  taskId: string;
  instruction: string;
  financialState: FinancialState;
  policyVersion: string;
}

export interface Planner {
  plan(request: PlanningRequest): Promise<ActionPlan>;
}

export const plannerImplementationStatus = "bounded_payment_planner" as const;
