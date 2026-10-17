import { developmentChain } from "@guardian-wallet/shared";
import { ApiStatus } from "../components/api-status";

const workspaces = [
  ["01", "Web", "apps/web", "Goals, permissions, and visible execution results."],
  ["02", "API & planner", "apps/api · packages/planner", "Structured plans grounded in current financial state."],
  ["03", "Executor", "apps/worker · packages/wallet", "Bounded authority, submission, and receipt reconciliation."],
  ["04", "On-chain controls", "contracts", "Permission and protected-balance implementation."],
  ["05", "Shared state", "packages/shared · packages/database", "Versioned types, task state, and durable records."],
  ["06", "Evidence", "tests · docs", "Repeatable evaluation and verifiable execution evidence."],
];

export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Guardian Wallet home">
          <span className="brand-mark" aria-hidden="true">G</span> Guardian<span>Wallet</span>
        </a>
        <span className="badge">Wallet & backend foundation</span>
      </header>

      <section className="hero">
        <p className="eyebrow">INTERNATIONAL TRACK / TOPIC F</p>
        <h1>Your goals.<br /><span>Bounded autonomy.</span></h1>
        <p className="intro">A workspace for building financial agents that act within human-defined
          authority, adapt to changing conditions, and make their results verifiable.</p>
        <div className="facts">
          <div><span className="label">Development network</span><strong>{developmentChain.name}</strong></div>
          <div><span className="label">Chain ID</span><strong>{developmentChain.id}</strong></div>
          <div><span className="label">Next step</span><strong>Owner setup</strong></div>
        </div>
      </section>

      <section className="section-header">
        <div><p className="eyebrow">THE FOUNDATION</p><h2>One connected workspace.</h2></div>
        <p>Policy-bound execution and Qwen planning are implemented. Connect the owner wallet
          to authorize the deployed account and restricted agent session.</p>
      </section>

      <section className="cards" aria-label="Repository workspaces">
        {workspaces.map(([number, title, location, description]) => (
          <article className="card" key={number}>
            <span className="card-number">{number}</span>
            <h3>{title}</h3><p>{description}</p><code>{location}</code>
          </article>
        ))}
      </section>

      <section className="next-step">
        <div><p className="eyebrow">FIRST MILESTONE</p><h2>Prove the permissioned transaction path.</h2>
          <p>Create the smart account, authorize a restricted session, confirm an allowed
            transaction, and demonstrate rejection outside its scope.</p><a className="setup-link" href="/setup">Open sponsored owner setup →</a><br /><a className="setup-link" href="/dashboard">Open Astra dashboard →</a></div>
        <ApiStatus />
      </section>

      <footer>Guardian Wallet · 3 builders · 5-day execution plan</footer>
    </main>
  );
}
