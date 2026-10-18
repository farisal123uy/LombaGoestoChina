import { spawnSync } from "node:child_process";
import { mkdir, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url)), directory = join(root, ".local/linux-review");
await mkdir(directory, { recursive: true });
const identity = join(directory, "id_ed25519"), knownHosts = join(directory, "known_hosts");
try { await access(identity); } catch {
  const keygen = spawnSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "guardian-disposable-linux-check", "-f", identity], { encoding: "utf8", windowsHide: true });
  if (keygen.status !== 0) throw new Error("FREE_VM_SSH_KEY_CREATION_FAILED");
}
const sshOptions = ["-4", "-T", "-i", identity, "-o", "IdentitiesOnly=yes", "-o", "ForwardAgent=no", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${knownHosts}`, "-o", "ConnectTimeout=20", "railway.new"];
const quote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
const probe = "const os=require('node:os');console.log(JSON.stringify({marker:'guardian-linux-probe',platform:process.platform,node:process.version,arch:process.arch,totalMemoryBytes:os.totalmem()}))";
const result = spawnSync("ssh", [...sshOptions, `node -e ${quote(probe)}`], { encoding: "utf8", timeout: 90000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
await writeFile(join(directory, "bootstrap.stdout.private.log"), result.stdout || "", { mode: 0o600 });
await writeFile(join(directory, "bootstrap.stderr.private.log"), result.stderr || "", { mode: 0o600 });
const objects = [];
for (const line of `${result.stdout || ""}\n${result.stderr || ""}`.split(/\r?\n/)) {
  try { objects.push(JSON.parse(line)); } catch { /* Keep non-JSON manifest/log text private. */ }
}
const machine = objects.find((entry) => entry?.marker === "guardian-linux-probe");
function findField(value, predicate) {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && predicate(key.toLowerCase(), item)) return item;
    const nested = findField(item, predicate); if (nested) return nested;
  }
}
let previewUrl;
for (const object of objects) {
  const candidate = findField(object, (key, value) => key.includes("preview") && /^https:\/\//.test(value));
  if (candidate) { const url = new URL(candidate); if (/\.(?:railway\.app|rlwy\.net)$/.test(url.hostname)) previewUrl = url.origin; }
}
const state = { capturedAt: new Date().toISOString(), connected: result.status === 0 && machine?.platform === "linux", machine, previewUrl: previewUrl || null, manifestObjects: objects.filter((object) => object !== machine),
  scope: "Unclaimed free VM, no paid upgrade or coding agent launched. Preview remains creator-IP restricted until human claim; not a final jury URL." };
await writeFile(join(directory, "connection.private.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
const failure = (result.stderr || "").match(/(?:Anonymous trials are temporarily disabled|Permission denied|Connection refused|Connection timed out|Could not resolve hostname)[^\r\n]*/i)?.[0];
console.log(JSON.stringify({ connected: state.connected, machine, previewUrl: state.previewUrl, privateManifestFile: ".local/linux-review/connection.private.json", ...(failure ? { failure } : {}), status: state.connected ? "linux-verification-vm-only-not-final-submission-host" : "free-vm-unavailable-no-paid-fallback" }, null, 2));
if (!state.connected) process.exitCode = 1;
