import { z } from "zod";
import { addressSchema, developmentChain } from "@guardian-wallet/shared";
import { randomUUID } from "node:crypto";
import { createPostgresPaymentStore, accountKey } from "@guardian-wallet/database";
import { BoundedPaymentPlanner } from "@guardian-wallet/planner";
import { createAgentKernel, createDevelopmentPublicClient, createKernelPaymentDriver, createProviderFulfillment } from "@guardian-wallet/wallet";
import { privateKeyToAccount } from "viem/accounts";
import { PaymentWorker } from "./worker.js";

const environment = z.object({
  WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(2000),
  EXECUTION_ENABLED: z.enum(["false", "true"]).default("false"),
  DATABASE_URL: z.string().min(1).optional(), BASE_SEPOLIA_RPC_URL: z.url().optional(), ZERODEV_RPC_URL: z.url().optional(),
  KERNEL_ACCOUNT_ADDRESS: addressSchema.optional(), GUARDIAN_ADDRESS: addressSchema.optional(),
  AGENT_SESSION_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((v) => v as `0x${string}`).optional(),
  SESSION_VALID_UNTIL: z.coerce.number().int().positive().optional(),
  SESSION_ENABLE_SIGNATURE: z.string().regex(/^0x[0-9a-fA-F]+$/).transform((v) => v as `0x${string}`).optional(),
  MAX_GAS_COST_WEI: z.string().regex(/^[1-9][0-9]*$/).default("1000000000000000"),
  CONFIRMATIONS: z.coerce.number().int().min(1).default(2),
  GAS_MODE: z.enum(["native", "sponsored"]).default("native"),
  APPROVED_PAYMASTER_ADDRESS: addressSchema.optional(),
  PROVIDER_SIGNER_URL: z.url().optional(), PROVIDER_SIGNER_TOKEN: z.string().min(32).optional(), PROVIDER_SIGNER_ADDRESS: addressSchema.optional(),
}).parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")));

let worker: PaymentWorker | undefined;
let closeDatabase: (() => Promise<void>) | undefined;
try {
  if (environment.EXECUTION_ENABLED === "true") {
    const { DATABASE_URL, BASE_SEPOLIA_RPC_URL, ZERODEV_RPC_URL, KERNEL_ACCOUNT_ADDRESS, GUARDIAN_ADDRESS, AGENT_SESSION_PRIVATE_KEY, SESSION_VALID_UNTIL } = environment;
    if (!DATABASE_URL || !BASE_SEPOLIA_RPC_URL || !ZERODEV_RPC_URL || !KERNEL_ACCOUNT_ADDRESS || !GUARDIAN_ADDRESS || !AGENT_SESSION_PRIVATE_KEY || !SESSION_VALID_UNTIL) throw new Error("INCOMPLETE_EXECUTOR_CONFIGURATION");
    if (environment.GAS_MODE === "sponsored" && !environment.APPROVED_PAYMASTER_ADDRESS) throw new Error("APPROVED_PAYMASTER_REQUIRED");
    const client = createDevelopmentPublicClient(BASE_SEPOLIA_RPC_URL);
    const account = await createAgentKernel(client, KERNEL_ACCOUNT_ADDRESS, privateKeyToAccount(AGENT_SESSION_PRIVATE_KEY), GUARDIAN_ADDRESS, SESSION_VALID_UNTIL, environment.SESSION_ENABLE_SIGNATURE);
    const database = createPostgresPaymentStore(DATABASE_URL);
    closeDatabase = database.close;
    worker = new PaymentWorker(database.store, new BoundedPaymentPlanner(), createKernelPaymentDriver({
      client, account, guardianAddress: GUARDIAN_ADDRESS, bundlerUrl: ZERODEV_RPC_URL, maxGasCostWei: BigInt(environment.MAX_GAS_COST_WEI), confirmations: environment.CONFIRMATIONS,
      sponsorship: environment.GAS_MODE === "sponsored" ? { approvedPaymaster: environment.APPROVED_PAYMASTER_ADDRESS! } : undefined,
    }), accountKey(84532, KERNEL_ACCOUNT_ADDRESS), randomUUID(), environment.PROVIDER_SIGNER_URL && environment.PROVIDER_SIGNER_TOKEN && environment.PROVIDER_SIGNER_ADDRESS ? createProviderFulfillment({ baseUrl: environment.PROVIDER_SIGNER_URL, token: environment.PROVIDER_SIGNER_TOKEN, guardian: GUARDIAN_ADDRESS, providerSigner: environment.PROVIDER_SIGNER_ADDRESS }) : undefined);
  }
} catch {
  await closeDatabase?.();
  throw new Error("EXECUTOR_INITIALIZATION_FAILED_CHECK_CONFIGURATION");
}

let stopped = false;
let wake: (() => void) | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { stopped = true; wake?.(); });
}
while (!stopped) {
  try {
    const status = worker ? await worker.runOnce() : "heartbeat_execution_disabled";
    console.info(JSON.stringify({ service: "guardian-wallet-worker", status, chainId: developmentChain.id, timestamp: new Date().toISOString() }));
  } catch (error) {
    // Never print credential-bearing RPC errors or the session key.
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? `DATABASE_${error.code}` : "RUNTIME_OPERATION_FAILED";
    console.error(JSON.stringify({ service: "guardian-wallet-worker", error: "TICK_FAILED", code }));
  }
  if (!stopped) await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, environment.WORKER_INTERVAL_MS);
    wake = () => { clearTimeout(timer); resolve(); };
  });
}
await closeDatabase?.();
