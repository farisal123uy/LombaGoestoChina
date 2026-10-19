import Link from "next/link";
import { ApiStatus } from "../components/api-status";
import { ReviewRuntimeStatus } from "../components/review-runtime-status";
import { UiIcon, type IconName } from "../components/ui-icon";
import { loadLandingEvidence, originLabel } from "../lib/evidence";
import "./landing.css";

export const dynamic = "force-dynamic";
function Origin({ value }: { value: Parameters<typeof originLabel>[0] }) { return <span className={`origin origin-${value}`}>● {originLabel(value)}</span>; }

export default async function Home() {
  const evidence = await loadLandingEvidence(), reviewOnly = process.env.REVIEW_ONLY === "true";
  const { balances, settlement, compromised } = evidence;
  const paths: { href: string; icon: IconName; label: string; title: string; text: string }[] = reviewOnly ? [
    { href: "/review", icon: "flask", label: "INTERACTIVE SANDBOX", title: "Meet your agent wallet", text: "Create a disposable workspace. Try hosted AI and actual contracts without a personal wallet." },
    { href: "/evidence", icon: "receipt", label: "INSPECT THE RECORD", title: "Follow the evidence", text: "Explore recorded public receipts, policy checks and model evaluation results." },
  ] : [
    { href: "/setup", icon: "shield", label: "01 / SET YOUR BOUNDARIES", title: "Configure your wallet", text: "Connect the owner, deploy your policy and authorize a scoped Astra session." },
    { href: "/dashboard", icon: "wallet", label: "02 / DELEGATE A TASK", title: "Open your workspace", text: "Plan a service purchase, track escrow and inspect verified delivery in one place." },
    { href: "/evidence", icon: "receipt", label: "03 / VERIFY THE RESULT", title: "Follow the evidence", text: "Inspect recorded receipts and trace the boundary between AI proposals and execution." },
  ];
  return <main className="landing-shell">
    <section className="landing-hero">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-dot" /> INTELLIGENCE, WITH BOUNDARIES</p>
        <h1>AI proposes.<br /><span>The contract decides.</span></h1>
        <p>Astra turns your goals into services. Guardian keeps spending inside your rules. One workspace to configure authority, delegate tasks and verify what happened.</p>
        <div className="landing-actions">
          <Link className="action-primary" href={reviewOnly ? "/review" : "/dashboard"}>{reviewOnly ? "Try the reviewer workspace" : "Open wallet workspace"}<UiIcon name="arrow" /></Link>
          <Link className="action-secondary" href={reviewOnly ? "/evidence" : "/setup"}>{reviewOnly ? "View the evidence" : "Set up your wallet"}</Link>
        </div>
        <div className="hero-caption"><UiIcon name="shield" /><span>Bounded sessions</span><i /> <span>Provider-attested escrow</span></div>
      </div>
      <div className="authority-map" aria-label="How wallet authority flows">
        <div className="map-heading"><span>GUARDIAN EXECUTION MODEL</span><span className="map-tag">POLICY FIRST</span></div>
        <div className="map-agent"><div className="map-agent-icon"><UiIcon name="spark" /></div><div><strong>Astra agent</strong><small>Interprets your goal · proposes a plan</small></div><span className="map-node-label">INTENT</span></div>
        <div className="map-connector"><span /> <small>Authenticated quote</small><span /></div>
        <div className="map-guard"><div className="map-shield"><UiIcon name="shield" /></div><h2>The policy boundary</h2><p>Your rules. Enforced by the contract.</p><div className="map-checks">{["Protected reserve", "Recipient allowlist", "Daily spending limit", "Scoped session"].map((label) => <span key={label}><UiIcon name="check" />{label}</span>)}</div></div>
        <div className="map-connector"><span /><small>Only within your authority</small><span /></div>
        <div className="map-outcomes"><div><UiIcon name="lock" /><strong>Escrow</strong><small>Lock → release / refund</small></div><div><UiIcon name="receipt" /><strong>Evidence</strong><small>Receipt + service probe</small></div></div>
        <p className="map-footnote">Architecture illustration · not a live transaction</p>
      </div>
    </section>

    <section className="workspace-paths" aria-labelledby="workspace-title">
      <div className="section-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="workspace-title">Everything connected.<br /><span>Every action accountable.</span></h2></div><p>From first authorization to the final receipt. Pick up where you need to.</p></div>
      <div className={`workspace-path-grid${reviewOnly ? " two-columns" : ""}`}>{paths.map((path) => <Link href={path.href} className="workspace-path-card" key={path.href}><div className="path-card-top"><span className="path-icon"><UiIcon name={path.icon} /></span><UiIcon name="arrow" /></div><small>{path.label}</small><h3>{path.title}</h3><p>{path.text}</p></Link>)}</div>
      {!reviewOnly && <div className="sandbox-callout"><span><UiIcon name="flask" /><strong>Just exploring?</strong> Try the isolated reviewer workspace. No personal wallet needed.</span><Link href="/review">Try the reviewer workspace <UiIcon name="arrow" /></Link></div>}
    </section>

    <section className="landing-section evidence-section" aria-labelledby="evidence-title">
      <div className="section-heading"><div><p className="eyebrow">PROOF OVER PROMISES</p><h2 id="evidence-title">A visible boundary.</h2></div><p>Historical post-payment amounts from recorded public procurement. Current balances are in your wallet workspace.</p></div>
      <div className="evidence-widget"><div className="usage-block"><div><span>Recorded token balance after payment</span><strong>{balances.balance}</strong><Origin value={balances.origin} /></div><div className="usage-line"><span>Protected balance</span><b>{balances.protected}</b><div className="usage-track"><i style={{ width: `${balances.protectedPercent}%` }} /></div></div><div className="usage-line"><span>UTC-day spend</span><b>{balances.spent} / {balances.daily}</b><div className="usage-track usage-track-violet"><i style={{ width: `${balances.spentPercent}%` }} /></div></div></div><div className="evidence-stats"><div><span>Settled amount</span><strong>{settlement.amount}</strong></div><div><span>Protected balance</span><strong>{balances.protected}</strong></div><div><span>UTC-day limit</span><strong>{balances.daily}</strong></div></div></div>
      <div className="comparison-grid"><article className="comparison-card planner"><p className="eyebrow">ADVERSARIAL TEST · LOCAL FORK</p><h3>Compromised planner fixture</h3><dl><div><dt>Proposed amount</dt><dd>{compromised.proposedAmount}</dd></div><div><dt>Decoded rejection</dt><dd>{compromised.rejection ?? "Not recorded"}</dd></div></dl><Origin value={compromised.origin} /></article><article className="comparison-card contract"><p className="eyebrow">CONTRACT RESULT</p><h3>Execution rejected</h3><dl><div><dt>Inner UserOperation</dt><dd>{compromised.innerSucceeded ? "Succeeded" : "Failed"}</dd></div><div><dt>Outer transaction</dt><dd>{compromised.outerSucceeded === undefined ? "Not recorded" : compromised.outerSucceeded ? "Succeeded" : "Failed"}</dd></div></dl><Link className="setup-link" href="/evidence">Inspect the recorded tests <span aria-hidden="true">↗</span></Link></article></div>
    </section>

    <section className="landing-section faq-section" aria-labelledby="faq-title"><p className="eyebrow">A FEW THINGS TO KNOW</p><h2 id="faq-title">Clear about boundaries.</h2><details><summary>Can the AI drain the wallet?</summary><p>No claim of prompt-injection immunity. Contract controls bound payment amount, recipient, protected balance, daily spend, signature and replay state under the on-chain policy.</p></details><details><summary>What is not proven?</summary><p>{evidence.limitations}</p><p>A provider signature is an attestation of readiness, not an on-chain proof of service quality.</p></details><details><summary>Is this live?</summary><p>This overview shows recorded artifacts. The owner wallet uses Base Sepolia public testnet. The reviewer workspace executes actual contracts on a disposable fork and does not broadcast public transactions.</p></details></section>
    <section className="api-band">{reviewOnly ? <ReviewRuntimeStatus /> : <ApiStatus />}</section>
    <footer>Guardian Wallet · MockUSD is a test token with no value · Recorded evidence is not live verification.</footer>
  </main>;
}
