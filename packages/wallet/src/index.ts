import type { ActionPlan, ExecutionRecord } from "@guardian-wallet/shared";
import { createPublicClient, http, type HttpTransport, type PublicClient } from "viem";
import { baseSepolia } from "viem/chains";

export function createDevelopmentPublicClient(rpcUrl: string): PublicClient<HttpTransport, typeof baseSepolia> {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl, { timeout: 10_000 }),
  });
}

export interface WalletExecutor {
  execute(plan: ActionPlan): Promise<ExecutionRecord>;
}

export const walletImplementationStatus = "pending" as const;
