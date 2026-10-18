import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { developmentChain, addressSchema, signatureSchema, createPaymentTaskSchema, databaseValueSchema, procureSchema, serviceCatalog, type AgentExchange, type PaymentPlan, type PaymentTask, type PolicySnapshot, type WalletAssetMetadata } from "@guardian-wallet/shared";
import { accountKey, type PaymentStore } from "@guardian-wallet/database";
import { interpretProcurement, QwenRateLimitError, type QwenClient, type PaymentPlanner } from "@guardian-wallet/planner";
import { getPaymentId, quoteTypedData, invoiceId, providerId, serviceHash, getServiceOffer, type createProviderAgentClient, type createProviderServiceClient } from "@guardian-wallet/wallet";
import { verifyTypedData, type Address } from "viem";
import { OwnerAuth, ApiError } from "./auth.js";
import { registerWalletAssistant, type ProcurementResult } from "./wallet-assistant.js";

export interface FinancialApi {
  ownerAddress: Address;
  accountAddress: Address;
  guardianAddress: Address;
  chainId: number;
  authDomain: string;
  store: PaymentStore;
  planner: PaymentPlanner;
  readPolicy(): Promise<PolicySnapshot>;
  readAssetMetadata?(state: PolicySnapshot): Promise<WalletAssetMetadata>;
  validatePlan?(plan: PaymentPlan): Promise<void>;
  assistant?: { qwen: QwenClient };
  clock?: () => number;
  procurement?: { qwen: QwenClient; provider: ReturnType<typeof createProviderAgentClient>; service: ReturnType<typeof createProviderServiceClient>; modelId: string };
}

