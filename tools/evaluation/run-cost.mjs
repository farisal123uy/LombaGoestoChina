import { spawn } from "node:child_process";
import { join } from "node:path";
import { root, verifyProject } from "../services/config.mjs";

await verifyProject();
const child = spawn(process.execPath, [join(root, "node_modules/hardhat/dist/src/cli.js"), "test", "nodejs", "test/Cost.integration.ts"], {
  cwd: join(root, "contracts"), stdio: "inherit",
  env: { ...process.env, KERNEL_FORK_RPC_URL: process.env.KERNEL_FORK_RPC_URL?.trim() || "https://sepolia.base.org", RECORD_COST_EVIDENCE: "true" },
});
child.once("error", () => { console.error("COST_FORK_RUNNER_FAILED"); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
