# Guardian Wallet — catatan progres

## Publikasi dan deployment publik — 20 Oktober

- Runtime source, logo web dan materi submission tim telah di-commit sebagai
  **`d5517adc9d551ba6df36b53a357001bb35edd981`** dan di-push ke `origin/feat/batching-evaluation`;
  branch `main` tidak diubah. Commit dokumentasi lanjutan memperbarui catatan release tanpa
  mengubah berkas runtime yang sudah dideploy.
- Reviewer publik: https://preview-95c94201191f7206.up.railway.app/review. Release runtime
  Linux aktif memakai source archive SHA-256
  **`4fc4f46ebf05e5c7ee2f2e3bad68871d4b80474338a2081d21c1bfe3b64dbdb3`**, dibuat dari
  commit di atas. Access code tetap dibagikan terpisah secara privat.
- Build baru lulus clean install/build Linux, readiness model/fork, live GPT-OSS procurement
  di fork, signed delivery, service probe/write-read dan closed-capability rejection. Public
  HTTPS browser kemudian lulus end-to-end dengan logo SVG/favicon yang hash-nya cocok dengan source.
- Tiga probe readiness/TLS China melihat HTTP 200 dan build ID baru. Ini probe jaringan waktu
  tertentu, bukan browser juri/SLA. Tidak ada upgrade billing API; host tetap Free/Trial yang
  eligibility-nya dikonfirmasi operator.
- Rollout memakai release directory berversi dan mempertahankan release/environment sebelumnya
  untuk rollback. Perbandingan archive menunjukkan **97 runtime files**, tanpa file runtime berubah.
- Verifikasi kode menjelang penutupan rilis mencakup lint, typecheck, production build dan
  semua **156 tes**. Tidak ada kode runtime berubah pada pembaruan catatan publikasi ini.
- Submission folder berisi materi yang dikelola tim; source push bukan bukti upload resmi.
  Organizer belum mengonfirmasi penerimaan Base Sepolia dan portal belum memiliki receipt.

## Perapihan struktur proyek — 20 Oktober

- Materi submission aktif memakai sembilan berkas PPTX/Markdown/rekaman milik tim
  di root `submission/`. Isi materi tersebut dipertahankan.
- Generator `tools/submission/` beserta tes generator dan panduan lamanya dihapus.
  Empat script npm generator dihapus; `test:tooling` mempertahankan pemeriksaan
  allowlist evidence Docker yang masih digunakan. Redirect `QWEN_CLOUD.md` yang
  sudah digantikan `AI_CLOUD.md` dihapus dan tautannya diperbarui.
- Lima dokumen historis dipindahkan ke [docs/archive](archive/README.md): roadmap,
  workflow awal, storyboard demo lama, draft klarifikasi jaringan dan draft email
  yang dibatalkan. Dokumen arsitektur/API serta seluruh evidence tetap di lokasi
  semula karena masih menjadi referensi aplikasi, tooling dan materi tim.
- Output verifikasi sementara generator dan smoke migrasi lama dibersihkan;
  credential, jurnal onboarding, dependency serta build runtime dipertahankan.
- Packager source-only diperbaiki agar tetap bekerja pada working tree yang
  memiliki penghapusan/pemindahan file belum di-commit.
- Hasil akhir: **12 berkas source/tooling usang dihapus**, **5 dokumen diarsipkan**
  ditambah satu indeks arsip, serta **28 artefak sementara dibersihkan**. Inventaris
  berkas proyek turun dari **309 menjadi 298** (di luar dependency/hasil build).
- Hash kesembilan berkas submission tim sama sebelum/sesudah perapihan. Verifikasi
  lint, typecheck, production build, **105 integrasi**, **8 web**, **25 browser**,
  **17 kontrak/fork**, **1 tooling** dan packaging source-only semuanya lulus.

## Perbaikan pemeriksaan menyeluruh — 20 Oktober

Catatan checkpoint sebelum perapihan. Generator dan output presentasi yang disebut
di bawah sudah dihentikan/dibersihkan; materi aktif kini berada di root `submission/`.

- Konteks `Dockerfile.review` kini menyertakan `public-escrow-procurement.json`
  yang diimpor frontend. Berkas submission tidak masuk konteks image runtime.
  Regresi tooling mencocokkan seluruh import evidence frontend dengan allowlist.
  Docker tidak terpasang pada mesin ini; image belum dibangun/dijalankan di sesi ini.
- `npm run typecheck` kini mencakup tes integrasi/browser dan konfigurasi tes root
  melalui `tsconfig.tests.json`. Import `join` ganda, tipe mock driver, fixture service
  escrow dan akses opsi union pada tes rekonsiliasi sudah diperbaiki tanpa melonggarkan strict mode.
- Override esbuild **0.25.12** khusus `@esbuild-kit/core-utils` menghapus empat advisory
  pengembangan. Lockfile dipertahankan pada versi SDK/aplikasi semula dan diuji ulang
  dengan **`npm ci`**; audit penuh dan produksi sama-sama **0 advisory**. Drizzle check,
  generate schema ke `.local/drizzle-smoke` serta transform TS sync/async lulus.
- Pipeline submission memiliki schema deck lengkap, folder output otomatis dan
  `GUARDIAN_SUBMISSION_DIR` bersama untuk Node/Python/PowerShell. Konten memakai
  GPT-OSS/cloud serta bukti escrow publik; capture historis tidak ditimpa. Validasi
  tidak lagi mencantumkan angka tes hardcoded sebagai hasil pengujian baru.
