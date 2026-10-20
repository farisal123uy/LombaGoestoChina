import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { loadModelOptions } from "../models/cloud-config.mjs";
import { StructuredModelClient, cloudModelProfiles } from "@guardian-wallet/planner";

const root = fileURLToPath(new URL("../../", import.meta.url)), require = createRequire(import.meta.url), directory = join(root, ".local/review");
await mkdir(directory, { recursive: true });
const options = await loadModelOptions(); new StructuredModelClient(options);
const publicMode = process.argv.includes("--public");
const localReport = process.argv.includes("--local-report");
if (localReport && !publicMode) throw new Error("LOCAL_DEPLOYMENT_REPORT_REQUIRES_PUBLIC_MODE");
const deployment = publicMode ? JSON.parse(await readFile(join(root, ".local/linux-review/deployment-report.json"), "utf8")) : undefined;
const accessCode = publicMode ? JSON.parse(await readFile(join(root, ".local/linux-review/access.private.json"), "utf8")).accessCode : randomBytes(32).toString("hex");
const webPort = 3114, runtimePort = 4314;
for (const port of publicMode ? [] : [webPort, runtimePort]) {
  try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) }); throw new Error("BROWSER_CHECK_PORT_IN_USE"); } catch (error) { if (error.message === "BROWSER_CHECK_PORT_IN_USE") throw error; }
}
const paths = ["apps/web/components/financial-dashboard.tsx", "apps/web/components/wallet-assistant.tsx", "apps/web/components/reviewer-workspace.tsx", "apps/web/components/app-navigation.tsx", "apps/web/app/icon.svg", "apps/web/lib/evidence.ts", "apps/api/src/review-host.ts"];
const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, createHash("sha256").update(await readFile(join(root, path))).digest("hex")])));
const buildId = publicMode ? deployment.buildId : createHash("sha256").update(JSON.stringify(sourceHashes)).digest("hex");
const origin = publicMode ? new URL(deployment.previewUrl).origin : `http://127.0.0.1:${webPort}`;
if (publicMode && (!/^https:\/\/[^/]+\.(?:railway\.app|rlwy\.net)$/.test(origin) || !/^[a-f0-9]{64}$/i.test(buildId))) throw new Error("PUBLIC_REVIEW_TARGET_NOT_VERIFIED");
const env = { ...process.env, AI_PROVIDER: "groq", AI_MODEL_ID: options.modelId, GROQ_API_KEY: options.apiKey, GROQ_FREE_TIER_CONFIRMED: "true", AI_OUTPUT_TOKENS: String(cloudModelProfiles[options.modelId].defaultCompletionTokens), REVIEW_ACCESS_CODE: accessCode,
  REVIEW_PORT: String(runtimePort), REVIEW_RUNTIME_URL: `http://127.0.0.1:${runtimePort}`, REVIEW_MAX_SESSIONS: "1", REVIEW_BUILD_ID: buildId, KERNEL_FORK_RPC_URL: "https://sepolia.base.org", NODE_ENV: "production" };
