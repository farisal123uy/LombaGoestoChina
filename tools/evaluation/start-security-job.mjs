import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url)), directory = join(root, ".local/evaluation");
await mkdir(directory, { recursive: true });
const stateFile = join(directory, "security-postfix-job.json");
try {
  const previous = JSON.parse(await readFile(stateFile, "utf8"));
  if (previous.pid) { process.kill(previous.pid, 0); throw new Error("SECURITY_JOB_ALREADY_RUNNING"); }
} catch (error) { if (error.message === "SECURITY_JOB_ALREADY_RUNNING") throw error; if (error.code !== "ENOENT" && error.code !== "ESRCH") throw error; }
const stdout = openSync(join(directory, "security-postfix.stdout.log"), "a", 0o600), stderr = openSync(join(directory, "security-postfix.stderr.log"), "a", 0o600);
const child = spawn(process.execPath, [join(root, "tools/models/evaluate-security.mjs"), "--record"], { cwd: root, detached: true, windowsHide: true, stdio: ["ignore", stdout, stderr] });
await writeFile(stateFile, `${JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString(), command: "selected-cloud-security-corpus-after-null-offer-fix", expectedCases: 60 }, null, 2)}\n`, { mode: 0o600 });
child.unref();
console.log(JSON.stringify({ pid: child.pid, progress: ".local/evaluation/security-progress.json", state: ".local/evaluation/security-postfix-job.json", note: "Explicitly paced Free API evaluation. No public payments or automatic paid fallback." }));
