import { readEnvironment, readOrigin, validateServiceValue, verifyProject } from "./config.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function inspectServices(environments, origin) {
  const { api, worker, database } = environments;
  return {
    github: origin && validateServiceValue("github", origin) ? "configured_access_not_verified" : "missing",
    database: database.DATABASE_URL ? "configured_connection_not_checked" : "missing",
    modelProvider: api.AI_PROVIDER || "baseline",
    modelId: api.AI_PROVIDER === "ollama" && validateServiceValue("qwen_model", api.AI_MODEL_ID) ? api.AI_MODEL_ID : null,
    model: api.AI_PROVIDER === "ollama" && api.AI_MODEL_ID && api.OLLAMA_BASE_URL ? "configured_qwen_not_verified" : "missing",
    executionRpc: api.BASE_SEPOLIA_RPC_URL || worker.BASE_SEPOLIA_RPC_URL ? "configured_chain_not_verified" : "missing",
    bundler: worker.ZERODEV_RPC_URL ? "configured_entrypoint_not_verified" : "missing",
    gasPaymentMode: worker.GAS_MODE === "sponsored" ? "project_paymaster_native_gas" : "account_funded_native_eth",
    gasSponsorship: worker.GAS_MODE === "sponsored" ? "configured_check_policy_quota_and_signed_execution" : "not_used",
    transactionSubmission: "not_checked_by_connection_test",
    ownerAddress: api.OWNER_ADDRESS ? "configured" : "pending_wallet_setup",
    kernelAccount: api.KERNEL_ACCOUNT_ADDRESS ? "configured" : "pending_deployment",
    guardianContract: api.GUARDIAN_ADDRESS ? "configured" : "pending_deployment",
    financialApiConfigured: Boolean(api.DATABASE_URL && api.OWNER_ADDRESS && api.KERNEL_ACCOUNT_ADDRESS && api.GUARDIAN_ADDRESS && api.BASE_SEPOLIA_RPC_URL),
    workerExecution: worker.EXECUTION_ENABLED === "true" ? "enabled_check_authorization_before_use" : "disabled",
  };
}
async function rpc(url, method) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("RPC_HTTP_FAILURE");
  const body = await response.json();
  if (body.error) throw new Error("RPC_RESPONSE_ERROR");
  return body.result;
}
async function checkDatabase(url) {
  if (!url) return "missing";
  let sql;
  try {
    const { default: postgres } = await import("postgres");
    sql = postgres(url, { max: 1, prepare: false, connect_timeout: 8, connection: { statement_timeout: 8000 } });
    await sql`SELECT 1 AS connection_check`;
    return "connected_select_1_ok";
  } catch (error) { return describeDatabaseFailure(error); }
  finally { if (sql) await sql.end({ timeout: 1 }); }
}
export function describeDatabaseFailure(error) {
  if (error instanceof URIError) return "connection_uri_malformed_password_encoding";
  if (error?.code === "28P01") return "database_password_authentication_failed";
  if (error?.code === "ENOTFOUND" || error?.code === "EAI_AGAIN") return "database_hostname_resolution_failed";
  if (error?.code === "ECONNREFUSED") return "database_connection_refused_check_host_port";
  if (["CONNECT_TIMEOUT", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"].includes(error?.code)) return "database_connection_timeout_or_network_unreachable";
  if (["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(error?.code)) return "database_tls_certificate_verification_failed";
  return "connection_failed_check_uri_password_ssl_and_network";
}
async function checkModel(api) {
  if (api.AI_PROVIDER !== "ollama" || !api.AI_MODEL_ID || !api.OLLAMA_BASE_URL) return "missing";
  try {
    if (!validateServiceValue("ollama", api.OLLAMA_BASE_URL) || !validateServiceValue("qwen_model", api.AI_MODEL_ID)) return "invalid_qwen_configuration";
    const response = await fetch(`${api.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/tags`, { headers: api.OLLAMA_API_TOKEN ? { authorization: `Bearer ${api.OLLAMA_API_TOKEN}` } : {}, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return `model_list_http_${response.status}`;
    const body = await response.json();
    return body.models?.some((model) => model.name === api.AI_MODEL_ID || model.model === api.AI_MODEL_ID) ? "qwen_model_available_inference_not_verified" : "qwen_model_not_installed";
  } catch { return "ollama_not_reachable"; }
}
async function main() {
  await verifyProject();
  const environments = { api: await readEnvironment("api"), worker: await readEnvironment("worker"), database: await readEnvironment("database") };
  const status = await inspectServices(environments, readOrigin());
  if (process.argv.includes("--network")) {
    const { api, worker, database } = environments;
    const [db, model, chain, bundler] = await Promise.all([
      checkDatabase(database.DATABASE_URL), checkModel(api),
      (async () => { const url = api.BASE_SEPOLIA_RPC_URL || worker.BASE_SEPOLIA_RPC_URL; if (!url) return "missing"; try { return BigInt(await rpc(url, "eth_chainId")) === 84532n ? "base_sepolia_chain_84532_verified" : "wrong_chain"; } catch { return "execution_rpc_request_failed"; } })(),
      (async () => { if (!worker.ZERODEV_RPC_URL) return "missing"; try { const entries = await rpc(worker.ZERODEV_RPC_URL, "eth_supportedEntryPoints"); return Array.isArray(entries) && entries.some((a) => typeof a === "string" && a.toLowerCase() === "0x0000000071727de22e5e9d8baf0edac6f37da032") ? "entrypoint_0.7_supported" : "required_entrypoint_not_reported"; } catch { return "bundler_request_failed"; } })(),
    ]);
    status.networkChecks = { database: db, model, executionRpc: chain, bundler };
    Object.assign(status, { database: db, model, executionRpc: chain, bundler });
  }
  // Values, URLs, API keys, password strings and signed authorizations are excluded.
  console.log(JSON.stringify(status, null, 2));
  if (process.argv.includes("--strict")) {
    if ([status.github, status.database, status.model, status.bundler, status.executionRpc].includes("missing")) process.exitCode = 1;
    if (status.networkChecks && (status.networkChecks.database !== "connected_select_1_ok" || status.networkChecks.model !== "qwen_model_available_inference_not_verified" || status.networkChecks.executionRpc !== "base_sepolia_chain_84532_verified" || status.networkChecks.bundler !== "entrypoint_0.7_supported")) process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("Service check failed; secret-bearing error details were suppressed."); process.exitCode = 1; });
}