export async function buildApp(webOrigin = "http://localhost:3000", financial?: FinancialApi, model: { provider: "baseline" | "ollama" | "groq"; modelId: string | null } = { provider: "baseline", modelId: null }) {
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] }, bodyLimit: 32768 });
  await app.register(cors, { origin: webOrigin });
  const auth = financial && new OwnerAuth(financial.ownerAddress, financial.authDomain, financial.chainId);
  const procurementRequests = new Map<string, { instruction: string; draftOnly: boolean; work: Promise<ProcurementResult> }>();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "INVALID_REQUEST", fields: error.issues.map((i) => i.path.join(".")) });
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof QwenRateLimitError) return reply.header("retry-after", String(error.retryAfterSeconds)).code(429).send({ error: error.message, retryAfterSeconds: error.retryAfterSeconds });
    if (error instanceof Error && error.message === "QWEN_RATE_LIMITED" && "retryAfterSeconds" in error && typeof error.retryAfterSeconds === "number") {
      const seconds = Math.min(86400, Math.max(1, error.retryAfterSeconds));
      return reply.header("retry-after", String(seconds)).code(429).send({ error: error.message, retryAfterSeconds: seconds });
    }
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return reply.code(404).send({ error: "TASK_NOT_FOUND" });
    if (error instanceof Error && ["TASK_BUSY", "TASK_ALREADY_SUBMITTED", "CONFIRMED_PAYMENT_REQUIRED_FOR_DELIVERY", "DELIVERY_RETRY_LIMIT", "INVALID_REVIEWED_PLAN"].includes(error.message)) return reply.code(409).send({ error: error.message });
    if (error instanceof Error && /^QWEN_[A-Z_]+$/.test(error.message)) return reply.code(error.message === "QWEN_INVALID_OUTPUT" ? 502 : 503).send({ error: error.message });
    if (error && typeof error === "object" && "statusCode" in error && [400, 413, 415].includes(Number(error.statusCode))) return reply.code(Number(error.statusCode)).send({ error: "INVALID_REQUEST" });
    // SDK/RPC error strings can include credential-bearing URLs. Do not return/log them.
    return reply.code(500).send({ error: "REQUEST_FAILED" });
  });
  app.addHook("onSend", async (_request, reply) => { reply.header("cache-control", "no-store"); });
  function context(header?: string) {
    if (!financial || !auth) throw new ApiError(503, "FINANCIAL_SERVICES_NOT_CONFIGURED");
    return { ...financial, owner: auth.authenticate(header) };
  }

  app.get("/health", async () => ({
    status: "ok",
    service: "guardian-wallet-api",
    stage: "wallet-backend-foundation",
  }));

  app.get("/v1/status", async () => ({
    stage: "wallet-backend-foundation", executionEnabled: financial ? !await financial.store.isPaused(accountKey(financial.chainId, financial.accountAddress)) : false,
    financialConfigured: Boolean(financial), providerConfigured: Boolean(financial?.procurement), assistantConfigured: Boolean((financial?.assistant || financial?.procurement) && financial?.readAssetMetadata && financial?.validatePlan), ownerAddress: financial?.ownerAddress, accountAddress: financial?.accountAddress, chain: developmentChain, model,
    capabilities: { ownerAuthentication: "implemented_single_instance", walletDelegation: "kernel_0.3.1_fork_tested", aiPlanning: model.provider === "baseline" ? "deterministic_baseline" : model.modelId ? `structured_${model.provider}_model_configured` : "not_configured", transactionExecution: "requires_deployed_funded_account_and_worker", onchainPolicyEnforcement: "local_and_kernel_fork_tested" },
  }));

  app.post("/auth/nonce", async (request) => {
    if (!auth) throw new ApiError(503, "FINANCIAL_SERVICES_NOT_CONFIGURED");
    const input = z.strictObject({ address: addressSchema }).parse(request.body);
    return auth.challenge(input.address);
  });
  app.post("/auth/verify", async (request) => {
    if (!auth) throw new ApiError(503, "FINANCIAL_SERVICES_NOT_CONFIGURED");
    const input = z.strictObject({ address: addressSchema, nonce: z.string().regex(/^[0-9a-f]{48}$/), signature: signatureSchema }).parse(request.body);
    return auth.verify(input.address, input.nonce, input.signature);
  });

  async function makeTask(header: string | undefined, body: unknown) {
    const ctx = context(header);
    const input = createPaymentTaskSchema.parse(body);
    if (input.quote.account.toLowerCase() !== ctx.accountAddress.toLowerCase()) throw new ApiError(403, "ACCOUNT_NOT_REGISTERED");
    const state = await ctx.readPolicy();
    if (state.chainId !== ctx.chainId) throw new ApiError(503, "CHAIN_MISMATCH");
    if (!await verifyTypedData({ ...quoteTypedData(ctx.chainId, ctx.guardianAddress, input.quote), address: state.quoteSigner, signature: input.quote.signature })) throw new ApiError(400, "INVALID_QUOTE_SIGNATURE");
    const task: PaymentTask = { id: randomUUID(), chainId: ctx.chainId, owner: ctx.owner, paymentId: getPaymentId(ctx.chainId, input.quote), instruction: input.instruction, quote: input.quote, quoteSigner: state.quoteSigner, status: "queued", createdAt: new Date().toISOString() };
    return { ctx, task, state };
  }
  app.post("/v1/tasks", async (request, reply) => {
    const { ctx, task, state } = await makeTask(request.headers.authorization, request.body);
    const outcome = await ctx.planner.plan(task, state);
    const planned: PaymentTask = outcome.status === "planned" ? { ...task, status: "planned", plan: outcome.plan } : { ...task, status: outcome.status, reason: outcome.reason };
    const saved = await ctx.store.createTask(planned);
    return reply.code(saved.id === task.id ? 201 : 200).send({ task: saved });
  });
  app.post("/v1/tasks/:id/replan", async (request) => {
    const { ctx, task, state } = await makeTask(request.headers.authorization, request.body);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const current = await ctx.store.getTask(id, ctx.owner);
    if (!current) throw new ApiError(404, "TASK_NOT_FOUND");
    if (current.paymentId !== task.paymentId) throw new ApiError(400, "INVOICE_ID_MISMATCH");
    const updated = { ...current, ...task, id, createdAt: current.createdAt };
    const outcome = await ctx.planner.plan(updated, state);
    const planned: PaymentTask = outcome.status === "planned" ? { ...updated, status: current.status === "draft" ? "draft" : "planned", plan: outcome.plan } : { ...updated, status: outcome.status, reason: outcome.reason };
    await ctx.store.replaceUnsubmittedTask(planned);
    return { task: planned };
  });
  app.post("/v1/plans", async (request) => {
    const { ctx, task, state } = await makeTask(request.headers.authorization, request.body);
    return { previewOnly: true, ...await ctx.planner.plan(task, state) };
  });
  app.get("/v1/tasks", async (request) => {
    const ctx = context(request.headers.authorization);
    return { tasks: await ctx.store.listTasks(ctx.owner) };
  });
  app.get("/v1/tasks/:id", async (request) => {
    const ctx = context(request.headers.authorization);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const task = await ctx.store.getTask(id, ctx.owner);
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND");
    return { task, operation: await ctx.store.getAttempt(id, ctx.owner) };
  });
  for (const [route, action] of [["cancel", "cancel"], ["retry-delivery", "retry_delivery"]] as const) {
    app.post(`/v1/tasks/:id/${route}`, async (request) => {
      const ctx = context(request.headers.authorization);
      const { id } = z.strictObject({ id: z.string().uuid() }).parse(request.params);
      z.strictObject({}).parse(request.body ?? {});
      const task = await ctx.store.manageTask(id, ctx.owner, accountKey(ctx.chainId, ctx.accountAddress), action);
      return { task, paymentResubmitted: false, schedulerPaused: await ctx.store.isPaused(accountKey(ctx.chainId, ctx.accountAddress)) };
    });
  }
  app.get("/v1/policy", async (request) => {
    const ctx = context(request.headers.authorization);
    return { policy: await ctx.readPolicy() };
  });
  app.get("/v1/provider/catalog", async (request) => { context(request.headers.authorization); return { offers: serviceCatalog, serviceKind: "provider-managed-postgresql-kv-test-namespace" }; });
  async function procure(header: string | undefined, body: unknown, draftOnly = false): Promise<ProcurementResult> {
    const ctx = context(header);
    const input = procureSchema.parse(body);
    if (!ctx.procurement) throw new ApiError(503, "PROVIDER_NOT_CONFIGURED");
    const id = getPaymentId(ctx.chainId, { account: ctx.accountAddress, providerId, invoiceId: invoiceId(ctx.accountAddress, input.requestId) });
    const existing = await ctx.store.getByPaymentId(id, ctx.owner);
    if (existing) {
      if (existing.instruction !== input.instruction) throw new ApiError(409, "REQUEST_ID_REUSED_FOR_DIFFERENT_GOAL");
      return { status: existing.status, task: existing, exchange: existing.exchange || [] };
    }
    const key = `${ctx.owner.toLowerCase()}:${input.requestId}`;
    const pending = procurementRequests.get(key);
    if (pending) {
      if (pending.instruction !== input.instruction || pending.draftOnly !== draftOnly) throw new ApiError(409, "REQUEST_ID_REUSED_FOR_DIFFERENT_GOAL");
      return pending.work;
    }
    const work: Promise<ProcurementResult> = (async () => {
      const exchange: AgentExchange[] = [];
      const intent = await interpretProcurement(ctx.procurement!.qwen, input.instruction);
      exchange.push({ actor: "astra", stage: "service_request", summary: intent.summary, modelId: ctx.procurement!.modelId, observedAt: new Date().toISOString() });
      if (intent.action !== "request_quote" || intent.offerId === null) return { status: intent.action === "wait" ? "waiting" : "needs_owner", reason: intent.summary, exchange };
      const reply = await ctx.procurement!.provider.requestQuote(input.requestId, input.instruction, intent.offerId);
      exchange.push({ actor: "provider_agent", stage: "offer_response", summary: reply.reason, modelId: reply.modelId, observedAt: new Date().toISOString() });
      if (!reply.accepted) return { status: "needs_owner", reason: reply.reason, exchange };
      const offer = getServiceOffer(intent.offerId), quote = reply.quote;
      if (quote.providerId !== providerId || quote.invoiceId !== invoiceId(ctx.accountAddress, input.requestId) || quote.serviceHash !== serviceHash(offer.id) || quote.amountUnits !== offer.amountUnits) throw new ApiError(400, "PROVIDER_OFFER_BINDING_FAILED");
      const made = await makeTask(header, { instruction: input.instruction, quote });
      const outcome = await ctx.planner.plan(made.task, made.state);
      exchange.push({ actor: "provider_signer", stage: "authenticated_invoice", summary: `Fixed catalog invoice: ${offer.amountUnits} integer token units.`, observedAt: new Date().toISOString() });
      exchange.push({ actor: "astra", stage: "payment_plan", summary: outcome.status === "planned" ? outcome.plan.summary : outcome.reason, modelId: ctx.procurement!.modelId, observedAt: new Date().toISOString() });
      const task: PaymentTask = { ...made.task, requestId: input.requestId, offerId: offer.id, exchange,
        ...(outcome.status === "planned" ? { status: draftOnly ? "draft" : "planned", plan: outcome.plan } : { status: outcome.status, reason: outcome.reason }) };
       const saved = await ctx.store.createTask(task);
       if (saved.instruction !== input.instruction) throw new ApiError(409, "REQUEST_ID_REUSED_FOR_DIFFERENT_GOAL");
       return { status: saved.status, task: saved, exchange };
    })();
    procurementRequests.set(key, { instruction: input.instruction, draftOnly, work });
    try { return await work; } finally { procurementRequests.delete(key); }
  }
  app.post("/v1/procure", async (request) => procure(request.headers.authorization, request.body));
  registerWalletAssistant(app, context, procure);
  async function serviceTask(header: string | undefined, params: unknown) {
    const ctx = context(header);
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const task = await ctx.store.getTask(id, ctx.owner);
    if (!ctx.procurement || task?.status !== "completed" || !task.delivery) throw new ApiError(409, "SERVICE_NOT_READY");
    return { ctx, namespace: task.delivery.namespaceId };
  }
  app.post("/v1/tasks/:id/probe", async (request) => {
    const { ctx, namespace } = await serviceTask(request.headers.authorization, request.params);
    return ctx.procurement!.service.probe(namespace, randomUUID());
  });
  app.get("/v1/tasks/:id/database", async (request) => {
    const { ctx, namespace } = await serviceTask(request.headers.authorization, request.params);
    return ctx.procurement!.service.values(namespace);
  });
  app.put("/v1/tasks/:id/database", async (request) => {
    const { ctx, namespace } = await serviceTask(request.headers.authorization, request.params);
    const input = databaseValueSchema.parse(request.body);
    return ctx.procurement!.service.put(namespace, input.key, input.value);
  });
  for (const [route, paused] of [["/agent/start", false], ["/agent/pause", true]] as const) {
    app.post(route, async (request) => {
      const ctx = context(request.headers.authorization);
      await ctx.store.setPaused(accountKey(ctx.chainId, ctx.accountAddress), paused);
      return { locallyPaused: paused, onchainAuthorityChanged: false };
    });
  }

  return app;
}
