import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { configureOrigin, destinations, readEnvironment, readOrigin, savePublicSetup, validateServiceValue, verifyProject, writeEnvironment } from "./config.mjs";

if (!process.stdin.isTTY) {
  console.error("Jalankan npm.cmd run setup:services langsung di terminal VS Code agar input rahasia dapat disembunyikan.");
  process.exit(1);
}
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const input = createInterface({ input: process.stdin, output, terminal: true });
async function ask(label, current = "", kind = "url", secret = false) {
  while (true) {
    process.stdout.write(`${label}${current ? " [sudah terisi; Enter=pertahankan]" : " [Enter=lewati]"}: `);
    muted = secret;
    const value = (await new Promise((resolve) => input.question("", resolve))).trim();
    muted = false;
    if (secret) process.stdout.write("\n");
    if (!value) return current;
    if (validateServiceValue(kind, value)) return value;
    console.log("Format belum benar. Masukkan nilai dari dashboard layanan; nilainya tidak ditampilkan kembali.");
  }
}
try {
  await verifyProject();
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : "all";
  if (!["all", "supabase", "qwen", "zerodev", "github", "wallet"].includes(only)) throw new Error("Pilih --only supabase|qwen|zerodev|github|wallet");
  const selected = (name) => only === "all" || only === name;
  const api = await readEnvironment("api"), worker = await readEnvironment("worker"), db = await readEnvironment("database");
  const services = [];
  console.log("Guardian Wallet — penyiapan layanan lokal. Input rahasia disembunyikan. Tidak ada deployment/pembayaran yang dijalankan.\nPanduan: docs/SETUP_LAYANAN.md\n");
  if (selected("github")) {
    const repository = await ask("URL repository GitHub, contoh https://github.com/USER/guardian-wallet.git", readOrigin(), "github");
    if (repository) { configureOrigin(repository); services.push("github"); console.log("Remote origin sudah dikonfigurasi; source belum di-push."); }
  }
  let database = db.DATABASE_URL || worker.DATABASE_URL || api.DATABASE_URL || "";
  if (selected("supabase")) {
    console.log("\nSupabase: Connect → Session pooler untuk koneksi IPv4, port 5432. Migration dapat memakai direct connection jika IPv6 tersedia.");
    database = await ask("Connection URI lengkap, password sudah terisi/percent-encoded", database, "database", true);
    if (database) {
      await writeEnvironment("database", { DATABASE_URL: database });
      await writeEnvironment("worker", { DATABASE_URL: database });
      services.push("supabase");
    }
  }
  if (selected("qwen")) {
    const base = await ask("Endpoint Ollama (lokal: http://127.0.0.1:11434)", api.OLLAMA_BASE_URL || "http://127.0.0.1:11434", "ollama");
    if (base) {
      try {
        const response = await fetch(`${base.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(3000) });
        const data = await response.json();
        const installed = (data.models ?? []).map((item) => item.name).filter((name) => typeof name === "string" && name.toLowerCase().includes("qwen"));
        console.log(`Model Qwen terpasang: ${installed.join(", ") || "belum terdeteksi"}`);
      } catch { console.log("Ollama belum terjangkau; konfigurasi bisa disimpan lalu diverifikasi setelah server aktif."); }
      const model = await ask("Model Qwen", api.AI_MODEL_ID?.toLowerCase().includes("qwen") ? api.AI_MODEL_ID : "qwen3:8b", "qwen_model");
      if (model) {
        await writeEnvironment("api", { AI_PROVIDER: "ollama", OLLAMA_BASE_URL: base, AI_MODEL_ID: model, AI_REQUEST_TIMEOUT_MS: "45000", AI_CONTEXT_TOKENS: "4096" });
        services.push("qwen_ollama");
      }
    }
  }
  if (selected("zerodev")) {
    const rpc = await ask("Execution RPC Base Sepolia (contoh https://sepolia.base.org)", api.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", "url", true);
    const bundler = await ask("ZeroDev project RPC URL untuk Base Sepolia, salin dari dashboard", worker.ZERODEV_RPC_URL, "url", true);
    if (rpc) {
      await writeEnvironment("api", { BASE_SEPOLIA_RPC_URL: rpc });
      await writeEnvironment("worker", { BASE_SEPOLIA_RPC_URL: rpc });
      await writeEnvironment("contracts", { BASE_SEPOLIA_RPC_URL: rpc });
    }
    if (bundler) { await writeEnvironment("worker", { ZERODEV_RPC_URL: bundler }); services.push("zerodev"); }
  }
  if (selected("wallet")) {
    console.log("\nAlamat berikut publik dan opsional sampai kontrak/account selesai di-deploy. Jangan masukkan private key.");
    const owner = await ask("Alamat owner wallet (0x + 40 karakter hex)", api.OWNER_ADDRESS, "address");
    const account = await ask("Alamat Kernel smart account", api.KERNEL_ACCOUNT_ADDRESS, "address");
    const guardian = await ask("Alamat kontrak GuardianPayments", api.GUARDIAN_ADDRESS, "address");
    await writeEnvironment("api", { OWNER_ADDRESS: owner, KERNEL_ACCOUNT_ADDRESS: account, GUARDIAN_ADDRESS: guardian });
    await writeEnvironment("worker", { KERNEL_ACCOUNT_ADDRESS: account, GUARDIAN_ADDRESS: guardian });
  }
  const updated = await readEnvironment("api");
  const financialApiReady = Boolean(database && updated.OWNER_ADDRESS && updated.KERNEL_ACCOUNT_ADDRESS && updated.GUARDIAN_ADDRESS && updated.BASE_SEPOLIA_RPC_URL);
  if (financialApiReady) await writeEnvironment("api", { DATABASE_URL: database });
  else console.log("\nDB disimpan untuk migration/worker. API finansial menunggu alamat owner, Kernel, Guardian dan execution RPC; health/web tetap dapat dijalankan.");
  await savePublicSetup({ services, financialApiReady });
  console.log(`\nSelesai. File konfigurasi: ${Object.values(destinations).join(", ")}`);
  console.log("Jalankan npm.cmd run services:check, kemudian npm.cmd run services:check -- --network untuk verifikasi koneksi read-only.");
  console.log("Login deployment terpisah: npm.cmd run cloud:vercel -- login dan npm.cmd run cloud:railway -- login --browserless.");
} catch {
  // Do not print exception messages: providers/URLs may contain credentials.
  console.error("Penyiapan belum selesai. Periksa format input, file .gitignore, dan remote origin. Nilai rahasia tidak dicetak.");
  process.exitCode = 1;
} finally { muted = false; input.close(); }
