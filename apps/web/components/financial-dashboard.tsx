"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentExchange, PaymentAttempt, PaymentTask, PolicySnapshot } from "@guardian-wallet/shared";
import { ensureBaseSepolia, textToHex, tokenAmount, walletProvider } from "../lib/wallet";
import { OwnerRuntimeNotice, SiteFooter, SiteHeader } from "./site-chrome";
import { plainErrorMessage } from "../lib/error-message";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
interface Status { financialConfigured: boolean; providerConfigured: boolean; executionEnabled: boolean; ownerAddress?: `0x${string}`; accountAddress?: `0x${string}`; model: { provider: string; modelId: string | null }; }
interface TaskDetails { task: PaymentTask; operation?: PaymentAttempt; }
async function request<T>(path: string, token?: string, body?: object, method = body ? "POST" : "GET"): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { method, cache: "no-store", signal: AbortSignal.timeout(path === "/v1/procure" ? 150000 : 20000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "API_REQUEST_FAILED");
  return value as T;
}

export function FinancialDashboard() {
  const [status, setStatus] = useState<Status>();
  const [auth, setAuth] = useState<{ token: string; address: string }>();
  const [policy, setPolicy] = useState<PolicySnapshot>();
  const [tasks, setTasks] = useState<PaymentTask[]>([]);
  const [selected, setSelected] = useState<TaskDetails>();
  const [goal, setGoal] = useState("Rent a small 1 MB database for 1 hour for my software project. Pay the authenticated 0.26 MockUSD invoice if it fits my existing policy.");
  const [exchange, setExchange] = useState<AgentExchange[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<Record<string, string>>({});
  const [key, setKey] = useState("project-note"), [value, setValue] = useState("Hello from Astra's database.");
  const pendingRequest = useRef<{ id: string; instruction: string } | undefined>(undefined);
  const selectedId = selected?.task.id;
  const hasActiveTasks = tasks.some((t) => ["planned", "executing", "paid", "service_pending"].includes(t.status));
  const refresh = useCallback(async (token?: string) => {
    setStatus(await request<Status>("/v1/status"));
    if (!token) return;
    const [nextTasks, nextPolicy] = await Promise.all([request<{ tasks: PaymentTask[] }>("/v1/tasks", token), request<{ policy: PolicySnapshot }>("/v1/policy", token)]);
    setTasks(nextTasks.tasks); setPolicy(nextPolicy.policy);
    if (selectedId) setSelected(await request<TaskDetails>(`/v1/tasks/${selectedId}`, token));
  }, [selectedId]);
  useEffect(() => { refresh(auth?.token).catch(() => setError("Start the financial runtime with npm.cmd run runtime:dev, then refresh/sign in.")); }, [refresh, auth?.token]);
  useEffect(() => {
    if (!auth) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(auth.token); } catch { if (!stopped) setError("Could not refresh. Sign in again if the session expired; payments are not retried from the browser."); }
      if (!stopped) timer = setTimeout(poll, hasActiveTasks ? 3000 : 10000);
    };
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [auth, refresh, hasActiveTasks]);
  useEffect(() => {
    let provider;
    try { provider = walletProvider(); } catch { return; }
    const changed = () => { setAuth(undefined); setPolicy(undefined); setTasks([]); setSelected(undefined); setExchange([]); setData({}); };
    provider.on?.("accountsChanged", changed);
    return () => provider.removeListener?.("accountsChanged", changed);
  }, []);
  async function action(name: string, body: () => Promise<void>) {
    setBusy(name); setError(""); setNotice("");
    try { await body(); } catch (cause) { setError(plainErrorMessage(cause instanceof Error ? cause.message : "REQUEST_FAILED")); }
    finally { setBusy(""); }
  }
  const signIn = () => action("Sign in with owner", async () => {
    const current = await request<Status>("/v1/status"); setStatus(current);
    if (!current.financialConfigured || !current.ownerAddress) throw new Error("Complete owner setup and restart the financial runtime first.");
    const wallet = walletProvider(), accounts = await wallet.request({ method: "eth_requestAccounts" }) as string[];
    const address = accounts[0];
    if (!address || address.toLowerCase() !== current.ownerAddress.toLowerCase()) throw new Error("Select the configured owner account in MetaMask.");
    await ensureBaseSepolia(wallet);
    const challenge = await request<{ nonce: string; message: string }>("/auth/nonce", undefined, { address });
    const signature = await wallet.request({ method: "personal_sign", params: [textToHex(challenge.message), address] });
    const session = await request<{ token: string }>("/auth/verify", undefined, { address, nonce: challenge.nonce, signature });
    setAuth({ token: session.token, address });
  });
  const procure = () => action("Astra and provider are exchanging a service request and quote", async () => {
    if (!auth) throw new Error("Sign in first.");
    if (!pendingRequest.current || pendingRequest.current.instruction !== goal) pendingRequest.current = { id: crypto.randomUUID(), instruction: goal };
    const result = await request<{ status: string; task?: PaymentTask; exchange?: AgentExchange[]; reason?: string }>("/v1/procure", auth.token, { requestId: pendingRequest.current.id, instruction: goal });
    setExchange(result.exchange || []);
    setNotice(result.reason || `Astra result: ${result.status}`);
    if (result.task) setSelected(await request<TaskDetails>(`/v1/tasks/${result.task.id}`, auth.token));
    pendingRequest.current = undefined;
    await refresh(auth.token);
  });
  const toggle = (paused: boolean) => action(paused ? "Pause scheduling" : "Start scheduling", async () => {
    if (!auth) throw new Error("Sign in first.");
    await request(`/agent/${paused ? "pause" : "start"}`, auth.token, {});
    await refresh(auth.token);
  });
  const probe = () => action("Verify provider database", async () => {
    if (!auth || !selected) return;
    const result = await request<{ ready: boolean; probeCount: number }>(`/v1/tasks/${selected.task.id}/probe`, auth.token, {});
    const values = await request<{ values: Record<string, string> }>(`/v1/tasks/${selected.task.id}/database`, auth.token);
    setData(values.values); setNotice(`Database read/write probe verified. Probe count: ${result.probeCount}`);
  });

  return <main className="dashboard-shell">
    <SiteHeader current="/dashboard" />
    <OwnerRuntimeNotice />
    <section className="dashboard-heading"><div><p className="eyebrow">ASTRA · ENTERPRISE PROCUREMENT</p><h1>Goals to services.<br /><span>Inside your authority.</span></h1><p>Two model-backed agent runtimes exchange a request and quote. A separate signer authenticates catalog prices. Settlement and an independent service probe determine completion.</p></div><div className="dashboard-login"><span className="label">Model</span><strong>{status?.model.modelId || "Waiting for API"}</strong><p>{auth ? "Owner signed in" : "Owner sign-in required"}</p><button disabled={!!busy || !status?.financialConfigured} onClick={signIn}>{auth ? "Sign in again" : "Connect owner & sign in"}</button><p className="sign-in-note">Signing this message does not move funds and costs no gas.</p></div></section>
    {error && <div className="setup-error" role="alert">{error}</div>}{notice && <div className="dashboard-notice" role="status">{notice}</div>}{busy && <p className="setup-progress" role="status">{busy}…</p>}
    <section className="dashboard-stats">{[["Confirmed token balance", policy?.balanceUnits], ["Protected balance", policy?.protectedBalanceUnits], ["UTC-day limit", policy?.dailyLimitUnits], ["Spent this UTC day", policy?.spentUnits]].map(([name, amount]) => <article key={name}><span className="label">{name}</span><strong>{amount === undefined ? "—" : tokenAmount(amount)}</strong><small>MockUSD test units</small></article>)}</section>
    <div className="dashboard-columns"><section className="setup-panel"><p className="eyebrow">DELEGATE A TASK</p><h2>Ask Astra to rent a database</h2><p className="setup-detail">The provider supplies a real, expiring PostgreSQL key-value namespace for this demonstration. It is a test service on the configured database.</p><label htmlFor="goal" className="label">Project goal</label><textarea id="goal" value={goal} maxLength={4000} disabled={!!busy} onChange={(event) => setGoal(event.target.value)} /><button disabled={!!busy || !auth || !status?.providerConfigured || !goal.trim()} onClick={procure}>Ask Astra & request provider quote</button><div className="dashboard-agent-control"><strong>Scheduler: {status?.executionEnabled ? "running" : "paused"}</strong><div className="setup-buttons"><button disabled={!!busy || !auth || status?.executionEnabled} onClick={() => toggle(false)}>Start agent</button><button className="secondary" disabled={!!busy || !auth || !status?.executionEnabled} onClick={() => toggle(true)}>Pause worker</button></div><p className="setup-detail">Local pause stops new scheduling; on-chain policy, expiry and session revocation remain separate controls.</p></div></section>
      <section className="setup-panel"><p className="eyebrow">AI-TO-AI EXCHANGE</p><h2>Request → quote → plan</h2>{(exchange.length ? exchange : selected?.task.exchange || []).map((item, index) => <article className="exchange-event" key={`${item.stage}-${index}`}><span>{item.actor.replaceAll("_", " ")} {item.modelId && <small>· {item.modelId}</small>}</span><strong>{item.stage.replaceAll("_", " ")}</strong><p>{item.summary}</p></article>)}{!exchange.length && !selected?.task.exchange?.length && <p className="setup-detail">Actual exchange summaries appear after a request. No financial results are fabricated.</p>}</section></div>
    <section className="setup-panel dashboard-tasks"><div className="dashboard-section-title"><div><p className="eyebrow">DURABLE EXECUTION</p><h2>Tasks and service evidence</h2></div><button className="secondary" disabled={!!busy} onClick={() => action("Refresh", () => refresh(auth?.token))}>Refresh</button></div>{!tasks.length && <p className="setup-detail">Sign in and create a procurement task to begin.</p>}<div className="task-list">{tasks.map((task) => <button disabled={!!busy || !auth} className={`task-row ${selectedId === task.id ? "selected" : ""}`} key={task.id} onClick={() => action("Load task", async () => { setSelected(await request<TaskDetails>(`/v1/tasks/${task.id}`, auth!.token)); setExchange([]); setData({}); })}><span><strong>{task.offerId || "Authenticated invoice"}</strong><small>{task.id}</small></span><span>{tokenAmount(task.quote.amountUnits)} MockUSD</span><span className={`task-status status-${task.status}`}>{task.status.replaceAll("_", " ")}</span></button>)}</div>
      {selected && <div className="task-detail"><div><span className="label">Task status</span><h3>{selected.task.status.replaceAll("_", " ")}</h3><p className="setup-detail">{selected.task.reason || selected.task.plan?.summary}</p><span className="label">Invoice ID</span><code>{selected.task.quote.invoiceId}</code>{selected.operation && <><span className="label">Operation · {selected.operation.status}</span><code>{selected.operation.userOperationHash}</code>{selected.operation.transactionHash && <a className="setup-link" target="_blank" rel="noreferrer" href={`https://sepolia.basescan.org/tx/${selected.operation.transactionHash}`}>Inspect public transaction ↗</a>}</>}</div>
      {selected.task.delivery && <div><span className="label">Verified provider namespace</span><code>{selected.task.delivery.namespaceId}</code><p className="setup-detail">Expires {new Date(selected.task.delivery.expiresAt * 1000).toLocaleString()}. Completion requires a signed delivery receipt and a database write/read probe, after payment confirmation.</p><button disabled={!!busy || !auth} onClick={probe}>Verify database probe</button><div className="database-edit"><label className="label" htmlFor="db-key">Database key</label><input id="db-key" value={key} maxLength={64} onChange={(e) => setKey(e.target.value)} /><label className="label" htmlFor="db-value">Value</label><input id="db-value" value={value} maxLength={4096} onChange={(e) => setValue(e.target.value)} /><button disabled={!!busy || !auth} onClick={() => action("Write database value", async () => { await request(`/v1/tasks/${selected.task.id}/database`, auth!.token, { key, value }, "PUT"); setData((await request<{ values: Record<string, string> }>(`/v1/tasks/${selected.task.id}/database`, auth!.token)).values); })}>Write & read back</button></div><pre>{JSON.stringify(data, null, 2)}</pre></div>}</div>}
    </section><SiteFooter />
  </main>;
}
