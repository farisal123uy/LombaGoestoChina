import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLandingEvidence } from "../lib/evidence";

describe("landing page", () => {
  it("loads all amounts from committed evidence", async () => {
    const evidence = await loadLandingEvidence();

    // Verify loader returns all required fields
    expect(evidence.balances.balance).toMatch(/^\d+\.\d{2} MockUSD$/);
    expect(evidence.balances.protected).toMatch(/^\d+\.\d{2} MockUSD$/);
    expect(evidence.balances.daily).toMatch(/^\d+\.\d{2} MockUSD$/);
    expect(evidence.balances.spent).toMatch(/^\d+\.\d{2} MockUSD$/);
    expect(evidence.settlement.amount).toMatch(/^\d+\.\d{2} MockUSD$/);
    expect(typeof evidence.balances.protectedPercent).toBe("number");
    expect(typeof evidence.balances.spentPercent).toBe("number");
    expect(evidence.compromised.proposedAmount).toBeDefined();
    expect(evidence.limitations).toBeDefined();
  });

  it("imports no fetch, wagmi, or API client", async () => {
    const pagePath = resolve(import.meta.dirname, "page.tsx");
    const content = await readFile(pagePath, "utf8");

    expect(content).not.toMatch(/\bfetch\b/);
    expect(content).not.toMatch(/\bwagmi\b/);
    expect(content).not.toMatch(/\bapi-client\b/);
    expect(content).not.toMatch(/from ['"]@\/lib\/api['"]/);
  });
});
