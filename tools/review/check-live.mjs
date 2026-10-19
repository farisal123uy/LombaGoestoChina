import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { verifyTypedData } from "viem";
import { StructuredModelClient, cloudModelProfiles, isReviewedCloudModel } from "@guardian-wallet/planner";
import { quoteTypedData, deliveryTypedData, getPaymentId } from "@guardian-wallet/wallet";
import { buildReviewHost } from "../../apps/api/dist/review-host.js";
import { createReviewWorkspace } from "./workspace.mjs";
import { loadModelOptions } from "../models/cloud-config.mjs";

// Run from contracts/. All keys/funds for execution are disposable
// fork fixtures; the inference requests below use the configured real Groq API.
const saved = await loadModelOptions();
new StructuredModelClient(saved);
const index = process.argv.indexOf("--models"), models = index < 0 ? [saved.modelId] : process.argv[index + 1]?.split(",");
if (!models?.length || models.length > 2 || models.some((model) => !isReviewedCloudModel(model)) || new Set(models).size !== models.length) throw new Error("INVALID_REVIEW_LIVE_MODELS");
const catalogResponse = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${saved.apiKey}` }, redirect: "error", signal: AbortSignal.timeout(15000) });
if (!catalogResponse.ok) throw new Error("CLOUD_MODEL_CATALOG_UNAVAILABLE");
const catalog = await catalogResponse.json();
if (models.some((modelId) => !catalog.data?.some((entry) => entry.id === modelId))) throw new Error("REVIEW_MODEL_UNAVAILABLE");
const forkUrl = process.env.KERNEL_FORK_RPC_URL || "https://sepolia.base.org";
const forkResponse = await fetch(forkUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(12000) });
assert.equal((await forkResponse.json()).result, "0x14a34", "REVIEW_FORK_CHAIN_MISMATCH");

const runs = [];
for (const modelId of models) {
  if (runs.length) await new Promise((resolve) => setTimeout(resolve, 65000));
  const calls = [], accessCode = randomBytes(32).toString("hex"), rssBefore = process.memoryUsage().rss;
  const modelFetch = async (url, init) => {
    const started = performance.now();
    const response = await fetch(url, init);
    let body; try { body = await response.clone().json(); } catch { /* The normal client rejects invalid responses. */ }
    calls.push({ requestedModel: modelId, reportedModel: body?.model, httpStatus: response.status, elapsedMs: Math.round(performance.now() - started), inputTokens: body?.usage?.prompt_tokens, completionTokens: body?.usage?.completion_tokens, reasoningTokens: body?.usage?.completion_tokens_details?.reasoning_tokens });
    return response;
  };
  const options = { ...saved, modelId, outputTokens: cloudModelProfiles[modelId].defaultCompletionTokens, fetch: modelFetch };
  const host = await buildReviewHost({ accessCode, maxSessions: 1, ready: async () => ({ model: "ready", fork: "ready" }), createWorkspace: () => createReviewWorkspace(options) });
  let result = { modelId, passed: false, stage: "initialization" };
  try {
    await host.listen({ host: "127.0.0.1", port: 0 });
    const base = `http://127.0.0.1:${host.server.address().port}`;
    async function request(path, body, token, method = body ? "POST" : "GET") {
      const response = await fetch(`${base}${path}`, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(150000) });
      const value = await response.json();
      if (!response.ok) throw new Error(typeof value.error === "string" && /^[A-Z0-9_]+$/.test(value.error) ? value.error : "REVIEW_HTTP_FAILED");
      return value;
    }
    const initAt = performance.now();
    const session = await request("/sessions", { requestId: randomUUID(), accessCode });
    const initializationMs = Math.round(performance.now() - initAt), initializedRss = process.memoryUsage().rss;
    assert.equal(session.mode, "isolated-local-fork"); assert.equal(session.publicBroadcast, false);
    const prefix = `/sessions/${session.id}`, api = (path, body, method) => request(`${prefix}${path}`, body, session.token, method);
    const before = (await api("/v1/assets")).overview;
    assert.equal(before.token.balanceUnits, "10000000"); assert.equal(before.spentUnits, "0");
    result.stage = "asset-and-risk-inference";
    const assetAnswer = await api("/v1/assistant", { requestId: randomUUID(), instruction: "Tampilkan aset saya dan sisa anggaran yang bisa digunakan hari ini." });
    assert.equal(assetAnswer.intent, "asset_overview"); assert.equal(assetAnswer.modelId, modelId);
    const riskAnswer = await api("/v1/assistant", { requestId: randomUUID(), instruction: "Check the current wallet policy and payment risks." });
    assert.equal(riskAnswer.intent, "risk_check"); assert.equal(riskAnswer.modelId, modelId);
    const instruction = "Rent a 1 MB database for 1 hour and pay only its authenticated catalog invoice within the existing wallet policy.";
    result.stage = "procurement-preview";
    const procurementAt = performance.now();
    const preview = await api("/v1/assistant", { requestId: randomUUID(), instruction });
    assert.equal(preview.task?.status, "draft", "REVIEW_DRAFT_REQUIRED");
    assert.equal(preview.paymentReview?.status, "ready", "REVIEW_PAYMENT_PREVIEW_BLOCKED");
    assert.equal(preview.modelId, modelId);
    const taskId = preview.task.id;
    const draft = await api(`/v1/tasks/${taskId}`);
    assert.equal(draft.operation, undefined, "REVIEW_PREVIEW_MUST_NOT_SEND");
    const policy = (await api("/v1/policy")).policy;
    assert(await verifyTypedData({ ...quoteTypedData(policy.chainId, policy.guardianAddress, draft.task.quote), address: policy.quoteSigner, signature: draft.task.quote.signature }), "REVIEW_QUOTE_SIGNATURE_INVALID");
    result.stage = "queue-and-settlement";
    const execution = { taskIds: [taskId], instruction };
    const queued = await api("/v1/assistant/execute", execution);
    assert.equal(queued.status, "queued"); assert.equal(queued.schedulerPaused, true);
    await api("/agent/start", {});
    let detail;
    const deadline = Date.now() + 60000;
    do {
      detail = await api(`/v1/tasks/${taskId}`);
      if (detail.task.status === "completed") break;
      if (["needs_owner", "rejected"].includes(detail.task.status)) throw new Error("REVIEW_EXECUTION_REQUIRES_OWNER");
      await new Promise((resolve) => setTimeout(resolve, 700));
    } while (Date.now() < deadline);
    assert.equal(detail.task.status, "completed", "REVIEW_COMPLETION_TIMEOUT");
    assert.equal(detail.operation?.status, "confirmed");
    const delivery = detail.task.delivery;
    assert(delivery, "REVIEW_DELIVERY_REQUIRED");
    const { signature, ...unsignedDelivery } = delivery;
    assert.equal(delivery.paymentId, getPaymentId(policy.chainId, detail.task.quote));
    assert.equal(delivery.transactionHash, detail.operation.transactionHash);
    assert(await verifyTypedData({ ...deliveryTypedData(policy.chainId, policy.guardianAddress, unsignedDelivery), address: policy.quoteSigner, signature }), "REVIEW_DELIVERY_SIGNATURE_INVALID");
    result.stage = "service-probe-and-idempotency";
    const probe = await api(`/v1/tasks/${taskId}/probe`, {}); assert.equal(probe.ready, true);
    await api(`/v1/tasks/${taskId}/database`, { key: "live-api-proof", value: "Real hosted model, signed invoice and delivery, isolated contract settlement." }, "PUT");
    const values = await api(`/v1/tasks/${taskId}/database`);
    assert.equal(values.values["live-api-proof"], "Real hosted model, signed invoice and delivery, isolated contract settlement.");
    assert.equal((await api("/v1/assistant/execute", execution)).status, "already_submitted");
    const after = (await api("/v1/assets")).overview;
    assert.equal(after.token.balanceUnits, "9740000"); assert.equal(after.spentUnits, "260000");
    assert(calls.length > 0 && calls.every((call) => call.httpStatus === 200 && call.reportedModel === modelId), "REVIEW_MODEL_BINDING_FAILED");
    const procurementToCompletedAndProbeMs = Math.round(performance.now() - procurementAt);
    await request(`/sessions/${session.id}`, undefined, session.token, "DELETE");
    const denied = await fetch(`${base}${prefix}/v1/assets`, { headers: { authorization: `Bearer ${session.token}` } });
    assert.equal(denied.status, 401, "REVIEW_CLOSED_SESSION_STILL_ACCESSIBLE");
    result = { modelId, passed: true, stage: "completed", initializationMs, procurementToCompletedAndProbeMs, taskId, taskStatus: detail.task.status, operationStatus: detail.operation.status, localTransactionHash: detail.operation.transactionHash,
      before: { balanceUnits: before.token.balanceUnits, spentUnits: before.spentUnits }, after: { balanceUnits: after.token.balanceUnits, spentUnits: after.spentUnits },
      checks: ["real-model-asset-and-risk-interpretation", "signed-provider-quote", "draft-no-send", "queue-keeps-pause", "actual-Kernel-Guardian-settlement", "independent-delivery-signature-check", "service-probe-and-write-read", "no-duplicate-payment", "closed-capability-denied"],
      resourceObservation: { rssBeforeBytes: rssBefore, initializedRssBytes: initializedRss, scope: "Local checker process; later models may include retained prior allocations. Excludes separate Next.js process; not Linux hosting acceptance" } };
  } catch (error) {
    result.error = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "REVIEW_LIVE_FLOW_FAILED";
  } finally { await host.close(); }
  runs.push({ ...result, modelCalls: calls });
}
const paths = ["tools/review/check-live.mjs", "tools/review/workspace.mjs", "tools/review/network-runtime.mjs", "apps/api/src/wallet-assistant.ts", "packages/planner/src/model-profiles.ts"];
const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(new URL(`../../${path}`, import.meta.url))).digest("hex")])));
const report = { capturedAt: new Date().toISOString(), evidenceType: "live-Groq-API-actual-disposable-Kernel-fork-provider-service-HTTP-workflow", runs, sourceHashes,
  limitations: "Real hosted model inference, but all token/gas transfers execute only on disposable local forks. No new public transaction or commercial service purchase. Runtime latency is measured on this host, excludes hosted cold starts and China browser network. Free account remains operator-confirmed." };
if (process.argv.includes("--record")) await writeFile(new URL("../../docs/evidence/reviewer-live-cloud.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (runs.some((run) => !run.passed)) process.exitCode = 1;
