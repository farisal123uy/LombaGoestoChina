import { z } from "zod";
export * from "./payments.js";
export * from "./services.js";
export * from "./assistant.js";

export const developmentChain = {
  id: 84532,
  name: "Base Sepolia",
  explorerUrl: "https://sepolia.basescan.org",
  isTestnet: true,
} as const;

export const taskStatuses = [
  "draft", "planned", "authorized", "submitted", "confirmed", "completed",
  "needs_owner", "rejected", "failed", "unknown",
] as const;

export const taskStatusSchema = z.enum(taskStatuses);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const scaffoldCapabilities = {
  ownerAuthentication: "pending",
  walletDelegation: "pending",
  aiPlanning: "pending",
  transactionExecution: "pending",
  onchainPolicyEnforcement: "pending",
} as const;

export interface FinancialState {
  chainId: number;
  accountAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenDecimals: number;
  balanceUnits: string;
  observedAt: string;
}

export interface ActionPlan {
  taskId: string;
  recipientId: string;
  amountUnits: string;
  policyVersion: string;
  summary: string;
  requiresOwnerDecision: boolean;
}

export interface ExecutionRecord {
  taskId: string;
  chainId: number;
  status: TaskStatus;
  userOperationHash?: `0x${string}`;
  transactionHash?: `0x${string}`;
  errorCode?: string;
}
