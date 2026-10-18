"use client";
import { useEffect, useRef, useState } from "react";
import { FinancialDashboard } from "./financial-dashboard";

interface Session { id: string; token: string; ownerAddress: string; accountAddress: string; expiresAt: number; mode: string; }
interface Ready { status: string; availableSlots: number; maxSessions: number; dependencies: { model: string; fork: string }; }
const storageKey = "guardian-review-session";
async function call<T>(path: string, body?: object, token?: string, method = body ? "POST" : "GET"): Promise<T> {
  const response = await fetch(`/api/review${path}`, { method, cache: "no-store", signal: AbortSignal.timeout(150000), headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "REVIEW_UNAVAILABLE");
  return value as T;
}
export function ReviewerWorkspace() {
  const [session, setSession] = useState<Session>(), [ready, setReady] = useState<Ready>();
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const pending = useRef<string | undefined>(undefined);
  useEffect(() => {
    setNow(Date.now());
    const readAccessLink = () => {
      const access = new URLSearchParams(location.hash.slice(1)).get("access");
      if (access && access.length >= 32 && access.length <= 256) { setCode(access); pending.current = undefined; history.replaceState(null, "", location.pathname); }
    };
    readAccessLink();
    window.addEventListener("hashchange", readAccessLink);
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null") as Session | null; if (saved && saved.expiresAt > Date.now()) setSession(saved); else sessionStorage.removeItem(storageKey); } catch { sessionStorage.removeItem(storageKey); }
    let stopped = false;
    const refresh = () => call<Ready>("/ready").then((value) => { if (!stopped) setReady(value); }).catch(() => { if (!stopped) setError("The review runtime is unavailable. Ask the team to check the runtime and cloud AI API configuration."); });
    void refresh();
    const statusTimer = setInterval(refresh, 30000), clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => { stopped = true; window.removeEventListener("hashchange", readAccessLink); clearInterval(statusTimer); clearInterval(clockTimer); };
  }, []);
  async function start() {
    setBusy(true); setError(""); pending.current ||= crypto.randomUUID();
    try {
      const result = await call<Session>("/sessions", { accessCode: code, requestId: pending.current });
      setSession(result); sessionStorage.setItem(storageKey, JSON.stringify(result)); pending.current = undefined;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "REVIEW_SESSION_FAILED"); }
    finally { setBusy(false); }
  }
  async function release() {
    if (!session) return;
    setBusy(true); setError("");
    try { await call(`/sessions/${session.id}`, undefined, session.token, "DELETE"); }
    catch { /* Expired/restarted workspaces are already inaccessible. */ }
    finally { setSession(undefined); sessionStorage.removeItem(storageKey); setBusy(false); setReady(await call<Ready>("/ready").catch(() => undefined)); }
  }
  const expired = session && now >= session.expiresAt;
  return <>
    <section className="review-access dashboard-shell">
      <p className="eyebrow">INTERNATIONAL TRACK · TOPIC F · REVIEW ACCESS</p><h1>Try Guardian Wallet</h1>
      <p>Use a disposable workspace with hosted AI inference, actual Kernel/Guardian contracts on an isolated Base Sepolia fork, and a PostgreSQL test namespace. No wallet installation, personal funds or paid API account is required.</p>
      <p className="setup-detail">Catalog rental periods are sandbox service terms. Closing or expiring this 15-minute workspace discards the namespace earlier. Completed means settlement and delivery/probe were verified at that time, not full-period uptime.</p>
      <p className="setup-detail">Sandbox transactions are local-fork execution, not public-chain evidence. The historical public procurement is independently inspectable: <a className="setup-link" href="https://sepolia.basescan.org/tx/0x7cd8b34b835cb34b65d5d3484d81541874b225e7d5fb345f5c9514ad20fdd86d" target="_blank" rel="noreferrer">Base Sepolia procurement transaction ↗</a>.</p>
      {ready && <p>Runtime: {ready.status} · AI model: {ready.dependencies.model} · fork source: {ready.dependencies.fork} · free workspace slots: {ready.availableSlots}/{ready.maxSessions}</p>}
      {error && <p className="setup-error" role="alert">{error}</p>}
      {!session ? <div className="setup-panel"><label className="label" htmlFor="review-code">Reviewer access code</label><input id="review-code" type="password" autoComplete="off" value={code} onChange={(event) => { setCode(event.target.value); pending.current = undefined; }} /><button disabled={busy || code.length < 32 || ready?.status !== "ready"} onClick={start}>{busy ? "Creating isolated contracts and database…" : "Start private review workspace"}</button><p className="setup-detail">Initialization can take up to two minutes. Retry reuses the same request ID. Sessions last 15 minutes; closing releases resources and discards sandbox data.</p></div> : <div className="dashboard-notice"><strong>{expired ? "Review workspace expired" : `Workspace expires in ${Math.max(0, Math.ceil((session.expiresAt - now) / 60000))} minute(s)`}</strong><p>Account: <code>{session.accountAddress}</code></p><button className="secondary" disabled={busy} onClick={release}>Close workspace</button></div>}
      <ol className="review-instructions"><li>Ask Astra to show assets and check wallet risk.</li><li>Ask to rent a 1 MB database for 1 hour; inspect the draft and payment preview.</li><li>Queue reviewed payments, then Start agent. Follow the task to completed.</li><li>Inspect the local receipt, verify the service probe, and write/read a database value.</li><li>Try an out-of-policy request and inspect the checks; no extra authority is granted.</li></ol>
    </section>
    {session && !expired && <FinancialDashboard key={session.id} reviewSession={{ apiBase: `/api/review/sessions/${session.id}`, token: session.token, ownerAddress: session.ownerAddress }} />}
  </>;
}
