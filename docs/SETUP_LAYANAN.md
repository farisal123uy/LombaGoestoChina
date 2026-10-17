# Setup layanan Guardian Wallet

Panduan ini untuk menyiapkan akun dan koneksi proyek secara bertahap. Status awal:
Git/Node/npm sudah tersedia. Supabase sudah terhubung dan migration awal/RLS telah
diterapkan. Model lokal Qwen tersedia melalui Ollama; bundler dan akun deployment
masih perlu disiapkan.
Branch kerja: `feat/wallet-agent-backend`. Remote `origin` sudah terhubung ke
https://github.com/farisal123uy/LombaGoestoChina.git dan akses baca telah diverifikasi.

## 1. Akun yang dipakai dan hasil yang harus tersedia

| Layanan | Buka | Hasil yang dibutuhkan |
| --- | --- | --- |
| GitHub | https://github.com/farisal123uy/LombaGoestoChina | Repository proyek yang sudah ada; origin telah dikonfigurasi. |
| Supabase | https://supabase.com/dashboard | Project PostgreSQL dan connection URI server-side. |
| Qwen / Ollama | http://127.0.0.1:11434 | Model lokal `qwen3:8b`, native JSON-schema output; tanpa API key cloud. |
| ZeroDev | https://dashboard.zerodev.app | Project untuk Base Sepolia, RPC bundler yang mendukung EntryPoint 0.7. |
| Railway | https://railway.com/dashboard | Project dengan service API dan worker. |
| Vercel | https://vercel.com/new | Project web, root directory `apps/web`. |

Pakai akun GitHub yang sama untuk login ke layanan yang menyediakan opsi tersebut.
Saat memilih region, tempatkan database dan backend pada region yang berdekatan
(Singapore bila tersedia). Latensi dan biaya tetap akan diukur, bukan diasumsikan.

Qwen berjalan pada GPU komputer lokal. Periksa plan/credit Railway, ZeroDev dan
layanan deployment pada dashboard masing-masing sebelum membuat resource berbayar.
Pembuatan akun, login browser dan pengisian billing dilakukan pemilik akun.

## 2. Mulai dari GitHub

Untuk workspace ini, gunakan repository existing **farisal123uy/LombaGoestoChina**.
Remote sudah di-fetch; default branch `main` terdeteksi. Riwayat upload GitHub
(`4b68811`) dan root commit lokal (`6cd497e`) terpisah. Penyelarasan history perlu
dilakukan saat publishing setelah review perubahan; menambahkan remote saja belum
menyatukan history dan belum mempublikasikan implementasi A+B.

Bagian berikut menjelaskan pembuatan repository baru bila proyek disiapkan ulang;
akun/repository yang sudah tersedia tidak perlu dibuat ulang.

1. Login/daftar di https://github.com.
2. Buka https://github.com/new.
3. Nama repository: `guardian-wallet` (atau nama tim yang disepakati).
4. Pilih **Public** untuk akses juri sesuai rencana submission.
5. Buat repository **kosong**: jangan tambahkan README, .gitignore, atau license dari
   GitHub karena proyek lokal sudah mempunyai riwayat dan file awal.
6. Salin URL HTTPS, misalnya `https://github.com/NAMA/guardian-wallet.git`.

Di terminal VS Code dengan folder `C:\ProjetLomba\guardian-wallet` terbuka:

```powershell
npm.cmd run setup:services -- --only github
git remote -v
git branch --show-current
```

Wizard hanya memasang remote `origin`; tidak melakukan commit/push atau mengganti
branch. Jika origin sudah berbeda, wizard mempertahankannya. Untuk autentikasi GitHub
di VS Code gunakan menu Accounts → Sign in to GitHub ketika diminta.

URL repository boleh diberikan melalui chat. Password, personal access token dan
private key diisi langsung di komputer atau dashboard layanan.

## 3. Buat PostgreSQL di Supabase

1. Login melalui https://supabase.com/dashboard dan buat project `guardian-wallet`.
2. Pilih organisasi, buat password database, dan simpan password tersebut di tempat
   pribadi. Pilih region dekat backend.
3. Tunggu database aktif, kemudian klik **Connect**.
4. Untuk Windows/jaringan IPv4, pilih **Session pooler** pada port **5432**. Salin
   host, user dan port dari Connect; jangan menebak nama host dari region.
5. Ganti `[YOUR-PASSWORD]` pada URI dengan password database. Karakter seperti `@`,
   `#`, `?`, `&`, `/` pada password harus percent-encoded. Ini password database,
   bukan password login akun Supabase atau anon/publishable key.
6. Gunakan SSL (`?sslmode=require`, atau konfigurasi verifikasi sertifikat yang sesuai
   bila sudah disiapkan). Untuk migration, direct connection adalah rekomendasi
   Supabase; session pooler menjadi jalur IPv4 bila direct IPv6 tidak bisa diakses.

