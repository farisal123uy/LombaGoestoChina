import type { ReactNode } from "react";
import type { EvidenceData, EvidenceRecord, HashRecord, Origin } from "../lib/evidence";
import { chainNote, originLabel, twoDecimals } from "../lib/evidence";
import { CopyHashButton } from "./copy-hash-button";
import { SiteFooter, SiteHeader } from "./site-chrome";

function Badge({ origin, fixture }: { origin: Origin; fixture?: boolean }) { return <span className={`evidence-badge evidence-${origin}`}>{fixture ? "Fixture · " : ""}{originLabel(origin)}</span>; }
function Value({ value }: { value: string | boolean | undefined }) { return <span>{value === undefined ? "Not recorded" : typeof value === "boolean" ? value ? "Yes" : "No" : twoDecimals(value)}</span>; }
function Facts({ facts }: { facts: Record<string, string | boolean | undefined> }) { return <dl className="evidence-facts">{Object.entries(facts).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><Value value={value} /></dd></div>)}</dl>; }
function SourceState({ record }: { record: EvidenceRecord }) { return <div className="evidence-provenance"><span>Captured: {record.capturedAt ?? "Not recorded"}</span><span>Source state: {record.sourceState ?? "Not recorded"}</span></div>; }
function Hashes({ hashes }: { hashes: HashRecord[] }) {
  if (!hashes.length) return null;
  return <div className="evidence-hashes">{hashes.map((item, index) => <div className="evidence-hash" key={`${item.origin}-${index}`}><span className="label">{item.label} · {item.kind}</span><code>{item.value}</code><CopyHashButton value={item.value} />
    {item.explorerHref ? <a href={item.explorerHref} target="_blank" rel="noreferrer">Open public transaction ↗</a> : item.origin === "live-public" ? <span className="evidence-note">Public record; no explorer URL was recorded.</span> : <span className="evidence-note">{chainNote(item.origin)}</span>}</div>)}</div>;
}
function Boundaries({ record, proves }: { record: EvidenceRecord; proves: string }) {
  const doesNotProve = record.notEstablished?.length ? record.notEstablished : [record.limitations ?? record.scope ?? "Not recorded"];
  return <div className="evidence-boundaries"><p><strong>Proves:</strong> {proves}</p><div><strong>Does not prove:</strong><ul>{doesNotProve.map((item) => <li key={item}>{item}</li>)}</ul></div></div>;
}
function Card({ id, record, proves, children }: { id?: string; record: EvidenceRecord; proves: string; children: ReactNode }) {
  return <section id={id} className="evidence-card"><div className="evidence-card-heading"><div><p className="eyebrow">RECORDED ARTIFACT</p><h2>{record.title}</h2></div><Badge origin={record.origin} fixture={record.fixture} /></div><SourceState record={record} /><Boundaries record={record} proves={proves} />{children}</section>;
}
function ClaimTable() {
  const claims = [["claim-a", "Public purchase", "Recorded settlement and payment."], ["claim-b", "Delivery lines", "Recorded signed delivery and live probe."], ["claim-c", "Compromised planner", "Fixture operation was rejected."], ["claim-d", "Revoke", "Former session was denied."], ["claim-e", "Recovery", "One send reconciled after restart."], ["claim-f", "Qwen evaluation", "Selected smoke cases passed."]];
  return <section className="claims" aria-labelledby="claims-title"><p className="eyebrow">JUDGE START HERE</p><h1 id="claims-title">Six claims. <span>One record each.</span></h1><p>These committed artifacts are static: no live API, wallet, explorer, or chain query runs here.</p><table><thead><tr><th>Claim</th><th>What the record shows</th></tr></thead><tbody>{claims.map(([id, title, summary]) => <tr key={id}><th><a href={`#${id}`}>{title}</a></th><td>{summary}</td></tr>)}</tbody></table></section>;
}

