import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createReviewWorkspace } from "./workspace.mjs";
import { defaultCloudModel } from "@guardian-wallet/planner";

const databaseProfile = process.argv.includes("--baseline") ? "default" : "compact", stages = [];
// No real API key and no inference is used by this startup-only resource probe.
const workspace = await createReviewWorkspace({ provider: "groq", modelId: defaultCloudModel, apiKey: `gsk_test_${randomUUID().replaceAll("-", "")}`, freeTierConfirmed: true,
  fetch: async () => { throw new Error("PROFILE_MUST_NOT_INFER"); },
}, { databaseProfile, observeStage: (stage) => stages.push(stage) });
try {
  const response = await workspace.api.inject({ method: "GET", url: "/v1/assets", headers: { authorization: `Bearer ${workspace.token}` } });
  if (response.statusCode !== 200 || response.json().overview.token.balanceUnits !== "10000000") throw new Error("PROFILE_WALLET_NOT_READY");
} finally { await workspace.close(); }
const report = { capturedAt: new Date().toISOString(), evidenceType: "isolated-fork-startup-resource-profile-no-model-inference", platform: process.platform, databaseProfile, stages,
  afterClose: process.memoryUsage(), peakRssKb: process.resourceUsage().maxRSS, limitations: "One fresh Node process on this local host. Excludes the separate web process and cloud CPU throttling/cold start. No Groq request or public payment." };
if (process.argv.includes("--record")) await writeFile(new URL(`../../docs/evidence/reviewer-memory-${databaseProfile}.json`, import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
