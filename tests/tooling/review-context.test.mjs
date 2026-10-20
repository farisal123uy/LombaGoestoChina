import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("review image evidence allowlist covers every frontend JSON import", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url)), source = resolve(root, "apps/web/lib/evidence.ts");
  const imports = [...(await readFile(source, "utf8")).matchAll(/from\s+["']([^"']*docs\/evidence\/[^"']+\.json)["']/g)];
  assert(imports.length > 0);
  const rules = new Set((await readFile(resolve(root, "Dockerfile.review.dockerignore"), "utf8")).split(/\r?\n/).map((line) => line.trim()));
  assert(rules.has("!docs/evidence"));
  for (const match of imports) {
    const path = relative(root, resolve(dirname(source), match[1])).replaceAll("\\", "/");
    assert(rules.has(`!${path}`), `Required frontend evidence is excluded from the review image: ${path}`);
    assert((await readFile(resolve(root, path))).length > 0);
  }
});
