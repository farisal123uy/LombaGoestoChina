import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { buildProviderAgent } from "../../apps/api/dist/provider-agent.js";
import { root } from "../services/config.mjs";
import { qwenRuntimeOptions } from "@guardian-wallet/planner";

try {
  const env = parseEnv(await readFile(join(root, ".local/provider-agent.env"), "utf8"));
  const app = await buildProviderAgent({ accessToken: env.ACCESS_TOKEN, signerToken: env.SIGNER_TOKEN, signerUrl: env.SIGNER_URL, qwen: qwenRuntimeOptions(env) });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void app.close(); });
  await app.listen({ host: "127.0.0.1", port: Number(env.PORT || 4200) });
} catch { console.error("PROVIDER_AGENT_STARTUP_FAILED"); process.exitCode = 1; }
