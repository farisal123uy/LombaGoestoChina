import { randomUUID } from "node:crypto";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, encodeEventTopics, keccak256, toBytes, verifyTypedData, type Hex, type PublicClient } from "viem";
import { ProviderStore, type QueryDatabase } from "@guardian-wallet/database";
import { deliveryTypedData, getPaymentId, guardianAbi, quoteTypedData, createProviderFulfillment } from "@guardian-wallet/wallet";
import type { DeliveryReceipt, PaymentAttempt, PaymentTask, ServiceQuote } from "@guardian-wallet/shared";
import { buildProviderSigner } from "../../apps/api/src/provider-signer.js";
import { buildProviderAgent } from "../../apps/api/src/provider-agent.js";
import { applyTestMigrations } from "../helpers/migrations.js";

let db: PGlite;
const cleanup: (() => Promise<unknown>)[] = [];
beforeAll(async () => { db = new PGlite(); await applyTestMigrations(db); });
beforeEach(async () => { await db.exec("TRUNCATE provider_databases,provider_invoices;"); });
afterEach(async () => { vi.unstubAllGlobals(); for (const close of cleanup.splice(0)) await close(); });
afterAll(async () => { await db.close(); });
function wrap(connection: PGlite | Transaction): QueryDatabase {
  return {
    query: async <T extends object>(sql: string, params: (string | number | boolean | null)[] = []) => (await connection.query<T>(sql, params)).rows,
    transaction: async (body) => {
      if (!(connection instanceof PGlite)) throw new Error("NESTED_TRANSACTION");
      return connection.transaction((tx) => body(wrap(tx)));
    },
  };
}
async function fixture() {
  const key = generatePrivateKey(), signer = privateKeyToAccount(key);
  const account = "0x1111111111111111111111111111111111111111" as const, guardian = "0x2222222222222222222222222222222222222222" as const, token = "0x3333333333333333333333333333333333333333" as const;
  const blockHash = keccak256(toBytes("block")), tx = keccak256(toBytes("payment-tx"));
  let consumed = false, paidQuote: ServiceQuote | undefined, logRecipient = signer.address;
  const client = {
    getChainId: async () => 84532,
    readContract: async ({ functionName }: { functionName: string }) => functionName === "getPolicy" ? { installed: true, rules: { token, quoteSigner: signer.address, validUntil: Math.floor(Date.now() / 1000) + 86400 } } : consumed,
    getBlockNumber: async () => 12n,
    getBlock: async () => ({ hash: blockHash, timestamp: BigInt(Math.floor(Date.now() / 1000)) }),
    getTransactionReceipt: async () => ({ status: "success", transactionHash: tx, blockHash, blockNumber: 10n, logs: paidQuote ? [{
      address: guardian,
      topics: encodeEventTopics({ abi: guardianAbi, eventName: "PaymentSettled", args: { account, paymentId: getPaymentId(84532, paidQuote), recipient: logRecipient } }),
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint64" }], [BigInt(paidQuote.amountUnits), 1n]),
    }] : [] }),
  } as unknown as PublicClient;
  const store = new ProviderStore(wrap(db)), access = "a".repeat(64);
  const app = await buildProviderSigner({ client, store, account, guardian, token, privateKey: key, accessToken: access });
  cleanup.push(() => app.close());
  const headers = { authorization: `Bearer ${access}` };
  async function invoice() {
    const requestId = randomUUID();
    const response = await app.inject({ method: "POST", url: "/quotes", headers, payload: { requestId, offerId: "database-small-1h" } });
    expect(response.statusCode).toBe(200);
    return { requestId, ...response.json<{ quote: ServiceQuote }>() };
  }
  return { app, headers, invoice, store, signer, account, guardian, tx, pay: (quote: ServiceQuote) => { consumed = true; paidQuote = quote; }, wrongRecipient: () => { logRecipient = account; } };
}

