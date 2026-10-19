import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { addressSchema, hashSchema, signatureSchema } from "@guardian-wallet/shared";
import {
  assertPaymaster, buildBootstrap, createExecutionClient, deserializeOperation, entryPoint,
  gasExposure, getGuardianSessionAuthorization, operationHash, serializeOperation,
  type BootstrapConfiguration, type NativeSponsorship,
} from "@guardian-wallet/wallet";
import { formatEther, parseEventLogs, verifyMessage, verifyTypedData, type Hex, type PublicClient } from "viem";
import { entryPoint07Abi, formatUserOperationRequest, UserOperationReceiptNotFoundError, type UserOperation } from "viem/account-abstraction";
import { ApiError, OwnerAuth } from "./auth.js";

const operationSchema = z.strictObject({
  id: z.string().uuid(), hash: hashSchema, payload: z.string(), preparedAt: z.number(), submissionBlock: z.string(),
  status: z.enum(["prepared", "submitting", "submitted", "unknown", "confirmed", "failed"]),
  maxGasCostWei: z.string(), transactionHash: hashSchema.optional(), reason: z.string().optional(),
});
const stateSchema = z.strictObject({ operation: operationSchema.optional(), sessionSignature: signatureSchema.optional(), runtimeSynced: z.boolean().default(false) });
type Journal = z.infer<typeof stateSchema>;

