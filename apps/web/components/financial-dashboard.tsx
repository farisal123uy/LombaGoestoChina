"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AgentExchange, PaymentAttempt, PaymentTask, PolicySnapshot } from "@guardian-wallet/shared";
import { ensureBaseSepolia, textToHex, tokenAmount, walletProvider } from "../lib/wallet";
import { UiIcon } from "./ui-icon";
import { useOwnerSession } from "./owner-session";
import { WalletAssistant } from "./wallet-assistant";
import { TaskReceipt } from "./task-receipt";
import { walletApiBase as apiBase, walletRequestError } from "../lib/api-error";

interface Status { financialConfigured: boolean; providerConfigured: boolean; assistantConfigured?: boolean; executionEnabled: boolean; ownerAddress?: `0x${string}`; accountAddress?: `0x${string}`; model: { provider: string; modelId: string | null }; }
interface TaskDetails { task: PaymentTask; operation?: PaymentAttempt; }
async function apiRequest<T>(base: string, path: string, token?: string, body?: object, method = body ? "POST" : "GET"): Promise<T> {
  const response = await fetch(`${base}${path}`, { method, cache: "no-store", signal: AbortSignal.timeout(path === "/v1/procure" ? 150000 : 20000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw walletRequestError(base, response.status, value, Boolean(token));
  return value as T;
}
const activeStatuses = ["draft", "queued", "planned", "waiting", "executing", "escrowed", "paid", "service_pending"];

export function FinancialDashboard({ reviewSession }: { reviewSession?: { apiBase: string; token: string; ownerAddress: string } }) {
  const base = reviewSession?.apiBase || apiBase;
  const isReview = Boolean(reviewSession);
  const request = useCallback(<T,>(path: string, token?: string, body?: object, method?: string) => apiRequest<T>(base, path, token, body, method), [base]);
  const [status, setStatus] = useState<Status>();
  const { walletSession, setWalletSession: setAuth, restoring } = useOwnerSession();
  const [sandboxAuth] = useState(reviewSession ? { token: reviewSession.token, address: reviewSession.ownerAddress } : undefined);
  const auth = sandboxAuth || walletSession;
  const [policy, setPolicy] = useState<PolicySnapshot>();
  const [tasks, setTasks] = useState<PaymentTask[]>([]);
  const [selected, setSelected] = useState<TaskDetails>();
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [goal, setGoal] = useState("Rent a small 1 MB database for 1 hour for my software project. Pay the authenticated 0.26 MockUSD invoice if it fits my existing policy.");
  const [exchange, setExchange] = useState<AgentExchange[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [data, setData] = useState<Record<string, string>>({});
  const [key, setKey] = useState("project-note"), [value, setValue] = useState("Hello from Astra's database.");
  const pendingRequest = useRef<{ id: string; instruction: string } | undefined>(undefined);
  const selectedId = selected?.task.id;
  const hasActiveTasks = tasks.some((t) => ["planned", "executing", "escrowed", "paid", "service_pending"].includes(t.status));
  const refresh = useCallback(async (token?: string) => {
    setStatus(await request<Status>("/v1/status", token));
    if (!token) { setPolicy(undefined); setTasks([]); setSelected(undefined); setExchange([]); setData({}); return; }
    const [nextTasks, nextPolicy] = await Promise.all([request<{ tasks: PaymentTask[] }>("/v1/tasks", token), request<{ policy: PolicySnapshot }>("/v1/policy", token)]);
    setTasks(nextTasks.tasks); setPolicy(nextPolicy.policy);
    if (selectedId && nextTasks.tasks.some((task) => task.id === selectedId)) setSelected(await request<TaskDetails>(`/v1/tasks/${selectedId}`, token));
    else if (selectedId) setSelected(undefined);
  }, [selectedId, request]);
  useEffect(() => { refresh(auth?.token).catch((cause: unknown) => setError(isReview ? "The review workspace is expired or unavailable. Close it and start a new workspace." : cause instanceof TypeError ? "Start the financial runtime with npm.cmd run runtime:dev, then refresh/sign in." : cause instanceof Error ? cause.message : "Could not load the wallet.")); }, [refresh, auth?.token, isReview]);
  useEffect(() => {
    if (!auth) return;
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(auth.token); } catch (cause) { if (!stopped) setError(cause instanceof Error ? cause.message : "Could not refresh the wallet."); }
      if (!stopped) timer = setTimeout(poll, hasActiveTasks ? 3000 : 10000);
    };
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [auth, refresh, hasActiveTasks]);
  useEffect(() => {
    if (isReview) return;
    let provider;
    try { provider = walletProvider(); } catch { return; }
    const changed = () => { setAuth(undefined); setPolicy(undefined); setTasks([]); setSelected(undefined); setExchange([]); setData({}); };
    provider.on?.("accountsChanged", changed); provider.on?.("chainChanged", changed);
    return () => { provider.removeListener?.("accountsChanged", changed); provider.removeListener?.("chainChanged", changed); };
  }, [isReview, setAuth]);
  async function action(name: string, body: () => Promise<void>) {
    setBusy(name); setError(""); setNotice("");
    try { await body(); } catch (cause) { setError(cause instanceof Error ? cause.message : "REQUEST_FAILED"); }
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
    const session = await request<{ token: string; expiresInSeconds: number }>("/auth/verify", undefined, { address, nonce: challenge.nonce, signature });
    setAuth({ token: session.token, address: address as `0x${string}`, expiresAt: Date.now() + session.expiresInSeconds * 1000 });
  });
  const procure = () => action("Astra and provider are exchanging a service request and quote", async () => {
    if (!auth) throw new Error("Sign in first.");
    if (!pendingRequest.current || pendingRequest.current.instruction !== goal) pendingRequest.current = { id: crypto.randomUUID(), instruction: goal };
    const result = await request<{ status: string; task?: PaymentTask; exchange?: AgentExchange[]; reason?: string }>("/v1/procure", auth.token, { requestId: pendingRequest.current.id, instruction: goal });
    setExchange(result.exchange || []); setNotice(result.reason || `Astra result: ${result.status}`);
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
  const counts = { all: tasks.length, active: tasks.filter((task) => activeStatuses.includes(task.status)).length, completed: tasks.filter((task) => task.status === "completed").length };
  const visibleTasks = tasks.filter((task) => filter === "all" || (filter === "active" ? activeStatuses.includes(task.status) : task.status === "completed"));
  const events = exchange.length ? exchange : selected?.task.exchange || [];
  const Container = isReview ? "section" : "main";

  return <Container className="dashboard-shell">
    {reviewSession && <p className="dashboard-notice sandbox-notice">Review sandbox: hosted AI inference and actual Kernel/Guardian execution on an isolated local fork. Transactions here are not public broadcasts. The owner and funds belong only to this disposable workspace.</p>}
    <section className="dashboard-heading">
      <div><p className="eyebrow">WALLET WORKSPACE / ASTRA</p><h1>Goals to services.<br /><span>Inside your authority.</span></h1><p>Your balance, your boundaries, your agent. Plan a purchase and follow it all the way to verified delivery.</p></div>
      <div className="dashboard-login"><span className="model-avatar"><UiIcon name="spark" /></span><div><span className="label">YOUR AI ASSISTANT</span><strong>{status?.model.modelId || "Waiting for API"}</strong><p>{reviewSession ? "Disposable review workspace" : restoring ? "Restoring owner sign-in…" : auth ? "Owner signed in" : "Owner sign-in required"}</p></div>{!reviewSession && <button disabled={!!busy || restoring || !status?.financialConfigured} onClick={signIn}>{auth ? "Sign in again" : "Connect owner & sign in"}</button>}</div>
    </section>
    {!isReview && <div className="workspace-guide"><UiIcon name="wallet" /><p><strong>Wallet is your daily workspace.</strong> {auth ? "Your sign-in stays active across refreshes in this tab until it expires. " : "Sign in with MetaMask to see balances and tasks. "}Setup is only needed to deploy the wallet and authorize Astra for the first time.</p><Link href="/setup">View deployment & delegation <UiIcon name="arrow" /></Link></div>}
    {!isReview && status?.accountAddress && <p className="setup-detail">Active Kernel account: <code>{status.accountAddress}</code> · Tasks and invoices below belong to this account.</p>}
    <section className="dashboard-stats" aria-label="On-chain wallet balances">{[["Confirmed token balance", policy?.balanceUnits, "wallet"], ["Protected balance", policy?.protectedBalanceUnits, "shield"], ["UTC-day limit", policy?.dailyLimitUnits, "lock"], ["Spent this UTC day", policy?.spentUnits, "receipt"]].map(([name, amount, icon]) => <article key={name}><div className="stat-heading"><span className="label">{name}</span><UiIcon name={icon as "wallet" | "shield" | "lock" | "receipt"} /></div><strong>{amount === undefined ? "—" : tokenAmount(amount)}</strong><small>MockUSD test units</small></article>)}</section>
    <div className="workspace-control-bar"><div className="scheduler-label"><span className={`scheduler-dot${status?.executionEnabled ? " is-running" : ""}`} /><strong>Scheduler: {status?.executionEnabled ? "running" : "paused"}</strong><span>{counts.active} active task{counts.active === 1 ? "" : "s"}</span></div><div className="setup-buttons"><button disabled={!!busy || !auth || status?.executionEnabled} onClick={() => toggle(false)}>Start agent</button><button className="secondary" disabled={!!busy || !auth || !status?.executionEnabled} onClick={() => toggle(true)}>Pause worker</button></div></div>
    <p className="control-hint">Start agent enables the account queue; execution also requires a running worker process. If a task stays planned, check <code>npm.cmd run runtime:dev</code>. Local pause and on-chain revocation are separate.</p>
    {error && <div className="setup-error" role="alert">{error}</div>}{notice && <div className="dashboard-notice" role="status">{notice}</div>}{busy && <p className="setup-progress" role="status"><span className="busy-spinner" />{busy}…</p>}
    {status?.assistantConfigured && <WalletAssistant key={auth?.token || "signed-out"} token={auth?.token} tasks={tasks} baseUrl={base} onChanged={() => refresh(auth?.token)} />}
    <div className="dashboard-columns">
      <section className="setup-panel"><div className="panel-title"><span className="panel-icon"><UiIcon name="database" /></span><div><p className="eyebrow">DIRECT SERVICE REQUEST</p><h2>Ask Astra to rent a database</h2></div></div><p className="setup-detail">Prefer a focused request? Ask the provider for an authenticated quote for an expiring PostgreSQL key-value namespace.</p><label htmlFor="goal" className="label">Project goal</label><textarea id="goal" value={goal} maxLength={4000} disabled={!!busy} onChange={(event) => setGoal(event.target.value)} /><button disabled={!!busy || !auth || !status?.providerConfigured || !goal.trim()} onClick={procure}>Ask Astra & request provider quote</button></section>
      <section className="setup-panel exchange-panel"><div className="panel-title"><span className="panel-icon"><UiIcon name="receipt" /></span><div><p className="eyebrow">AGENT ACTIVITY</p><h2>Request → quote → plan</h2></div></div>{events.map((item, index) => <article className="exchange-event" key={`${item.stage}-${index}`}><span>{item.actor.replaceAll("_", " ")} {item.modelId && <small>· {item.modelId}</small>}</span><strong>{item.stage.replaceAll("_", " ")}</strong><p>{item.summary}</p></article>)}{!events.length && <div className="empty-state"><UiIcon name="spark" /><strong>Ready for your first request</strong><p>Agent exchange summaries will appear here when you request a quote or select an existing task.</p></div>}</section>
    </div>
    <section className="setup-panel dashboard-tasks" id="task-activity"><div className="dashboard-section-title"><div><p className="eyebrow">ACTIVITY & RECEIPTS</p><h2>Tasks and service evidence</h2></div><button className="secondary" disabled={!!busy} onClick={() => action("Refresh", () => refresh(auth?.token))}>Refresh</button></div>
      <div className="task-filters" aria-label="Filter tasks">{(["all", "active", "completed"] as const).map((item) => <button key={item} className="task-filter" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === "all" ? "All tasks" : item === "active" ? "Active" : "Completed"}<span>{counts[item]}</span></button>)}</div>
      {!visibleTasks.length && <div className="empty-state"><UiIcon name="receipt" /><strong>{!auth ? "Your activity, in one place" : filter === "all" ? "No tasks yet" : "No matching tasks"}</strong><p>{!auth ? "Sign in and create a procurement task to begin." : filter === "all" ? "Request a database with Astra. Your task and its verified receipts will appear here." : "Choose another filter to see the rest of your activity."}</p></div>}
      <div className="task-list">{visibleTasks.map((task) => <button disabled={!!busy || !auth} className={`task-row ${selectedId === task.id ? "selected" : ""}`} key={task.id} onClick={() => action("Load task", async () => { setSelected(await request<TaskDetails>(`/v1/tasks/${task.id}`, auth!.token)); setExchange([]); setData({}); })}><span><strong>{task.offerId || "Authenticated invoice"}</strong><small>{task.id}</small></span><span>{tokenAmount(task.quote.amountUnits)} MockUSD</span><span className={`task-status status-${task.status}`}>{task.status.replaceAll("_", " ")}</span></button>)}</div>
      {selected && <div className="task-detail"><TaskReceipt task={selected.task} operation={selected.operation} local={isReview} />
        {!selected.operation && ["draft", "queued", "planned", "waiting", "needs_owner", "rejected"].includes(selected.task.status) && <div className="setup-buttons"><button className="secondary" disabled={!!busy || !auth} onClick={() => action("Discard unsubmitted invoice", async () => { await request(`/v1/tasks/${selected.task.id}/cancel`, auth!.token, {}); await refresh(auth!.token); setNotice("Unsubmitted invoice discarded. Its reserved queue budget is released; you can request a fresh quote."); })}>Discard unsubmitted invoice</button></div>}
        {selected.task.status === "completed" && selected.task.delivery && <div className="service-evidence"><div className="panel-title"><span className="panel-icon"><UiIcon name="database" /></span><div><span className="label">Verified provider namespace</span><strong>Service workspace</strong></div></div><code>{selected.task.delivery.namespaceId}</code><p className="setup-detail">Expires {new Date(selected.task.delivery.expiresAt * 1000).toLocaleString()}. Completion requires a signed delivery receipt and a database write/read probe after settlement or escrow release.</p><button disabled={!!busy || !auth} onClick={probe}>Verify database probe</button><div className="database-edit"><label className="label" htmlFor="db-key">Database key</label><input id="db-key" value={key} maxLength={64} onChange={(event) => setKey(event.target.value)} /><label className="label" htmlFor="db-value">Value</label><input id="db-value" value={value} maxLength={4096} onChange={(event) => setValue(event.target.value)} /><button disabled={!!busy || !auth} onClick={() => action("Write database value", async () => { await request(`/v1/tasks/${selected.task.id}/database`, auth!.token, { key, value }, "PUT"); setData((await request<{ values: Record<string, string> }>(`/v1/tasks/${selected.task.id}/database`, auth!.token)).values); })}>Write & read back</button></div><pre>{JSON.stringify(data, null, 2)}</pre></div>}
      </div>}
    </section><footer>Bounded authority · confirmed settlement · verifiable test-service delivery</footer>
  </Container>;
}
