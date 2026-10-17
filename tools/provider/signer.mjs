import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createPostgresQueryDatabase, ProviderStore } from "@guardian-wallet/database";
import { createDevelopmentPublicClient } from "@guardian-wallet/wallet";
import { buildProviderSigner } from "../../apps/api/dist/provider-signer.js";
import { root } from "../services/config.mjs";

try {
  const env = parseEnv(await readFile(join(root, ".local/provider-signer-service.env"), "utf8"));
  const secret = parseEnv(await readFile(join(root, ".local/provider-signing.env"), "utf8"));
  const db = createPostgresQueryDatabase(env.DATABASE_URL);
  const app = await buildProviderSigner({ client: createDevelopmentPublicClient(env.BASE_SEPOLIA_RPC_URL), store: new ProviderStore(db.database), account: env.KERNEL_ACCOUNT_ADDRESS, guardian: env.GUARDIAN_ADDRESS, token: env.TOKEN_ADDRESS, privateKey: secret.PROVIDER_SIGNER_PRIVATE_KEY, accessToken: env.ACCESS_TOKEN });
  app.addHook("onClose", async () => { await db.close(); });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void app.close(); });
  await app.listen({ host: "127.0.0.1", port: Number(env.PORT || 4201) });
} catch { console.error("PROVIDER_SIGNER_STARTUP_FAILED"); process.exitCode = 1; }