export function EvidenceLedger({ evidence }: { evidence: EvidenceData }) {
  const { deployment, procurement, localFork, preview, evaluation } = evidence;
  const settlementAmount = twoDecimals(procurement.facts.Amount);
  const deliveryFacts = { "Delivery signature verified": procurement.facts["Delivery signature verified"], "Recorded delivery status": procurement.facts["Recorded delivery status"] };
  return <main className="evidence-shell">
    <SiteHeader current="/evidence" />
    <ClaimTable />
    <aside className="verify-box"><strong>Verify the public purchase</strong><ol><li>Open the recorded public transaction below.</li><li>Confirm status <strong>Success</strong>.</li><li>Confirm the token transfer equals <strong>{settlementAmount}</strong>.</li></ol></aside>
    <details className="evidence-glossary"><summary>Glossary: public chain, local fork, local inference</summary><dl><div><dt>Public chain · recorded</dt><dd>A recorded public-chain artifact. It is not a fresh verification.</dd></div><div><dt>Local fork · recorded</dt><dd>A recorded local test run. Its hashes are not public-chain transactions.</dd></div><div><dt>Local inference · recorded</dt><dd>A recorded local model run. It is not a chain transaction.</dd></div></dl></details>
    <section className="evidence-section" aria-labelledby="purchase-title"><p className="eyebrow">PUBLIC PURCHASE</p><h2 id="purchase-title">Payment and delivery record</h2>
      <Card id="deployment" record={deployment} proves="Public testnet deployment and policy verification."><Facts facts={deployment.facts} /><Hashes hashes={deployment.hashes} /></Card>
      <Card id="claim-a" record={procurement} proves="Existing public testnet settlement independently checked against recorded receipts, events, signed quote, signed delivery, and consumed-ID state."><Facts facts={procurement.facts} /><div id="claim-b" className="delivery-lines"><h3>Delivery lines</h3><Boundaries record={procurement} proves="Recorded delivery signature verification and live probe status at capture time." /><Facts facts={deliveryFacts} /></div><Hashes hashes={procurement.hashes} /></Card>
    </section>
    <section className="evidence-section" aria-labelledby="fork-title"><p className="eyebrow">LOCAL FORK</p><h2 id="fork-title">Three recorded policy checks</h2><div className="evidence-subgrid">
      <Card id="claim-c" record={localFork.compromised} proves="The fixture records a failed inner UserOperation and a successful outer transaction result."><Facts facts={{ "UserOperation succeeded": localFork.compromised.success, "Outer transaction succeeded": localFork.compromised.outerTransactionSucceeded, ...localFork.compromised.facts }} /><Hashes hashes={localFork.compromised.hashes} /></Card>
      <Card id="claim-d" record={localFork.revoke} proves="The recorded owner revocation succeeded and the subsequent former-session operation was rejected."><Facts facts={localFork.revoke.facts} /><Hashes hashes={localFork.revoke.hashes} /></Card>
      <Card id="claim-e" record={localFork.recovery} proves="The record shows one send, an unknown response, then paid status after restart reconciliation."><Facts facts={localFork.recovery.facts} /><Hashes hashes={localFork.recovery.hashes} /></Card>
    </div></section>
    <Card id="claim-f" record={evaluation} proves="The recorded selected Qwen smoke cases produced their expected outputs."><div className="evidence-runs">{evaluation.runs.map((run) => <div key={run.case}><strong>{run.case}</strong><span>Expected: <code>{run.expected}</code></span><span>Actual: <code>{run.actual}</code></span><span>{run.passed ? "Passed" : "Failed"}{run.elapsedMs === undefined ? "" : ` · ${run.elapsedMs} ms`}</span></div>)}</div><Facts facts={evaluation.facts} /></Card>
    <Card record={preview} proves="Actual local Qwen inference, separate provider processes, a hosted SQL invoice, and public on-chain policy reads for this preview."><Facts facts={preview.facts} /><Hashes hashes={preview.hashes} /></Card>
    <details className="evidence-ledger-details"><summary>Hash ledger and code fingerprints</summary><p>Full recorded hashes and source checksums. Only recorded public-chain transactions may include an explorer link.</p><Hashes hashes={evidence.hashLedger} /></details>
    <SiteFooter />
  </main>;
}
