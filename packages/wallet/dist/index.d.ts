import type { ActionPlan, ExecutionRecord } from "@guardian-wallet/shared";
import { type HttpTransport, type PublicClient } from "viem";
import { baseSepolia } from "viem/chains";
export declare function createDevelopmentPublicClient(rpcUrl: string): PublicClient<HttpTransport, typeof baseSepolia>;
export interface WalletExecutor {
    execute(plan: ActionPlan): Promise<ExecutionRecord>;
}
export declare const walletImplementationStatus: "pending";
//# sourceMappingURL=index.d.ts.map