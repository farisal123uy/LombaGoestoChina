# Guardian Wallet — catatan progres

Checkpoint: **17 Oktober 2026**. Branch lokal: `feat/wallet-agent-backend`.

## Posisi saat ini

**Alur pertama berhasil end-to-end di Base Sepolia: Astra/Qwen → provider AI →
signed quote → pembayaran 0.26 MockUSD → signed delivery → database probe dan
write/read nyata. Task berstatus `completed`; bukti publik sudah disimpan.**

## Sudah terverifikasi

- Owner menandatangani sponsored bootstrap dan scoped session melalui MetaMask.
- Kernel, Guardian dan token uji sudah ada di Base Sepolia. Manifest aman:
  [`evidence/public-deployment.json`](evidence/public-deployment.json).
- Saldo deployment 10 MockUSD; reserve 6, per-payment 1, batas UTC-day 2.
- Qwen lokal/Ollama tersedia dan smoke test awal 4 kasus lulus.
- Supabase tersambung; migration sampai `0003_json_object_payloads.sql` diterapkan;
  9 tabel internal memakai RLS tanpa public-role policies.
- **36 integration tests**, **14 contract/fork tests**, **6 browser tests**, lint,
  typecheck dan production build lulus. Browser tests memakai fixture wallet/API;
  fork tests memakai chain lokal; keduanya bukan pembayaran publik.
- Live check **17 Oktober 2026, 13:15 WIB** berhasil: Astra/Qwen → provider AI
  terpisah → quote 0.26 MockUSD dengan signature valid → live payment plan.
  Kasus wait → `wait`; direct jailbreak → `needs_owner`.
- API dan provider signer menolak akses tanpa autentikasi (401). Worker benar-benar
  memberi heartbeat `idle`; scheduler tetap paused; tidak ada task/UserOperation
  pembayaran yang dibuat **oleh preview tersebut**. Bukti: [`evidence/provider-live-preview.json`](evidence/provider-live-preview.json).
- **Public procurement pertama settled pukul 13:25:04 WIB**, diverifikasi terpisah
  pukul **13:28:32 WIB**. Task `34aef831-2851-4c5d-9eca-545925652091` completed;
  satu event settlement cocok, operation confirmed, consumed-ID valid, quote dan
  delivery signature valid, fresh probe dan unique-key write/read lulus.
- Saldo setelah pembayaran **9.74 MockUSD**, reserve **6**, spent UTC-day **0.26**
  dari cap **2**; Kernel ETH tetap **0**, native gas dibayar paymaster.
- Bukti hasil: [`evidence/public-procurement.json`](evidence/public-procurement.json)
  dan [`AI-01 public procurement`](evidence/AI-01-public-procurement.md).

## Transaksi dan layanan publik pertama