describe("Provider signer and real PostgreSQL test-service provisioning (chain proof fixtures)", () => {
  it("authenticates and binds fixed catalog pricing/idempotency without accepting model financial fields", async () => {
    const f = await fixture();
    expect((await f.app.inject({ method: "POST", url: "/quotes", payload: { requestId: randomUUID(), offerId: "database-small-1h" } })).statusCode).toBe(401);
    const first = await f.invoice();
    expect(first.quote.amountUnits).toBe("260000");
    expect(await verifyTypedData({ ...quoteTypedData(84532, f.guardian, first.quote), address: f.signer.address, signature: first.quote.signature })).toBe(true);
    const again = await f.app.inject({ method: "POST", url: "/quotes", headers: f.headers, payload: { requestId: first.requestId, offerId: "database-small-1h" } });
    expect(again.json<{ quote: ServiceQuote }>().quote).toEqual(first.quote);
    expect((await f.app.inject({ method: "POST", url: "/quotes", headers: f.headers, payload: { requestId: first.requestId, offerId: "database-standard-4h" } })).statusCode).toBe(409);
    expect((await f.app.inject({ method: "POST", url: "/quotes", headers: f.headers, payload: { requestId: randomUUID(), offerId: "database-small-1h", amountUnits: "1" } })).statusCode).toBe(400);
  });
  it("does not provision before a consumed invoice and matching recipient/amount event", async () => {
    const f = await fixture(), invoice = await f.invoice();
    const request = { method: "POST" as const, url: "/provision", headers: f.headers, payload: { invoiceId: invoice.quote.invoiceId, transactionHash: f.tx } };
    expect((await f.app.inject(request)).statusCode).toBe(409);
    f.pay(invoice.quote); f.wrongRecipient();
    expect((await f.app.inject(request)).statusCode).toBe(409);
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM provider_databases")).rows[0]?.count).toBe(0);
  });
  it("rejects encoded JSON strings at the database boundary", async () => {
    const f = await fixture(); await f.invoice();
    await expect(db.query("UPDATE provider_invoices SET payload=$1::text::jsonb", [JSON.stringify(JSON.stringify({ unexpected: "double encoded" }))])).rejects.toThrow("provider_invoice_payload_object");
    expect((await db.query<{ kind: string }>("SELECT jsonb_typeof(payload) AS kind FROM provider_invoices")).rows[0]?.kind).toBe("object");
  });
  it("provisions once, signs the delivery and persists an actual database write/read probe", async () => {
    const f = await fixture(), invoice = await f.invoice(); f.pay(invoice.quote);
    const request = { method: "POST" as const, url: "/provision", headers: f.headers, payload: { invoiceId: invoice.quote.invoiceId, transactionHash: f.tx } };
    const created = await f.app.inject(request); expect(created.statusCode).toBe(200);
    const delivery = created.json<{ delivery: DeliveryReceipt }>().delivery;
    expect(await verifyTypedData({ ...deliveryTypedData(84532, f.guardian, delivery), address: f.signer.address, signature: delivery.signature })).toBe(true);
    expect((await f.app.inject(request)).json<{ delivery: DeliveryReceipt }>().delivery.namespaceId).toBe(delivery.namespaceId);
    const probeId = randomUUID();
    const probe = await f.app.inject({ method: "POST", url: `/databases/${delivery.namespaceId}/probe`, headers: f.headers, payload: { probeId } });
    expect(probe.json()).toMatchObject({ probeId, ready: true, probeCount: 1, capacityBytes: 1048576 });
    expect((await f.app.inject({ method: "PUT", url: `/databases/${delivery.namespaceId}/values`, headers: f.headers, payload: { key: "note", value: "hello from actual PostgreSQL" } })).statusCode).toBe(200);
    expect((await f.app.inject({ method: "GET", url: `/databases/${delivery.namespaceId}/values`, headers: f.headers })).json()).toEqual({ values: { note: "hello from actual PostgreSQL" } });
    // The body limit must support the schema's 4096-character UTF-8 value.
    expect((await f.app.inject({ method: "PUT", url: `/databases/${delivery.namespaceId}/values`, headers: f.headers, payload: { key: "unicode", value: "界".repeat(4096) } })).statusCode).toBe(200);
    const task: PaymentTask = { id: randomUUID(), chainId: 84532, owner: f.account, quoteSigner: f.signer.address, paymentId: delivery.paymentId, instruction: "database", quote: invoice.quote, status: "paid", offerId: "database-small-1h", createdAt: new Date().toISOString() };
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const response = await f.app.inject({ method: init.method as "POST", url: new URL(url).pathname, headers: init.headers as Record<string, string>, payload: init.body as string });
      return new Response(response.body, { status: response.statusCode });
    });
    const attempt: PaymentAttempt = { taskId: task.id, sender: f.account, userOperationHash: hashForAttempt(), nonce: "0", nonceKey: "0", submissionBlock: "1", preparedAt: Date.now(), validUntil: invoice.quote.validUntil, status: "confirmed", transactionHash: f.tx };
    expect(await createProviderFulfillment({ baseUrl: "http://signer.test", token: "a".repeat(64), guardian: f.guardian, providerSigner: f.signer.address }).fulfill(task, attempt)).toEqual(delivery);
    await db.exec(`UPDATE provider_databases SET expires_at=now()-interval '1 second'`);
    expect((await f.app.inject({ method: "POST", url: `/databases/${delivery.namespaceId}/probe`, headers: f.headers, payload: { probeId: randomUUID() } })).statusCode).toBe(409);
  });
  it("provider AI forwards only fixed offer identity and cannot inject signer financial fields", async () => {
    const f = await fixture(), quoted = await f.invoice();
    let decision: object = { accepted: true, offerId: "database-small-1h", summary: "The requested offer is available." };
    const modelFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ done: true, message: { role: "assistant", content: JSON.stringify(decision) } })));
    const signFetch = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ quote: quoted.quote })));
    vi.stubGlobal("fetch", signFetch);
    const app = await buildProviderAgent({ accessToken: "b".repeat(64), signerToken: "c".repeat(64), signerUrl: "http://signer.test", qwen: { provider: "ollama", fetch: modelFetch } });
    cleanup.push(() => app.close());
    const request = { method: "POST" as const, url: "/request", payload: { requestId: quoted.requestId, instruction: "Rent a 1 MB database for 1 hour.", preferredOfferId: "database-small-1h" } };
    expect((await app.inject(request)).statusCode).toBe(401);
    const authenticated = { ...request, headers: { authorization: `Bearer ${"b".repeat(64)}` } };
    expect((await app.inject(authenticated)).json()).toMatchObject({ accepted: true, quote: quoted.quote });
    expect(JSON.parse(signFetch.mock.calls[0]![1]!.body as string)).toEqual({ requestId: quoted.requestId, offerId: "database-small-1h" });
    decision = { accepted: true, offerId: "database-standard-4h", summary: "Upsell." };
    expect((await app.inject(authenticated)).json()).toMatchObject({ accepted: false });
    decision = { accepted: true, offerId: "database-small-1h", summary: "Alter payment.", amountUnits: "1" };
    expect((await app.inject(authenticated)).statusCode).toBe(503);
    expect(signFetch).toHaveBeenCalledOnce();
  });
  it("rejects a forged delivery signature before treating an acknowledgement as service completion", async () => {
    const f = await fixture(), invoice = await f.invoice();
    const task: PaymentTask = { id: randomUUID(), chainId: 84532, owner: f.account, quoteSigner: f.signer.address, paymentId: getPaymentId(84532, invoice.quote), instruction: "database", quote: invoice.quote, status: "paid", offerId: "database-small-1h", createdAt: new Date().toISOString() };
    const now = Math.floor(Date.now() / 1000);
    const raw = { account: f.account, invoiceId: invoice.quote.invoiceId, paymentId: task.paymentId, serviceHash: invoice.quote.serviceHash, namespaceId: randomUUID(), transactionHash: f.tx, readyAt: now, expiresAt: now + 3600 };
    const attacker = privateKeyToAccount(generatePrivateKey());
    const delivery = { ...raw, signature: await attacker.signTypedData(deliveryTypedData(84532, f.guardian, raw)) };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ delivery })));
    vi.stubGlobal("fetch", fetcher);
    const attempt: PaymentAttempt = { taskId: task.id, sender: f.account, userOperationHash: `0x${"12".repeat(32)}` as Hex, nonce: "0", nonceKey: "0", submissionBlock: "1", preparedAt: Date.now(), validUntil: now + 3600, status: "confirmed", transactionHash: f.tx };
    const fulfillment = createProviderFulfillment({ baseUrl: "http://provider.test", token: "a".repeat(64), guardian: f.guardian, providerSigner: f.signer.address });
    await expect(fulfillment.fulfill(task, attempt)).rejects.toThrow("DELIVERY_SIGNATURE_INVALID");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

function hashForAttempt(): Hex { return keccak256(toBytes("attempt")); }
