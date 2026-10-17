import { createKernelAccountClient, createZeroDevPaymasterClient, type CreateKernelAccountReturnType, type KernelAccountClient } from "@zerodev/sdk";
import { http, type Address, type Chain, type PublicClient, type Transport } from "viem";
import { assertPaymaster } from "./user-operation.js";

export interface NativeSponsorship { url?: string; approvedPaymaster: Address; }
export function createExecutionClient(client: PublicClient, account: CreateKernelAccountReturnType<"0.7">, bundlerUrl: string, sponsorship?: NativeSponsorship, consumeFinalQuote = true): KernelAccountClient<Transport, Chain | undefined, CreateKernelAccountReturnType<"0.7">, PublicClient> {
  const paymaster = sponsorship ? createZeroDevPaymasterClient({ chain: client.chain, transport: http(sponsorship.url || bundlerUrl, { timeout: 15000, retryCount: 0 }) }) : undefined;
  return createKernelAccountClient({
    account, client, chain: client.chain, bundlerTransport: http(bundlerUrl, { timeout: 15000, retryCount: 0 }),
    userOperation: { estimateFeesPerGas: async () => client.estimateFeesPerGas() },
    paymaster: paymaster && sponsorship ? {
      getPaymasterStubData: async (operation) => {
        const result = await paymaster.sponsorUserOperation({ userOperation: operation, shouldConsume: false });
        assertPaymaster(result, sponsorship.approvedPaymaster);
        return result;
      },
      getPaymasterData: async (operation) => {
        const result = await paymaster.sponsorUserOperation({ userOperation: operation, shouldConsume: consumeFinalQuote });
        assertPaymaster(result, sponsorship.approvedPaymaster);
        return result;
      },
    } : undefined,
  });
}
