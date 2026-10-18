# Guardian Wallet — catatan progres

## Keputusan aktif — lanjut menggunakan jaringan yang ada

- User mengonfirmasi identitas/eligibility tim sudah diselesaikan; dicatat sebagai
  konfirmasi tim, bukan verifikasi dokumen personal oleh software.
- User memilih lanjut memakai **Base Sepolia public testnet / MockUSD** dan membatalkan
  pengiriman email ke panitia. Konfirmasi jaringan bukan lagi tugas kontak aktif.
  Aturan yang diberikan menyebut real on-chain transaction hashes tanpa menetapkan
  mainnet/testnet; penerimaan resmi tidak diklaim. Hasil fork reviewer tetap terpisah.
- Aturan lokal dan brief International Track di situs/tautan IEEE sudah diperiksa;
  belum ditemukan penerimaan Base Sepolia/testnet secara eksplisit. Draft pertanyaan
  Inggris di `ORGANIZER_NETWORK_CONFIRMATION.md` dan `organizer-network-query.eml`
  sekarang menjadi arsip yang tidak dikirim, bukan permintaan yang sedang menunggu jawaban.
- Owner kini mengizinkan publikasi source ke branch GitHub `feat/batching-evaluation`;
  branch `main` tidak diubah. Presentasi/video tetap menunggu izin terpisah.

## Status aktif — sistem online dan frontend terintegrasi (18 Oktober)

- **URL juri:** https://preview-95c94201191f7206.up.railway.app/review
  Kode akses dibagikan privat; tautan lengkap ada di
  `.local/linux-review/reviewer-link.private.txt`, bukan source publik.
- **Build deployed:** `912063431ea05c663abd9df36bdff047687006d5cf8ea9fde87ba8b9b0f9d9c0`.
  ZIP source persis versi ini disimpan di `.local/linux-review/deployed-source-<hash>.zip`.
  Host Linux diklaim dan Free/Trial tanpa kartu dikonfirmasi user. Tidak ada upgrade
  berbayar yang dijalankan; kuota/kredit dan masa layanan tetap perlu dipantau tim.
- **Frontend `feat/enterprise-dashboard` revision `4e47b13` sudah diintegrasikan**
  secara lokal: landing/theme/evidence, tetap tersambung ke wallet assistant dan review.
- **GPT-OSS 120B Groq nyata**: smoke 4/4; perbandingan 120B/20B sama-sama 8/8. P50
  675/580 ms; P95 1008/621 ms. Whole-flow keduanya sekitar 8 detik; 120B dipertahankan.
- **Evaluasi keamanan cloud 60/60** pada 30 kasus × 2 setelah perbaikan schema offer
  nonaktif. Baseline 54/60 dengan enam error API disimpan, tidak dihitung sebagai
  keberhasilan blokir. Ini regresi in-sample, bukan kekebalan universal.
- **Browser produksi melalui HTTPS publik lulus**: no-MetaMask, real API plan,
  queue/start, completed/confirmed, signature delivery/probe/write-read, tutup sesi.
  Procurement sampai write/read **11276 ms**; total uji **37703 ms**. Transaksi tetap
  fork disposable, bukan pembayaran publik baru. Bukti: `reviewer-public-browser.json`.
- **3 probe China lulus** (Beijing/Shanghai/Shenzhen): HTTPS valid, 200, ready dan
  build ID sesuai; 1471/1779/2349 ms. Ini endpoint probe, bukan browser juri.
- Pengujian lokal terbaru: **78 integration**, **7 web**, **13 browser**; checkpoint
  **16 contract/fork**. Lint/typecheck/build dan pemeriksaan output
  web lulus; key model/path runtime privat tidak ditemukan pada output/trace yang dicek.
- Panduan aktif: [REVIEWER_GUIDE.md](REVIEWER_GUIDE.md),
  [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md),
  [CLOUD-VALIDATION.md](evidence/CLOUD-VALIDATION.md), [release gates](RELEASE_CHECKLIST.md).
- **Push source ke branch `feat/batching-evaluation` telah diizinkan owner; `main`
  tidak diubah. Presentasi/video tetap menunggu izin.**
  `submission/` tetap kosong. Sisa resmi: konfirmasi jaringan oleh panitia, identitas/
  eligibility tim, uji jaringan juri sendiri, materi presentasi, dan upload/receipt
  portal. Catatan di bawah adalah checkpoint historis, bukan status aktif.
