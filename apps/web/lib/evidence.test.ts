import { describe, expect, it } from "vitest";
import { chainNote, loadEvidence, loadLandingEvidence, originLabel } from "./evidence";

describe("evidence ledger", () => {
  it("loads every required committed artifact", async () => {
    const evidence = await loadEvidence();
    expect(evidence.deployment.hashes).not.toHaveLength(0);
    expect(evidence.procurement.hashes).not.toHaveLength(0);
    expect(evidence.localFork.compromised.hashes).not.toHaveLength(0);
    expect(evidence.preview.hashes).not.toHaveLength(0);
    expect(evidence.evaluation.runs).not.toHaveLength(0);
  });

  it("formats loader amounts to two decimals", async () => {
    const landing = await loadLandingEvidence();
    for (const value of [landing.balances.before, landing.balances.after, landing.balances.protected, landing.balances.daily, landing.balances.spent, landing.settlement.amount]) expect(value).toMatch(/^\d+\.\d{2} MockUSD$/);
  });

  it("preserves missing compromised-planner facts", async () => {
    const { localFork } = await loadEvidence();
    expect(localFork.compromised.facts["Proposed amount"]).toBeUndefined();
    expect(localFork.compromised.facts["Decoded rejection"]).toBeUndefined();
    expect(localFork.compromised.facts["Invoice consumed after"]).toBeUndefined();
  });

  it("keeps recorded scope and limitations on their own records", async () => {
    const evidence = await loadEvidence();
    expect(evidence.procurement.scope).toContain("Existing public testnet settlement");
    expect(evidence.localFork.compromised.notEstablished).toContain("Public-chain deployment or accepted competition execution evidence");
    expect(evidence.preview.scope).toContain("Preview only");
    expect(evidence.evaluation.limitations).toContain("Selected smoke cases");
  });

  it("links only recorded live-public hashes", async () => {
    const evidence = await loadEvidence();
    const nonPublic = evidence.hashLedger.filter((hash) => hash.origin !== "live-public");
    expect(evidence.procurement.hashes.some((hash) => Boolean(hash.explorerHref))).toBe(true);
    expect(nonPublic.every((hash) => hash.explorerHref === undefined)).toBe(true);
    expect(evidence.procurement.hashes.find((hash) => hash.kind === "Transaction")?.explorerHref).toBeDefined();
    expect(chainNote("local-fork")).toBe("Local fork · not a public-chain transaction");
    expect(chainNote("local-inference")).toBe("Local inference · not a chain transaction");
  });

  it("uses non-engineer origin labels", () => {
    expect(originLabel("live-public")).toBe("Public chain · recorded");
    expect(originLabel("local-fork")).toBe("Local fork · recorded");
    expect(originLabel("local-inference")).toBe("Local inference · recorded");
  });
});
