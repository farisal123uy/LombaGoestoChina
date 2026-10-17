import { z } from "zod";
import { buildApp } from "./app.js";
import { addressSchema } from "@guardian-wallet/shared";
import { createPostgresPaymentStore } from "@guardian-wallet/database";
import { BoundedPaymentPlanner, createQwenPlanner, QwenClient } from "@guardian-wallet/planner";
import { createDevelopmentPublicClient, createProviderAgentClient, createProviderServiceClient, readPolicySnapshot } from "@guardian-wallet/wallet";

const environment = z.object({
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(), BASE_SEPOLIA_RPC_URL: z.url().optional(),
  OWNER_ADDRESS: addressSchema.optional(), KERNEL_ACCOUNT_ADDRESS: addressSchema.optional(), GUARDIAN_ADDRESS: addressSchema.optional(),
  AUTH_DOMAIN: z.string().min(1).max(200).default("localhost:3000"),
  AI_PROVIDER: z.enum(["baseline", "ollama"]).default("baseline"),
  AI_MODEL_ID: z.string().min(1).default("qwen3:8b"),
  OLLAMA_BASE_URL: z.url().default("http://127.0.0.1:11434"), OLLAMA_API_TOKEN: z.string().min(1).optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(120000).default(45000),
  AI_CONTEXT_TOKENS: z.coerce.number().int().min(1024).max(8192).default(4096),
  PROVIDER_AGENT_URL: z.url().optional(), PROVIDER_AGENT_TOKEN: z.string().min(32).optional(),
  PROVIDER_SIGNER_URL: z.url().optional(), PROVIDER_SIGNER_TOKEN: z.string().min(32).optional(),
}).parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")));

const database = environment.DATABASE_URL ? createPostgresPaymentStore(environment.DATABASE_URL) : undefined;
if (database && (!environment.BASE_SEPOLIA_RPC_URL || !environment.OWNER_ADDRESS || !environment.KERNEL_ACCOUNT_ADDRESS || !environment.GUARDIAN_ADDRESS)) throw new Error("INCOMPLETE_FINANCIAL_API_CONFIGURATION");
const planner = environment.AI_PROVIDER === "ollama" ? createQwenPlanner({
  baseUrl: environment.OLLAMA_BASE_URL, modelId: environment.AI_MODEL_ID, apiToken: environment.OLLAMA_API_TOKEN,
  timeoutMs: environment.AI_REQUEST_TIMEOUT_MS, contextTokens: environment.AI_CONTEXT_TOKENS,
}) : new BoundedPaymentPlanner();
const publicClient = environment.BASE_SEPOLIA_RPC_URL ? createDevelopmentPublicClient(environment.BASE_SEPOLIA_RPC_URL) : undefined;
const app = await buildApp(environment.WEB_ORIGIN, database && environment.BASE_SEPOLIA_RPC_URL && environment.OWNER_ADDRESS && environment.KERNEL_ACCOUNT_ADDRESS && environment.GUARDIAN_ADDRESS ? {
  ownerAddress: environment.OWNER_ADDRESS, accountAddress: environment.KERNEL_ACCOUNT_ADDRESS, guardianAddress: environment.GUARDIAN_ADDRESS,
  chainId: 84532, authDomain: environment.AUTH_DOMAIN, store: database.store, planner,
  readPolicy: () => readPolicySnapshot(publicClient!, environment.GUARDIAN_ADDRESS!, environment.KERNEL_ACCOUNT_ADDRESS!),
  procurement: environment.AI_PROVIDER === "ollama" && environment.PROVIDER_AGENT_URL && environment.PROVIDER_AGENT_TOKEN && environment.PROVIDER_SIGNER_URL && environment.PROVIDER_SIGNER_TOKEN ? {
    qwen: new QwenClient({ baseUrl: environment.OLLAMA_BASE_URL, modelId: environment.AI_MODEL_ID, apiToken: environment.OLLAMA_API_TOKEN, timeoutMs: environment.AI_REQUEST_TIMEOUT_MS, contextTokens: environment.AI_CONTEXT_TOKENS }),
    provider: createProviderAgentClient({ baseUrl: environment.PROVIDER_AGENT_URL, token: environment.PROVIDER_AGENT_TOKEN }),
    service: createProviderServiceClient({ baseUrl: environment.PROVIDER_SIGNER_URL, token: environment.PROVIDER_SIGNER_TOKEN }), modelId: environment.AI_MODEL_ID,
  } : undefined,
} : undefined, { provider: environment.AI_PROVIDER, modelId: environment.AI_PROVIDER === "ollama" ? environment.AI_MODEL_ID : null });
if (database) app.addHook("onClose", async () => { await database.close(); });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: environment.HOST, port: environment.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