- Perintah `npm.cmd run release:readiness` memeriksa readiness/build publik, penolakan
  akses tanpa capability/kode salah, hasil model/browser/China dan kecocokan **85 file
  runtime** terhadap ZIP deployed. Report lokal: `.local/release/readiness-report.json`.

## Checkpoint terbaru — GPT-OSS dan sandbox juri

- Kandidat utama **`openai/gpt-oss-120b`**, pembanding eksplisit **`openai/gpt-oss-20b`**
  melalui Groq Free. Profil GPT memakai reasoning low dan include_reasoning=false;
  budget completion mencakup reasoning. Qwen tetap alternatif eksplisit, tanpa fallback.
- Setup privat: `npm.cmd run setup:ai-cloud`. Benchmark `model:compare` memakai delapan
  kasus sama/model, mencatat P50/P95/token dan berhenti saat kuota tercapai. **Key Free
  belum tersedia; belum ada skor/latensi Groq nyata yang dinyatakan berhasil.**
- **76 integration, 16 contract/fork, 10 browser cases**, lint, typecheck dan production
  build lulus. Factory review diuji sampai `completed`, quote dan
  delivery signature sah, probe/write/read DB berhasil, replay tidak membayar ulang,
  wallet/DB kedua terisolasi. Bukti: `evidence/reviewer-workspace-fork.json`.
  Model HTTP pada uji ini adalah fixture; kontrak dan database benar-benar dieksekusi
  pada fork, tanpa transaksi/pembayaran publik baru.
- Container `Dockerfile.review`, runtime `review:serve`, profil deployment dan dependency
  boundary `apps/reviewer` disiapkan. Docker/cloud deployment belum dijalankan; batas
  RAM/CPU/eligibility Free dan akses jaringan China tetap gate nyata.
- Audit dependency produksi (termasuk dependency runtime reviewer): **0 advisory**.
  Full development tree masih memiliki **4 moderate** pada rantai drizzle-kit/esbuild;
  build-only tooling tersebut dipangkas dari image produksi. Ini bukan audit keamanan.
- Panduan terbaru: [AI_CLOUD.md](AI_CLOUD.md), [REVIEW_DEPLOYMENT.md](REVIEW_DEPLOYMENT.md),
  [technical documentation](technical-documentation.md), [release gates](RELEASE_CHECKLIST.md).
- Frontend teman belum di-push/diintegrasikan; source stage dua belum di-commit/push.
  Presentasi/video tetap menunggu izin. Status rilis resmi **belum 100%**.

## Pembaruan aktif — API cloud gratis dan kesiapan juri

- Batas biaya layanan **Rp0**, tanpa aktivasi billing. Presentasi/video menunggu izin
  owner; frontend teman belum di-push sehingga integrasi frontend final belum selesai.
- Qwen runtime dipindahkan ke adapter **Groq Free**, model pinned
  `qwen/qwen3.8-27b`, strict JSON, reasoning none, batas token/request dan penanganan
  quota tanpa paid fallback. Panduan: [QWEN_CLOUD.md](QWEN_CLOUD.md).
- **75 integration cases lulus** (termasuk adapter cloud berbasis mock dan isolasi
  host juri). Inferensi Groq/latensi aktual belum terverifikasi tanpa key akun Free.
- Sandbox juri `/review` dan host capability-scoped sudah diimplementasikan. Runtime
  membuat wallet/kontrak/DB disposable pada fork lokal; belum dinyatakan lolos alur
  cloud lengkap. Pemilihan hosting publik mandiri yang gratis masih merupakan gate.
- Percobaan gateway laptop sudah dihentikan sesuai revisi arah deployment. URL Quick
  Tunnel sebelumnya bukan tautan rilis. Tidak ada transaksi publik/pembayaran baru.

## Pembaruan 18 Oktober — wallet assistant

Direktori kerja tetap **`guardian-wallet-stage2`**, branch lokal
**`feat/batching-evaluation`**; belum di-commit/push. Panduan fitur dan kontrak API:
[WALLET_ASSISTANT.md](WALLET_ASSISTANT.md).

