import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const deployment = await read(".local/linux-review/deployment-report.json");
const [smoke, comparison, security, browser, china, sourceComparison] = await Promise.all([
  read("docs/evidence/cloud-model-smoke.json"), read("docs/evidence/cloud-model-comparison.json"), read("docs/evidence/security-cloud-model-evaluation.json"),
  read("docs/evidence/reviewer-public-browser.json"), read("docs/evidence/china-network-readiness.json"), read(".local/release/deployment-comparison.json"),
]);
const origin = new URL(deployment.previewUrl).origin;
if (!/^https:\/\/[^/]+\.up\.railway\.app$/.test(origin)) throw new Error("RELEASE_HOST_NOT_ALLOWLISTED");
let response, live = {};
const readinessAttempts = [];
for (let attempt = 0; attempt < 4; attempt++) {
  try {
    response = await fetch(`${origin}/api/review/ready`, { signal: AbortSignal.timeout(20000) });
    let body; try { body = await response.json(); } catch { /* Hosting cold-start/error HTML is not readiness JSON. */ }
    readinessAttempts.push({ httpStatus: response.status, jsonReadiness: body?.status || "not-json", buildMatches: body?.buildId === deployment.buildId });
    if (body) live = body;
    if (response.ok && body?.status === "ready" && body.buildId === deployment.buildId) break;
  } catch { readinessAttempts.push({ httpStatus: "transport-error", jsonReadiness: "unavailable", buildMatches: false }); }
  if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2500));
}
const denied = await fetch(`${origin}/api/review/sessions/00000000-0000-4000-8000-000000000000/v1/assets`, { signal: AbortSignal.timeout(15000) });
const rejectedCode = await fetch(`${origin}/api/review/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: "00000000-0000-4000-8000-000000000000", accessCode: "invalid-public-readiness-probe" }), signal: AbortSignal.timeout(15000) });
const tracks = Object.values(security.summary);
const checks = {
  publicReady: Boolean(response?.ok && live.status === "ready"),
  exactBuildId: live.buildId === deployment.buildId,
  sourceRuntimeMatchesDeployedArchive: sourceComparison.runtimeMatchesSavedDeployment && sourceComparison.deployedSourceSha256 === deployment.buildId,
  unauthenticatedWorkspaceReadDenied: denied.status === 401,
  incorrectAccessCodeDenied: rejectedCode.status === 401,
  liveCloudSmokePassed: smoke.summary.passed === smoke.summary.cases,
  bothModelsPassedComparison: comparison.summary.length === 2 && comparison.summary.every((row) => row.passed === row.requiredCases),
  selectedSecurityCorpusPassed: security.observations === security.requiredObservations && tracks.every((row) => row.passed === row.observations && row.inconclusive === 0),
  publicBrowserWorkflowPassed: browser.passed && browser.deployedSourceSha256 === deployment.buildId && browser.taskStatus === "completed" && browser.operationStatus === "confirmed",
  threeChinaProbesPassed: china.observedProbes === 3 && china.expectedBuildId === deployment.buildId && china.results.every((row) => row.passed && row.country === "CN"),
};
const report = { capturedAt: new Date().toISOString(), publicUrl: `${origin}/review`, evidenceUrl: `${origin}/evidence`, deployedBuildId: deployment.buildId, readinessAttempts, checks,
  technicalAcceptancePassed: Object.values(checks).every(Boolean),
  sourcePublication: "deferred-by-owner-local-only", presentationVideo: "awaiting-owner-authorization", accountBilling: "Free/Trial confirmed by owner; no upgrade/billing API invoked; current credits/tier not independently inspected",
  officialSubmissionComplete: false,
  teamIdentityEligibility: "completed-by-team-confirmed-by-owner; personal documents not inspected by software",
  networkEvidenceDecision: { network: "Base Sepolia public testnet", chainId: 84532, token: "MockUSD test ERC-20", decision: "proceed-with-existing-evidence-by-owner-direction", organizerAcceptance: "not-confirmed; available-rules-unspecified", organizerEmailInquiry: "cancelled-by-owner-not-sent" },
  remainingOfficialGates: ["owner-authorized-presentation", "source-publication-when-authorized", "official-upload-and-receipt"],
  operationalFollowup: ["monitor-Free-Trial-credit-lifetime-and-host-health-through-judging", "test-on-the-judge-browser/network-in-addition-to-selected-China-probes"],
  privateAccessLinkFile: ".local/linux-review/reviewer-link.private.txt",
};
await writeFile(join(root, ".local/release/readiness-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.technicalAcceptancePassed) process.exitCode = 1;
