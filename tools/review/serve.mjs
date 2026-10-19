import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { superviseProcesses } from "./process-supervisor.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url)), require = createRequire(import.meta.url);
if (!process.env.GROQ_API_KEY || process.env.GROQ_FREE_TIER_CONFIRMED !== "true" || !process.env.REVIEW_ACCESS_CODE || process.env.REVIEW_ACCESS_CODE.length < 32) throw new Error("REVIEW_CLOUD_SECRETS_REQUIRED");
const port = Number(process.env.PORT || 7860), runtimePort = Number(process.env.REVIEW_PORT || 4300);
if (![port, runtimePort].every((value) => Number.isInteger(value) && value >= 1024 && value <= 65535) || port === runtimePort) throw new Error("INVALID_REVIEW_PORTS");
const env = { ...process.env, REVIEW_PORT: String(runtimePort), REVIEW_RUNTIME_URL: `http://127.0.0.1:${runtimePort}`, REVIEW_MAX_SESSIONS: process.env.REVIEW_MAX_SESSIONS || "1", DOTENV_CONFIG_PATH: "/nonexistent/review-no-owner-env", KERNEL_FORK_RPC_URL: process.env.KERNEL_FORK_RPC_URL || "https://sepolia.base.org" };
const webEnv = { ...env, REVIEW_ONLY: "true" }; delete webEnv.GROQ_API_KEY; delete webEnv.GROQ_FREE_TIER_CONFIRMED; delete webEnv.REVIEW_ACCESS_CODE;
const supervisor = superviseProcesses([
  { name: "review-api", args: [join(root, "tools/review/server.mjs")], cwd: join(root, "contracts"), env },
  { name: "web", args: [require.resolve("next/dist/bin/next"), "start", "--hostname", "0.0.0.0", "--port", String(port)], cwd: join(root, "apps/web"), env: webEnv },
], { onEvent: (event) => console.log(JSON.stringify({ service: "guardian-review-supervisor", ...event })),
  healthCheck: async () => {
    const responses = await Promise.all([`http://127.0.0.1:${runtimePort}/health`, `http://127.0.0.1:${port}/api/review/health`].map((url) => fetch(url, { signal: AbortSignal.timeout(3000) })));
    return (await Promise.all(responses.map(async (response) => response.ok && (await response.json()).status === "ok"))).every(Boolean);
  },
});
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { void supervisor.stop(); });
console.log(JSON.stringify({ service: "guardian-review-cloud", port, mode: "isolated-local-fork", maxSessions: Number(env.REVIEW_MAX_SESSIONS), accountTier: "operator-confirmed-Free", modelConfiguration: "server-environment", inferenceVerification: "check-ready-and-run-live-smoke", externalBillingActivation: false }));
process.exitCode = (await supervisor.result).code;
