import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLandingEvidence, loadEvidence } from "../lib/evidence";

describe("landing page", () => {
  it("loads all amounts from recorded evidence and displays the post-payment balance", async () => {
    const evidence = await loadLandingEvidence();
    for (const amount of [evidence.balances.balance, evidence.balances.protected, evidence.balances.daily, evidence.balances.spent, evidence.settlement.amount]) expect(amount).toMatch(/^\d+\.\d{2} MockUSD$/);
    expect(typeof evidence.balances.protectedPercent).toBe("number");
    expect(typeof evidence.balances.spentPercent).toBe("number");
    expect(evidence.compromised.proposedAmount).toBeDefined(); expect(evidence.limitations).toBeDefined();
    expect(evidence.balances.balance).toBe((await loadEvidence()).procurement.facts["Token balance after"]);
  });
  it("imports no direct fetch, wagmi or API client", async () => {
    const content = await readFile(resolve(import.meta.dirname, "page.tsx"), "utf8");
    expect(content).not.toMatch(/\bfetch\b/); expect(content).not.toMatch(/\bwagmi\b/); expect(content).not.toMatch(/\bapi-client\b/); expect(content).not.toMatch(/from ['"]@\/lib\/api['"]/);
  });
  it("contains no hard-coded MockUSD amounts", async () => {
    const content = await readFile(resolve(import.meta.dirname, "page.tsx"), "utf8");
    expect(content).not.toMatch(/\d+\.\d{2}\s*MockUSD/); expect(content).not.toMatch(/["'`]\d+\.\d+\s*MockUSD["'`]/);
  });
});
