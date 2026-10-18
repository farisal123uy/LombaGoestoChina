import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

describe("site navigation", () => {
  it("uses the shared header on every route", async () => {
    const files = ["app/page.tsx", "components/evidence-ledger.tsx", "components/owner-setup.tsx", "components/financial-dashboard.tsx"];
    await Promise.all(files.map(async (file) => expect(await readFile(resolve(root, file), "utf8")).toContain("SiteHeader")));
  });

  it("defines all landing deep-link targets", async () => {
    const evidence = await readFile(resolve(root, "components/evidence-ledger.tsx"), "utf8");
    for (const id of ["claim-a", "claim-b", "claim-c", "claim-d", "claim-e", "claim-f"]) expect(evidence).toContain(`id=\"${id}\"`);
  });
});
