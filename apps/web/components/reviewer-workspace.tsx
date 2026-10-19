"use client";
import { useEffect, useRef, useState } from "react";
import { FinancialDashboard } from "./financial-dashboard";
import { UiIcon } from "./ui-icon";

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
  return <main className="review-page">
    <section className="review-access dashboard-shell">
      <div className="review-intro"><div><p className="eyebrow">EXPLORE / ISOLATED SANDBOX</p><h1>Meet your wallet.<br /><span>Try its boundaries.</span></h1><p>Hosted AI, actual contracts, a disposable workspace. Explore Guardian with no wallet installation or personal funds.</p></div><span className="review-hero-icon"><UiIcon name="flask" /></span></div>
      {!session && <div className="review-feature-list"><span><UiIcon name="spark" />Hosted AI inference</span><span><UiIcon name="shield" />Isolated Kernel / Guardian fork</span><span><UiIcon name="database" />PostgreSQL test namespace</span></div>}
      {ready && <p>Runtime: {ready.status} · AI model: {ready.dependencies.model} · fork source: {ready.dependencies.fork} · free workspace slots: {ready.availableSlots}/{ready.maxSessions}</p>}
      {error && <p className="setup-error" role="alert">{error}</p>}
      {!session ? <div className="review-start-grid"><div className="setup-panel"><div className="panel-title"><span className="panel-icon"><UiIcon name="lock" /></span><div><p className="eyebrow">PRIVATE REVIEW ACCESS</p><h2>Your workspace awaits</h2></div></div><label className="label" htmlFor="review-code">Reviewer access code</label><input id="review-code" type="password" autoComplete="off" placeholder="Enter the code shared by the team" value={code} onChange={(event) => { setCode(event.target.value); pending.current = undefined; }} /><button disabled={busy || code.length < 32 || ready?.status !== "ready"} onClick={start}>{busy ? "Creating isolated contracts and database…" : "Start private review workspace"}</button><p className="setup-detail">Allow up to two minutes to initialize. Sessions last 15 minutes. Closing discards the workspace; retries reuse the same request ID.</p></div><div className="review-walkthrough"><p className="eyebrow">A QUICK WALKTHROUGH</p><ol className="review-instructions"><li><strong>Explore your wallet</strong><span>Ask Astra about assets, budget and wallet policy.</span></li><li><strong>Review a service purchase</strong><span>Request a 1 MB database for 1 hour. Review the draft before queuing.</span></li><li><strong>Watch authority at work</strong><span>Start the agent, follow settlement, then probe and write/read the database.</span></li></ol></div></div> : <div className="dashboard-notice review-session-banner"><div><strong>{expired ? "Review workspace expired" : `Workspace expires in ${Math.max(0, Math.ceil((session.expiresAt - now) / 60000))} minute(s)`}</strong><p>Account: <code>{session.accountAddress}</code></p></div><button className="secondary" disabled={busy} onClick={release}>Close workspace</button></div>}
      <details className="review-boundaries"><summary>About this sandbox and its receipts</summary><p>Sandbox transactions are local-fork execution, not public-chain evidence. The historical public procurement is independently inspectable: <a className="setup-link" href="https://base-sepolia.blockscout.com/tx/0x7cd8b34b835cb34b65d5d3484d81541874b225e7d5fb345f5c9514ad20fdd86d" target="_blank" rel="noreferrer">Base Sepolia procurement transaction ↗</a>.</p><p>Catalog rental periods are sandbox service terms. Closing or expiring this 15-minute workspace discards the namespace earlier. Completed means settlement and delivery/probe were verified at that time, not full-period uptime. Try an out-of-policy request to inspect the checks; requests grant no extra authority.</p></details>
    </section>
    {session && !expired && <FinancialDashboard key={session.id} reviewSession={{ apiBase: `/api/review/sessions/${session.id}`, token: session.token, ownerAddress: session.ownerAddress }} />}
  </main>;
}
