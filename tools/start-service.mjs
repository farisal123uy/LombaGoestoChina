import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const service = process.env.SERVICE || "api";
if (!["api", "worker"].includes(service)) throw new Error("SERVICE_MUST_BE_API_OR_WORKER");
const child = spawn(process.execPath, ["--env-file-if-exists=.env", "dist/index.js"], {
  cwd: fileURLToPath(new URL(`../apps/${service}/`, import.meta.url)),
  stdio: "inherit", env: process.env,
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { child.kill(signal); });
child.on("error", () => { console.error("SERVICE_START_FAILED"); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
