import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
export function createDevelopmentPublicClient(rpcUrl) {
    return createPublicClient({
        chain: baseSepolia,
        transport: http(rpcUrl, { timeout: 10_000 }),
    });
}
export const walletImplementationStatus = "pending";
//# sourceMappingURL=index.js.map