- Transaction: `0x7cd8b34b835cb34b65d5d3484d81541874b225e7d5fb345f5c9514ad20fdd86d`
- [Explorer Base Sepolia](https://sepolia.basescan.org/tx/0x7cd8b34b835cb34b65d5d3484d81541874b225e7d5fb345f5c9514ad20fdd86d)
- UserOperation: `0x5a5799732c1c0874843d8f6d11abea9c7e509ef9aada68de670513c72ebeada0`
- Namespace: `0ef2e9f4-aa5d-4a93-ac07-c2cabeb15a6e`, kapasitas **1 MiB**, periode
  **1 jam** sampai **17 Oktober 2026, 14:25:04 WIB**. Bukti liveness berlaku saat
  diverifikasi; setelah expiry layanan berhenti sesuai rental, bukan dibayar ulang.
- Script verifikasi hanya memeriksa settlement yang ada dan menulis key evidence
  unik; tidak membuat task atau mengirim UserOperation pembayaran baru.

## Implementasi yang tersedia

- `/setup`: owner deployment/session onboarding.
- `/dashboard`: owner API login, goal procurement, request/quote exchange, Start/Pause,
  task/transaction evidence, service probe, KV write/read.
- API owner-authenticated dan worker persist-before-send/reconciliation.
- Provider AI terpisah dari proses signer.
- Katalog tetap: namespace PostgreSQL JSONB 1 MB/1 jam/0.26 MockUSD atau
  4 MB/4 jam/0.52 MockUSD; ini layanan uji, bukan dedicated cloud database.
- Fulfillment memerlukan pembayaran confirmed, delivery signature dan write/read
  probe; kegagalan delivery tidak mengulang pembayaran.
- Tool `provider:check` tersedia untuk live-model preview tanpa membuat payment task.

## Temuan runtime yang sudah diperbaiki

1. Konfigurasi DB worker sebelumnya berbeda dari DB API/migration. Sudah
   disinkronkan lewat `provider:configure`.
2. Live runtime menemukan JSON ter-encode dua kali oleh postgres.js ketika encoded
   string langsung di-cast ke `jsonb`. Tiga invoice preview terdampak; migration
   memperbaiki payload tersebut menjadi object tanpa mengganti isi invoice.
3. Binding `::text::jsonb` diterapkan pada task, attempt, invoice, namespace dan KV
   data. Lima CHECK constraints menolak JSON non-object di boundary database.
4. Race request ID untuk goal berbeda, polling dashboard, serta body limit untuk
   value Unicode juga sudah diperbaiki dan diuji.

## Angka live preview (satu run, bukan benchmark maksimum)

- Buyer intent: 9.758 detik, termasuk cold model startup.
- Provider AI + pengambilan invoice idempotent dari signer: 1.336 detik.
- Payment planning: 0.923 detik.
- Readiness check sudah menyiapkan invoice dengan request ID yang sama sebelum
  provider AI dipanggil. Angka ini tidak mencakup latency settlement/delivery.

## Cara mengulang pemeriksaan

```powershell
npm.cmd run test:integration
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
# Opt-in fork: transaksi hanya pada fork lokal.
$env:KERNEL_FORK_RPC_URL="https://sepolia.base.org"
npm.cmd run test:contracts
```

Live preview, saat API/worker/provider belum berjalan dan antrean kosong/paused:

```powershell
npm.cmd run provider:configure
npm.cmd run provider:check -- --temporary-runtime --record
```

Proses sementara yang dibuat checker dihentikan sesudah pemeriksaan; web/onboarding
yang sudah berjalan tidak dihentikan. Panduan lengkap: [PROCUREMENT_RUNTIME.md](PROCUREMENT_RUNTIME.md).

## Status runtime dan cara melanjutkan demo

Status proses pada checkpoint terakhir: **web 3000, API 4000, provider AI 4200 dan
signer 4201 sudah berjalan**, financial/provider configured, model `qwen3:8b`,
scheduler **running setelah owner Start agent**. Satu task publik telah completed.
Dua jendela PowerShell dibuka untuk web dan financial runtime;
Ctrl+C pada masing-masing jendela menghentikan proses terkait. Status ini adalah
snapshot, bukan jaminan proses tetap hidup sesudah terminal/komputer ditutup.

1. Jika proses sudah berhenti, jalankan `npm.cmd run runtime:dev` dari root repo dan
   `npm.cmd run dev:web` di terminal terpisah. Konfigurasi owner yang selesai tetap
   tersimpan; tidak perlu mengulang deployment untuk login API.
2. Buka `http://localhost:3000/dashboard`, login kembali bila session expired, lalu
   pilih task yang sudah **completed** untuk melihat transaction dan namespace.
3. Sebelum rental expiry, gunakan **Verify database probe** / **Write & read back**
   untuk demonstrasi layanan yang sama. Bukti JSON/AI-01 sudah siap untuk bahan demo.
4. Berikutnya: perluas evaluasi keamanan/reliabilitas, implementasi queue batching dan
   pengukuran COST-01, lalu hosting serta final demo/submission.

## Masih belum selesai

- Queue batching/gas economics, evaluasi adversarial lebih luas, hosting dan final
  demo/submission.

## GitHub dan kolaborasi frontend

- Checkpoint implementasi sudah di-commit dan di-push sebagai **`5088219`** di branch
  **`feat/wallet-agent-backend`**. Panduan teman frontend:
  [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md). Riwayat `main` memiliki root berbeda;
  penggabungan ke `main` masih memerlukan penyelarasan.

Private key, session authorization, bearer token, signed operation journal dan
credential URL tidak dicantumkan dalam catatan/evidence publik.
