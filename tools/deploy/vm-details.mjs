import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const directory = fileURLToPath(new URL("../../.local/linux-review/", import.meta.url));
const state = JSON.parse(await readFile(join(directory, "connection.private.json"), "utf8"));
const fields = [];
function walk(value, path = "") {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number") fields.push({ key: key.toLowerCase(), path: `${path}.${key}`, value: item });
    else walk(item, `${path}.${key}`);
  }
}
walk(state.manifestObjects);
// Once the build window expires SSH may issue a fresh human claim session.
try {
  const pending = JSON.parse(await readFile(join(directory, "stop-server.stdout.private.log"), "utf8"));
  if (pending.status === "claim_required") { fields.length = 0; walk(pending); }
} catch { /* The original manifest is used before a renewal is needed. */ }
const claim = fields.find((field) => field.key.includes("claim") && typeof field.value === "string" && /^https:\/\//.test(field.value));
if (claim) {
  const url = new URL(claim.value);
  if (url.hostname !== "railway.com" && !url.hostname.endsWith(".railway.com")) throw new Error("UNEXPECTED_VM_CLAIM_HOST");
  await writeFile(join(directory, "claim-link.private.txt"), `${url.toString()}\n`, { mode: 0o600 });
}
const deadlines = fields.filter((field) => /deadline|expires|expiration/.test(field.key) && (typeof field.value === "number" || /^\d{4}-\d\d-\d\dT/.test(String(field.value)))).map(({ key, value }) => ({ key, value }));
const region = fields.find((field) => field.key.includes("region") && typeof field.value === "string" && /^[a-z0-9_-]{2,60}$/.test(field.value))?.value;
console.log(JSON.stringify({ previewUrl: state.previewUrl, region: region || "not-reported", deadlines, claimLinkFile: claim ? ".local/linux-review/claim-link.private.txt" : "not-found-in-manifest", restriction: "Creator-IP-only until human claim; account plan/billing must be checked before claim." }, null, 2));
