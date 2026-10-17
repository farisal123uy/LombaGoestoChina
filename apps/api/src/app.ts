import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { developmentChain, addressSchema, signatureSchema, createPaymentTaskSchema, databaseValueSchema, procureSchema, serviceCatalog, type AgentExchange, type PaymentTask, type PolicySnapshot } from "@guardian-wallet/shared";
import { accountKey, type PaymentStore } from "@guardian-wallet/database";
import { interpretProcurement, type QwenClient, type PaymentPlanner } from "@guardian-wallet/planner";
import { getPaymentId, quoteTypedData, invoiceId, providerId, serviceHash, getServiceOffer, type createProviderAgentClient, type createProviderServiceClient } from "@guardian-wallet/wallet";
import { verifyTypedData, type Address } from "viem";
import { OwnerAuth, ApiError } from "./auth.js";

export interface FinancialApi {
  ownerAddress: Address;
  accountAddress: Address;
  guardianAddress: Address;
  chainId: number;
  authDomain: string;
  store: PaymentStore;
  planner: PaymentPlanner;
  readPolicy(): Promise<PolicySnapshot>;
  procurement?: { qwen: QwenClient; provider: ReturnType<typeof createProviderAgentClient>; service: ReturnType<typeof createProviderServiceClient>; modelId: string };
}

export async function buildApp(webOrigin = "http://localhost:3000", financial?: FinancialApi, model: { provider: "baseline" | "ollama"; modelId: string | null } = { provider: "baseline", modelId: null }) {
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] }, bodyLimit: 32768 });
  await app.register(cors, { origin: webOrigin });
  const auth = financial && new OwnerAuth(financial.ownerAddress, financial.authDomain, financial.chainId);
  const procurementRequests = new Map<string, { instruction: string; work: Promise<unknown> }>();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "INVALID_REQUEST", fields: error.issues.map((i) => i.path.join(".")) });
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ error: error.message });
    if (error instanceof Error && error.message === "TASK_BUSY") return reply.code(409).send({ error: "TASK_BUSY" });
    if (error instanceof Error && /^QWEN_[A-Z_]+$/.test(error.message)) return reply.code(error.message === "QWEN_INVALID_OUTPUT" ? 502 : 503).send({ error: error.message });
    if (error && typeof error === "object" && "statusCode" in error && (error.statusCode === 400 || error.statusCode === 413)) return reply.code(error.statusCode).send({ error: "INVALID_REQUEST" });
    // SDK/RPC error strings can include credential-bearing URLs. Do not return/log them.
    return reply.code(500).send({ error: "REQUEST_FAILED" });
  });
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
    financialConfigured: Boolean(financial), providerConfigured: Boolean(financial?.procurement), ownerAddress: financial?.ownerAddress, accountAddress: financial?.accountAddress, chain: developmentChain, model,
    capabilities: { ownerAuthentication: "implemented_single_instance", walletDelegation: "kernel_0.3.1_fork_tested", aiPlanning: model.provider === "ollama" ? "qwen_ollama_adapter_configured" : "deterministic_baseline", transactionExecution: "requires_deployed_funded_account_and_worker", onchainPolicyEnforcement: "local_and_kernel_fork_tested" },
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
    const planned: PaymentTask = outcome.status === "planned" ? { ...updated, status: "planned", plan: outcome.plan } : { ...updated, status: outcome.status, reason: outcome.reason };
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
  app.get("/v1/policy", async (request) => {
    const ctx = context(request.headers.authorization);
    return { policy: await ctx.readPolicy() };
  });
  app.get("/v1/provider/catalog", async (request) => { context(request.headers.authorization); return { offers: serviceCatalog, serviceKind: "provider-managed-postgresql-kv-test-namespace" }; });
  app.post("/v1/procure", async (request) => {
    const ctx = context(request.headers.authorization);
    const input = procureSchema.parse(request.body);
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
      if (pending.instruction !== input.instruction) throw new ApiError(409, "REQUEST_ID_REUSED_FOR_DIFFERENT_GOAL");
      return pending.work;
    }
    const work = (async () => {
      const exchange: AgentExchange[] = [];
      const intent = await interpretProcurement(ctx.procurement!.qwen, input.instruction);
      exchange.push({ actor: "astra", stage: "service_request", summary: intent.summary, modelId: ctx.procurement!.modelId, observedAt: new Date().toISOString() });
      if (intent.action !== "request_quote") return { status: intent.action === "wait" ? "waiting" : "needs_owner", reason: intent.summary, exchange };
      const reply = await ctx.procurement!.provider.requestQuote(input.requestId, input.instruction, intent.offerId);
      exchange.push({ actor: "provider_agent", stage: "offer_response", summary: reply.reason, modelId: reply.modelId, observedAt: new Date().toISOString() });
      if (!reply.accepted) return { status: "needs_owner", reason: reply.reason, exchange };
      const offer = getServiceOffer(intent.offerId), quote = reply.quote;
      if (quote.providerId !== providerId || quote.invoiceId !== invoiceId(ctx.accountAddress, input.requestId) || quote.serviceHash !== serviceHash(offer.id) || quote.amountUnits !== offer.amountUnits) throw new ApiError(400, "PROVIDER_OFFER_BINDING_FAILED");
      const made = await makeTask(request.headers.authorization, { instruction: input.instruction, quote });
      const outcome = await ctx.planner.plan(made.task, made.state);
      exchange.push({ actor: "provider_signer", stage: "authenticated_invoice", summary: `Fixed catalog invoice: ${offer.amountUnits} integer token units.`, observedAt: new Date().toISOString() });
      exchange.push({ actor: "astra", stage: "payment_plan", summary: outcome.status === "planned" ? outcome.plan.summary : outcome.reason, modelId: ctx.procurement!.modelId, observedAt: new Date().toISOString() });
      const task: PaymentTask = { ...made.task, requestId: input.requestId, offerId: offer.id, exchange,
        ...(outcome.status === "planned" ? { status: "planned", plan: outcome.plan } : { status: outcome.status, reason: outcome.reason }) };
       const saved = await ctx.store.createTask(task);
       if (saved.instruction !== input.instruction) throw new ApiError(409, "REQUEST_ID_REUSED_FOR_DIFFERENT_GOAL");
       return { status: saved.status, task: saved, exchange };
    })();
    procurementRequests.set(key, { instruction: input.instruction, work });
    try { return await work; } finally { procurementRequests.delete(key); }
  });
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