- Ekspor lokal `.local/submission-check/` berhasil: **9 slide / 7:45**, tiga PDF,
  speaker notes, empat tautan receipt publik dan catatan latihan Indonesia. Video
  bernarasi juga diekspor dan durasi sebenarnya di Chromium **223,772 detik**
  (1280×720). Manifest dan ZIP memverifikasi SHA-256 artefak serta evidence.
- Regresi akhir: **105 integrasi**, **8 web**, **25 browser**, **17 kontrak/fork**,
  **4 tooling**, lint, typecheck dan production build lulus. Pemeriksaan output web
  tidak menemukan key model terkonfigurasi atau path runtime privat pada berkas yang diperiksa.
- README dan panduan package/test diperbarui; checkpoint lama tetap diberi label
  historis. Materi submission aktif sekarang dikelola langsung oleh tim di root proyek.

## Perbaikan lokal 20 Oktober — Setup, Wallet, dan pemulihan demo owner

- Setup dijelaskan sebagai deployment/delegasi awal; Wallet sebagai workspace harian.
  Status konfigurasi tersimpan memakai **Already configured**, terpisah dari login saat ini.
- Login coordinator dan API dipertahankan dalam sessionStorage per service, maksimal
  masa sesi server 15 menit. Pemulihan memvalidasi akun MetaMask, Base Sepolia, expiry,
  dan endpoint `/auth/session`; account/network change dan 401 membatalkan sesi terkait.
- Daftar/detail task dibatasi pada chain/Kernel aktif agar invoice akun lama tidak
  ditawarkan ke assistant yang account-scoped. Regresi SQL/API mencakup pemisahan ini.
- Checkbox invoice dijelaskan sebagai pemilihan preview. Ada tombol preview eksplisit,
  invoice kedaluwarsa dinonaktifkan, dan invoice yang belum dikirim dapat dibuang
  melalui endpoint cancel yang sudah ada. Saldo/risk bisa di-refresh tanpa inferensi AI.
- Diagnosis langsung menemukan saldo **9,48 MockUSD**, anggaran hari itu **2 MockUSD**,
  empat task akun lama, satu expired plan, serta provider agent/signer tidak hidup.
  Log worker menunjukkan kegagalan pemuatan `tsx` pada proses runtime lama.
- Runtime lokal dan coordinator di-restart. Provider health kembali 200; worker
  mengalihkan expired plan ke `needs_owner/EXPIRED_PLAN`, lalu idle. Komitmen antrean
  kembali nol. Satu inferensi diagnosis GPT-OSS 120B berhasil; tidak ada transaksi
  pembayaran baru yang dibuat oleh diagnosis/pemulihan ini.
- Verifikasi: **105 integration**, **8 web unit**, **22 browser cases terkait**
  (dashboard/setup/reviewer), lint, typecheck seluruh workspace, build API dan web lulus.
  Pengujian browser memakai wallet/API fixture; pembayaran MetaMask live berikutnya
  tetap dilakukan owner. Perubahan ini lokal, belum merupakan deployment cloud baru.
- Panduan: [OWNER_DEMO_GUIDE.md](OWNER_DEMO_GUIDE.md). Diagnosis ulang:
  `npm.cmd run wallet:diagnose` atau `npm.cmd run wallet:diagnose -- --ai` untuk satu
  permintaan tambahan ke model.

## Keputusan aktif — lanjut menggunakan jaringan yang ada

- User mengonfirmasi identitas/eligibility tim sudah diselesaikan; dicatat sebagai
  konfirmasi tim, bukan verifikasi dokumen personal oleh software.
- User memilih lanjut memakai **Base Sepolia public testnet / MockUSD** dan membatalkan
  pengiriman email ke panitia. Konfirmasi jaringan bukan lagi tugas kontak aktif.
  Aturan yang diberikan menyebut real on-chain transaction hashes tanpa menetapkan
  mainnet/testnet; penerimaan resmi tidak diklaim. Hasil fork reviewer tetap terpisah.
- Aturan lokal dan brief International Track di situs/tautan IEEE sudah diperiksa;
  belum ditemukan penerimaan Base Sepolia/testnet secara eksplisit. Draft pertanyaan
  Inggris di `archive/ORGANIZER_NETWORK_CONFIRMATION.md` dan `archive/organizer-network-query.eml`
  sekarang menjadi arsip yang tidak dikirim, bukan permintaan yang sedang menunggu jawaban.
- Owner memilih melanjutkan dengan evidence Base Sepolia; branch `main` tetap tidak diubah.
  Status source push dan deployment terbaru dicatat pada bagian teratas file ini.

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
- **Checkpoint saat itu (18 Oktober):** source push sudah diizinkan owner; source belum
  dipublikasikan dan `submission/` belum berisi materi final. Status tersebut sudah
  diperbarui oleh publikasi/deployment dan materi tim pada bagian teratas file ini.
  Catatan di bawah tetap merupakan riwayat checkpoint, bukan status aktif.
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
- **Checkpoint pra-integrasi (18 Oktober):** frontend dan source stage dua belum dipush;
  presentasi/video masih menunggu keputusan tim. Status ini kemudian berubah; lihat bagian
  publikasi/deployment di awal dokumen. Status official submission saat ini tetap belum lengkap.

## Historical checkpoint — API cloud gratis dan kesiapan juri (18 Oktober)

- Batas biaya layanan **Rp0**, tanpa aktivasi billing. Pada checkpoint ini presentasi/video
  menunggu izin owner dan frontend teman belum di-push; keduanya adalah status historis.
- Qwen runtime dipindahkan ke adapter **Groq Free**, model pinned
  `qwen/qwen3.8-27b`, strict JSON, reasoning none, batas token/request dan penanganan
  quota tanpa paid fallback. Panduan konfigurasi saat ini: [AI_CLOUD.md](AI_CLOUD.md).
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
