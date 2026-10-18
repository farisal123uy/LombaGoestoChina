import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatUnits } from "viem";

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
  limitations?: string;
  notEstablished?: string[];
  sourceHashes: Record<string, string>;
  hashes: HashRecord[];
}
export interface CompromisedPlannerRecord extends EvidenceRecord { success: boolean; outerTransactionSucceeded?: boolean; facts: Record<string, string | boolean | undefined>; }
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
  hashLedger: HashRecord[];
}

type Json = Record<string, unknown>;
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const sourceEvidenceDirectory = resolve(moduleDirectory, "../../../docs/evidence");
const compiledEvidenceDirectory = resolve(moduleDirectory, "../../../../docs/evidence");
const evidenceDirectory = existsSync(sourceEvidenceDirectory) ? sourceEvidenceDirectory : compiledEvidenceDirectory;
const requiredFiles = ["public-deployment.json", "public-procurement.json", "2026-10-16-local-fork.json", "provider-live-preview.json", "qwen-local-evaluation.json"] as const;

function object(value: unknown, name: string): Json { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid evidence JSON object: ${name}`); return value as Json; }
function text(value: unknown, name: string): string { if (typeof value !== "string") throw new Error(`Invalid evidence JSON field: ${name}`); return value; }
function scalar(value: unknown, name: string): string { if (typeof value !== "string" && typeof value !== "number") throw new Error(`Invalid evidence JSON field: ${name}`); return String(value); }
function bool(value: unknown, name: string): boolean { if (typeof value !== "boolean") throw new Error(`Invalid evidence JSON field: ${name}`); return value; }
function strings(value: unknown, name: string): Record<string, string> { const result = object(value, name); return Object.fromEntries(Object.entries(result).map(([key, entry]) => [key, text(entry, `${name}.${key}`)])); }
function stringList(value: unknown, name: string): string[] { if (!Array.isArray(value)) throw new Error(`Invalid evidence JSON field: ${name}`); return value.map((entry, index) => text(entry, `${name}.${index}`)); }
function optionalText(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function optionalBool(value: unknown): boolean | undefined { return typeof value === "boolean" ? value : undefined; }
function amount(units: unknown, decimals: unknown): string | undefined { if (typeof units !== "string" || typeof decimals !== "number") return undefined; return `${formatUnits(BigInt(units), decimals)} MockUSD`; }
function nonPublicLabel(origin: Exclude<Origin, "live-public">) { return origin === "local-fork" ? "Local fork · not a public-chain transaction" : "Local inference · not a chain transaction"; }
function hash(label: string, value: unknown, kind: HashKind, origin: Origin, explorerHref?: string): HashRecord | undefined { if (typeof value !== "string") return undefined; return { label, value, kind, origin, ...(origin === "live-public" && explorerHref ? { explorerHref } : {}) }; }
function only<T>(value: T | undefined): T[] { return value ? [value] : []; }

async function readEvidence(name: typeof requiredFiles[number]): Promise<Json> {
  const path = resolve(evidenceDirectory, name);
  let content: string;
  try { content = await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Required evidence file is missing: ${path}`); throw error; }
  try { return object(JSON.parse(content), name); }
  catch (error) { throw new Error(`Invalid evidence JSON in ${path}: ${error instanceof Error ? error.message : "parse failed"}`); }
}

