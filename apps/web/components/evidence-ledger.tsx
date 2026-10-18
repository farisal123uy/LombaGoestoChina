import type { ReactNode } from "react";
import type { EvidenceData, EvidenceRecord, HashRecord, Origin } from "../lib/evidence";
import { chainNote, originLabel } from "../lib/evidence";
import { CopyHashButton } from "./copy-hash-button";
import { CloudValidation } from "./cloud-validation";

function Badge({ origin, fixture }: { origin: Origin; fixture?: boolean }) { return <span className={`evidence-badge evidence-${origin}`}>{fixture ? "Fixture · " : ""}{originLabel(origin)}</span>; }
function Value({ value }: { value: string | boolean | undefined }) { return <span>{value === undefined ? "Not recorded" : typeof value === "boolean" ? value ? "Yes" : "No" : value}</span>; }
function Facts({ facts }: { facts: Record<string, string | boolean | undefined> }) { return <dl className="evidence-facts">{Object.entries(facts).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><Value value={value} /></dd></div>)}</dl>; }
function SourceState({ record }: { record: EvidenceRecord }) { return <div className="evidence-provenance"><span>Captured: {record.capturedAt ?? "Not recorded"}</span><span>Source state: {record.sourceState ?? "Not recorded"}</span></div>; }
function Hashes({ hashes }: { hashes: HashRecord[] }) {
  if (!hashes.length) return null;
  return <div className="evidence-hashes">{hashes.map((item, index) => <div className="evidence-hash" key={`${item.origin}-${index}`}><span className="label">{item.label} · {item.kind}</span><code>{item.value}</code><CopyHashButton value={item.value} />{item.explorerHref ? <a href={item.explorerHref} target="_blank" rel="noreferrer">Open public transaction ↗</a> : item.origin === "live-public" ? <span className="evidence-note">Public record; no explorer URL was recorded.</span> : <span className="evidence-note">{chainNote(item.origin)}</span>}</div>)}</div>;
}
function Sources({ record }: { record: EvidenceRecord }) {
  const entries = Object.entries(record.sourceHashes); if (!entries.length) return null;
  return <details className="evidence-sources"><summary>Source SHA-256 ({entries.length})</summary>{entries.map(([path, value]) => <div key={path}><span>{path}</span><code>{value}</code><CopyHashButton value={value} /></div>)}</details>;
}
function Card({ record, children }: { record: EvidenceRecord; children: ReactNode }) { return <section className="evidence-card"><div className="evidence-card-heading"><div><p className="eyebrow">RECORDED ARTIFACT</p><h2>{record.title}</h2></div><Badge origin={record.origin} fixture={record.fixture} /></div><SourceState record={record} />{children}<Sources record={record} /></section>; }

export function EvidenceLedger({ evidence, reviewOnly = false }: { evidence: EvidenceData; reviewOnly?: boolean }) {
  const { deployment, procurement, localFork, preview, evaluation } = evidence;
  return <main className="evidence-shell">
    <header className="evidence-header"><a className="brand" href="/"><span className="brand-mark">G</span> Guardian<span>Wallet</span></a><nav><a href="/review">Try reviewer workspace</a>{!reviewOnly && <><a href="/setup">Owner setup</a><a href="/dashboard">Astra dashboard</a></>}</nav></header>
    <section className="evidence-intro"><p className="eyebrow">RECORDED EVIDENCE LEDGER</p><h1>Recorded facts.<br /><span>Clear boundaries.</span></h1><p>Loaded from versioned JSON artifacts. This page does not query a wallet, explorer or chain. Public-chain badges identify a recorded artifact, not fresh verification.</p></section>
    <aside className="evidence-boundary"><strong>Reading this ledger</strong><span>Explorer links appear only on recorded public transactions. Local-fork hashes never identify public-chain transactions. Model inference alone has no chain transaction.</span></aside>
    <CloudValidation />
    <div className="evidence-grid"><Card record={deployment}><p className="evidence-description">Recorded sponsored deployment and policy state. It does not claim procurement or service delivery.</p><Facts facts={deployment.facts} /><Hashes hashes={deployment.hashes} /></Card><Card record={procurement}><p className="evidence-description">Recorded completed procurement. Provider delivery was an expiring managed PostgreSQL JSONB namespace; liveness is only recorded at capture time.</p><Facts facts={procurement.facts} /><Hashes hashes={procurement.hashes} /></Card></div>
    <Card record={localFork}><p className="evidence-description">Isolated fork record. Its hashes are not public Base Sepolia transactions.</p><Facts facts={localFork.facts} /><div className="evidence-subgrid">
      <article className="evidence-subcard"><div><Badge origin={localFork.compromised.origin} fixture={localFork.compromised.fixture} /><h3>Compromised planner</h3></div><p>The record contains an adversarial fixture, a failed inner UserOperation and an outer transaction success. Missing facts stay missing.</p><Facts facts={{ "UserOperation succeeded": localFork.compromised.success, "Outer transaction succeeded": localFork.compromised.outerTransactionSucceeded, ...localFork.compromised.facts }} /><Hashes hashes={localFork.compromised.hashes} /></article>
      <article className="evidence-subcard"><div><Badge origin={localFork.revoke.origin} /><h3>Revoke then deny</h3></div><p>Recorded sequence: owner revocation succeeded; a subsequent former-session operation was rejected.</p><Hashes hashes={localFork.revoke.hashes} /></article>
      <article className="evidence-subcard"><div><Badge origin={localFork.recovery.origin} /><h3>Lost-response recovery</h3></div><p>Recorded SQL/PGlite and local-bundler-stub recovery. It is not a real mempool measurement.</p><Facts facts={localFork.recovery.facts} /><Hashes hashes={localFork.recovery.hashes} /></article>
    </div><Sources record={localFork} /></Card>
    <div className="evidence-grid"><Card record={evaluation}><p className="evidence-description">Historical local Qwen smoke cases using synthetic financial state and quote fixtures. Not evidence for the current GPT-OSS model or a payment.</p><div className="evidence-runs">{evaluation.runs.map((run) => <div key={run.case}><strong>{run.case}</strong><span>Expected: <code>{run.expected}</code></span><span>Actual: <code>{run.actual}</code></span><span>{run.passed ? "Passed" : "Failed"}{run.elapsedMs === undefined ? "" : ` · ${run.elapsedMs} ms`}</span></div>)}</div><Facts facts={evaluation.facts} /></Card><Card record={preview}><p className="evidence-description">Historical local buyer/provider preview. It created no payment task, UserOperation or service provision.</p><Facts facts={preview.facts} /><Hashes hashes={preview.hashes} /></Card></div>
    <section className="evidence-card"><div className="evidence-card-heading"><div><p className="eyebrow">COMPLETE INDEX</p><h2>Hash ledger</h2></div></div><p className="evidence-description">Recorded hashes and source checksums. Their origin governs whether a public explorer link is allowed.</p><Hashes hashes={evidence.hashLedger} /></section>
    <footer>Recorded evidence only · no live verification · MockUSD test token</footer>
  </main>;
}
