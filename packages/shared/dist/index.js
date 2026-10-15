import { z } from "zod";
export const developmentChain = {
    id: 84532,
    name: "Base Sepolia",
    explorerUrl: "https://sepolia.basescan.org",
    isTestnet: true,
};
export const taskStatuses = [
    "draft", "planned", "authorized", "submitted", "confirmed", "completed",
    "needs_owner", "rejected", "failed", "unknown",
];
export const taskStatusSchema = z.enum(taskStatuses);
export const scaffoldCapabilities = {
    ownerAuthentication: "pending",
    walletDelegation: "pending",
    aiPlanning: "pending",
    transactionExecution: "pending",
    onchainPolicyEnforcement: "pending",
};
//# sourceMappingURL=index.js.map