export async function loadEvidence(): Promise<EvidenceData> {
  const [deploymentJson, procurementJson, forkJson, previewJson, evaluationJson] = await Promise.all([readEvidence("public-deployment.json"), readEvidence("public-procurement.json"), readEvidence("2026-10-16-local-fork.json"), readEvidence("provider-live-preview.json"), readEvidence("qwen-local-evaluation.json")]);
  const deploymentExplorer = text(deploymentJson.explorer, "public-deployment.explorer");
  const deployment: EvidenceData["deployment"] = {
    title: "Owner-sponsored deployment", origin: "live-public", capturedAt: text(deploymentJson.verifiedAt, "public-deployment.verifiedAt"), scope: text(deploymentJson.scope, "public-deployment.scope"), sourceState: optionalText(deploymentJson.sourceState), sourceHashes: strings(deploymentJson.sources ?? {}, "public-deployment.sources"),
    hashes: [...only(hash("UserOperation", deploymentJson.userOperationHash, "UserOperation", "live-public")), ...only(hash("Transaction", deploymentJson.transactionHash, "Transaction", "live-public", deploymentExplorer)), ...only(hash("Block", deploymentJson.blockHash, "Block", "live-public"))],
    facts: { "Owner signature verified": bool(deploymentJson.ownerSignatureVerified, "public-deployment.ownerSignatureVerified"), "UserOperation succeeded": bool(deploymentJson.userOperationSuccess, "public-deployment.userOperationSuccess"), "Initial token balance": amount(deploymentJson.tokenBalanceUnits, deploymentJson.tokenDecimals ?? 6), "Protected balance": amount(deploymentJson.protectedBalanceUnits, deploymentJson.tokenDecimals ?? 6), "UTC-day limit": amount(deploymentJson.dailyLimitUnits, deploymentJson.tokenDecimals ?? 6), "Policy version": text(deploymentJson.policyVersion, "public-deployment.policyVersion") }
  };

  const snapshots = object(procurementJson.blockBoundarySnapshots, "public-procurement.blockBoundarySnapshots");
  const policy = object(procurementJson.currentPolicy, "public-procurement.currentPolicy");
  const delivery = object(procurementJson.delivery, "public-procurement.delivery");
  const procurementExplorer = text(procurementJson.explorer, "public-procurement.explorer");
  const procurement: EvidenceData["procurement"] = {
    title: "Database procurement and delivery", origin: "live-public", capturedAt: text(procurementJson.verifiedAt, "public-procurement.verifiedAt"), scope: text(procurementJson.scope, "public-procurement.scope"), sourceState: optionalText(procurementJson.sourceState), sourceHashes: strings(procurementJson.sources ?? {}, "public-procurement.sources"),
    hashes: [...only(hash("UserOperation", procurementJson.userOperationHash, "UserOperation", "live-public")), ...only(hash("Transaction", procurementJson.transactionHash, "Transaction", "live-public", procurementExplorer)), ...only(hash("Settlement block", procurementJson.blockHash, "Block", "live-public")), ...only(hash("Invoice", procurementJson.invoiceId, "Invoice", "live-public")), ...only(hash("Payment", procurementJson.paymentId, "Payment", "live-public")), ...only(hash("Service", procurementJson.serviceHash, "Service", "live-public"))],
    facts: { "Task status": text(procurementJson.taskStatus, "public-procurement.taskStatus"), "Amount": amount(procurementJson.amountUnits, procurementJson.tokenDecimals), "Settlement": text(procurementJson.settledAt, "public-procurement.settledAt"), "Token balance before": amount(snapshots.tokenBalanceBeforeUnits, procurementJson.tokenDecimals), "Token balance after": amount(snapshots.tokenBalanceAfterUnits, procurementJson.tokenDecimals), "UTC spend before": amount(snapshots.utcDaySpentBeforeUnits, procurementJson.tokenDecimals), "UTC spend after": amount(snapshots.utcDaySpentAfterUnits, procurementJson.tokenDecimals), "Quote signature verified": bool(procurementJson.quoteSignatureVerified, "public-procurement.quoteSignatureVerified"), "Delivery signature verified": bool(delivery.signatureVerified, "public-procurement.delivery.signatureVerified"), "Recorded delivery status": text(delivery.status, "public-procurement.delivery.status"), "Current UTC spend": amount(policy.spentUnits, procurementJson.tokenDecimals), "Recorded source state": optionalText(procurementJson.sourceState) }
  };

  const operationResults = forkJson.operationResults;
  if (!Array.isArray(operationResults)) throw new Error("Invalid evidence JSON field: 2026-10-16-local-fork.operationResults");
  const operation = (label: string) => { const entry = operationResults.find((item) => object(item, "local-fork.operation").label === label); if (!entry) throw new Error(`Required local-fork operation is missing: ${label}`); return object(entry, `local-fork.${label}`); };
  const adversarial = operation("SEC-01-compromised-planner-fixture");
  const revoke = operation("owner-revokes-sessions");
  const revoked = operation("revoked-session-denied");
  const recoveryJson = object(forkJson.workerRecovery, "local-fork.workerRecovery");
  const forkSourceState = text(forkJson.sourceState, "local-fork.sourceState");
  const forkScope = text(forkJson.evidenceType, "local-fork.evidenceType");
  const forkNotEstablished = stringList(forkJson.notEstablished, "local-fork.notEstablished");
  const forkFacts = { "Fork block": scalar(forkJson.forkBlock, "local-fork.forkBlock"), "Initial token balance": amount(forkJson.initialBalanceUnits, forkJson.tokenDecimals), "After first payment": amount(forkJson.balanceAfterFirstPaymentUnits, forkJson.tokenDecimals), "After recovered payment": amount(forkJson.balanceAfterWorkerPaymentUnits, forkJson.tokenDecimals) };
  const compromised: CompromisedPlannerRecord = {
    title: "Compromised planner fixture", origin: "local-fork", fixture: adversarial.outputOrigin === "adversarial_fixture", sourceState: forkSourceState, capturedAt: optionalText(forkJson.capturedOn), scope: forkScope, notEstablished: forkNotEstablished, sourceHashes: strings(forkJson.sources ?? {}, "local-fork.sources"),
    hashes: [...only(hash("Fixture UserOperation", adversarial.userOperationHash, "UserOperation", "local-fork")), ...only(hash("Fixture transaction", adversarial.transactionHash, "Transaction", "local-fork"))],
    success: bool(adversarial.success, "local-fork.adversarial.success"), outerTransactionSucceeded: optionalBool(adversarial.outerTransactionSucceeded),
    facts: { "Proposed amount": amount(adversarial.proposedAmountUnits, forkJson.tokenDecimals), "Proposed recipient": optionalText(adversarial.proposedRecipient), "Decoded rejection": optionalText(adversarial.decodedRejection) ?? optionalText(adversarial.rejection), "Token balance before": amount(adversarial.tokenBalanceBeforeUnits, forkJson.tokenDecimals), "Token balance after": amount(adversarial.tokenBalanceAfterUnits, forkJson.tokenDecimals), "UTC spend before": amount(adversarial.utcDaySpentBeforeUnits, forkJson.tokenDecimals), "UTC spend after": amount(adversarial.utcDaySpentAfterUnits, forkJson.tokenDecimals), "Invoice consumed before": optionalBool(adversarial.invoiceConsumedBefore), "Invoice consumed after": optionalBool(adversarial.invoiceConsumedAfter) }
  };
  const localFork: EvidenceData["localFork"] = {
    title: "Kernel and Guardian local fork", origin: "local-fork", sourceState: forkSourceState, capturedAt: text(forkJson.capturedOn, "local-fork.capturedOn"), scope: forkScope, notEstablished: forkNotEstablished, sourceHashes: strings(forkJson.sources ?? {}, "local-fork.sources"), hashes: [], facts: forkFacts,
    compromised,
    revoke: { title: "Session revocation", origin: "local-fork", sourceState: forkSourceState, capturedAt: optionalText(forkJson.capturedOn), scope: forkScope, notEstablished: forkNotEstablished, sourceHashes: {}, hashes: [...only(hash("Owner revoke UserOperation", revoke.userOperationHash, "UserOperation", "local-fork")), ...only(hash("Owner revoke transaction", revoke.transactionHash, "Transaction", "local-fork")), ...only(hash("Revoked session UserOperation", revoked.userOperationHash, "UserOperation", "local-fork"))], facts: { "Owner revocation succeeded": bool(revoke.success, "local-fork.revoke.success"), "Former-session operation succeeded": bool(revoked.success, "local-fork.revoked.success") } },
    recovery: { title: "Lost-response recovery", origin: "local-fork", sourceState: forkSourceState, capturedAt: optionalText(forkJson.capturedOn), scope: forkScope, notEstablished: forkNotEstablished, sourceHashes: {}, hashes: [...only(hash("Recovery UserOperation", recoveryJson.userOperationHash, "UserOperation", "local-fork")), ...only(hash("Recovery transaction", recoveryJson.transactionHash, "Transaction", "local-fork"))], facts: { "Status after lost response": text(recoveryJson.statusAfterLostResponse, "local-fork.workerRecovery.statusAfterLostResponse"), "Status after restart reconciliation": text(recoveryJson.statusAfterRestartReconciliation, "local-fork.workerRecovery.statusAfterRestartReconciliation"), "Send count": scalar(recoveryJson.sendCount, "local-fork.workerRecovery.sendCount"), "Bundler": text(recoveryJson.bundler, "local-fork.workerRecovery.bundler") } }
  };

  const preview: EvidenceData["preview"] = { title: "Provider quote preview", origin: "local-inference", capturedAt: text(previewJson.checkedAt, "provider-preview.checkedAt"), scope: text(previewJson.scope, "provider-preview.scope"), sourceState: optionalText(previewJson.sourceState), sourceHashes: strings(previewJson.sources, "provider-preview.sources"), hashes: [...only(hash("Invoice", previewJson.invoiceId, "Invoice", "local-inference")), ...only(hash("Observed block", previewJson.observedBlockHash, "Block", "local-inference"))], facts: { "Model": text(previewJson.modelId, "provider-preview.modelId"), "Quote signature verified": bool(previewJson.quoteSignatureVerified, "provider-preview.quoteSignatureVerified"), "Amount": amount(previewJson.amountUnits, 6), "Tasks created": scalar(previewJson.tasksCreated, "provider-preview.tasksCreated"), "UserOperations submitted": scalar(previewJson.userOperationsSubmitted, "provider-preview.userOperationsSubmitted"), "Service provisioned": bool(previewJson.serviceProvisioned, "provider-preview.serviceProvisioned") } };
  const runs = evaluationJson.runs;
  if (!Array.isArray(runs)) throw new Error("Invalid evidence JSON field: qwen-local-evaluation.runs");
  const evaluation: EvidenceData["evaluation"] = { title: "Qwen smoke evaluation", origin: "local-inference", capturedAt: text(evaluationJson.capturedAt, "qwen-local-evaluation.capturedAt"), limitations: text(evaluationJson.limitations, "qwen-local-evaluation.limitations"), sourceState: optionalText(evaluationJson.sourceState), sourceHashes: strings(evaluationJson.sourceHashes, "qwen-local-evaluation.sourceHashes"), hashes: [], facts: { "Model": text(evaluationJson.modelId, "qwen-local-evaluation.modelId"), "Evidence type": text(evaluationJson.evidenceType, "qwen-local-evaluation.evidenceType"), "Limitations": text(evaluationJson.limitations, "qwen-local-evaluation.limitations") }, runs: runs.map((run, index) => { const item = object(run, `qwen-local-evaluation.runs.${index}`); const metrics = item.metrics && typeof item.metrics === "object" ? object(item.metrics, `qwen-local-evaluation.runs.${index}.metrics`) : undefined; return { case: text(item.case, `qwen-local-evaluation.runs.${index}.case`), expected: JSON.stringify(item.expected), actual: JSON.stringify(item.actual), passed: bool(item.passed, `qwen-local-evaluation.runs.${index}.passed`), elapsedMs: typeof metrics?.elapsedMs === "number" ? metrics.elapsedMs : undefined }; }) };
  const sourceHashes = (record: EvidenceRecord) => Object.entries(record.sourceHashes).map(([path, value]) => ({ label: path, value, kind: "Source SHA-256" as const, origin: record.origin }));
  const hashLedger = [deployment, procurement, localFork, compromised, localFork.revoke, localFork.recovery, preview, evaluation].flatMap((record) => [...record.hashes, ...sourceHashes(record)]);
  return { deployment, procurement, localFork, preview, evaluation, hashLedger };
}

