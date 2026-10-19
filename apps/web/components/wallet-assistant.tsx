"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaymentTask, WalletAssistantResponse, WalletExecutionResponse, WalletOverview, WalletRiskReport } from "@guardian-wallet/shared";
import { UiIcon } from "./ui-icon";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
function amount(units: string, decimals: number) {
  const n = BigInt(units), absolute = n < BigInt(0) ? -n : n, base = BigInt(10) ** BigInt(decimals);
  const fraction = (absolute % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${n < BigInt(0) ? "−" : ""}${absolute / base}${fraction ? `.${fraction}` : ""}`;
}
async function request<T>(base: string, path: string, token: string, body?: object): Promise<T> {
  const response = await fetch(`${base}${path}`, { method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(body ? 150000 : 20000),
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error === "QWEN_RATE_LIMITED" || value.error === "QWEN_DAILY_LIMIT" ? `Free AI API limit reached. Retry after ${value.retryAfterSeconds || 60} seconds; no alternate model or payment was triggered.` : value.error || "WALLET_ASSISTANT_FAILED");
  return value as T;
}

export function WalletAssistant({ token, tasks, baseUrl = apiBase, onChanged }: { token?: string; tasks: PaymentTask[]; baseUrl?: string; onChanged(): Promise<void> }) {
  const api = useCallback(<T,>(path: string, token: string, body?: object) => request<T>(baseUrl, path, token, body), [baseUrl]);
  const [instruction, setInstruction] = useState("Tampilkan aset saya dan sisa anggaran yang bisa digunakan hari ini.");
  const [selected, setSelected] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<{ overview: WalletOverview; risk: WalletRiskReport }>();
  const [reply, setReply] = useState<{ instruction: string; value: WalletAssistantResponse }>();
  const [execution, setExecution] = useState<WalletExecutionResponse>();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef<{ id: string; instruction: string; ids: string } | undefined>(undefined);
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    api<{ overview: WalletOverview; risk: WalletRiskReport }>("/v1/risk", token).then((value) => { if (!stopped) setSnapshot(value); }).catch((cause: unknown) => { if (!stopped) setError(cause instanceof Error ? cause.message : "WALLET_REFRESH_FAILED"); });
    return () => { stopped = true; };
  }, [token, api]);
  async function ask(text = instruction) {
    if (!token || busy) return;
    setBusy(true); setError(""); setExecution(undefined);
    const ids = selected.filter((id) => tasks.some((task) => task.id === id));
    if (!pending.current || pending.current.instruction !== text || pending.current.ids !== ids.join()) pending.current = { id: crypto.randomUUID(), instruction: text, ids: ids.join() };
    try {
      const value = await api<WalletAssistantResponse>("/v1/assistant", token, { requestId: pending.current.id, instruction: text, ...(ids.length ? { taskIds: ids } : {}) });
      setReply({ instruction: text, value }); setSnapshot(value); pending.current = undefined;
      await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "WALLET_ASSISTANT_FAILED"); }
    finally { setBusy(false); }
  }
  async function queue() {
    if (!token || busy || !reply?.value.paymentReview || reply.value.paymentReview.status !== "ready") return;
    setBusy(true); setError("");
    try {
      const value = await api<WalletExecutionResponse>("/v1/assistant/execute", token, { taskIds: reply.value.paymentReview.taskIds, instruction: reply.instruction });
      setExecution(value);
      if (value.review) setReply({ ...reply, value: { ...reply.value, paymentReview: value.review } });
      await onChanged();
      setSnapshot(await api<{ overview: WalletOverview; risk: WalletRiskReport }>("/v1/risk", token));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "WALLET_QUEUE_FAILED"); }
    finally { setBusy(false); }
  }
  const overview = snapshot?.overview, review = reply?.value.paymentReview;
  return <section className="setup-panel dashboard-tasks wallet-assistant" aria-label="Wallet assistant">
    <div className="assistant-heading"><div className="panel-title"><span className="panel-icon astra-icon"><UiIcon name="spark" /></span><div><p className="eyebrow">YOUR POLICY-BOUND COPILOT</p><h2>Your wallet, with Astra</h2></div></div><span className="assistant-language">EN / ID</span></div>
    <p className="setup-detail">Ask in English or Indonesian. Astra interprets your request; wallet data and policy checks determine what can happen. A database request creates a draft for you to review.</p>
    {overview && <><div className="dashboard-stats">{[["Available for new plans", overview.availableToPlanUnits], ["Queued commitments", overview.committedUnits], ["Spendable above reserve", overview.spendableBalanceUnits], ["Daily budget remaining", overview.remainingDailyUnits]].map(([name, units]) => <article key={name}><span className="label">{name}</span><strong>{amount(units!, overview.token.decimals)}</strong><small>{overview.token.symbol}</small></article>)}</div><p className="setup-detail">Block {overview.observedBlockNumber} · observed {new Date(overview.observedAt * 1000).toLocaleString()} · {overview.draftTaskCount} draft(s). Pending operations are reserved conservatively and may already be reflected in the chain balance.</p></>}
    {overview?.nativeBalanceWei !== undefined && <p className="setup-detail">Native gas balance: {amount(overview.nativeBalanceWei, 18)} ETH. Paymaster eligibility is checked separately by the executor.</p>}
    <div className="setup-buttons"><button className="secondary" disabled={!token || busy} onClick={() => ask("Show my asset balance, protected reserve and available payment budget.")}>Asset overview</button><button className="secondary" disabled={!token || busy} onClick={() => ask("Periksa risiko wallet dan pembayaran saya saat ini.")}>Check wallet risk</button></div>
    <div className="assistant-suggestions"><span>Start with a goal</span><button className="suggestion-chip" disabled={!token || busy} onClick={() => setInstruction("Rent a 1 MB database for 1 hour. Pay only the authenticated catalog invoice within my existing wallet policy.")}><UiIcon name="database" />Rent a database</button><small>Fills your instruction · review before sending</small></div>
    <label className="label" htmlFor="wallet-instruction">Wallet instruction</label><textarea id="wallet-instruction" value={instruction} maxLength={4000} disabled={busy} onChange={(event) => setInstruction(event.target.value)} />
    <fieldset disabled={busy || !token} className="wallet-task-selection"><legend>Invoice tasks for planning (up to 10)</legend>{tasks.filter((task) => ["draft", "queued", "planned", "waiting", "needs_owner", "rejected"].includes(task.status)).map((task) => <label key={task.id}><input type="checkbox" checked={selected.includes(task.id)} disabled={!selected.includes(task.id) && selected.length >= 10} onChange={(event) => setSelected((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} /><span>{task.offerId || "Authenticated invoice"} · {overview ? `${amount(task.quote.amountUnits, overview.token.decimals)} ${overview.token.symbol}` : task.quote.amountUnits} · {task.status}<small>{task.id}</small></span></label>)}{!tasks.some((task) => ["draft", "queued", "planned", "waiting", "needs_owner", "rejected"].includes(task.status)) && <p className="setup-detail">Ask to rent a catalog database to obtain a draft, or create a signed invoice task first.</p>}</fieldset>
    <div className="assistant-submit"><span><UiIcon name="shield" />You review. Guardian enforces.</span><button disabled={!token || busy || !instruction.trim()} onClick={() => ask()}>{busy ? "Checking wallet…" : "Ask wallet assistant"}<UiIcon name="arrow" /></button></div>
    {error && <p className="setup-error" role="alert">{error}</p>}
    {reply && <div className="exchange-event" aria-live="polite"><span>AI interpretation · {reply.value.modelId} · {reply.value.intent.replaceAll("_", " ")}</span><p>{reply.value.interpretation}</p>{reply.value.intent === "unsupported" && <p>Available actions: wallet overview, payment-policy risk checks, authenticated invoice planning, and catalog database procurement.</p>}</div>}
    {snapshot && <details className="wallet-risk"><summary><span><UiIcon name="shield" />Wallet policy risk: {snapshot.risk.level}</span><small>View policy checks</small></summary><ul>{snapshot.risk.checks.map((check, index) => <li key={`${check.code}-${index}`}><strong>{check.severity} · {check.code}</strong> — {check.message}{check.taskId && <small> Task {check.taskId}</small>}</li>)}</ul><p className="setup-detail">Scope: payment authority, budget and operation state. Market prices, trading and portfolio risk are not assessed.</p></details>}
    {review && overview && <div className="wallet-payment-review"><h3>Payment preview: {review.status}</h3><p>Total {amount(review.totalUnits, overview.token.decimals)} {overview.token.symbol} · balance after invoices and existing commitments: {amount(review.balanceAfterUnits, overview.token.decimals)} · daily capacity after commitments: {amount(review.remainingDailyAfterUnits, overview.token.decimals)}</p><ul>{review.items.map((item) => <li key={item.taskId}><code>{item.taskId}</code> · {amount(item.amountUnits, overview.token.decimals)} → <code>{item.recipient}</code></li>)}</ul>{review.blockers.length > 0 && <ul>{review.blockers.map((item, index) => <li key={index}>{item.code}: {item.message}</li>)}</ul>}<button disabled={!token || busy || review.status !== "ready" || execution?.status === "queued" || execution?.status === "already_submitted"} onClick={queue}>Queue reviewed payments</button><p className="setup-detail">A fresh policy and invoice check runs when queued. If scheduling is paused, use Start agent to run queued tasks. Start resumes the account queue.</p></div>}
    {execution && <p className="dashboard-notice" role="status">{execution.status === "queued" ? `Payments queued. Scheduler ${execution.schedulerPaused ? "is paused; use Start agent to execute" : "is running; follow Tasks and service evidence for confirmation"}.` : execution.status === "already_submitted" ? "These invoices already have operations. Existing transaction status is shown in Tasks and service evidence; no new payment was created." : "Payments blocked. Review the current checks above."}</p>}
  </section>;
}
