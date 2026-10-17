import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const destinations = {
  api: "apps/api/.env", worker: "apps/worker/.env", database: "packages/database/.env",
  contracts: "contracts/.env", web: "apps/web/.env.local",
};
export async function verifyProject() {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  if (pkg.name !== "guardian-wallet") throw new Error("WRONG_PROJECT_DIRECTORY");
}
export async function readEnvironment(name) {
  try { return parseEnv(await readFile(join(root, destinations[name]), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

/** Preserve comments, unknown fields and existing values unless explicitly updated. */
export function mergeEnvironment(text, updates) {
  const pending = new Map(Object.entries(updates).filter(([, value]) => value !== undefined));
  for (const [key, value] of pending) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== "string" || /[\r\n\0]/.test(value)) throw new Error("INVALID_ENVIRONMENT_ENTRY");
  }
  const seen = new Set();
  const lines = text.split(/\r?\n/).filter((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
    if (!match || !pending.has(match[1])) return true;
    if (seen.has(match[1])) return false;
    seen.add(match[1]);
    return true;
  }).map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
    if (!match || !pending.has(match[1])) return line;
    const value = pending.get(match[1]);
    pending.delete(match[1]);
    return `${match[1]}=${JSON.stringify(value)}`;
  });
  while (lines.at(-1) === "") lines.pop();
  for (const [key, value] of pending) lines.push(`${key}=${JSON.stringify(value)}`);
  return `${lines.join("\n")}\n`;
}

export async function writeEnvironment(name, updates) {
  const destination = destinations[name];
  if (!destination) throw new Error("UNKNOWN_ENVIRONMENT_TARGET");
  assertPrivateTarget(destination);
  const path = join(root, destination);
  let text;
  try { text = await readFile(path, "utf8"); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const template = name === "web" ? "apps/web/.env.example" : destination.replace(/\.env$/, ".env.example");
    text = await readFile(join(root, template), "utf8");
  }
  const temporary = `${path}.setup-${process.pid}`;
  try {
    await writeFile(temporary, mergeEnvironment(text, updates), { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(() => {}); }
}

export function assertPrivateTarget(destination) {
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", destination], { cwd: root, stdio: "ignore" });
  if (tracked.status === 0) throw new Error("ENVIRONMENT_FILE_IS_TRACKED_BY_GIT");
  const ignored = spawnSync("git", ["check-ignore", "--quiet", "--no-index", "--", destination], { cwd: root, stdio: "ignore" });
  if (ignored.status !== 0) throw new Error("ENVIRONMENT_FILE_IS_NOT_GIT_IGNORED");
}

export function validateServiceValue(kind, value) {
  if (typeof value !== "string" || /[\r\n\0]/.test(value)) return false;
  if (!value) return true;
  if (kind === "model" || kind === "qwen_model") return !value.startsWith("sk-") && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value) && (kind !== "qwen_model" || value.toLowerCase().includes("qwen"));
  if (kind === "address") return /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value);
  if (kind === "key") return value.startsWith("sk-") && value.length >= 20 && !/\s/.test(value);
  try {
    const url = new URL(value);
    if (kind === "database") {
      decodeURIComponent(url.username);
      decodeURIComponent(url.password);
      return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname && url.username && url.password) && !url.hash && !value.includes("[YOUR-PASSWORD]");
    }
    if (kind === "github") return url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password && !url.search && !url.hash && /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname);
    if (kind === "ollama") return !url.username && !url.password && !url.search && !url.hash && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "ollama"].includes(url.hostname)));
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch { return false; }
}

/** Accept the literal password locally; encode exactly once, without guessing it. */
export function replaceDatabasePassword(uri, password) {
  if (typeof password !== "string" || !password.length || /[\r\n\0]/.test(password)) throw new Error("INVALID_DATABASE_PASSWORD");
  const url = new URL(uri);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || url.hash) throw new Error("INVALID_DATABASE_URI_STRUCTURE");
  url.password = encodeURIComponent(password);
  if (!url.searchParams.has("sslmode") && (url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com"))) url.searchParams.set("sslmode", "require");
  const updated = url.toString();
  if (!validateServiceValue("database", updated)) throw new Error("INVALID_DATABASE_URI");
  return updated;
}

export function readOrigin() {
  const result = spawnSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
export function configureOrigin(url) {
  if (!validateServiceValue("github", url) || !url) throw new Error("INVALID_GITHUB_REPOSITORY_URL");
  const current = readOrigin();
  if (current && current !== url) throw new Error("ORIGIN_ALREADY_EXISTS_USE_EXISTING_REPOSITORY");
  if (!current && spawnSync("git", ["remote", "add", "origin", url], { cwd: root, stdio: "ignore" }).status !== 0) throw new Error("COULD_NOT_ADD_GIT_REMOTE");
}
export async function savePublicSetup(metadata) {
  // Only explicitly selected public fields, never credentials or RPC URLs.
  const safe = { services: metadata.services ?? [], configuredAt: new Date().toISOString(), financialApiReady: Boolean(metadata.financialApiReady) };
  const directory = join(root, ".local");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "services-status.json"), `${JSON.stringify(safe, null, 2)}\n`);
}
