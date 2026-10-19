import { formatUnits } from "viem";
import deploymentArtifact from "../../../docs/evidence/public-deployment.json";
import procurementArtifact from "../../../docs/evidence/public-procurement.json";
import forkArtifact from "../../../docs/evidence/2026-10-16-local-fork.json";
import previewArtifact from "../../../docs/evidence/provider-live-preview.json";
import qwenArtifact from "../../../docs/evidence/qwen-local-evaluation.json";
import smokeArtifact from "../../../docs/evidence/cloud-model-smoke.json";
import comparisonArtifact from "../../../docs/evidence/cloud-model-comparison.json";
import securityArtifact from "../../../docs/evidence/security-cloud-model-evaluation.json";
import securityBaselineArtifact from "../../../docs/evidence/security-cloud-model-baseline.json";
import linuxArtifact from "../../../docs/evidence/reviewer-linux-cloud.json";
import costArtifact from "../../../docs/evidence/cost-fork.json";

export type Origin = "live-public" | "local-fork" | "local-inference";
export type HashKind = "UserOperation" | "Transaction" | "Block" | "Invoice" | "Payment" | "Service" | "Source SHA-256";
export interface HashRecord { label: string; value: string; kind: HashKind; origin: Origin; explorerHref?: string; }
export interface EvidenceRecord {
  title: string;
  origin: Origin;
  fixture?: boolean;
  sourceState?: string;
  capturedAt?: string;
  scope?: string;
  limitations?: string | string[];
  notEstablished?: string[];
  sourceHashes: Record<string, string>;
  hashes: HashRecord[];
}
export interface CompromisedPlannerRecord extends EvidenceRecord { success: boolean; outerTransactionSucceeded?: boolean; facts: Record<string, string | boolean | undefined>; }
export interface CostEvidence extends EvidenceRecord {
  evidenceType: string;
  result: {
    invoiceCount: string;
    invoiceAmountUnits: string;
    totalServiceAmountUnits: string;
    singleOperationCount: string;
    batchOperationCount: string;
    singleMedianEnclosingTransactionGas: string;
    batchMedianEnclosingTransactionGas: string;
    enclosingTransactionGasReductionPercent: string;
  };
  limitations: string[];
}
export interface EvidenceData {
  deployment: EvidenceRecord & { facts: Record<string, string | boolean | undefined> };
  procurement: EvidenceRecord & { facts: Record<string, string | boolean | undefined> };
  localFork: EvidenceRecord & {
    facts: Record<string, string | boolean | undefined>;
    compromised: CompromisedPlannerRecord;
    revoke: EvidenceRecord & { facts: Record<string, string | boolean | undefined> };
    recovery: EvidenceRecord & { facts: Record<string, string | boolean | undefined> };
  };
  preview: EvidenceRecord & { facts: Record<string, string | boolean | undefined> };
  evaluation: EvidenceRecord & { facts: Record<string, string | boolean | undefined>; runs: Array<{ case: string; expected: string; actual: string; passed: boolean; elapsedMs?: number }> };
  cost: CostEvidence;
  hashLedger: HashRecord[];
}

type Json = Record<string, unknown>;
const requiredFiles = ["public-deployment.json", "public-procurement.json", "2026-10-16-local-fork.json", "provider-live-preview.json", "qwen-local-evaluation.json"] as const;
const cloudFiles = ["cloud-model-smoke.json", "cloud-model-comparison.json", "security-cloud-model-evaluation.json", "security-cloud-model-baseline.json", "reviewer-linux-cloud.json"] as const;
const requiredArtifacts = { "public-deployment.json": deploymentArtifact, "public-procurement.json": procurementArtifact, "2026-10-16-local-fork.json": forkArtifact, "provider-live-preview.json": previewArtifact, "qwen-local-evaluation.json": qwenArtifact };
const cloudArtifacts = { "cloud-model-smoke.json": smokeArtifact, "cloud-model-comparison.json": comparisonArtifact, "security-cloud-model-evaluation.json": securityArtifact, "security-cloud-model-baseline.json": securityBaselineArtifact, "reviewer-linux-cloud.json": linuxArtifact };

