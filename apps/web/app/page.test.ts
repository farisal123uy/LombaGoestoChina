import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLandingEvidence } from "../lib/evidence";

describe("landing page", () => {
  it("loads all amounts from committed evidence", async () => {
    const evidence = await loadLandingEvidence();
    for (const value of [evidence.balances.before, evidence.balances.after, evidence.balances.protected, evidence.balances.daily, evidence.balances.spent, evidence.settlement.amount]) expect(value).toMatch(/^\d+\.\d{2} MockUSD$/);
    expect(typeof evidence.balances.protectedPercent).toBe("number");
    expect(typeof evidence.balances.spentPercent).toBe("number");
    expect(evidence.compromised.proposedAmount).toBeDefined();
    expect(evidence.limitations).toBeDefined();
  });

  it("imports no fetch, wagmi, or API client", async () => {
    const content = await readFile(resolve(import.meta.dirname, "page.tsx"), "utf8");
    expect(content).not.toMatch(/\bfetch\b/);
    expect(content).not.toMatch(/\bwagmi\b/);
    expect(content).not.toMatch(/\bapi-client\b/);
    expect(content).not.toMatch(/from ['"]@\/lib\/api['"]/);
  });

  it("contains no hard-coded MockUSD amounts or API widget", async () => {
    const content = await readFile(resolve(import.meta.dirname, "page.tsx"), "utf8");
    expect(content).not.toMatch(/\d+\.\d{2}\s*MockUSD/);
    expect(content).not.toContain("ApiStatus");
    expect(content).toContain("balances.before");
    expect(content).toContain("balances.after");
    expect(content).toContain("usage-track-amber");
  });
});
