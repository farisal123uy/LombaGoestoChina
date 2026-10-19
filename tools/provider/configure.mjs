import { randomBytes } from "node:crypto";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { assertPrivateTarget, mergeEnvironment, readEnvironment, root, verifyProject, writeEnvironment } from "../services/config.mjs";

async function localEnv(name, values) {
  const relative = `.local/${name}.env`, path = join(root, relative);
  assertPrivateTarget(relative);
  let text = "";
  try { text = await readFile(path, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const temp = `${path}.${process.pid}.tmp`;
  try { await writeFile(temp, mergeEnvironment(text, values), { flag: "wx", mode: 0o600 }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
try {
  await verifyProject();
  const deployment = JSON.parse(await readFile(join(root, ".local/onboarding/deployment.json"), "utf8"));
  const api = await readEnvironment("api"), worker = await readEnvironment("worker"), database = await readEnvironment("database");
   if (!database.DATABASE_URL || !["ollama", "groq"].includes(api.AI_PROVIDER) || (api.AI_PROVIDER === "groq" && (!api.GROQ_API_KEY || api.GROQ_FREE_TIER_CONFIRMED !== "true"))) throw new Error("CONFIGURE_DATABASE_AND_QWEN_FIRST");
  let old = {};
  try { old = parseEnv(await readFile(join(root, ".local/provider-agent.env"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const agentToken = old.ACCESS_TOKEN || randomBytes(32).toString("hex"), signerToken = old.SIGNER_TOKEN || randomBytes(32).toString("hex");
  await localEnv("provider-agent", { PORT: "4200", ACCESS_TOKEN: agentToken, SIGNER_TOKEN: signerToken, SIGNER_URL: "http://127.0.0.1:4201", AI_PROVIDER: api.AI_PROVIDER, AI_MODEL_ID: api.AI_MODEL_ID || (api.AI_PROVIDER === "groq" ? "openai/gpt-oss-120b" : "qwen3:8b"), AI_OUTPUT_TOKENS: api.AI_OUTPUT_TOKENS || "", GROQ_API_KEY: api.GROQ_API_KEY || "", GROQ_FREE_TIER_CONFIRMED: api.GROQ_FREE_TIER_CONFIRMED || "false", OLLAMA_BASE_URL: api.OLLAMA_BASE_URL || "http://127.0.0.1:11434", OLLAMA_API_TOKEN: api.OLLAMA_API_TOKEN || "" });
  await localEnv("provider-signer-service", { PORT: "4201", ACCESS_TOKEN: signerToken, DATABASE_URL: database.DATABASE_URL, BASE_SEPOLIA_RPC_URL: api.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", KERNEL_ACCOUNT_ADDRESS: deployment.kernel, GUARDIAN_ADDRESS: deployment.guardian, TOKEN_ADDRESS: deployment.token });
  await writeEnvironment("api", { PROVIDER_AGENT_URL: "http://127.0.0.1:4200", PROVIDER_AGENT_TOKEN: agentToken, PROVIDER_SIGNER_URL: "http://127.0.0.1:4201", PROVIDER_SIGNER_TOKEN: signerToken });
  await writeEnvironment("worker", { DATABASE_URL: database.DATABASE_URL, PROVIDER_SIGNER_URL: "http://127.0.0.1:4201", PROVIDER_SIGNER_TOKEN: signerToken, PROVIDER_SIGNER_ADDRESS: deployment.providerSigner, WORKER_INTERVAL_MS: !worker.WORKER_INTERVAL_MS || worker.WORKER_INTERVAL_MS === "15000" ? "2000" : worker.WORKER_INTERVAL_MS });
  console.log("Provider agent/signer credentials configured locally. Keys/tokens are not printed. Separate model and signing processes will be used.");
} catch { console.error("PROVIDER_CONFIGURATION_FAILED_CHECK_LOCAL_DEPLOYMENT_DATABASE_AND_MODEL"); process.exitCode = 1; }
