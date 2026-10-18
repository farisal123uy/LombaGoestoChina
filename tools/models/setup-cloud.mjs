import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertPrivateTarget, mergeEnvironment, root, verifyProject, writeEnvironment } from "../services/config.mjs";
import { defaultCloudModel, cloudModelProfiles, isReviewedCloudModel } from "@guardian-wallet/planner";

await verifyProject();
let muted = false;
const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk, encoding); done(); } });
const input = process.stdin.isTTY ? createInterface({ input: process.stdin, output, terminal: true }) : undefined;
async function ask(message, secret = false) {
  if (!input) throw new Error("INTERACTIVE_TERMINAL_REQUIRED");
  process.stdout.write(`${message}: `); muted = secret;
  const value = await new Promise((resolve) => input.question("", resolve));
  muted = false; if (secret) process.stdout.write("\n"); return value.trim();
}
async function confirmFreeAccount() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await ask("Langkah 1/2 — konfirmasi akun Free: ketik FREE lalu Enter (input disembunyikan; jangan tempel API key di sini)", true);
    if (answer.toUpperCase() === "FREE") return true;
    if (!answer || ["BATAL", "CANCEL"].includes(answer.toUpperCase())) return false;
    console.log(/^gsk_/i.test(answer)
      ? "API key masuk pada langkah konfirmasi. Nilainya tidak dicetak atau disimpan ke konfigurasi. Ketik FREE dahulu; key diminta pada langkah 2/2."
      : "Konfirmasi belum sesuai. Ketik FREE jika akun memang Free tanpa billing berbayar, atau tekan Enter untuk batal.");
  }
  return false;
}
try {
  const modelIndex = process.argv.indexOf("--model"), modelId = modelIndex >= 0 ? process.argv[modelIndex + 1] : defaultCloudModel;
  if (!modelId || !isReviewedCloudModel(modelId)) throw new Error("CLOUD_MODEL_NOT_ALLOWLISTED");
  console.log(`Guardian Wallet — Groq Free, model ${modelId}.\nAkun harus tetap Free, tanpa upgrade Developer atau metode pembayaran.\nUrutan input: 1) ketik FREE untuk konfirmasi akun; 2) baru tempel API key dari https://console.groq.com/keys . Kedua input disembunyikan.\n`);
  const confirmed = process.argv.includes("--from-env") ? process.env.GROQ_FREE_TIER_CONFIRMED === "true" : await confirmFreeAccount();
  if (!confirmed) throw new Error("FREE_ACCOUNT_NOT_CONFIRMED");
  const key = process.argv.includes("--from-env") ? process.env.GROQ_API_KEY : await ask("Langkah 2/2 — tempel Groq API key BARU lalu Enter (input disembunyikan)", true);
  if (!key || !/^gsk_[A-Za-z0-9_-]{16,}$/.test(key)) throw new Error("INVALID_GROQ_KEY");
  const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error("CLOUD_KEY_VERIFICATION_FAILED");
  const models = await response.json();
  if (!models.data?.some((model) => model.id === modelId)) throw new Error("FREE_CLOUD_MODEL_UNAVAILABLE");
  const values = { AI_PROVIDER: "groq", AI_MODEL_ID: modelId, GROQ_API_KEY: key, GROQ_FREE_TIER_CONFIRMED: "true", AI_REQUEST_TIMEOUT_MS: "30000", AI_CONTEXT_TOKENS: "4096", AI_OUTPUT_TOKENS: String(cloudModelProfiles[modelId].defaultCompletionTokens) };
  const relative = ".local/ai-cloud.env"; assertPrivateTarget(relative);
  await mkdir(join(root, ".local"), { recursive: true });
  await writeFile(join(root, relative), mergeEnvironment("", values), { mode: 0o600 });
  await writeEnvironment("api", values);
  try {
    const providerFile = ".local/provider-agent.env";
    const text = await readFile(join(root, providerFile), "utf8"); assertPrivateTarget(providerFile);
    await writeFile(join(root, providerFile), mergeEnvironment(text, values), { mode: 0o600 });
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  console.log(`Konfigurasi Groq Free tersimpan privat; model ${modelId} tersedia. Pemeriksaan ini hanya membaca katalog, belum mengukur inferensi/latensi. Lanjutkan npm.cmd run model:cloud. Tidak ada aktivasi paket billing.`);
} catch (error) { console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "CLOUD_SETUP_FAILED"); process.exitCode = 1; }
finally { muted = false; input?.close(); }
