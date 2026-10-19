import assert from "node:assert/strict";
import { it } from "node:test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createReviewWorkspace } from "../../tools/review/workspace.mjs";
import { defaultCloudModel } from "@guardian-wallet/planner";
import type { WalletAssistantResponse, WalletExecutionResponse, WalletOverview, PaymentTask, PaymentAttempt } from "@guardian-wallet/shared";

it("review workspace: real fork, signed procurement/delivery and isolated databases through the cloud transport fixture", { skip: !process.env.KERNEL_FORK_RPC_URL, timeout: 240000 }, async (t) => {
  const started = Date.now(), cpuStart = process.cpuUsage();
  let calls = 0;
  const modelFetch: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(String(init?.body)) as { model: string; reasoning_effort: string; include_reasoning: boolean; tools?: unknown; response_format: { json_schema: { schema: { properties: Record<string, unknown> } } } };
    assert.equal(body.model, defaultCloudModel); assert.equal(body.reasoning_effort, "low"); assert.equal(body.include_reasoning, false); assert.equal(body.tools, undefined);
    const fields = body.response_format.json_schema.schema.properties;
    const value = fields.accepted ? { accepted: true, offerId: "database-small-1h", summary: "Accept the fixed catalog database offer." }
      : fields.decision ? { decision: "pay", summary: "Pay the authenticated invoice within the existing policy." }
        : fields.taskIds ? { action: "procure_database", taskIds: [], summary: "Request the small database and preview its invoice." }
          : { action: "request_quote", offerId: "database-small-1h", summary: "Request the fixed catalog offer." };
    calls++;
    return new Response(JSON.stringify({ model: defaultCloudModel, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 100, completion_tokens: 40 } }));
  };
  const options = { provider: "groq" as const, apiKey: `gsk_test_${randomUUID().replaceAll("-", "")}`, freeTierConfirmed: true, modelId: defaultCloudModel, fetch: modelFetch };
  const first = await createReviewWorkspace(options); t.after(() => first.close());
  const firstResources = { elapsedMs: Date.now() - started, rssBytes: process.memoryUsage().rss, cpuMicros: process.cpuUsage(cpuStart) };
  const headers = { authorization: `Bearer ${first.token}` };
  const before = (await first.api.inject({ method: "GET", url: "/v1/assets", headers })).json<{ overview: WalletOverview }>().overview;
  assert.equal(before.token.balanceUnits, "10000000"); assert.equal(before.spentUnits, "0");
  const request = { requestId: randomUUID(), instruction: "Rent a 1 MB database for 1 hour within the existing wallet policy." };
  const previewResponse = await first.api.inject({ method: "POST", url: "/v1/assistant", headers, payload: request });
  assert.equal(previewResponse.statusCode, 200, previewResponse.body);
  const preview = previewResponse.json<WalletAssistantResponse>(); assert.equal(preview.task?.status, "draft"); assert.equal(preview.paymentReview?.status, "ready");
  const taskId = preview.task!.id;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const draft = (await first.api.inject({ method: "GET", url: `/v1/tasks/${taskId}`, headers })).json<{ task: PaymentTask; operation?: PaymentAttempt }>();
  assert.equal(draft.task.status, "draft"); assert.equal(draft.operation, undefined);
  const execution = { taskIds: [taskId], instruction: request.instruction };
  const queued = await first.api.inject({ method: "POST", url: "/v1/assistant/execute", headers, payload: execution });
  assert.equal(queued.statusCode, 200, queued.body); assert.equal(queued.json<WalletExecutionResponse>().status, "queued");
  assert.equal(queued.json<WalletExecutionResponse>().schedulerPaused, true);
  assert.equal((await first.api.inject({ method: "POST", url: "/agent/start", headers, payload: {} })).statusCode, 200);
  let detail = draft;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    detail = (await first.api.inject({ method: "GET", url: `/v1/tasks/${taskId}`, headers })).json<typeof detail>();
    if (detail.task.status === "completed") break;
    if (detail.task.status === "escrowed") {
      assert.equal(detail.task.escrow?.status, "locked");
      assert.equal((await first.api.inject({ method: "GET", url: `/v1/tasks/${taskId}/database`, headers })).statusCode, 409, "service reads stay blocked while funds remain in escrow");
    }
    assert(!["needs_owner", "rejected"].includes(detail.task.status), JSON.stringify({ taskStatus: detail.task.status, reason: detail.task.reason }));
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  assert.equal(detail.task.status, "completed", JSON.stringify(detail)); assert.equal(detail.operation?.status, "confirmed"); assert(detail.task.delivery);
  assert.equal(detail.task.escrow?.status, "released"); assert(detail.task.escrow?.lockTransactionHash); assert(detail.task.escrow?.releaseTransactionHash);
  const write = await first.api.inject({ method: "PUT", url: `/v1/tasks/${taskId}/database`, headers, payload: { key: "review-proof", value: "Signed payment and service delivery verified." } });
  assert.equal(write.statusCode, 200, write.body);
  const values = (await first.api.inject({ method: "GET", url: `/v1/tasks/${taskId}/database`, headers })).json<{ values: Record<string, string> }>();
  assert.equal(values.values["review-proof"], "Signed payment and service delivery verified.");
  assert.equal((await first.api.inject({ method: "POST", url: `/v1/tasks/${taskId}/probe`, headers, payload: {} })).statusCode, 200);
  assert.equal((await first.api.inject({ method: "POST", url: "/v1/assistant/execute", headers, payload: execution })).json<WalletExecutionResponse>().status, "already_submitted");
  const after = (await first.api.inject({ method: "GET", url: "/v1/assets", headers })).json<{ overview: WalletOverview }>().overview;
  assert.equal(after.token.balanceUnits, "9740000"); assert.equal(after.spentUnits, "260000");
  const second = await createReviewWorkspace(options); t.after(() => second.close());
  const otherHeaders = { authorization: `Bearer ${second.token}` };
  const other = (await second.api.inject({ method: "GET", url: "/v1/assets", headers: otherHeaders })).json<{ overview: WalletOverview }>().overview;
  assert.notEqual(other.account, before.account); assert.equal(other.token.balanceUnits, "10000000"); assert.equal(other.spentUnits, "0");
  assert.equal((await second.api.inject({ method: "GET", url: `/v1/tasks/${taskId}`, headers: otherHeaders })).statusCode, 404);
  const report = { capturedAt: new Date().toISOString(), evidenceType: "actual-isolated-Kernel-fork-PGlite-cloud-HTTP-fixture-not-live-model", modelId: defaultCloudModel, modelCalls: calls, taskStatus: detail.task.status, operationStatus: detail.operation?.status, transactionHash: detail.operation?.transactionHash, before, after, secondAccount: other.account,
    resourceObservation: { firstWorkspace: firstResources, twoWorkspaceRssBytes: process.memoryUsage().rss, processPeakRssKb: process.resourceUsage().maxRSS, environment: "Windows local test process; excludes separate web process; not a Linux hosting capacity guarantee" },
    escrow: detail.task.escrow,
    checks: ["draft-not-sent", "queue-preserves-pause", "restricted-session-escrow-lock", "provider-attested-escrow-release", "signed-delivery-verification", "database-probe-and-write-read", "idempotent-execute", "separate-wallet-and-database"], limitations: "Model HTTP responses are explicit fixtures. Real contracts and service DB execute on disposable local forks. Escrow uses a trusted provider attestation plus timeout refund; service quality is not independently proven on-chain. No Groq inference, public transaction, commercial purchase or billing." };
  if (process.env.RECORD_REVIEW_EVIDENCE === "true") await writeFile(new URL("../../docs/evidence/reviewer-workspace-fork.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  t.diagnostic(JSON.stringify(report));
});