function object(value: unknown, name: string): Json { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid evidence JSON object: ${name}`); return value as Json; }
function text(value: unknown, name: string): string { if (typeof value !== "string") throw new Error(`Invalid evidence JSON field: ${name}`); return value; }
function scalar(value: unknown, name: string): string { if (typeof value !== "string" && typeof value !== "number") throw new Error(`Invalid evidence JSON field: ${name}`); return String(value); }
export function unsignedUnits(value: unknown, name: string): string { const units = text(value, name); if (!/^(0|[1-9][0-9]*)$/.test(units)) throw new Error(`Invalid evidence integer units: ${name}`); return units; }
function bool(value: unknown, name: string): boolean { if (typeof value !== "boolean") throw new Error(`Invalid evidence JSON field: ${name}`); return value; }
function strings(value: unknown, name: string): Record<string, string> { return Object.fromEntries(Object.entries(object(value, name)).map(([key, entry]) => [key, text(entry, `${name}.${key}`)])); }
function stringList(value: unknown, name: string): string[] { if (!Array.isArray(value)) throw new Error(`Invalid evidence JSON field: ${name}`); return value.map((entry, index) => text(entry, `${name}.${index}`)); }
function optionalText(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function optionalBool(value: unknown): boolean | undefined { return typeof value === "boolean" ? value : undefined; }
function amount(units: unknown, decimals: unknown): string | undefined { if (typeof decimals !== "number" || typeof units !== "string" || !/^(0|[1-9][0-9]*)$/.test(units)) return undefined; return `${formatUnits(BigInt(units), decimals)} MockUSD`; }
function nonPublicLabel(origin: Exclude<Origin, "live-public">) { return origin === "local-fork" ? "Local fork · not a public-chain transaction" : "Local inference · not a chain transaction"; }
function hash(label: string, value: unknown, kind: HashKind, origin: Origin, explorerHref?: string): HashRecord | undefined {
  if (typeof value !== "string") return undefined;
  let safeHref: string | undefined;
  if (origin === "live-public" && kind === "Transaction" && explorerHref) {
    try {
      const url = new URL(explorerHref);
      if (url.protocol === "https:" && url.hostname === "sepolia.basescan.org" && url.pathname.toLowerCase() === `/tx/${value.toLowerCase()}` && /^0x[0-9a-f]{64}$/i.test(value)) safeHref = url.toString();
    } catch { /* A malformed link is never a public receipt. */ }
  }
  return { label, value, kind, origin, ...(safeHref ? { explorerHref: safeHref } : {}) };
}
function only<T>(value: T | undefined): T[] { return value ? [value] : []; }
async function readEvidence(name: typeof requiredFiles[number]): Promise<Json> { return object(requiredArtifacts[name], name); }
export async function readCloudEvidence(name: typeof cloudFiles[number]): Promise<Json | undefined> {
  if (!cloudFiles.includes(name)) throw new Error("Evidence file is not allowlisted");
  return object(cloudArtifacts[name], name);
}

export async function loadEvidence(): Promise<EvidenceData> {
  const artifacts = await Promise.all(requiredFiles.map(readEvidence));
  const deploymentJson = artifacts[0]!;
  const procurementJson = artifacts[1]!;
  const forkJson = artifacts[2]!;
  const previewJson = artifacts[3]!;
  const evaluationJson = artifacts[4]!;
  const deployment = (() => {
    const explorer = text(deploymentJson.explorer, "public-deployment.explorer");
    return {
      title: "Owner-sponsored deployment", origin: "live-public" as const, capturedAt: text(deploymentJson.verifiedAt, "public-deployment.verifiedAt"), scope: text(deploymentJson.scope, "public-deployment.scope"), sourceState: optionalText(deploymentJson.sourceState), sourceHashes: strings(deploymentJson.sources ?? {}, "public-deployment.sources"),
      hashes: [...only(hash("UserOperation", deploymentJson.userOperationHash, "UserOperation", "live-public")), ...only(hash("Transaction", deploymentJson.transactionHash, "Transaction", "live-public", explorer)), ...only(hash("Block", deploymentJson.blockHash, "Block", "live-public"))],
      facts: { "Owner signature verified": bool(deploymentJson.ownerSignatureVerified, "public-deployment.ownerSignatureVerified"), "UserOperation succeeded": bool(deploymentJson.userOperationSuccess, "public-deployment.userOperationSuccess"), "Initial token balance": amount(deploymentJson.tokenBalanceUnits, deploymentJson.tokenDecimals ?? 6), "Protected balance": amount(deploymentJson.protectedBalanceUnits, deploymentJson.tokenDecimals ?? 6), "UTC-day limit": amount(deploymentJson.dailyLimitUnits, deploymentJson.tokenDecimals ?? 6), "Policy version": text(deploymentJson.policyVersion, "public-deployment.policyVersion") },
    };
  })();
  const snapshots = object(procurementJson.blockBoundarySnapshots, "public-procurement.blockBoundarySnapshots"), policy = object(procurementJson.currentPolicy, "public-procurement.currentPolicy"), delivery = object(procurementJson.delivery, "public-procurement.delivery"), procurementExplorer = text(procurementJson.explorer, "public-procurement.explorer");
  const procurement = {
    title: "Database procurement and delivery", origin: "live-public" as const, capturedAt: text(procurementJson.verifiedAt, "public-procurement.verifiedAt"), scope: text(procurementJson.scope, "public-procurement.scope"), sourceState: optionalText(procurementJson.sourceState), sourceHashes: strings(procurementJson.sources ?? {}, "public-procurement.sources"),
    hashes: [...only(hash("UserOperation", procurementJson.userOperationHash, "UserOperation", "live-public")), ...only(hash("Transaction", procurementJson.transactionHash, "Transaction", "live-public", procurementExplorer)), ...only(hash("Settlement block", procurementJson.blockHash, "Block", "live-public")), ...only(hash("Invoice", procurementJson.invoiceId, "Invoice", "live-public")), ...only(hash("Payment", procurementJson.paymentId, "Payment", "live-public")), ...only(hash("Service", procurementJson.serviceHash, "Service", "live-public"))],
    facts: { "Task status": text(procurementJson.taskStatus, "public-procurement.taskStatus"), "Amount": amount(procurementJson.amountUnits, procurementJson.tokenDecimals), "Settlement": text(procurementJson.settledAt, "public-procurement.settledAt"), "Token balance before": amount(snapshots.tokenBalanceBeforeUnits, procurementJson.tokenDecimals), "Token balance after": amount(snapshots.tokenBalanceAfterUnits, procurementJson.tokenDecimals), "UTC spend before": amount(snapshots.utcDaySpentBeforeUnits, procurementJson.tokenDecimals), "UTC spend after": amount(snapshots.utcDaySpentAfterUnits, procurementJson.tokenDecimals), "Quote signature verified": bool(procurementJson.quoteSignatureVerified, "public-procurement.quoteSignatureVerified"), "Delivery signature verified": bool(delivery.signatureVerified, "public-procurement.delivery.signatureVerified"), "Recorded delivery status": text(delivery.status, "public-procurement.delivery.status"), "Current UTC spend": amount(policy.spentUnits, procurementJson.tokenDecimals), "Recorded source state": optionalText(procurementJson.sourceState) },
  };
  const operationResults = forkJson.operationResults;
  if (!Array.isArray(operationResults)) throw new Error("Invalid evidence JSON field: 2026-10-16-local-fork.operationResults");
  const operation = (label: string) => { const entry = operationResults.find((item) => object(item, "local-fork.operation").label === label); if (!entry) throw new Error(`Required local-fork operation is missing: ${label}`); return object(entry, `local-fork.${label}`); };
  const adversarial = operation("SEC-01-compromised-planner-fixture"), revoke = operation("owner-revokes-sessions"), revoked = operation("revoked-session-denied"), recoveryJson = object(forkJson.workerRecovery, "local-fork.workerRecovery"), forkSourceState = text(forkJson.sourceState, "local-fork.sourceState"), forkScope = text(forkJson.evidenceType, "local-fork.evidenceType"), forkNotEstablished = stringList(forkJson.notEstablished, "local-fork.notEstablished");
  const compromised: CompromisedPlannerRecord = {
    title: "Compromised planner fixture", origin: "local-fork", fixture: adversarial.outputOrigin === "adversarial_fixture", sourceState: forkSourceState, capturedAt: optionalText(forkJson.capturedOn), scope: forkScope, notEstablished: forkNotEstablished, sourceHashes: strings(forkJson.sources ?? {}, "local-fork.sources"), hashes: [...only(hash("Fixture UserOperation", adversarial.userOperationHash, "UserOperation", "local-fork")), ...only(hash("Fixture transaction", adversarial.transactionHash, "Transaction", "local-fork"))], success: bool(adversarial.success, "local-fork.adversarial.success"), outerTransactionSucceeded: optionalBool(adversarial.outerTransactionSucceeded),
    facts: { "Proposed amount": amount(adversarial.proposedAmountUnits, forkJson.tokenDecimals), "Proposed recipient": optionalText(adversarial.proposedRecipient), "Decoded rejection": optionalText(adversarial.decodedRejection) ?? optionalText(adversarial.rejection), "Token balance before": amount(adversarial.tokenBalanceBeforeUnits, forkJson.tokenDecimals), "Token balance after": amount(adversarial.tokenBalanceAfterUnits, forkJson.tokenDecimals), "UTC spend before": amount(adversarial.utcDaySpentBeforeUnits, forkJson.tokenDecimals), "UTC spend after": amount(adversarial.utcDaySpentAfterUnits, forkJson.tokenDecimals), "Invoice consumed before": optionalBool(adversarial.invoiceConsumedBefore), "Invoice consumed after": optionalBool(adversarial.invoiceConsumedAfter) },
  };
  const localFork = {
    title: "Kernel and Guardian local fork", origin: "local-fork" as const, sourceState: forkSourceState, capturedAt: text(forkJson.capturedOn, "local-fork.capturedOn"), scope: forkScope, notEstablished: forkNotEstablished, sourceHashes: strings(forkJson.sources ?? {}, "local-fork.sources"), hashes: [], facts: { "Fork block": scalar(forkJson.forkBlock, "local-fork.forkBlock"), "Initial token balance": amount(forkJson.initialBalanceUnits, forkJson.tokenDecimals), "After first payment": amount(forkJson.balanceAfterFirstPaymentUnits, forkJson.tokenDecimals), "After recovered payment": amount(forkJson.balanceAfterWorkerPaymentUnits, forkJson.tokenDecimals) }, compromised,
    revoke: { title: "Session revocation", origin: "local-fork" as const, sourceState: forkSourceState, capturedAt: optionalText(forkJson.capturedOn), scope: forkScope, notEstablished: forkNotEstablished, sourceHashes: {}, hashes: [...only(hash("Owner revoke UserOperation", revoke.userOperationHash, "UserOperation", "local-fork")), ...only(hash("Owner revoke transaction", revoke.transactionHash, "Transaction", "local-fork")), ...only(hash("Revoked session UserOperation", revoked.userOperationHash, "UserOperation", "local-fork"))], facts: { "Owner revocation succeeded": bool(revoke.success, "local-fork.revoke.success"), "Former-session operation succeeded": bool(revoked.success, "local-fork.revoked.success") } },
    recovery: { title: "Lost-response recovery", origin: "local-fork" as const, sourceState: forkSourceState, capturedAt: optionalText(forkJson.capturedOn), scope: forkScope, notEstablished: forkNotEstablished, sourceHashes: {}, hashes: [...only(hash("Recovery UserOperation", recoveryJson.userOperationHash, "UserOperation", "local-fork")), ...only(hash("Recovery transaction", recoveryJson.transactionHash, "Transaction", "local-fork"))], facts: { "Status after lost response": text(recoveryJson.statusAfterLostResponse, "local-fork.workerRecovery.statusAfterLostResponse"), "Status after restart reconciliation": text(recoveryJson.statusAfterRestartReconciliation, "local-fork.workerRecovery.statusAfterRestartReconciliation"), "Send count": scalar(recoveryJson.sendCount, "local-fork.workerRecovery.sendCount"), "Bundler": text(recoveryJson.bundler, "local-fork.workerRecovery.bundler") } },
  };
  const preview = { title: "Provider quote preview", origin: "local-inference" as const, capturedAt: text(previewJson.checkedAt, "provider-preview.checkedAt"), scope: text(previewJson.scope, "provider-preview.scope"), sourceState: optionalText(previewJson.sourceState), sourceHashes: strings(previewJson.sources, "provider-preview.sources"), hashes: [...only(hash("Invoice", previewJson.invoiceId, "Invoice", "local-inference")), ...only(hash("Observed block", previewJson.observedBlockHash, "Block", "local-inference"))], facts: { "Model": text(previewJson.modelId, "provider-preview.modelId"), "Quote signature verified": bool(previewJson.quoteSignatureVerified, "provider-preview.quoteSignatureVerified"), "Amount": amount(previewJson.amountUnits, 6), "Tasks created": scalar(previewJson.tasksCreated, "provider-preview.tasksCreated"), "UserOperations submitted": scalar(previewJson.userOperationsSubmitted, "provider-preview.userOperationsSubmitted"), "Service provisioned": bool(previewJson.serviceProvisioned, "provider-preview.serviceProvisioned") } };
  if (!Array.isArray(evaluationJson.runs)) throw new Error("Invalid evidence JSON field: qwen-local-evaluation.runs");
  const evaluation = { title: "Qwen smoke evaluation", origin: "local-inference" as const, capturedAt: text(evaluationJson.capturedAt, "qwen-local-evaluation.capturedAt"), limitations: text(evaluationJson.limitations, "qwen-local-evaluation.limitations"), sourceState: optionalText(evaluationJson.sourceState), sourceHashes: strings(evaluationJson.sourceHashes, "qwen-local-evaluation.sourceHashes"), hashes: [], facts: { "Model": text(evaluationJson.modelId, "qwen-local-evaluation.modelId"), "Evidence type": text(evaluationJson.evidenceType, "qwen-local-evaluation.evidenceType"), "Limitations": text(evaluationJson.limitations, "qwen-local-evaluation.limitations") }, runs: evaluationJson.runs.map((run, index) => { const item = object(run, `qwen-local-evaluation.runs.${index}`), metrics = item.metrics && typeof item.metrics === "object" ? object(item.metrics, `qwen-local-evaluation.runs.${index}.metrics`) : undefined; return { case: text(item.case, `qwen-local-evaluation.runs.${index}.case`), expected: JSON.stringify(item.expected), actual: JSON.stringify(item.actual), passed: bool(item.passed, `qwen-local-evaluation.runs.${index}.passed`), elapsedMs: typeof metrics?.elapsedMs === "number" ? metrics.elapsedMs : undefined }; }) };
  if (!Array.isArray(costArtifact.results)) throw new Error("Invalid cost-fork.results");
  const costResult = costArtifact.results.map((result, index) => object(result, `cost-fork.results.${index}`)).find((result) => result.invoiceCount === 4);
  if (!costResult) throw new Error("Required cost-fork four-invoice result is missing");
  const costSamples = costResult.samples;
  if (!Array.isArray(costSamples)) throw new Error("Invalid cost-fork four-invoice samples");
  const costSample = (mode: string) => { const sample = costSamples.map((item, index) => object(item, `cost-fork.samples.${index}`)).find((item) => item.mode === mode); if (!sample) throw new Error(`Required cost-fork ${mode} sample is missing`); return sample; };
  if (!Array.isArray(costArtifact.limitations) || !costArtifact.limitations.every((item) => typeof item === "string")) throw new Error("Invalid cost-fork.limitations");
  const costEvidenceType = text(costArtifact.evidenceType, "cost-fork.evidenceType");
  const cost: CostEvidence = { title: "COST-01 batching gas record", origin: "local-fork", capturedAt: text(costArtifact.measuredAt, "cost-fork.measuredAt"), sourceState: costEvidenceType, sourceHashes: strings(costArtifact.sources ?? {}, "cost-fork.sources"), hashes: [], evidenceType: costEvidenceType, result: { invoiceCount: scalar(costResult.invoiceCount, "cost-fork.invoiceCount"), invoiceAmountUnits: unsignedUnits(costResult.invoiceAmountUnits, "cost-fork.invoiceAmountUnits"), totalServiceAmountUnits: unsignedUnits(costResult.totalServiceAmountUnits, "cost-fork.totalServiceAmountUnits"), singleOperationCount: scalar(costSample("single").operationCount, "cost-fork.single.operationCount"), batchOperationCount: scalar(costSample("batch").operationCount, "cost-fork.batch.operationCount"), singleMedianEnclosingTransactionGas: text(costResult.singleMedianEnclosingTransactionGas, "cost-fork.singleMedianEnclosingTransactionGas"), batchMedianEnclosingTransactionGas: text(costResult.batchMedianEnclosingTransactionGas, "cost-fork.batchMedianEnclosingTransactionGas"), enclosingTransactionGasReductionPercent: scalar(costResult.enclosingTransactionGasReductionPercent, "cost-fork.enclosingTransactionGasReductionPercent") }, limitations: costArtifact.limitations };
  const sourceHashes = (record: EvidenceRecord) => Object.entries(record.sourceHashes).map(([path, value]) => ({ label: path, value, kind: "Source SHA-256" as const, origin: record.origin }));
  const hashLedger = [deployment, procurement, localFork, compromised, localFork.revoke, localFork.recovery, preview, evaluation, cost].flatMap((record) => [...record.hashes, ...sourceHashes(record)]);
  return { deployment, procurement, localFork, preview, evaluation, cost, hashLedger };
}

export interface LandingEvidence {
  balances: { before: string; after: string; balance: string; protected: string; daily: string; spent: string; origin: Origin; protectedPercent: number; spentPercent: number };
  settlement: { amount: string; origin: Origin };
  compromised: { innerSucceeded: boolean; outerSucceeded?: boolean; proposedAmount?: string; rejection?: string; origin: Origin };
  limitations: string;
}
export function twoDecimals(value: string | boolean | undefined) { if (typeof value !== "string") return "Not recorded"; const match = value.match(/^(\d+)(?:\.(\d+))? MockUSD$/); return match ? `${match[1]}.${(match[2] ?? "").padEnd(2, "0").slice(0, 2)} MockUSD` : value; }
function ratio(value: string | boolean | undefined, total: string | boolean | undefined) { if (typeof value !== "string" || typeof total !== "string") return 0; return Math.min(100, Math.max(0, Number.parseFloat(value) / Number.parseFloat(total) * 100)); }
export async function loadLandingEvidence(): Promise<LandingEvidence> {
  const evidence = await loadEvidence(), publicFacts = evidence.procurement.facts, deploymentFacts = evidence.deployment.facts, compromisedFacts = evidence.localFork.compromised.facts;
  const before = publicFacts["Token balance before"], after = publicFacts["Token balance after"], protectedBalance = deploymentFacts["Protected balance"], daily = deploymentFacts["UTC-day limit"], spent = publicFacts["UTC spend after"];
  return { balances: { before: twoDecimals(before), after: twoDecimals(after), balance: twoDecimals(after), protected: twoDecimals(protectedBalance), daily: twoDecimals(daily), spent: twoDecimals(spent), origin: evidence.procurement.origin, protectedPercent: ratio(protectedBalance, before), spentPercent: ratio(spent, daily) }, settlement: { amount: twoDecimals(publicFacts.Amount), origin: evidence.procurement.origin }, compromised: { innerSucceeded: evidence.localFork.compromised.success, outerSucceeded: evidence.localFork.compromised.outerTransactionSucceeded, proposedAmount: twoDecimals(compromisedFacts["Proposed amount"]), rejection: typeof compromisedFacts["Decoded rejection"] === "string" ? compromisedFacts["Decoded rejection"] : undefined, origin: evidence.localFork.compromised.origin }, limitations: typeof evidence.evaluation.limitations === "string" ? evidence.evaluation.limitations : "Not recorded" };
}
export function originLabel(origin: Origin) { return origin === "live-public" ? "Public chain · recorded" : origin === "local-fork" ? "Local fork · recorded" : "Local inference · recorded"; }
export function chainNote(origin: Exclude<Origin, "live-public">) { return nonPublicLabel(origin); }
