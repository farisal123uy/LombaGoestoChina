import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { superviseProcesses } from "../../tools/review/process-supervisor.mjs";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const stop of cleanup.splice(0)) await stop(); });
async function port() {
  const server = createServer(); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST_PORT_REQUIRED");
  const value = address.port; await new Promise<void>((resolve) => server.close(() => resolve())); return value;
}
async function wait(check: () => Promise<boolean> | boolean, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 40)); }
  throw new Error("SUPERVISOR_TEST_TIMEOUT");
}
describe("Backend process group recovery with actual child processes", () => {
  it("recovers a crashed API, restarts the group, then shuts down without respawning", async () => {
    const value = await port(), origin = `http://127.0.0.1:${value}`;
    const code = `let healthy=true;require('node:http').createServer((q,r)=>{if(q.url==='/crash'){r.end('bye');setTimeout(()=>process.exit(7),5);return}if(q.url==='/unhealthy')healthy=false;r.statusCode=healthy?200:503;r.end(JSON.stringify({pid:process.pid,healthy}))}).listen(${value},'127.0.0.1')`;
    const health = async () => { try { return (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(200) })).ok; } catch { return false; } };
    const supervisor = superviseProcesses([{ name: "api", args: ["-e", code], stdio: "ignore" }, { name: "sidecar", args: ["-e", "setInterval(()=>{},1000)"], stdio: "ignore" }], {
      baseDelayMs: 30, killTimeoutMs: 300, healthIntervalMs: 100, healthGraceMs: 250, healthCheck: health,
    }); cleanup.push(supervisor.stop);
    await wait(health); const first = supervisor.snapshot().children.map((child) => child.pid);
    await fetch(`${origin}/crash`);
    await wait(async () => supervisor.snapshot().cycle >= 2 && await health());
    const second = supervisor.snapshot().children.map((child) => child.pid); expect(second).not.toEqual(first);
    await fetch(`${origin}/unhealthy`);
    await wait(async () => supervisor.snapshot().cycle >= 3 && await health());
    const before = supervisor.snapshot().cycle;
    expect((await supervisor.stop()).code).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(supervisor.snapshot().cycle).toBe(before); expect(supervisor.snapshot().children).toEqual([]);
    expect(await health()).toBe(false);
  });
  it("stops after the bounded rapid-restart budget instead of looping indefinitely", async () => {
    const supervisor = superviseProcesses([{ name: "invalid-api", args: ["-e", "process.exit(4)"], stdio: "ignore" }], { maxRestarts: 2, baseDelayMs: 10, killTimeoutMs: 100 });
    cleanup.push(supervisor.stop);
    expect(await supervisor.result).toEqual({ code: 1, totalRestarts: 2 });
    expect(supervisor.snapshot().cycle).toBe(3); expect(supervisor.snapshot().children).toEqual([]);
  });
});
