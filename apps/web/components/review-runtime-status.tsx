"use client";
import { useEffect, useState } from "react";

export function ReviewRuntimeStatus() {
  const [message, setMessage] = useState("Checking reviewer runtime…"), [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const response = await fetch("/api/review/ready", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const value = await response.json();
      setMessage(response.ok && value.status === "ready" ? `Reviewer runtime ready · ${value.availableSlots}/${value.maxSessions} workspace slots available.` : "Reviewer runtime is unavailable. Recorded evidence remains accessible.");
    } catch { setMessage("Reviewer runtime is unavailable. Recorded evidence remains accessible."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void check(); }, []);
  return <aside className="api-status"><span className="label">REVIEW RUNTIME · SAME-ORIGIN API</span><p aria-live="polite">{message}</p><button disabled={busy} onClick={check}>{busy ? "Checking…" : "Check reviewer runtime"}</button></aside>;
}
