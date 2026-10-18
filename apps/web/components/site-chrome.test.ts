import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const claimIds = ["claim-a", "claim-b", "claim-c", "claim-d", "claim-e", "claim-f"];

describe("site navigation", () => {
  it("uses the shared header on every route", async () => {
    const files = ["app/page.tsx", "components/evidence-ledger.tsx", "components/owner-setup.tsx", "components/financial-dashboard.tsx"];
    await Promise.all(files.map(async (file) => expect(await readFile(resolve(root, file), "utf8")).toContain("SiteHeader")));
  });

  it("defines each claim target exactly once", async () => {
    const ledger = await readFile(resolve(root, "components/evidence-ledger.tsx"), "utf8");
    for (const id of claimIds) expect(ledger.match(new RegExp(`id="${id}"`, "g"))).toHaveLength(1);
    expect(ledger.match(/id="deployment"/g)).toHaveLength(1);
  });

  it("links landing sections to valid evidence records", async () => {
    const [ledger, landing] = await Promise.all([readFile(resolve(root, "components/evidence-ledger.tsx"), "utf8"), readFile(resolve(root, "app/page.tsx"), "utf8")]);
    for (const id of ["claim-a", "claim-c", "deployment"]) {
      expect(landing).toContain(`/evidence#${id}`);
      expect(ledger).toContain(`id="${id}"`);
    }
  });
});
