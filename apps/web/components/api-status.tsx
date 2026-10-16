"use client";

import { useState } from "react";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export function ApiStatus() {
  const [status, setStatus] = useState("Not checked");
  const [checking, setChecking] = useState(false);

  async function checkHealth() {
    setChecking(true);
    try {
      const response = await fetch(`${apiUrl}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Health request failed");
      const data = await response.json() as { status?: unknown };
      setStatus(data.status === "ok" ? "API reachable" : "Unexpected response");
    } catch {
      setStatus("API unavailable");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="api-status">
      <div><span className="label">API process</span><p aria-live="polite">{status}</p></div>
      <button type="button" onClick={checkHealth} disabled={checking}>
        {checking ? "Checking…" : "Check connection"}
      </button>
    </div>
  );
}
