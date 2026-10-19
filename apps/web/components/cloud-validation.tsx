import { readCloudEvidence } from "../lib/evidence";
import { CopyHashButton } from "./copy-hash-button";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const value = (input: unknown) => typeof input === "string" || typeof input === "number" ? String(input) : "Not recorded";
const model = (input: unknown) => ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"].includes(String(input)) ? String(input) : "Not recorded";

export async function CloudValidation() {
  const [smoke, comparison, security, baseline, linux] = await Promise.all([readCloudEvidence("cloud-model-smoke.json"), readCloudEvidence("cloud-model-comparison.json"), readCloudEvidence("security-cloud-model-evaluation.json"), readCloudEvidence("security-cloud-model-baseline.json"), readCloudEvidence("reviewer-linux-cloud.json")]);
  const smokeSummary = record(smoke?.summary);
  const comparisonRows = Array.isArray(comparison?.summary) ? comparison.summary.map(record) : [];
  const securityTracks = ["planner", "buyer", "provider", "vendor"].map((name) => record(record(security?.summary)[name]));
  const securityPassed = securityTracks.every((track) => number(track.passed) !== undefined) ? securityTracks.reduce((sum, track) => sum + Number(track.passed), 0) : undefined;
  const baselineTracks = ["planner", "buyer", "provider", "vendor"].map((name) => record(record(baseline?.summary)[name]));
  const baselineErrors = baselineTracks.every((track) => number(track.inconclusive) !== undefined) ? baselineTracks.reduce((sum, track) => sum + Number(track.inconclusive), 0) : undefined;
  const flow = Array.isArray(linux?.runs) ? record(linux.runs[0]) : {};
  const receipt = typeof flow.localTransactionHash === "string" && /^0x[0-9a-f]{64}$/i.test(flow.localTransactionHash) ? flow.localTransactionHash : undefined;
  return <section className="evidence-card" id="cloud-validation">
    <p className="eyebrow">RECORDED CLOUD MODEL VALIDATION</p><h2>Hosted AI. Measured results.</h2>
    <p className="evidence-description">These are recorded tests, separate from the historical public transaction and local Qwen checkpoint. Inference latency is measured from the calling host, not from a judge in China.</p>
    <div className="evidence-grid">
      <article className="evidence-subcard"><h3>Cloud smoke</h3><p>{model(smoke?.modelId)}</p><p>{value(smokeSummary.passed)} / {value(smokeSummary.cases)} selected cases passed.</p><small>Captured {value(smoke?.capturedAt)}</small></article>
      <article className="evidence-subcard"><h3>Selected security regression</h3><p>{model(security?.modelId)}</p><p>{value(securityPassed)} / {value(security?.requiredObservations)} observations passed; {value(security?.uniqueCases)} unique cases repeated twice.</p><small>Captured {value(security?.capturedAt)}</small><p>In-sample regression after fixing the inactive-offer schema. Preserved baseline ({model(baseline?.modelId)}): {value(baselineErrors)} API/schema errors counted as inconclusive. This is not universal injection immunity or an audit.</p></article>
    </div>
    {comparisonRows.length > 0 && <div className="cloud-comparison"><h3>Same eight cases per model</h3><table><thead><tr><th>Recorded model</th><th>Passed</th><th>P50</th><th>P95</th><th>Completion tokens</th></tr></thead><tbody>{comparisonRows.map((row) => <tr key={model(row.modelId)}><td>{model(row.modelId)}</td><td>{value(row.passed)}/{value(row.requiredCases)}</td><td>{value(row.latencyP50Ms)} ms</td><td>{value(row.latencyP95Ms)} ms</td><td>{value(row.completionTokensIncludingReasoning)}</td></tr>)}</tbody></table><p className="evidence-note">Small selected corpus; completion totals include reasoning. These measurements do not establish general model superiority.</p></div>}
    <article className="evidence-subcard"><h3>Linux reviewer workflow · {flow.passed === true ? "passed" : "not verified"}</h3><p>{model(flow.modelId)} · task {value(flow.taskStatus)} · operation {value(flow.operationStatus)}</p><p>Recorded initialization {value(flow.initializationMs)} ms; procurement through settlement, delivery, probe and write/read {value(flow.procurementToCompletedAndProbeMs)} ms.</p>{receipt && <div className="evidence-hash"><span className="label">LOCAL-FORK RECEIPT · NOT A PUBLIC TRANSACTION</span><code>{receipt}</code><CopyHashButton value={receipt} /></div>}<p className="evidence-note">Real Groq inference and actual contracts/database on a disposable fork. This capture does not establish current availability, hosting entitlement or a new public payment.</p></article>
  </section>;
}