Contoh **format saja**, bukan nilai yang bisa langsung dipakai:

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@HOST_DARI_CONNECT:5432/postgres?sslmode=require
```

Masukkan URI tanpa menampilkannya dalam command history:

```powershell
npm.cmd run setup:services -- --only supabase
npm.cmd run services:check -- --network
```

Input connection string disembunyikan. Wizard menyimpannya di
`packages/database/.env` dan `apps/worker/.env`. API finansial baru diberi DB URL
setelah alamat owner, Kernel account, Guardian dan execution RPC lengkap, agar web/
health tetap dapat dijalankan selama setup.

Setelah koneksi lolos dan DB tersebut memang project baru yang dituju:

```powershell
npm.cmd run build:packages
npm.cmd run db:migrate
```

Jika connection check gagal karena password belum URL-encoded (`URI malformed`),
gunakan input password terpisah:

```powershell
npm.cmd run setup:database-password
npm.cmd run services:check -- --network
```

Masukkan password database **asli** pada prompt tersembunyi; tool meng-encode-nya
tepat sekali pada URI lokal yang sudah ada. Nilai password tidak masuk argumen atau
command history. Tool tidak menebak password dan tidak mengubah host/user/port.

Jangan gunakan connection URI database pada variabel `NEXT_PUBLIC_*`. Browser memakai
API Fastify; tabel task/operasi berisi data internal server, bukan Data API publik.

## 4. Siapkan Qwen lokal melalui Ollama

Model terpasang yang terdeteksi: `qwen3:8b` (Q4_K_M) dan `qwen2.5-coder:7b`.
Planner memakai **qwen3:8b**. Pastikan Ollama berjalan, lalu jalankan:

```powershell
ollama list
npm.cmd run setup:services -- --only qwen
npm.cmd run services:check -- --network
npm.cmd run model:check
```

Konfigurasi API lokal telah diisi:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
AI_MODEL_ID=qwen3:8b
AI_REQUEST_TIMEOUT_MS=45000
AI_CONTEXT_TOKENS=4096
```

Planner menggunakan native `/api/chat`, JSON schema + validasi Zod, `think=false`,
temperature 0, maksimum 256 output tokens, satu inference aktif dan antrean terbatas.
Model tetap hangat selama 10 menit. `AI_PROVIDER=baseline` memilih baseline
deterministik secara eksplisit. Server model yang tidak tersedia menghasilkan error;
tidak ada fallback diam-diam yang diberi label AI live.

`services:check --network` membaca `/api/tags`, sedangkan `model:check` menjalankan
uji live dengan data sintetis dan tidak mengirim transaksi. Laporan terakhir ada di
[bukti Qwen lokal](evidence/qwen-local-evaluation.json): 4/4 smoke cases, cold request
10.235 ms, dua respons planner hangat 567 dan 1.041 ms pada RTX 4060 Laptop 8 GB.
Ini pengamatan terbatas, bukan jaminan latensi seluruh workload atau ketahanan universal.

Saat API ditempatkan di Railway, `127.0.0.1` menunjuk container Railway. Gunakan
endpoint Qwen self-hosted yang dapat dijangkau backend melalui koneksi terproteksi,
dan set `OLLAMA_BASE_URL` ke endpoint tersebut. `OLLAMA_API_TOKEN` tersedia untuk
gateway yang memakai bearer authentication. Token tidak diperlukan untuk Ollama lokal.

## 5. Siapkan ZeroDev dan execution RPC

1. Login di https://dashboard.zerodev.app dan buat project Guardian Wallet.
2. Pilih **Base Sepolia**, chain ID **84532**.
3. Salin **project RPC/bundler URL** persis dari dashboard. Endpoint yang kita perlukan
   mendukung `eth_sendUserOperation` dan EntryPoint 0.7, bukan hanya explorer URL.
4. Execution RPC awal dapat memakai `https://sepolia.base.org`. Bundler RPC dan
   execution RPC adalah dua kebutuhan berbeda pada worker.
5. Jalankan:

```powershell
npm.cmd run setup:services -- --only zerodev
npm.cmd run services:check -- --network
```

Pemeriksa membaca chain ID dan `eth_supportedEntryPoints` tanpa mengirim transaksi.
RPC key/project URL disembunyikan pada input dan tidak ditampilkan dalam hasil cek.
Paymaster bukan syarat fase awal; account memakai gas native terpisah dari MockUSD.
Status `entrypoint_0.7_supported` berarti pemeriksaan dukungan bundler **lolos**.
`gasPaymentMode=account_funded_native_eth` dan `gasSponsorship=not_used` menjelaskan
mode gas saat ini; transaksi memakai saldo ETH testnet pada smart account.
`transactionSubmission=not_checked_by_connection_test` berarti checker ini belum
mengirim UserOperation. Pembuktian transaksi dilakukan setelah wallet/izin siap.

