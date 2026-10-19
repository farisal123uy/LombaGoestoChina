import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { keccak256 } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { assertPrivateTarget, readEnvironment, root, validateServiceValue, verifyProject, writeEnvironment } from "../services/config.mjs";

export async function loadOnboardingConfiguration() {
  await verifyProject();
  const api = await readEnvironment("api"), worker = await readEnvironment("worker"), database = await readEnvironment("database");
  const settlementMode = process.env.SETTLEMENT_MODE || worker.SETTLEMENT_MODE || "direct";
  if (!["direct", "escrow"].includes(settlementMode)) throw new Error("INVALID_SETTLEMENT_MODE");
  const escrowWindowSeconds = Number(process.env.ESCROW_WINDOW_SECONDS || worker.ESCROW_WINDOW_SECONDS || 600);
  if (!Number.isInteger(escrowWindowSeconds) || escrowWindowSeconds < 30 || escrowWindowSeconds > 86400) throw new Error("INVALID_ESCROW_WINDOW");
  if (settlementMode === "escrow" && worker.BATCH_MAX_SIZE && worker.BATCH_MAX_SIZE !== "1") throw new Error("ESCROW_REQUIRES_SINGLE_INVOICE");
  const databaseUrl = database.DATABASE_URL || api.DATABASE_URL || worker.DATABASE_URL;
  if (settlementMode === "escrow" && !databaseUrl) throw new Error("ESCROW_DATABASE_CONFIGURATION_REQUIRED");
  assertPrivateTarget(".local/provider-signing.env");
  const directory = join(root, settlementMode === "escrow" ? ".local/onboarding-escrow" : ".local/onboarding");
  const relativeDirectory = settlementMode === "escrow" ? ".local/onboarding-escrow" : ".local/onboarding";
  assertPrivateTarget(`${relativeDirectory}/operations.json`);
  if (!validateServiceValue("address", api.OWNER_ADDRESS) || !api.OWNER_ADDRESS || !worker.ZERODEV_RPC_URL) throw new Error("CONFIGURE_OWNER_AND_ZERODEV_FIRST");
  await mkdir(directory, { recursive: true });
  const manifestPath = join(directory, "configuration.json");
  const providerPath = join(root, ".local/provider-signing.env");
  let saved;
  try { saved = JSON.parse(await readFile(manifestPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  let providerEnvironment;
  try { providerEnvironment = parseEnv(await readFile(providerPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const sessionKey = worker.AGENT_SESSION_PRIVATE_KEY || generatePrivateKey();
  const providerKey = providerEnvironment?.PROVIDER_SIGNER_PRIVATE_KEY || generatePrivateKey();
  const session = privateKeyToAccount(sessionKey), provider = privateKeyToAccount(providerKey);
  const kernelIndex = settlementMode === "escrow" ? "1" : "0";
  const guardian = JSON.parse(await readFile(join(root, "contracts/artifacts/contracts/GuardianPayments.sol/GuardianPayments.json"), "utf8"));
  const token = JSON.parse(await readFile(join(root, "contracts/artifacts/contracts/GuardianDemoToken.sol/GuardianDemoToken.json"), "utf8"));
  const artifactHashes = { guardian: keccak256(guardian.bytecode), token: keccak256(token.bytecode) };
  if (saved && (saved.owner.toLowerCase() !== api.OWNER_ADDRESS.toLowerCase() || saved.sessionSigner.toLowerCase() !== session.address.toLowerCase() || saved.providerSigner.toLowerCase() !== provider.address.toLowerCase() || (saved.settlementMode || "direct") !== settlementMode || String(saved.kernelIndex ?? "0") !== kernelIndex || saved.artifactHashes.guardian !== artifactHashes.guardian || saved.artifactHashes.token !== artifactHashes.token)) throw new Error("ONBOARDING_CONFIGURATION_CHANGED_REVIEW_EXISTING_STATE");
  if (!worker.AGENT_SESSION_PRIVATE_KEY) await writeEnvironment("worker", { AGENT_SESSION_PRIVATE_KEY: sessionKey });
  if (!providerEnvironment?.PROVIDER_SIGNER_PRIVATE_KEY) await writeFile(providerPath, `PROVIDER_SIGNER_PRIVATE_KEY=${providerKey}\n`, { mode: 0o600, flag: "wx" });
  const configuration = saved || {
    owner: api.OWNER_ADDRESS, providerSigner: provider.address, recipient: provider.address,
    sessionSigner: session.address, validUntil: Math.floor(Date.now() / 1000) + 7 * 86400,
    settlementMode, kernelIndex, artifactHashes,
  };
  if (!saved) await writeFile(manifestPath, `${JSON.stringify(configuration, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  if (configuration.validUntil <= Date.now() / 1000) throw new Error("ONBOARDING_AUTHORIZATION_EXPIRED_REVIEW_RENEWAL");
  return {
    api: { OWNER_ADDRESS: api.OWNER_ADDRESS, WEB_ORIGIN: api.WEB_ORIGIN, BASE_SEPOLIA_RPC_URL: api.BASE_SEPOLIA_RPC_URL },
    worker: { ZERODEV_RPC_URL: worker.ZERODEV_RPC_URL }, directory, databaseUrl, settlementMode, escrowWindowSeconds,
    configuration: { ...configuration, kernelIndex: BigInt(configuration.kernelIndex ?? "0"), guardianBytecode: guardian.bytecode, tokenBytecode: token.bytecode },
    approvedPaymaster: worker.APPROVED_PAYMASTER_ADDRESS || "0x777777777777AeC03fd955926DbF81597e66834C",
  };
}

export async function synchronizeRuntime(context, deployment, signature, settlementMode = context.settlementMode, escrowWindowSeconds = context.escrowWindowSeconds) {
  const database = await readEnvironment("database");
  const databaseUrl = database.DATABASE_URL || context.databaseUrl;
  if (!databaseUrl) throw new Error("CONFIGURE_DATABASE_FIRST");
  await writeEnvironment("api", {
    OWNER_ADDRESS: context.configuration.owner, KERNEL_ACCOUNT_ADDRESS: deployment.kernel,
    GUARDIAN_ADDRESS: deployment.guardian, DATABASE_URL: databaseUrl,
  });
  await writeEnvironment("worker", {
    KERNEL_ACCOUNT_ADDRESS: deployment.kernel, GUARDIAN_ADDRESS: deployment.guardian,
    SESSION_VALID_UNTIL: String(context.configuration.validUntil), SESSION_ENABLE_SIGNATURE: signature,
    GAS_MODE: "sponsored", APPROVED_PAYMASTER_ADDRESS: context.approvedPaymaster, EXECUTION_ENABLED: "true",
    SETTLEMENT_MODE: settlementMode,
    ...(settlementMode === "escrow" ? { ESCROW_WINDOW_SECONDS: String(escrowWindowSeconds), BATCH_MAX_SIZE: "1", BATCH_WINDOW_MS: "0" } : {}),
  });
  const manifest = `${JSON.stringify({
    chainId: 84532, owner: context.configuration.owner, ...deployment,
    providerSigner: context.configuration.providerSigner, recipient: context.configuration.recipient,
    sessionSigner: context.configuration.sessionSigner, validUntil: context.configuration.validUntil,
    settlementMode, kernelIndex: String(context.configuration.kernelIndex ?? 0n),
    gasMode: "sponsored", paymaster: context.approvedPaymaster,
  }, null, 2)}\n`;
  await writeFile(join(context.directory, "deployment.json"), manifest, { mode: 0o600 });
  if (context.settlementMode === "escrow") {
    await mkdir(join(root, ".local/onboarding"), { recursive: true });
    await writeFile(join(root, ".local/onboarding/deployment.json"), manifest, { mode: 0o600 });
  }
}
