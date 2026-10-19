import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReviewHost, type ReviewWorkspace } from "../../apps/api/src/review-host.js";

const closes: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of closes.splice(0).reverse()) await close(); });
const code = "private-review-access-code-1234567890";
async function fixture(maxSessions = 2) {
  let now = Date.now(), serial = 0;
  const disposed = vi.fn();
  const createWorkspace = vi.fn(async (): Promise<ReviewWorkspace> => {
    const id = ++serial, api = Fastify();
    api.get("/v1/assets", async () => ({ workspace: id, funds: "ephemeral-only" }));
    api.post("/v1/assistant", async () => ({ workspace: id, intent: "asset_overview" }));
    return { api, token: `${id}`.padStart(64, "0"), ownerAddress: `owner-${id}`, accountAddress: `account-${id}`, close: async () => { disposed(id); await api.close(); } };
  });
  const host = await buildReviewHost({ accessCode: code, createWorkspace, maxSessions, clock: () => now, ready: async () => ({ model: "ready", fork: "ready" }) });
  closes.push(() => host.close());
  async function start(requestId = randomUUID()) {
    const response = await host.inject({ method: "POST", url: "/sessions", payload: { accessCode: code, requestId } });
    expect(response.statusCode).toBe(200);
    return response.json<{ id: string; token: string; mode: string; publicBroadcast: boolean }>();
  }
  return { host, start, createWorkspace, disposed, advance: (ms: number) => { now += ms; } };
}
describe("Reviewer host isolation and bounded resources", () => {
  it("refuses invalid public build metadata before starting a host or exposing a mistaken credential", async () => {
    const createWorkspace = vi.fn();
    await expect(buildReviewHost({ accessCode: code, createWorkspace, ready: async () => ({ model: "ready", fork: "ready" }), buildId: `gsk_test_${randomUUID().replaceAll("-", "")}` })).rejects.toThrow("INVALID_REVIEW_BUILD_ID");
    expect(createWorkspace).not.toHaveBeenCalled();
  });
  it("requires a review capability, deduplicates initialization, and isolates two independent wallets", async () => {
    const f = await fixture();
    expect((await f.host.inject({ method: "POST", url: "/sessions", payload: { requestId: randomUUID(), accessCode: "wrong" } })).statusCode).toBe(401);
    const requestId = randomUUID();
    const [one, same] = await Promise.all([f.start(requestId), f.start(requestId)]);
    expect(one.id).toBe(same.id); expect(one.mode).toBe("isolated-local-fork"); expect(one.publicBroadcast).toBe(false);
    const two = await f.start(); expect(two.id).not.toBe(one.id); expect(f.createWorkspace).toHaveBeenCalledTimes(2);
    const headers = { authorization: `Bearer ${one.token}` };
    expect((await f.host.inject({ method: "GET", url: `/sessions/${one.id}/v1/assets`, headers })).json()).toMatchObject({ workspace: 1 });
    expect((await f.host.inject({ method: "GET", url: `/sessions/${two.id}/v1/assets`, headers })).statusCode).toBe(401);
    expect((await f.host.inject({ method: "GET", url: `/sessions/${one.id}/v1/assets` })).statusCode).toBe(401);
    expect((await f.host.inject({ method: "POST", url: "/sessions", payload: { requestId: randomUUID(), accessCode: code } })).statusCode).toBe(429);
  });
  it("rate-limits incorrect access codes by client and returns Retry-After", async () => {
    const f = await fixture();
    // Host's clock is injected by fixture; failed guesses must not create a workspace.
    for (let attempt = 0; attempt < 20; attempt++) expect((await f.host.inject({ method: "POST", url: "/sessions", payload: { requestId: randomUUID(), accessCode: "wrong" } })).statusCode).toBe(401);
    const blocked = await f.host.inject({ method: "POST", url: "/sessions", payload: { requestId: randomUUID(), accessCode: code } });
    expect(blocked.statusCode).toBe(429); expect(blocked.headers["retry-after"]).toBe("900"); expect(f.createWorkspace).not.toHaveBeenCalled();
    f.advance(16 * 60000);
    expect((await f.start()).id).toBeTruthy();
  });
  it("never exposes login, arbitrary RPC, administration or query-string proxy routes", async () => {
    const f = await fixture(), session = await f.start(), headers = { authorization: `Bearer ${session.token}` };
    for (const path of ["auth/nonce", "admin", "rpc", "v1/tasks?owner=other", "v1/policy/configure"]) {
      expect((await f.host.inject({ method: "POST", url: `/sessions/${session.id}/${path}`, headers, payload: {} })).statusCode).toBe(404);
    }
    expect((await f.host.inject({ method: "GET", url: `/sessions/${session.id}/v1/assets`, headers })).body).not.toContain("privateKey");
  });
  it("expires and closes workspaces, invalidates access and releases the capacity", async () => {
    const f = await fixture(1), session = await f.start(), headers = { authorization: `Bearer ${session.token}` };
    f.advance(16 * 60000);
    expect((await f.host.inject({ method: "GET", url: `/sessions/${session.id}/v1/assets`, headers })).statusCode).toBe(401);
    await vi.waitFor(() => expect(f.disposed).toHaveBeenCalledOnce());
    const next = await f.start(); expect(next.id).not.toBe(session.id);
    expect((await f.host.inject({ method: "DELETE", url: `/sessions/${next.id}`, headers: { authorization: `Bearer ${next.token}` } })).json()).toEqual({ status: "closed" });
    expect((await f.host.inject({ method: "GET", url: `/sessions/${next.id}/v1/assets`, headers: { authorization: `Bearer ${next.token}` } })).statusCode).toBe(401);
  });
  it("bounds model requests while leaving read-only inspection available", async () => {
    const f = await fixture(), session = await f.start(), headers = { authorization: `Bearer ${session.token}` };
    for (let i = 0; i < 8; i++) expect((await f.host.inject({ method: "POST", url: `/sessions/${session.id}/v1/assistant`, headers, payload: {} })).statusCode).toBe(200);
    expect((await f.host.inject({ method: "POST", url: `/sessions/${session.id}/v1/assistant`, headers, payload: {} })).statusCode).toBe(429);
    expect((await f.host.inject({ method: "GET", url: `/sessions/${session.id}/v1/assets`, headers })).statusCode).toBe(200);
    f.advance(60001);
    expect((await f.host.inject({ method: "POST", url: `/sessions/${session.id}/v1/assistant`, headers, payload: {} })).statusCode).toBe(200);
  });
  it("never returns an already closed capability from a reused creation request ID", async () => {
    const f = await fixture(), requestId = randomUUID(), session = await f.start(requestId);
    await f.host.inject({ method: "DELETE", url: `/sessions/${session.id}`, headers: { authorization: `Bearer ${session.token}` } });
    const replay = await f.host.inject({ method: "POST", url: "/sessions", payload: { requestId, accessCode: code } });
    expect(replay.statusCode).toBe(410); expect(replay.body).not.toContain(session.token);
    expect(f.createWorkspace).toHaveBeenCalledOnce();
  });
  it("finishes authorized in-flight requests before one-time disposal and blocks new calls immediately", async () => {
    const f = await fixture(); let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; });
    f.createWorkspace.mockImplementationOnce(async () => {
      const api = Fastify(); api.post("/v1/assistant", async () => { entered(); await gate; return { finished: true }; });
      return { api, token: "a".repeat(64), ownerAddress: "owner", accountAddress: "account", close: async () => { f.disposed(); await api.close(); } };
    });
    const session = await f.start(), headers = { authorization: `Bearer ${session.token}` };
    const active = f.host.inject({ method: "POST", url: `/sessions/${session.id}/v1/assistant`, headers, payload: {} });
    await started;
    await f.host.inject({ method: "DELETE", url: `/sessions/${session.id}`, headers });
    expect(f.disposed).not.toHaveBeenCalled();
    expect((await f.host.inject({ method: "GET", url: `/sessions/${session.id}/v1/assets`, headers })).statusCode).toBe(401);
    release(); expect((await active).json()).toEqual({ finished: true });
    await vi.waitFor(() => expect(f.disposed).toHaveBeenCalledOnce());
  });
  it("reports cleanup failure as unavailable instead of quietly allocating more leaked workspaces", async () => {
    const f = await fixture();
    f.createWorkspace.mockImplementationOnce(async () => {
      const api = Fastify();
      return { api, token: "b".repeat(64), ownerAddress: "owner", accountAddress: "account", close: async () => { f.disposed(); await api.close(); throw new Error("secret-bearing-resource-error"); } };
    });
    const session = await f.start();
    await f.host.inject({ method: "DELETE", url: `/sessions/${session.id}`, headers: { authorization: `Bearer ${session.token}` } });
    await vi.waitFor(() => expect(f.disposed).toHaveBeenCalledOnce());
    await vi.waitFor(async () => expect((await f.host.inject({ method: "GET", url: "/ready" })).statusCode).toBe(503));
    const next = await f.host.inject({ method: "POST", url: "/sessions", payload: { requestId: randomUUID(), accessCode: code } });
    expect(next.statusCode).toBe(503); expect(next.body).not.toContain("secret-bearing"); expect(f.createWorkspace).toHaveBeenCalledOnce();
  });
  it("forwards the provider cooldown header through the reviewer boundary", async () => {
    const f = await fixture();
    f.createWorkspace.mockImplementationOnce(async () => {
      const api = Fastify(); api.post("/v1/assistant", async (_request, reply) => reply.header("retry-after", "17").code(429).send({ error: "QWEN_RATE_LIMITED", retryAfterSeconds: 17 }));
      return { api, token: "c".repeat(64), ownerAddress: "owner", accountAddress: "account", close: async () => { await api.close(); } };
    });
    const session = await f.start();
    const result = await f.host.inject({ method: "POST", url: `/sessions/${session.id}/v1/assistant`, headers: { authorization: `Bearer ${session.token}` }, payload: {} });
    expect(result.statusCode).toBe(429); expect(result.headers["retry-after"]).toBe("17"); expect(result.json().retryAfterSeconds).toBe(17);
  });
});