export interface LandingEvidence {
  balances: { before: string; after: string; protected: string; daily: string; spent: string; origin: Origin; protectedPercent: number; spentPercent: number };
  settlement: { amount: string; origin: Origin };
  compromised: { innerSucceeded: boolean; outerSucceeded?: boolean; proposedAmount?: string; rejection?: string; origin: Origin };
  limitations: string;
}

export function twoDecimals(value: string | boolean | undefined) { if (typeof value !== "string") return "Not recorded"; const match = value.match(/^(\d+)(?:\.(\d+))? MockUSD$/); if (!match) return value; return `${match[1]}.${(match[2] ?? "").padEnd(2, "0").slice(0, 2)} MockUSD`; }
function ratio(value: string | boolean | undefined, total: string | boolean | undefined) { if (typeof value !== "string" || typeof total !== "string") return 0; return Math.min(100, Math.max(0, (Number.parseFloat(value) / Number.parseFloat(total)) * 100)); }
export async function loadLandingEvidence(): Promise<LandingEvidence> {
  const evidence = await loadEvidence();
  const publicFacts = evidence.procurement.facts;
  const deploymentFacts = evidence.deployment.facts;
  const compromisedFacts = evidence.localFork.compromised.facts;
  const before = publicFacts["Token balance before"];
  const after = publicFacts["Token balance after"];
  const protectedBalance = deploymentFacts["Protected balance"];
  const daily = deploymentFacts["UTC-day limit"];
  const spent = publicFacts["UTC spend after"];
  return { balances: { before: twoDecimals(before), after: twoDecimals(after), protected: twoDecimals(protectedBalance), daily: twoDecimals(daily), spent: twoDecimals(spent), origin: evidence.procurement.origin, protectedPercent: ratio(protectedBalance, before), spentPercent: ratio(spent, daily) }, settlement: { amount: twoDecimals(publicFacts.Amount), origin: evidence.procurement.origin }, compromised: { innerSucceeded: evidence.localFork.compromised.success, outerSucceeded: evidence.localFork.compromised.outerTransactionSucceeded, proposedAmount: twoDecimals(compromisedFacts["Proposed amount"]), rejection: typeof compromisedFacts["Decoded rejection"] === "string" ? compromisedFacts["Decoded rejection"] : undefined, origin: evidence.localFork.compromised.origin }, limitations: evidence.evaluation.limitations ?? "Not recorded" };
}
export function originLabel(origin: Origin) { return origin === "live-public" ? "Public chain · recorded" : origin === "local-fork" ? "Local fork · recorded" : "Local inference · recorded"; }
export function chainNote(origin: Exclude<Origin, "live-public">) { return nonPublicLabel(origin); }
