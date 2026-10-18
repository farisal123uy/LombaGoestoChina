import { spawnSync, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const directory = fileURLToPath(new URL("../../.local/linux-review/", import.meta.url));
const connection = JSON.parse(await readFile(join(directory, "connection.private.json"), "utf8"));
if (!connection.connected) throw new Error("FREE_VM_NOT_CONNECTED");
const result = spawnSync("ssh", ["-4", "-T", "-i", join(directory, "id_ed25519"), "-o", "IdentitiesOnly=yes", "-o", "ForwardAgent=no", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${join(directory, "known_hosts")}`, "-o", "ConnectTimeout=20", "railway.new", "true"], { encoding: "utf8", timeout: 30000, windowsHide: true });
if (result.status === 0) { console.log("VM sudah menerima perintah SSH. Konfirmasi plan Free/Trial sebelum rollout berikutnya."); process.exit(0); }
let pending; try { pending = JSON.parse(result.stdout); } catch { throw new Error("VM_CLAIM_STATUS_UNAVAILABLE"); }
if (pending.status !== "claim_required" || !pending.human_claim_url) throw new Error("VM_CLAIM_STATUS_UNAVAILABLE");
const url = new URL(pending.human_claim_url);
if (url.protocol !== "https:" || (url.hostname !== "railway.com" && !url.hostname.endsWith(".railway.com"))) throw new Error("UNEXPECTED_VM_CLAIM_HOST");
await writeFile(join(directory, "claim-link.private.txt"), `${url.toString()}\n`, { mode: 0o600 });
await writeFile(join(directory, "claim-session.private.json"), `${JSON.stringify(pending)}\n`, { mode: 0o600 });
console.log("Tautan klaim baru tersimpan di .local/linux-review/claim-link.private.txt. Gunakan Free/Trial tanpa kartu; berhenti jika diminta paket berbayar. Jangan kirim tautan/token ke chat.");
if (process.argv.includes("--open")) {
  if (process.platform !== "win32") throw new Error("OPEN_CLAIM_LINK_MANUALLY");
  const child = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url.toString()], { detached: true, stdio: "ignore", windowsHide: true }); child.unref();
  console.log("Halaman klaim dibuka di browser perangkat ini; selesaikan login dan verifikasi Free/Trial sendiri.");
}
