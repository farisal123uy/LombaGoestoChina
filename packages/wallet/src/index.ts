import type { ActionPlan, ExecutionRecord } from "@guardian-wallet/shared";
import { createPublicClient, http, type HttpTransport, type PublicClient } from "viem";
import { baseSepolia } from "viem/chains";
export * from "./guardian.js";
export * from "./kernel.js";
export * from "./execution.js";
export * from "./user-operation.js";
export * from "./sponsorship.js";
export * from "./bootstrap.js";
export * from "./services.js";
export * from "./provider-client.js";

export function createDevelopmentPublicClient(rpcUrl: string): PublicClient<HttpTransport> {
  return createPublicClient({
    // Standard RPC fields suffice here; don't leak OP-specific transaction unions
    // into the chain-neutral planner/store/driver interfaces.
    chain: { id: baseSepolia.id, name: baseSepolia.name, nativeCurrency: baseSepolia.nativeCurrency, rpcUrls: baseSepolia.rpcUrls },
    transport: http(rpcUrl, { timeout: 10_000 }),
  });
}

export interface WalletExecutor {
  execute(plan: ActionPlan): Promise<ExecutionRecord>;
}

export const walletImplementationStatus = "kernel_guardian_initial_slice" as const;
