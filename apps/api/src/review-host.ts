import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

export interface ReviewWorkspace {
  api: FastifyInstance; token: string; ownerAddress: string; accountAddress: string;
  close(): Promise<void>;
}
interface Session { workspace: ReviewWorkspace; expiresAt: number; active: number; closing: boolean; requests: number[]; modelRequests: number[]; }
interface CreationResult { id: string; token: string; ownerAddress: string; accountAddress: string; expiresAt: number; mode: string; publicBroadcast: boolean; externalBilling: string; }
interface AccessAttempts { windowStartedAt: number; attempts: number; blockedUntil: number; }
const digest = (value: string) => createHash("sha256").update(value).digest();
const allowed = (method: string, path: string) => {
  if (method === "GET" && ["/v1/status", "/v1/policy", "/v1/tasks", "/v1/assets", "/v1/risk", "/v1/provider/catalog"].includes(path)) return true;
  if (method === "POST" && ["/v1/assistant", "/v1/assistant/execute", "/v1/procure", "/agent/start", "/agent/pause"].includes(path)) return true;
  return /^(?:GET \/v1\/tasks\/[0-9a-f-]{36}(?:\/database)?|POST \/v1\/tasks\/[0-9a-f-]{36}\/(?:probe|cancel|retry-delivery)|PUT \/v1\/tasks\/[0-9a-f-]{36}\/database)$/.test(`${method} ${path}`);
};

