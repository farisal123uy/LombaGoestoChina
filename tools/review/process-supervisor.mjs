import { spawn } from "node:child_process";

/** Restart an owned process group, with bounded attempts/backoff and shutdown. */
export function superviseProcesses(specifications, options = {}) {
  if (!specifications.length || specifications.some((spec) => !/^[a-z][a-z0-9-]{0,40}$/.test(spec.name))) throw new Error("INVALID_SUPERVISOR_SPEC");
  const maxRestarts = options.maxRestarts ?? 3, windowMs = options.windowMs ?? 60000, baseDelayMs = options.baseDelayMs ?? 500;
  const killTimeoutMs = options.killTimeoutMs ?? 5000, healthIntervalMs = options.healthIntervalMs ?? 10000, healthGraceMs = options.healthGraceMs ?? 30000;
  for (const number of [maxRestarts, windowMs, baseDelayMs, killTimeoutMs, healthIntervalMs, healthGraceMs]) if (!Number.isInteger(number) || number < 0) throw new Error("INVALID_SUPERVISOR_LIMITS");
  let resolveResult, active = [], closing = false, restarting = false, restarts = [], totalRestarts = 0, timer, healthTimer, cycle = 0, failures = 0, startedAt = 0;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const emit = (code, detail = {}) => options.onEvent?.({ code, cycle, totalRestarts, ...detail });
  async function terminate() {
    const owned = active; active = [];
    await Promise.all(owned.map(({ child }) => new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const hardKill = setTimeout(() => { child.kill("SIGKILL"); }, killTimeoutMs);
      child.once("exit", () => { clearTimeout(hardKill); resolve(); });
      child.once("error", () => { clearTimeout(hardKill); resolve(); });
      child.kill("SIGTERM");
    })));
  }
  async function stop() {
    if (closing) return result;
    closing = true; clearTimeout(timer); clearInterval(healthTimer);
    await terminate(); emit("SUPERVISOR_STOPPED"); resolveResult({ code: 0, totalRestarts });
    return result;
  }
  async function failed(reason) {
    if (closing || restarting) return;
    restarting = true; clearInterval(healthTimer); failures = 0;
    await terminate();
    if (closing) return;
    const now = Date.now(); restarts = restarts.filter((at) => at > now - windowMs);
    if (restarts.length >= maxRestarts) {
      closing = true; emit("SUPERVISOR_RESTART_LIMIT", { reason }); resolveResult({ code: 1, totalRestarts }); return;
    }
    restarts.push(now); totalRestarts++;
    const delayMs = Math.min(10000, baseDelayMs * 2 ** (restarts.length - 1));
    emit("SUPERVISOR_RESTART_SCHEDULED", { reason, delayMs });
    timer = setTimeout(() => { restarting = false; launch(); }, delayMs);
  }
  function launch() {
    if (closing) return;
    cycle++; startedAt = Date.now();
    for (const spec of specifications) {
      const currentCycle = cycle;
      const child = spawn(spec.executable || process.execPath, spec.args, { cwd: spec.cwd, env: spec.env, windowsHide: true, stdio: spec.stdio || "inherit" });
      active.push({ name: spec.name, child });
      options.onSpawn?.(spec.name, child);
      child.once("error", () => { if (currentCycle === cycle) void failed("CHILD_START_FAILED"); });
      child.once("exit", () => { if (currentCycle === cycle) void failed("CHILD_EXITED"); });
    }
    emit("SUPERVISOR_GROUP_STARTED");
    if (options.healthCheck) {
      let checking = false;
      healthTimer = setInterval(async () => {
        if (checking || closing || restarting || Date.now() - startedAt < healthGraceMs) return;
        checking = true;
        const checkedCycle = cycle;
        try { const healthy = await options.healthCheck(); if (checkedCycle === cycle) failures = healthy ? 0 : failures + 1; } catch { if (checkedCycle === cycle) failures++; }
        finally { checking = false; }
        if (checkedCycle === cycle && failures >= 3 && !closing && !restarting) void failed("CHILD_HEALTH_FAILED");
      }, healthIntervalMs);
    }
  }
  launch();
  return { result, stop, snapshot: () => ({ cycle, totalRestarts, stopping: closing, restarting, children: active.map(({ name, child }) => ({ name, pid: child.pid })) }) };
}
