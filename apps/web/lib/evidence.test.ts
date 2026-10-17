import { describe, expect, it } from "vitest";
import { chainNote, loadEvidence } from "./evidence";

describe("evidence ledger", () => {
  it("loads every required committed artifact", async () => {
    const evidence = await loadEvidence();

    expect(evidence.deployment.hashes).not.toHaveLength(0);
    expect(evidence.procurement.hashes).not.toHaveLength(0);
    expect(evidence.localFork.compromised.hashes).not.toHaveLength(0);
    expect(evidence.preview.hashes).not.toHaveLength(0);
    expect(evidence.evaluation.runs).not.toHaveLength(0);
  });

  it("preserves absent compromised-planner fields", async () => {
    const { localFork } = await loadEvidence();

    expect(localFork.compromised.facts["Proposed amount"]).toBeUndefined();
    expect(localFork.compromised.facts["Decoded rejection"]).toBeUndefined();
    expect(localFork.compromised.facts["Invoice consumed after"]).toBeUndefined();
  });

  it("links only recorded live-public hashes", async () => {
    const evidence = await loadEvidence();
    const nonPublic = evidence.hashLedger.filter((hash) => hash.origin !== "live-public");

    expect(evidence.procurement.hashes.some((hash) => Boolean(hash.explorerHref))).toBe(true);
    expect(nonPublic.every((hash) => hash.explorerHref === undefined)).toBe(true);
    expect(chainNote("local-fork")).toBe("Local fork, not on public chain");
    expect(chainNote("local-inference")).toBe("Recorded local inference, not a chain transaction");
  });
});
