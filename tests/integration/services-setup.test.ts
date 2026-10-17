import { describe, expect, it } from "vitest";
import { parseEnv } from "node:util";
// Tooling is plain Node ESM and intentionally has no dependency on app builds.
// @ts-expect-error JavaScript tooling has no generated declaration file.
import { mergeEnvironment, replaceDatabasePassword, validateServiceValue } from "../../tools/services/config.mjs";
// @ts-expect-error JavaScript tooling has no generated declaration file.
import { describeDatabaseFailure, inspectServices } from "../../tools/services/check.mjs";

describe("Service onboarding configuration boundaries", () => {
  it("preserves unrelated settings/comments and correctly quotes URI passwords and hash characters", () => {
    const existing = "# personal config\nPORT=4999\nCUSTOM_SETTING=keep-me\nDATABASE_URL=old\n";
    const uri = "postgresql://postgres.project:pass%23word@pooler.example.com:5432/postgres?sslmode=require";
    const rendered = mergeEnvironment(existing, { DATABASE_URL: uri, OLLAMA_API_TOKEN: "synthetic-#-not-real" });
    expect(rendered).toContain("# personal config");
    expect(parseEnv(rendered)).toEqual({ PORT: "4999", CUSTOM_SETTING: "keep-me", DATABASE_URL: uri, OLLAMA_API_TOKEN: "synthetic-#-not-real" });
  });
  it("refuses newline environment injection and removes ambiguous duplicate updated keys", () => {
    expect(() => mergeEnvironment("PORT=4000\n", { DATABASE_URL: "uri\nEXECUTION_ENABLED=true" })).toThrow("INVALID_ENVIRONMENT_ENTRY");
    const rendered = mergeEnvironment("DATABASE_URL=one\nDATABASE_URL=two\nEXECUTION_ENABLED=false\n", { DATABASE_URL: "three" });
    expect(rendered.match(/^DATABASE_URL=/gm)).toHaveLength(1);
    expect(parseEnv(rendered).EXECUTION_ENABLED).toBe("false");
  });
  it("rejects credential-bearing/wrong-host remotes, wrong wallet lengths and API keys used as model IDs", () => {
    expect(validateServiceValue("github", "https://github.com/team/guardian-wallet.git")).toBe(true);
    expect(validateServiceValue("github", "https://user:token@github.com/team/guardian-wallet.git")).toBe(false);
    expect(validateServiceValue("github", "https://attacker.example/team/guardian-wallet.git")).toBe(false);
    expect(validateServiceValue("address", `0x${"1".repeat(64)}`)).toBe(false);
    expect(validateServiceValue("model", "sk-proj-this-is-a-key-not-a-model")).toBe(false);
    expect(validateServiceValue("database", "postgresql://postgres:[YOUR-PASSWORD]@db.example:5432/postgres")).toBe(false);
  });
  it("reports readiness without disclosing passwords, keys, project URLs or repository URLs", async () => {
    const status = await inspectServices({
      api: { AI_PROVIDER: "ollama", AI_MODEL_ID: "qwen3:8b", OLLAMA_BASE_URL: "http://127.0.0.1:11434", OLLAMA_API_TOKEN: "private-gateway-token", BASE_SEPOLIA_RPC_URL: "https://rpc.example/private-token" },
      worker: { ZERODEV_RPC_URL: "https://bundler.example/private-project" },
      database: { DATABASE_URL: "postgresql://owner:private-password@db.example/database" },
    }, "https://github.com/team/guardian-wallet.git");
    const output = JSON.stringify(status);
    for (const secret of ["private-gateway-token", "private-password", "private-token", "private-project", "github.com/team"]) expect(output).not.toContain(secret);
    expect(status.financialApiConfigured).toBe(false);
    expect(status.workerExecution).toBe("disabled");
    expect(status.model).toBe("configured_qwen_not_verified");
    expect(status.modelProvider).toBe("ollama");
    expect(status.modelId).toBe("qwen3:8b");
    expect(validateServiceValue("ollama", "http://127.0.0.1:11434")).toBe(true);
    expect(validateServiceValue("qwen_model", "gpt-4.1-mini")).toBe(false);
  });
  it("encodes a literal password exactly once and rejects malformed percent escapes before connecting", () => {
    const original = "postgresql://postgres.project:bad%escape@aws-0-region.pooler.supabase.com:5432/postgres";
    expect(validateServiceValue("database", original)).toBe(false);
    const raw = "literal%40+@:#?/ password";
    const updated = replaceDatabasePassword(original, raw);
    const parsed = new URL(updated);
    expect(decodeURIComponent(parsed.password)).toBe(raw);
    expect(parsed.hostname).toBe("aws-0-region.pooler.supabase.com");
    expect(parsed.port).toBe("5432");
    expect(parsed.username).toBe("postgres.project");
    expect(parsed.searchParams.get("sslmode")).toBe("require");
    expect(validateServiceValue("database", updated)).toBe(true);
  });
  it("classifies database errors without disclosing secret-bearing error messages", () => {
    expect(describeDatabaseFailure(new URIError("secret-bearing-uri"))).toBe("connection_uri_malformed_password_encoding");
    expect(describeDatabaseFailure({ code: "28P01", message: "private-password" })).toBe("database_password_authentication_failed");
    expect(describeDatabaseFailure({ code: "ENOTFOUND", message: "private-host" })).toBe("database_hostname_resolution_failed");
    expect(describeDatabaseFailure({ code: "SELF_SIGNED_CERT_IN_CHAIN" })).toBe("database_tls_certificate_verification_failed");
    expect(describeDatabaseFailure({ message: "password=private-password" })).toBe("connection_failed_check_uri_password_ssl_and_network");
  });
});
