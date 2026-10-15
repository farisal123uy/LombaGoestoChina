import { z } from "zod";
export declare const developmentChain: {
    readonly id: 84532;
    readonly name: "Base Sepolia";
    readonly explorerUrl: "https://sepolia.basescan.org";
    readonly isTestnet: true;
};
export declare const taskStatuses: readonly ["draft", "planned", "authorized", "submitted", "confirmed", "completed", "needs_owner", "rejected", "failed", "unknown"];
export declare const taskStatusSchema: z.ZodEnum<{
    draft: "draft";
    planned: "planned";
    authorized: "authorized";
    submitted: "submitted";
    confirmed: "confirmed";
    completed: "completed";
    needs_owner: "needs_owner";
    rejected: "rejected";
    failed: "failed";
    unknown: "unknown";
}>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export declare const scaffoldCapabilities: {
    readonly ownerAuthentication: "pending";
    readonly walletDelegation: "pending";
    readonly aiPlanning: "pending";
    readonly transactionExecution: "pending";
    readonly onchainPolicyEnforcement: "pending";
};
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
//# sourceMappingURL=index.d.ts.map