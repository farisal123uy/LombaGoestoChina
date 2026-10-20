import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const deployment = JSON.parse(await readFile(join(root, ".local/linux-review/deployment-report.json"), "utf8"));
const target = new URL(deployment.previewUrl);
if (target.protocol !== "https:" || !target.hostname.endsWith(".up.railway.app")) throw new Error("CHINA_PROBE_TARGET_NOT_ALLOWLISTED");
// Free unauthenticated Globalping checks of a PUBLIC readiness endpoint only.
// No capability, account key, query string or private data is sent to the probes.
const request = { type: "http", target: target.hostname, timeout: 20,
  locations: [{ country: "CN", city: "Beijing", limit: 1 }, { country: "CN", city: "Shanghai", limit: 1 }, { country: "CN", city: "Shenzhen", limit: 1 }],
  measurementOptions: { protocol: "HTTPS", port: 443, request: { method: "GET", path: "/api/review/ready" } } };
const headers = { "user-agent": "guardian-wallet-network-acceptance/1.0", "content-type": "application/json" };
const reuseIndex = process.argv.indexOf("--measurement");
let created;
if (reuseIndex >= 0) created = { id: process.argv[reuseIndex + 1] };
else {
  const response = await fetch("https://api.globalping.io/v1/measurements", { method: "POST", headers, body: JSON.stringify(request), signal: AbortSignal.timeout(15000) });
  if (response.status !== 202) { console.log(JSON.stringify({ status: "network-probe-unavailable", providerHttpStatus: response.status, billableFallback: false })); process.exit(1); }
  created = await response.json();
}
if (!/^[A-Za-z0-9_-]+$/.test(created.id)) throw new Error("INVALID_NETWORK_MEASUREMENT_ID");
let measurement, etag;
const deadline = Date.now() + 50000;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const polled = await fetch(`https://api.globalping.io/v1/measurements/${created.id}`, { headers: { "user-agent": headers["user-agent"], ...(etag ? { "if-none-match": etag } : {}) }, signal: AbortSignal.timeout(15000) });
  if (polled.status === 304) continue;
  if (!polled.ok) throw new Error("NETWORK_MEASUREMENT_READ_FAILED");
  etag = polled.headers.get("etag"); measurement = await polled.json();
  if (measurement.status !== "in-progress") break;
}
const results = (measurement?.results || []).map((entry) => {
  const result = entry.result || {}, location = entry.probe || {};
  let readiness; try { readiness = JSON.parse(result.rawBody); } catch { /* Error pages are not treated as readiness. */ }
  return { country: location.country, city: location.city, network: location.network, status: result.status, httpStatus: result.statusCode,
    totalMs: result.timings?.total, dnsMs: result.timings?.dns, tcpMs: result.timings?.tcp, tlsMs: result.timings?.tls,
    tlsAuthorized: result.tls?.authorized, readiness: readiness?.status, observedBuildId: readiness?.buildId,
    passed: location.country === "CN" && result.statusCode === 200 && result.tls?.authorized === true && readiness?.status === "ready" && readiness?.buildId === deployment.buildId };
});
const report = { capturedAt: new Date().toISOString(), evidenceType: "third-party-China-probes-public-HTTPS-readiness-only", publicOrigin: target.origin, expectedBuildId: deployment.buildId,
  measurementId: created.id, measurementUrl: `https://api.globalping.io/v1/measurements/${created.id}`, status: measurement?.status || "timeout", requestedProbes: 3, observedProbes: results.length, results,
  limitations: "A point-in-time readiness/TLS check from independent probes reported in mainland China. Not a judge browser session, app execution or permanent China reachability guarantee. No credentials or private reviewer capabilities were shared; unauthenticated Free service, no billing activation." };
const output = process.argv.includes("--local-report") ? ".local/linux-review/china-network-report.json" : "docs/evidence/china-network-readiness.json";
await writeFile(join(root, output), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (results.length < 3 || results.some((row) => !row.passed)) process.exitCode = 1;
