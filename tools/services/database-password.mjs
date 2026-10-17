import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { readEnvironment, replaceDatabasePassword, verifyProject, writeEnvironment } from "./config.mjs";

if (!process.stdin.isTTY) {
  console.error("Jalankan npm.cmd run setup:database-password langsung di terminal VS Code. Jangan gunakan password sebagai argumen command.");
  process.exit(1);
}
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const input = createInterface({ input: process.stdin, output, terminal: true });
try {
  await verifyProject();
  const database = await readEnvironment("database");
  if (!database.DATABASE_URL) throw new Error("DATABASE_URI_MISSING");
  console.log("Perbaiki password pada connection URI yang sudah tersimpan. Host, port dan username tetap memakai konfigurasi tersebut.");
  console.log("Masukkan password DATABASE Supabase asli. Encoding URL dilakukan otomatis; input tidak ditampilkan.");
  process.stdout.write("Password database: ");
  muted = true;
  const password = await new Promise((resolve) => input.question("", resolve));
  muted = false;
  process.stdout.write("\n");
  const uri = replaceDatabasePassword(database.DATABASE_URL, password);
  await writeEnvironment("database", { DATABASE_URL: uri });
  await writeEnvironment("worker", { DATABASE_URL: uri });
  const api = await readEnvironment("api");
  if (api.DATABASE_URL) await writeEnvironment("api", { DATABASE_URL: uri });
  console.log("Encoding password diperbarui di konfigurasi lokal. Tidak ada koneksi, migration, atau transaksi yang dijalankan.");
  console.log("Berikutnya: npm.cmd run services:check -- --network");
} catch {
  console.error("Belum diperbarui sepenuhnya. Periksa connection URI tersimpan dan input password. Detail yang bisa mengandung credential disembunyikan.");
  process.exitCode = 1;
} finally { muted = false; input.close(); }
