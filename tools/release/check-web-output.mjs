import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModelOptions } from "../models/cloud-config.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url)), output = join(root, "apps/web/.next");
let secret;
try { secret = (await loadModelOptions()).apiKey; } catch { /* Path checks still run in CI without a key. */ }
let traces = 0, assets = 0;
async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) { if (item.name !== "cache" && item.name !== "dev") await walk(path); continue; }
    if (item.name.endsWith(".nft.json")) {
      const trace = JSON.parse(await readFile(path, "utf8")); traces++;
      for (const file of trace.files || []) {
        const normalized = String(file).replaceAll("\\", "/");
        if (/(?:^|\/)\.local\/|(?:^|\/)\.ssh\/|(?:^|\/)id_ed25519(?:$|\.)|claim-link|ai-cloud\.env|apps\/(?:api|worker|web)\/\.env(?:$|\.(?!example))|packages\/database\/\.env(?:$|\.(?!example))/.test(normalized)) throw new Error(`PRIVATE_RUNTIME_PATH_IN_WEB_TRACE: ${relative(root, path)}`);
      }
    }
    if (secret && /\.(?:js|json|html|rsc|txt)$/.test(item.name)) {
      assets++;
      if ((await readFile(path)).includes(Buffer.from(secret))) throw new Error(`MODEL_KEY_IN_WEB_OUTPUT: ${relative(root, path)}`);
    }
  }
}
await walk(output);
console.log(JSON.stringify({ tracesChecked: traces, filesCheckedForConfiguredModelKey: assets, modelKeyAvailableForComparison: Boolean(secret), privateRuntimePathsFound: false, configuredModelKeyFound: false, scope: "Built Next output and traces; not a universal secret scan." }, null, 2));