export class OnboardingJournal {
  constructor(private readonly path: string) {}
  async load(): Promise<Journal> {
    try { return stateSchema.parse(JSON.parse(await readFile(this.path, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { runtimeSynced: false }; throw new Error("ONBOARDING_JOURNAL_INVALID"); }
  }
  async save(value: Journal) {
    const parsed = stateSchema.parse(value);
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    try { await writeFile(temp, JSON.stringify(parsed), { mode: 0o600, flag: "wx" }); await rename(temp, this.path); }
    finally { await unlink(temp).catch(() => {}); }
  }
}

export interface OnboardingOptions {
  client: PublicClient;
  configuration: BootstrapConfiguration;
  settlementMode?: "direct" | "escrow";
  escrowWindowSeconds?: number;
  bundlerUrl: string;
  sponsorship: NativeSponsorship;
  maxGasCostWei: bigint;
  journal: OnboardingJournal;
  confirmations?: number;
  assertEscrowSchema?: () => Promise<void>;
  syncRuntime?: (deployment: { kernel: Hex; guardian: Hex; token: Hex }, sessionSignature: Hex, settlementMode: "direct" | "escrow", escrowWindowSeconds: number) => Promise<void>;
}

/** Single-owner, single-process LOCAL coordinator. No owner private key is accepted. */
export class OnboardingService {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: OnboardingOptions) {}
  private async serial<T>(body: () => Promise<T>) {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous.catch(() => {});
    try { return await body(); } finally { release(); }
  }
  private async context() {
    const bootstrap = await buildBootstrap(this.options.client, this.options.configuration);
    const bundler = createExecutionClient(this.options.client, bootstrap.account, this.options.bundlerUrl, this.options.sponsorship);
    return { ...bootstrap, bundler };
  }
  private async assertEscrowSchema() {
    if ((this.options.settlementMode ?? "direct") !== "escrow") return;
    try {
      if (!this.options.assertEscrowSchema) throw new Error("ESCROW_SCHEMA_PREFLIGHT_NOT_CONFIGURED");
      await this.options.assertEscrowSchema();
    } catch {
      throw new ApiError(503, "ONBOARDING_ESCROW_SCHEMA_REQUIRED");
    }
  }
  private view(state: Journal, context: Awaited<ReturnType<OnboardingService["context"]>>) {
    const operation = state.operation;
    return {
      chainId: 84532, owner: this.options.configuration.owner, kernel: context.account.address,
      settlementMode: this.options.settlementMode ?? "direct", kernelIndex: (this.options.configuration.kernelIndex ?? 0n).toString(),
      escrowWindowSeconds: this.options.escrowWindowSeconds ?? 600,
      guardian: context.guardianAddress, token: context.tokenAddress,
      providerSigner: this.options.configuration.providerSigner, recipient: this.options.configuration.recipient,
      sessionSigner: this.options.configuration.sessionSigner, validUntil: this.options.configuration.validUntil,
      limits: { initialTokenUnits: "10000000", protectedUnits: "6000000", perPaymentUnits: "1000000", dailyUnits: "2000000", decimals: 6 },
      installed: context.installed,
      ready: context.installed && operation?.status === "confirmed",
      sessionAuthorized: Boolean(state.sessionSignature),
      runtimeConfigured: state.runtimeSynced,
      gasMode: "sponsored_native_gas", paymaster: this.options.sponsorship.approvedPaymaster,
      operation: operation ? {
        id: operation.id, hash: operation.hash, preparedAt: operation.preparedAt, status: operation.status,
        maxGasCostWei: operation.maxGasCostWei, maxGasCostEth: formatEther(BigInt(operation.maxGasCostWei)),
        transactionHash: operation.transactionHash, reason: operation.reason,
      } : undefined,
      actions: ["Create the owner's Kernel account if needed", "Deploy Guardian and fixed-supply MockUSD through CREATE2", "Install Guardian with reserve and daily/per-payment limits", ...(this.options.settlementMode === "escrow" ? ["Authorize escrow lock, release and refund selectors for the session"] : [])],
    };
  }
  async status() { return this.serial(async () => this.view(await this.options.journal.load(), await this.context())); }

  async prepare() {
    return this.serial(async () => {
      await this.assertEscrowSchema();
      const state = await this.options.journal.load();
      const context = await this.context();
      if (state.operation && ["submitting", "submitted", "unknown"].includes(state.operation.status)) throw new ApiError(409, "ONBOARDING_RECONCILE_FIRST");
      if (state.operation?.status === "prepared" && Date.now() - state.operation.preparedAt < 300000 && context.calls.length) {
        const cached = deserializeOperation(state.operation.payload);
        const code = await this.options.client.getCode({ address: context.account.address });
        const deployed = Boolean(code && code !== "0x");
        if (Boolean(cached.factory) !== deployed && cached.callData === await context.account.encodeCalls(context.calls) && cached.nonce === await context.account.getNonce()) return this.view(state, context);
      }
      if (context.installed) {
        if (state.operation?.status !== "confirmed") throw new ApiError(409, "ONBOARDING_EXISTING_DEPLOYMENT_REQUIRES_REVIEW");
        return this.view(state, context);
      }
      if (!context.calls.length) throw new Error("ONBOARDING_NO_ACTIONS");
      const prepared = await context.bundler.prepareUserOperation({ callData: await context.account.encodeCalls(context.calls) });
      assertPaymaster(prepared, this.options.sponsorship.approvedPaymaster);
      const cost = gasExposure(prepared);
      if (cost > this.options.maxGasCostWei) throw new ApiError(409, "ONBOARDING_GAS_BUDGET_EXCEEDED");
      const operation: UserOperation<"0.7"> = { ...prepared, sender: context.account.address, signature: "0x" };
      const record = {
        id: randomUUID(), hash: operationHash(operation, 84532), payload: serializeOperation(operation),
        preparedAt: Date.now(), submissionBlock: (await this.options.client.getBlockNumber()).toString(),
        status: "prepared" as const, maxGasCostWei: cost.toString(),
      };
      state.operation = record;
      await this.options.journal.save(state);
      return this.view(state, context);
    });
  }

  async submit(id: string, signature: Hex) {
    return this.serial(async () => {
      const state = await this.options.journal.load(), record = state.operation;
      const context = await this.context();
      if (!record || record.id !== id) throw new ApiError(409, "ONBOARDING_OPERATION_MISMATCH");
      if (record.status !== "prepared") return this.view(state, context); // idempotent, never resend
      if (Date.now() - record.preparedAt > 300000) throw new ApiError(409, "ONBOARDING_QUOTE_EXPIRED_PREPARE_AGAIN");
      const operation = deserializeOperation(record.payload);
      if (operationHash(operation, 84532) !== record.hash || operation.sender.toLowerCase() !== context.account.address.toLowerCase()) throw new Error("ONBOARDING_PAYLOAD_BINDING");
      if (!context.calls.length || operation.callData !== await context.account.encodeCalls(context.calls) || operation.nonce !== await context.account.getNonce()) throw new ApiError(409, "ONBOARDING_STATE_CHANGED_PREPARE_AGAIN");
      const accountCode = await this.options.client.getCode({ address: context.account.address });
      if (Boolean(operation.factory) === Boolean(accountCode && accountCode !== "0x")) throw new ApiError(409, "ONBOARDING_STATE_CHANGED_PREPARE_AGAIN");
      if (gasExposure(operation) !== BigInt(record.maxGasCostWei) || gasExposure(operation) > this.options.maxGasCostWei) throw new ApiError(409, "ONBOARDING_GAS_BUDGET_EXCEEDED");
      if (!await verifyMessage({ address: this.options.configuration.owner, message: { raw: record.hash }, signature })) throw new ApiError(401, "ONBOARDING_OWNER_SIGNATURE_INVALID");
      assertPaymaster(operation, this.options.sponsorship.approvedPaymaster);
      operation.signature = signature;
      record.payload = serializeOperation(operation);
      record.status = "submitting";
      await this.options.journal.save(state); // durable before any network send
      try {
        const hash = await context.bundler.request({ method: "eth_sendUserOperation", params: [formatUserOperationRequest(operation), entryPoint.address] });
        if (hash.toLowerCase() !== record.hash.toLowerCase()) throw new Error("BUNDLER_HASH_MISMATCH");
        record.status = "submitted";
      } catch { record.status = "unknown"; record.reason = "SEND_OUTCOME_UNCERTAIN"; }
      await this.options.journal.save(state);
      return this.view(state, context);
    });
  }

  async reconcile() {
    return this.serial(async () => {
      const state = await this.options.journal.load(), record = state.operation;
      const context = await this.context();
      if (!record || ["prepared", "confirmed", "failed"].includes(record.status)) return this.view(state, context);
      let hash: Hex | undefined;
      try { hash = (await context.bundler.getUserOperationReceipt({ hash: record.hash })).receipt.transactionHash; }
      catch (error) { if (!(error instanceof UserOperationReceiptNotFoundError)) throw error; }
      const latest = await this.options.client.getBlockNumber();
      if (!hash) {
        const from = BigInt(record.submissionBlock);
        if (latest - from > 5000n) { record.reason = "EVENT_WINDOW_EXCEEDED_REVIEW_REQUIRED"; await this.options.journal.save(state); return this.view(state, context); }
        const logs = await this.options.client.getContractEvents({ address: entryPoint.address, abi: entryPoint07Abi, eventName: "UserOperationEvent", args: { userOpHash: record.hash }, fromBlock: from, toBlock: latest });
        hash = logs[0]?.transactionHash ?? undefined;
      }
      if (hash) {
        const receipt = await this.options.client.getTransactionReceipt({ hash });
        const canonical = await this.options.client.getBlock({ blockNumber: receipt.blockNumber });
        if (canonical.hash !== receipt.blockHash || latest - receipt.blockNumber + 1n < BigInt(this.options.confirmations ?? 2)) return this.view(state, context);
        const event = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs.filter((l) => l.address.toLowerCase() === entryPoint.address.toLowerCase()) }).find((e) => e.args.userOpHash.toLowerCase() === record.hash.toLowerCase());
        const operation = deserializeOperation(record.payload);
        if (!event || event.args.sender.toLowerCase() !== context.account.address.toLowerCase() || event.args.nonce !== operation.nonce) throw new Error("ONBOARDING_RECEIPT_BINDING");
        record.transactionHash = hash;
        if (!event.args.success) { record.status = "failed"; record.reason = "USER_OPERATION_REVERTED"; }
        else {
          const deployed = await this.context();
          if (!deployed.installed || deployed.calls.length) throw new Error("ONBOARDING_DEPLOYMENT_NOT_VERIFIED");
          record.status = "confirmed";
          record.reason = undefined;
        }
        await this.options.journal.save(state);
      }
      return this.view(state, await this.context());
    });
  }