/** Capability-scoped disposable fork workspaces, separate from the owner's API. */
export async function buildReviewHost(options: {
  accessCode: string; createWorkspace(): Promise<ReviewWorkspace>;
  ready(): Promise<{ model: string; fork: string }>;
  buildId?: string;
  maxSessions?: number; lifetimeMs?: number; clock?: () => number;
}) {
  if (options.accessCode.length < 32) throw new Error("REVIEW_ACCESS_CODE_TOO_SHORT");
  const buildId = options.buildId || "development";
  if (buildId !== "development" && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(buildId)) throw new Error("INVALID_REVIEW_BUILD_ID");
  const maxSessions = options.maxSessions ?? 2, lifetimeMs = options.lifetimeMs ?? 15 * 60000, clock = options.clock ?? Date.now;
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 3 || !Number.isInteger(lifetimeMs) || lifetimeMs < 60000 || lifetimeMs > 15 * 60000) throw new Error("INVALID_REVIEW_LIMITS");
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] }, bodyLimit: 32768 });
  const sessions = new Map<string, Session>();
  const creations = new Map<string, { work: Promise<CreationResult>; createdAt: number }>();
  const accessAttempts = new Map<string, AccessAttempts>();
  let initializing = 0, shuttingDown = false, cleanupFailed = false;
  const cleanup = new Set<Promise<void>>();
  function retire(id: string, session: Session) {
    session.closing = true;
    if (session.active || !sessions.has(id)) return;
    sessions.delete(id);
    const closing = session.workspace.close().catch(() => { cleanupFailed = true; app.log.error({ code: "REVIEW_WORKSPACE_CLEANUP_FAILED" }); }).finally(() => cleanup.delete(closing));
    cleanup.add(closing);
  }
  function prune() {
    for (const [id, session] of sessions) if (session.expiresAt <= clock() || session.closing) retire(id, session);
    for (const [id, creation] of creations) if (creation.createdAt + lifetimeMs + 120000 <= clock()) creations.delete(id);
  }
  const timer = setInterval(prune, 2000); timer.unref();
  app.addHook("onClose", async () => {
    shuttingDown = true; clearInterval(timer);
    await Promise.allSettled([...creations.values()].map((creation) => creation.work));
    for (const [id, session] of sessions) { session.active = 0; retire(id, session); }
    await Promise.allSettled([...cleanup]);
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "INVALID_REVIEW_REQUEST" });
    if (error && typeof error === "object" && "statusCode" in error && [400, 413, 415].includes(Number(error.statusCode))) return reply.code(Number(error.statusCode)).send({ error: "INVALID_REVIEW_REQUEST" });
    const code = error instanceof Error && /^(REVIEW|QWEN)_[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : "REVIEW_REQUEST_FAILED";
    return reply.code(503).send({ error: code });
  });
  app.addHook("onSend", async (_request, reply) => { reply.header("cache-control", "no-store"); });
  app.get("/health", async () => ({ status: "ok", service: "guardian-review", mode: "isolated-local-fork", externalBilling: "none", buildId }));
  app.get("/ready", async (_request, reply) => {
    prune();
    const dependencies = await options.ready();
    const ready = dependencies.model === "ready" && dependencies.fork === "ready" && !shuttingDown && !cleanupFailed;
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "unavailable", mode: "isolated-local-fork", dependencies, availableSlots: Math.max(0, maxSessions - sessions.size - initializing - cleanup.size), maxSessions, lifetimeSeconds: lifetimeMs / 1000, externalBilling: "none", buildId });
  });
  app.post("/sessions", async (request, reply) => {
    const input = z.strictObject({ requestId: z.string().uuid(), accessCode: z.string().min(1).max(256) }).parse(request.body);
    const now = clock(), remote = createHash("sha256").update(request.ip || "unknown").digest("hex");
    for (const [ip, attempt] of accessAttempts) if (attempt.windowStartedAt + 3600000 <= now && attempt.blockedUntil <= now) accessAttempts.delete(ip);
    let attempts = accessAttempts.get(remote);
    if (attempts?.blockedUntil && attempts.blockedUntil > now) return reply.header("retry-after", String(Math.ceil((attempts.blockedUntil - now) / 1000))).code(429).send({ error: "REVIEW_ACCESS_RATE_LIMIT", retryAfterSeconds: Math.ceil((attempts.blockedUntil - now) / 1000) });
    if (!attempts || attempts.windowStartedAt + 60000 <= now) { attempts = { windowStartedAt: now, attempts: 0, blockedUntil: 0 }; accessAttempts.set(remote, attempts); }
    attempts.attempts++;
    if (attempts.attempts > 20) { attempts.blockedUntil = now + 15 * 60000; return reply.header("retry-after", "900").code(429).send({ error: "REVIEW_ACCESS_RATE_LIMIT", retryAfterSeconds: 900 }); }
    if (!timingSafeEqual(digest(input.accessCode), digest(options.accessCode))) return reply.code(401).send({ error: "REVIEW_ACCESS_REQUIRED" });
    prune();
    const prior = creations.get(input.requestId);
    if (prior) {
      const result = await prior.work;
      const session = sessions.get(result.id);
      if (!session || session.closing || result.expiresAt <= clock()) return reply.code(410).send({ error: "REVIEW_SESSION_CLOSED_OR_EXPIRED" });
      return result;
    }
    if (cleanupFailed || shuttingDown) return reply.code(503).send({ error: "REVIEW_HOST_UNAVAILABLE" });
    if (sessions.size + initializing + cleanup.size >= maxSessions || creations.size >= 64) return reply.header("retry-after", "30").code(429).send({ error: "REVIEW_CAPACITY_FULL", retryAfterSeconds: 30 });
    initializing++;
    const work = (async () => {
      const workspace = await options.createWorkspace();
      const id = randomUUID(), expiresAt = clock() + lifetimeMs;
      if (shuttingDown) { await workspace.close(); throw new Error("REVIEW_SHUTTING_DOWN"); }
      sessions.set(id, { workspace, expiresAt, active: 0, closing: false, requests: [], modelRequests: [] });
      return { id, token: workspace.token, ownerAddress: workspace.ownerAddress, accountAddress: workspace.accountAddress, expiresAt, mode: "isolated-local-fork", publicBroadcast: false, externalBilling: "none" };
    })().finally(() => { initializing--; });
    creations.set(input.requestId, { work, createdAt: clock() });
    try { return await work; } catch (error) { creations.delete(input.requestId); throw error; }
  });
  function authenticate(id: string, header?: string) {
    prune();
    const session = sessions.get(id);
    if (!session || session.closing || session.expiresAt <= clock() || !header || !timingSafeEqual(digest(header), digest(`Bearer ${session.workspace.token}`))) return;
    return session;
  }
  app.delete<{ Params: { id: string } }>("/sessions/:id", async (request, reply) => {
    const session = authenticate(request.params.id, request.headers.authorization);
    if (!session) return reply.code(401).send({ error: "REVIEW_SESSION_EXPIRED_OR_INVALID" });
    retire(request.params.id, session);
    return { status: "closed" };
  });
  app.all<{ Params: { id: string; "*": string } }>("/sessions/:id/*", async (request, reply) => {
    const session = authenticate(request.params.id, request.headers.authorization);
    if (!session) return reply.code(401).send({ error: "REVIEW_SESSION_EXPIRED_OR_INVALID" });
    const path = `/${request.params["*"]}`;
    if (!allowed(request.method, path) || request.url.includes("?")) return reply.code(404).send({ error: "REVIEW_ROUTE_NOT_AVAILABLE" });
    const now = clock();
    session.requests = session.requests.filter((at) => at > now - 60000);
    session.modelRequests = session.modelRequests.filter((at) => at > now - 60000);
    const modelRequest = request.method === "POST" && ["/v1/assistant", "/v1/assistant/execute", "/v1/procure"].includes(path);
    if (session.requests.length >= 180 || (modelRequest && session.modelRequests.length >= 8)) return reply.header("retry-after", "60").code(429).send({ error: "REVIEW_RATE_LIMIT", retryAfterSeconds: 60 });
    session.requests.push(now); if (modelRequest) session.modelRequests.push(now);
    session.active++;
    try {
      const result = await session.workspace.api.inject({ method: request.method as "GET" | "POST" | "PUT", url: path, headers: { authorization: `Bearer ${session.workspace.token}`, ...(request.body !== undefined ? { "content-type": "application/json" } : {}) }, ...(request.body !== undefined ? { payload: request.body as object } : {}) });
      const retry = result.headers["retry-after"];
      if (typeof retry === "string" && /^\d{1,5}$/.test(retry)) reply.header("retry-after", retry);
      return reply.code(result.statusCode).type("application/json").send(result.body);
    } finally { session.active--; if (session.closing) retire(request.params.id, session); }
  });
  return app;
}