- Asset overview membaca saldo/token metadata, reserve, anggaran, native ETH dan
  komitmen antrean; kalkulasi integer, bukan angka hasil karangan model.
- Instruksi Inggris/Indonesia ditafsirkan Qwen menjadi overview, risk check, rencana
  invoice, procurement draft atau unsupported. Draft tidak dieksekusi worker.
- Queue release memakai owner auth, validasi ulang quote/policy dan transaksi DB
  dengan account lock; tidak otomatis membuka pause atau mengubah izin owner.
- Risk report mencakup policy/budget/operation/service state; bukan risiko pasar.
- **66 integration, 15 contract/fork, 8 browser cases** lulus. Uji fork yang diperluas
  menjalankan Qwen asli, API owner, PGlite, worker dan Kernel/Guardian sampai `paid`,
  memulihkan respons hilang dan memastikan satu send. Bukti:
  `evidence/wallet-assistant-fork.json`; ini fork lokal, bukan pembayaran publik baru.
- Typecheck seluruh workspace, lint dan production build lulus.
- Corpus intent Qwen baru: baseline **11/12**, sesudah perbaikan prompt **12/12** pada
  kasus yang sama; kedua hasil disimpan. Corpus keamanan lama 60/60 adalah checkpoint
  terpisah, bukan klaim pengujian ulang atau ketahanan universal.
- **Seluruh isi `submission/` sudah dihapus atas permintaan tim untuk dirombak.**
  Catatan paket/video/ZIP pada checkpoint di bawah adalah riwayat, bukan artefak yang
  masih tersedia. Bukti teknis di `docs/evidence/` tetap tersedia.

## Tahap kedua — batching, evaluasi, materi submission

Direktori kerja: **`C:\ProjetLomba\guardian-wallet-stage2`**. Branch:
**`feat/batching-evaluation`**, berbasis `e5ef81f`. Perubahan tahap dua belum
di-commit/push. Snapshot frontend/backend yang dibagikan kepada teman tetap tersedia
di branch `feat/wallet-agent-backend`.

- Bounded batching 1–10 invoice, window sampai 30 detik, deadline tidak diperpanjang,
  satu durable operation dengan membership tiap task, rekonsiliasi atomik dan
  fulfillment terpisah sudah diimplementasikan.
- Migration **0004/0005** sudah diuji lokal/fork; belum diterapkan pada Supabase
  runtime publik. Default `BATCH_MAX_SIZE=1`; rollout batch bersifat opt-in.
- **58 integration test, 15 contract/fork case, 6 browser test, typecheck, lint dan
  production build** lulus. Runtime dependency audit: 0 advisory diketahui.
- COST-01 membandingkan 4/7 invoice, tiga ulangan per mode dari snapshot warm yang
  sama. Bukti: `docs/evidence/cost-fork.json`. Ini gas EVM lokal, bukan harga mainnet/USD.
- Evaluasi Qwen: baseline **52/60**, setelah perbaikan prompt **60/60** pada corpus
  yang sama (30 kasus × 2); baseline gagal disimpan. Ini regresi in-sample, bukan
  bukti kebal prompt injection universal.
- Reorg/nonce/partial-settlement/head-lag/timeout dan fee deadline saat RPC stalled
  diuji. Fork menambahkan permit-selector, transferFrom, nested execute dan delegatecall.
- Materi submission berbahasa Inggris sudah diekspor: dokumen teknis **2 halaman**,
  risk report **5 halaman**, deck **9 slide PPTX/PDF**, dan video walkthrough bernarasi
  Inggris **264.543 detik (4m24s)**. Sumber video adalah bukti rekaman yang diberi
  label, bukan transaksi live baru. File berada di **`submission/generated/`**.
- Arsip review: **`submission/generated/Guardian-Wallet-submission-review.zip`**,
  berisi source snapshot, dokumen, video, evidence dan inventori SHA-256. Panduan:
  **`submission/README.md`**. Identitas tim, persetujuan jaringan testnet dari panitia,
  source freeze/commit/publish dan bukti unggah portal masih merupakan langkah rilis.
- Tidak ada layanan berbayar atau transaksi publik baru untuk evaluasi tahap dua.

## Checkpoint tahap pertama — publik

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