  async authorization() {
    return this.serial(async () => {
      const state = await this.options.journal.load(), context = await this.context();
      if (!context.installed || state.operation?.status !== "confirmed") throw new ApiError(409, "ONBOARDING_DEPLOY_FIRST");
      await this.assertEscrowSchema();
      return getGuardianSessionAuthorization(this.options.client, context.account.address, this.options.configuration.owner, this.options.configuration.sessionSigner, context.guardianAddress, this.options.configuration.validUntil, this.options.settlementMode === "escrow");
    });
  }
  async authorizeSession(signature: Hex) {
    // Recompute authorization under the serialized lock, never trust client policy data.
    return this.serial(async () => {
      const state = await this.options.journal.load(), context = await this.context();
      if (!context.installed || state.operation?.status !== "confirmed") throw new ApiError(409, "ONBOARDING_DEPLOY_FIRST");
      await this.assertEscrowSchema();
      const { typedData } = await getGuardianSessionAuthorization(this.options.client, context.account.address, this.options.configuration.owner, this.options.configuration.sessionSigner, context.guardianAddress, this.options.configuration.validUntil, this.options.settlementMode === "escrow");
      if (!await verifyTypedData({ ...typedData, address: this.options.configuration.owner, signature })) throw new ApiError(401, "ONBOARDING_SESSION_SIGNATURE_INVALID");
      state.sessionSignature = signature;
      await this.options.journal.save(state);
      await this.options.syncRuntime?.({ kernel: context.account.address, guardian: context.guardianAddress, token: context.tokenAddress }, signature, this.options.settlementMode ?? "direct", this.options.escrowWindowSeconds ?? 600);
      state.runtimeSynced = Boolean(this.options.syncRuntime);
      await this.options.journal.save(state);
      return this.view(state, context);
    });
  }
  async syncRuntime() {
    return this.serial(async () => {
      const state = await this.options.journal.load(), context = await this.context();
      if (!state.sessionSignature || !context.installed || state.operation?.status !== "confirmed") throw new ApiError(409, "ONBOARDING_AUTHORIZE_SESSION_FIRST");
      if (!this.options.syncRuntime) throw new ApiError(503, "ONBOARDING_RUNTIME_SYNC_NOT_CONFIGURED");
      await this.assertEscrowSchema();
      await this.options.syncRuntime({ kernel: context.account.address, guardian: context.guardianAddress, token: context.tokenAddress }, state.sessionSignature, this.options.settlementMode ?? "direct", this.options.escrowWindowSeconds ?? 600);
      state.runtimeSynced = true;
      await this.options.journal.save(state);
      return this.view(state, context);
    });
  }
}