## 6. Login Railway dan Vercel

CLI yang disiapkan: Vercel `64.3.1` dan Railway `5.69.0`, keduanya kompatibel dengan
Node.js yang terpasang. Perintah menggunakan npm exec/npx dan tidak memerlukan
instalasi global. Login harus dijalankan di terminal VS Code agar browser/OTP dapat
diselesaikan pemilik akun.

```powershell
npm.cmd run cloud:railway -- login --browserless
npm.cmd run cloud:railway -- whoami
npm.cmd run cloud:vercel -- login
npm.cmd run cloud:vercel -- whoami
```

Saat meminta verifikasi, buka URL yang diberikan CLI dan selesaikan login browser.
Credential disimpan oleh CLI masing-masing. Tidak perlu menyalin token ke chat.
Login belum membuat project atau men-deploy aplikasi.

### Railway: dua service dari repo yang sama

Setelah source di-commit/push melalui langkah Git yang disepakati:

1. Buat project Railway, hubungkan repo GitHub dan branch kerja yang akan diuji.
2. Service `guardian-api`: source root repository, Dockerfile root, variable
   `SERVICE=api`, `HOST=0.0.0.0`, dan variable API yang sesuai `apps/api/.env.example`.
   Railway menyediakan `PORT`. Generate domain publik dan pasang healthcheck `/health`.
3. Service `guardian-worker`: source yang sama, `SERVICE=worker`, variable worker yang
   sesuai `apps/worker/.env.example`. Mulai dengan `EXECUTION_ENABLED=false` sampai
   account/session sudah diotorisasi. Worker tidak memerlukan domain/HTTP healthcheck.
4. Database, token gateway model (jika dipakai), session key, dan deployer key mempunyai
   scope terpisah. Akses model hanya untuk API; key session hanya untuk worker.
5. Gunakan satu replica API selama auth masih in-memory. Hosted multi-process dan
   pooler akan diverifikasi sebelum memperluas deployment.

`Dockerfile`, `.dockerignore` dan `railway.json` sudah disiapkan untuk API/worker.
Build container/deployment belum diverifikasi tanpa Docker atau akses Railway.

### Vercel: web

1. Import repository di https://vercel.com/new.
2. Pilih **Root Directory = `apps/web`** dan framework Next.js.
3. Aktifkan akses source di luar root directory untuk shared workspace monorepo.
4. `apps/web/vercel.json` membangun shared packages dari root lalu Next.js.
5. Set `NEXT_PUBLIC_API_URL` ke domain service Railway API yang sebenarnya.
6. Setelah domain web tersedia, set `WEB_ORIGIN` di API ke origin web tersebut,
   dan `AUTH_DOMAIN` ke hostname web. Deploy ulang konfigurasi yang berubah.

## 7. Wallet dan kontrak setelah koneksi layanan siap

Panduan pemula MetaMask, Base Sepolia, alamat owner dan faucet:
[Setup wallet](SETUP_WALLET.md).

Owner menggunakan wallet browser. Alamat owner publik dapat dimasukkan melalui:

```powershell
npm.cmd run setup:services -- --only wallet
```

Alamat Kernel account dan Guardian baru diisi setelah deployment. Deployer private
key disimpan melalui Hardhat keystore; session credential hanya dibuat untuk worker.
Login ke ZeroDev saja tidak menghasilkan account, session authorization atau token.
Jangan memakai alamat/hashes fork lokal sebagai alamat deployment publik.

Langkah lengkap wallet ada di [handoff A+B](ab-handoff.md). Faucet testnet mengikuti
daftar resmi Base: https://docs.base.org/base-chain/tools/network-faucets.

## 8. Ringkasan pemeriksaan

```powershell
npm.cmd run services:check
npm.cmd run services:check -- --network
```

Hasil hanya mencetak status, bukan nilai credential. `--network` melakukan SELECT 1,
GET model metadata dan JSON-RPC read-only. Ia tidak membuat resource, menjalankan
inference, menandatangani atau mengirim transaksi. Opsi `--strict` memberikan
exit code gagal bila konfigurasi dasar atau pemeriksaan jaringan belum lolos.

Status `qwen_model_available_inference_not_verified` berarti model terdaftar pada
Ollama; hasil inference live dicatat oleh `model:check`. Status `pending_deployment` adalah normal
sampai kontrak/account dibuat. File `.env` dan metadata `.local/` diabaikan Git dan
dikecualikan dari Docker build context.

## Referensi yang diperiksa

- Supabase connection modes: https://supabase.com/docs/guides/database/connecting-to-postgres
- Railway CLI: https://docs.railway.com/guides/cli
- Vercel login: https://vercel.com/docs/cli/login
- ZeroDev quickstart: https://docs.zerodev.app/get-started/quickstart
- Ollama structured outputs: https://docs.ollama.com/capabilities/structured-outputs