const children = [];
function start(name, args, cwd, childEnv) {
  const stdout = openSync(join(directory, `browser-${name}.stdout.log`), "w", 0o600), stderr = openSync(join(directory, `browser-${name}.stderr.log`), "w", 0o600);
  const child = spawn(process.execPath, args, { cwd, env: childEnv, windowsHide: true, stdio: ["ignore", stdout, stderr] }); children.push(child); return child;
}
let browser, responseEvidence, failure, report, stage = "startup";
const began = Date.now();
try {
  if (!publicMode) {
    start("runtime", [join(root, "tools/review/server.mjs")], join(root, "contracts"), env);
    const webEnv = { ...env, REVIEW_ONLY: "true" }; delete webEnv.GROQ_API_KEY; delete webEnv.GROQ_FREE_TIER_CONFIRMED;
    start("web", [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(webPort)], join(root, "apps/web"), webEnv);
  }
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    try { const response = await fetch(`${origin}/api/review/ready`, { signal: AbortSignal.timeout(12000) }); const value = await response.json(); if (response.ok && value.buildId === buildId) { ready = true; break; } } catch { /* Owned child processes may still be starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  assert(ready, "BROWSER_RUNTIME_NOT_READY");
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  const forbiddenBrowserRequests = [];
  page.on("request", (request) => { if (/api\.groq\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|localhost:4000|127\.0\.0\.1:4000/.test(request.url())) forbiddenBrowserRequests.push(new URL(request.url()).origin); });
  page.on("response", async (response) => {
    if (/\/api\/review\/sessions\/[^/]+\/v1\/tasks\/[^/]+$/.test(response.url()) && response.ok()) {
      try { const value = await response.json(); if (value.task?.status === "completed" && value.operation?.status === "confirmed") responseEvidence = { taskId: value.task.id, taskStatus: value.task.status, operationStatus: value.operation.status, settlementMode: value.operation.settlementMode, escrow: value.task.escrow, localTransactionHash: value.operation.transactionHash }; } catch { /* Status polling can race with close. */ }
    }
  });
  await page.goto(origin);
  stage = "public-navigation";
  await expect(page.getByRole("heading", { name: /AI proposes\.\s*The contract decides\./ })).toBeVisible();
  const logo = page.getByRole("link", { name: "Guardian Wallet overview", exact: true }).locator("img.guardian-logo");
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", "/icon.svg");
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
  const icon = await page.request.get(`${origin}/icon.svg`);
  assert.equal(icon.status(), 200, "PUBLIC_BRAND_ICON_UNAVAILABLE");
  assert.equal(createHash("sha256").update(await icon.body()).digest("hex"), sourceHashes["apps/web/app/icon.svg"], "PUBLIC_BRAND_ICON_SOURCE_MISMATCH");
  await expect(page.getByRole("link", { name: "Owner setup", exact: true })).toHaveCount(0);
  await page.goto(`${origin}/dashboard`);
  await expect(page).toHaveURL(`${origin}/review`);
  await page.goto(`${origin}/review#access=${accessCode}`);
  stage = "workspace-creation";
  await page.getByRole("button", { name: "Start private review workspace" }).click();
  await expect(page.getByText("Disposable review workspace", { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByRole("button", { name: "Connect owner & sign in" })).toHaveCount(0);
  const assistant = page.getByRole("region", { name: "Wallet assistant" });
  await expect(assistant.getByText("Available for new plans", { exact: true })).toBeVisible();
  await assistant.getByLabel("Wallet instruction").fill("Rent a 1 MB database for 1 hour. Pay only the authenticated catalog invoice within my existing wallet policy.");
  const procurementAt = Date.now();
  stage = "payment-preview";
  await assistant.getByRole("button", { name: "Ask wallet assistant", exact: true }).click();
  await expect(assistant.getByRole("heading", { name: "Payment preview: ready" })).toBeVisible({ timeout: 120000 });
  await assistant.getByRole("button", { name: "Queue reviewed payments" }).click();
  stage = "queue-and-settlement";
  await expect(assistant.getByRole("status")).toContainText("Payments queued", { timeout: 120000 });
  await page.getByRole("button", { name: "Start agent", exact: true }).click();
  const task = page.getByRole("button", { name: /database-small-1h.*completed/ });
  await expect(task).toBeVisible({ timeout: 60000 }); await task.click();
  await expect(page.getByRole("heading", { name: "completed", exact: true })).toBeVisible();
  await expect(page.getByText("Service escrow · released", { exact: true })).toBeVisible();
  await expect(page.getByText("Escrow release", { exact: true })).toBeVisible();
  assert.equal(responseEvidence.settlementMode, "escrow");
  assert.equal(responseEvidence.escrow?.status, "released");
  assert(responseEvidence.escrow?.lockTransactionHash);
  assert(responseEvidence.escrow?.releaseTransactionHash);
  await expect(page.getByRole("link", { name: "Inspect public transaction ↗" })).toHaveCount(0);
  await page.getByRole("button", { name: "Verify database probe" }).click();
  stage = "service-probe-and-write-read";
  await expect(page.getByRole("status").filter({ hasText: "Database read/write probe verified" })).toBeVisible();
  await page.getByLabel("Database key", { exact: true }).fill("browser-live-proof");
  await page.getByLabel("Value", { exact: true }).fill("Production UI and real Groq API verified.");
  await page.getByRole("button", { name: "Write & read back" }).click();
  await expect(page.locator("pre")).toContainText("Production UI and real Groq API verified.");
  assert(responseEvidence, "BROWSER_COMPLETED_RESPONSE_NOT_OBSERVED");
  const procurementThroughWriteReadMs = Date.now() - procurementAt;
  await page.getByRole("button", { name: "Close workspace" }).click();
  stage = "close-workspace";
  await expect(page.getByRole("button", { name: "Start private review workspace" })).toBeVisible();
  assert.deepEqual(forbiddenBrowserRequests, [], "BROWSER_MADE_FORBIDDEN_DIRECT_PROVIDER_OR_LOCALHOST_REQUEST");
  report = { capturedAt: new Date().toISOString(), evidenceType: publicMode ? "public-HTTPS-browser-Linux-production-real-Groq-API-isolated-Kernel-fork" : "actual-production-Next-browser-real-Groq-API-local-Kernel-fork", passed: true, modelId: options.modelId, diagnosticBuildId: buildId, ...(publicMode ? { publicOrigin: origin, deployedSourceSha256: buildId } : {}), ...responseEvidence,
    elapsedMs: Date.now() - began, procurementThroughWriteReadMs, ...(publicMode ? { sourceRevision: deployment.sourceRevision } : {}), checks: ["public-brand-icon-matches-source", "browser-favicon", "public-review-navigation", "owner-route-redirect", "no-MetaMask", "real-API-payment-preview", "queue-and-worker-escrow-completion", "dashboard-shows-escrow-lock-and-release", "local-hash-not-public-explorer", "service-probe-write-read", "close-workspace", "no-browser-Groq-Google-font-or-owner-localhost-request"], sourceHashes,
    limitations: publicMode ? "Browser on the owner's network to the claimed Linux server over public HTTPS, not a China-network measurement. Model is real Groq API; transfers are only isolated fork assets. Hosting account Free/Trial is operator-confirmed. No video/presentation recording." : "Production web/backend on this Windows host for QA, not the final judge deployment. Model is real Groq API; transactions are isolated fork assets. No video or presentation recording." };
} catch (error) { failure = error; }
finally { await browser?.close().catch(() => {}); for (const child of children.reverse()) child.kill("SIGTERM"); }
if (failure) {
  const details = String(failure.stack || failure).replaceAll(accessCode, "<redacted-review-code>").replaceAll(options.apiKey, "<redacted-model-key>");
  await writeFile(join(directory, "browser-error.private.log"), details, { mode: 0o600 });
  console.error(JSON.stringify({ error: failure instanceof Error && /^[A-Z0-9_]+$/.test(failure.message) ? failure.message : "LIVE_BROWSER_VERIFICATION_FAILED", stage, diagnostics: ".local/review/browser-error.private.log" })); process.exitCode = 1;
}
else {
  if (localReport) await writeFile(join(root, ".local/linux-review/public-browser-report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  else if (process.argv.includes("--record")) await writeFile(join(root, publicMode ? "docs/evidence/reviewer-public-browser.json" : "docs/evidence/reviewer-live-browser.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