export async function buildOnboardingApp(service: OnboardingService, owner: `0x${string}`, webOrigin = "http://localhost:3000") {
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] }, bodyLimit: 4096 });
  const allowed = new Set([webOrigin, "http://localhost:3000", "http://127.0.0.1:3000"]);
  await app.register(cors, { origin: [...allowed] });
  const auth = new OwnerAuth(owner, new URL(webOrigin).host, 84532);
  app.addHook("onRequest", async (request) => {
    const host = request.headers.host?.split(":")[0];
    if (!host || !["localhost", "127.0.0.1"].includes(host) || (request.headers.origin && !allowed.has(request.headers.origin))) throw new ApiError(403, "ONBOARDING_LOCAL_ORIGIN_REQUIRED");
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "INVALID_REQUEST" });
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ error: error.message });
    const code = error instanceof Error && /^(?:ONBOARDING|PAYMASTER|CREATE2|EXISTING|WRONG|INVALID)_[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : "ONBOARDING_REQUEST_FAILED";
    return reply.code(500).send({ error: code });
  });
  app.get("/health", async () => ({ status: "ok", service: "local-owner-onboarding" }));
  app.get("/state", async () => service.status());
  app.post("/auth/nonce", async (request) => auth.challenge(z.strictObject({ address: addressSchema }).parse(request.body).address));
  app.post("/auth/verify", async (request) => {
    const input = z.strictObject({ address: addressSchema, nonce: z.string().regex(/^[0-9a-f]{48}$/), signature: signatureSchema }).parse(request.body);
    return auth.verify(input.address, input.nonce, input.signature);
  });
  for (const [path, action] of [["/prepare", () => service.prepare()], ["/reconcile", () => service.reconcile()], ["/session/authorization", () => service.authorization()], ["/runtime/sync", () => service.syncRuntime()]] as const) {
    app.post(path, async (request) => {
      auth.authenticate(request.headers.authorization);
      return JSON.parse(JSON.stringify(await action(), (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value));
    });
  }
  app.post("/submit", async (request) => {
    auth.authenticate(request.headers.authorization);
    const input = z.strictObject({ id: z.string().uuid(), signature: signatureSchema }).parse(request.body);
    return service.submit(input.id, input.signature);
  });
  app.post("/session/approve", async (request) => {
    auth.authenticate(request.headers.authorization);
    return service.authorizeSession(z.strictObject({ signature: signatureSchema }).parse(request.body).signature);
  });
  return app;
}
