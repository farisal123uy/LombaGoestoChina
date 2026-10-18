import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../../", import.meta.url)), directory = join(root, ".local/review");
await mkdir(directory, { recursive: true });
const accessFile = join(directory, "access.json");
let access;
try { access = JSON.parse(await readFile(accessFile, "utf8")); } catch { access = { accessCode: randomBytes(32).toString("hex") }; await writeFile(accessFile, `${JSON.stringify(access, null, 2)}\n`, { mode: 0o600 }); }
const webPort = Number(process.env.REVIEW_WEB_PORT || 3100), runtimePort = Number(process.env.REVIEW_PORT || 4300);
if (![webPort, runtimePort].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65535)) throw new Error("INVALID_REVIEW_PORT");
const children = [], logs = [];
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children.reverse()) child.kill("SIGTERM"); }
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);
function run(executable, args, cwd, env, name) {
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  child.on("error", () => { console.error(`${name.toUpperCase()}_START_FAILED`); stop(); process.exitCode = 1; });
  child.on("exit", (code) => { if (!stopping) { console.error(`${name.toUpperCase()}_EXITED_${code}`); stop(); process.exitCode = 1; } });
  const collect = (chunk) => { const text = String(chunk); logs.push(text); if (logs.length > 200) logs.shift(); if (name !== "gateway") process.stdout.write(text); };
  child.stdout.on("data", collect); child.stderr.on("data", collect);
  return child;
}
async function waitFor(url, predicate, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !stopping) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(12000) }); if (await predicate(response)) return; } catch { /* The child may still be starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("REVIEW_STARTUP_TIMEOUT");
}
async function cloudflared() {
  const platform = process.platform === "win32" ? "windows-amd64.exe" : process.platform === "linux" ? "linux-amd64" : "darwin-amd64.tgz";
  if (platform.endsWith("tgz")) throw new Error("INSTALL_CLOUDFLARED_FOR_THIS_PLATFORM");
  const response = await fetch("https://api.github.com/repos/cloudflare/cloudflared/releases/latest", { headers: { "user-agent": "guardian-wallet-free-review" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("GATEWAY_RELEASE_LOOKUP_FAILED");
  const release = await response.json(), asset = release.assets.find((item) => item.name === `cloudflared-${platform}`);
  if (!asset?.digest?.startsWith("sha256:")) throw new Error("GATEWAY_OFFICIAL_CHECKSUM_UNAVAILABLE");
  const bin = join(directory, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  const expected = asset.digest.slice(7);
  let bytes;
  try { bytes = await readFile(bin); } catch { /* First installation. */ }
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== expected) {
    const download = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(120000) });
    if (!download.ok) throw new Error("GATEWAY_DOWNLOAD_FAILED");
    bytes = Buffer.from(await download.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("GATEWAY_CHECKSUM_MISMATCH");
    await writeFile(bin, bytes, { mode: 0o700 }); await chmod(bin, 0o700);
  }
  return bin;
}
try {
  const require = createRequire(import.meta.url);
  const env = { ...process.env, REVIEW_ACCESS_CODE: access.accessCode, REVIEW_PORT: String(runtimePort), REVIEW_RUNTIME_URL: `http://127.0.0.1:${runtimePort}`, DOTENV_CONFIG_PATH: join(directory, "unused.env"), KERNEL_FORK_RPC_URL: "https://sepolia.base.org" };
  run(process.execPath, [join(root, "tools/review/server.mjs")], join(root, "contracts"), env, "review-runtime");
  await waitFor(`http://127.0.0.1:${runtimePort}/ready`, async (response) => response.ok && (await response.json()).status === "ready");
  const webEnv = { ...env, REVIEW_ONLY: "true" }; delete webEnv.GROQ_API_KEY; delete webEnv.GROQ_FREE_TIER_CONFIRMED;
  run(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(webPort)], join(root, "apps/web"), webEnv, "review-web");
  await waitFor(`http://127.0.0.1:${webPort}/review`, async (response) => response.ok);
  let publicUrl;
  if (process.argv.includes("--public")) {
    const executable = await cloudflared();
    const gateway = run(executable, ["tunnel", "--no-autoupdate", "--protocol", "http2", "--edge-ip-version", "4", "--url", `http://127.0.0.1:${webPort}`], root, process.env, "gateway");
    publicUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("FREE_GATEWAY_STARTUP_TIMEOUT")), 60000);
      const inspect = (chunk) => { const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (match) { clearTimeout(timer); resolve(match[0]); } };
      gateway.stderr.on("data", inspect); gateway.stdout.on("data", inspect);
    });
    await waitFor(`${publicUrl}/api/review/ready`, async (response) => response.ok, 90000);
  }
  const state = { startedAt: new Date().toISOString(), pid: process.pid, children: children.map((child) => child.pid), mode: "isolated-local-fork", externalBilling: "none", localUrl: `http://127.0.0.1:${webPort}/review`, publicUrl: publicUrl ? `${publicUrl}/review` : null };
  await writeFile(join(directory, "runtime-state.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(directory, "reviewer-link.txt"), `${state.publicUrl || state.localUrl}#access=${access.accessCode}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...state, reviewerLinkFile: ".local/review/reviewer-link.txt", note: "Local diagnostic runtime only. AI uses the configured cloud API. This process still depends on the computer/connection; the selected competition deployment uses review:serve on an independently hosted server." }, null, 2));
} catch (error) {
  console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "FREE_REVIEW_START_FAILED");
  await writeFile(join(directory, "startup-diagnostics.log"), logs.join(""), { mode: 0o600 });
  stop(); process.exitCode = 1;
}
