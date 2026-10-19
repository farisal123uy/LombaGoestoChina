import { buildReviewHost } from "../../apps/api/dist/review-host.js";
import { createReviewWorkspace } from "./workspace.mjs";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { QwenClient, qwenRuntimeOptions } from "@guardian-wallet/planner";

// Start from contracts/. The reviewer uses its own minimal pinned-fork HRE.
const accessCode = process.env.REVIEW_ACCESS_CODE;
if (!accessCode) throw new Error("REVIEW_ACCESS_CODE_REQUIRED");
let saved = {};
try { saved = parseEnv(await readFile(new URL("../../.local/ai-cloud.env", import.meta.url), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const options = qwenRuntimeOptions({ ...saved, ...process.env, AI_PROVIDER: "groq" });
const qwenClient = new QwenClient(options); // Missing key/free-tier confirmation fails closed.
let cached;
async function ready() {
  if (cached && cached.until > Date.now()) return cached.value;
  const [model, fork] = await Promise.all([
    (async () => { try { const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${options.apiKey}` }, redirect: "error", signal: AbortSignal.timeout(8000) }); const body = await response.json(); return body.data?.some((item) => item.id === qwenClient.modelId) ? "ready" : "missing"; } catch { return "unavailable"; } })(),
    (async () => { try { const response = await fetch(process.env.KERNEL_FORK_RPC_URL || "https://sepolia.base.org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(8000) }); return (await response.json()).result === "0x14a34" ? "ready" : "wrong_chain"; } catch { return "unavailable"; } })(),
  ]);
  const value = { model, fork }; cached = { value, until: Date.now() + 10000 }; return value;
}
const app = await buildReviewHost({ accessCode, ready, buildId: process.env.REVIEW_BUILD_ID, maxSessions: Number(process.env.REVIEW_MAX_SESSIONS || 2),
  createWorkspace: () => createReviewWorkspace(options),
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void app.close(); });
try { await app.listen({ host: "127.0.0.1", port: Number(process.env.REVIEW_PORT || 4300) }); }
catch { console.error("REVIEW_HOST_START_FAILED"); await app.close(); process.exitCode = 1; }
