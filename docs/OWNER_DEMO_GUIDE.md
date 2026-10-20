# Panduan Setup, Wallet, dan demo MetaMask

## Bedanya Setup dan Wallet

- **Setup (`/setup`)**: pekerjaan awal owner untuk deploy Kernel/Guardian/MockUSD,
  memasang policy, dan menandatangani delegasi terbatas untuk Astra.
- **Wallet (`/dashboard`)**: pemakaian sehari-hari untuk melihat saldo, meminta
  invoice layanan, meninjau pembayaran, menjalankan antrean, dan melihat bukti layanan.
- Connect MetaMask + sign-in hanya membuktikan identitas. Deployment dan delegasi
  membutuhkan tanda tangan terpisah. Jika setup sudah tersimpan, langsung buka Wallet.
- Setup memakai login coordinator lokal; Wallet memakai login payment API. Sesi
  masing-masing berlaku 15 menit dan dipulihkan setelah refresh pada tab yang sama
  jika akun, jaringan, masa berlaku, dan sesi server masih cocok. Restart server,
  sesi habis, pergantian akun, atau pergantian jaringan memerlukan login lagi.

**Already configured** berarti deployment/delegasi sebelumnya sudah tersimpan,
bukan langkah yang baru dilakukan saat halaman dibuka. Login saat ini ditunjukkan
terpisah sebagai **Signed in**.

## Arti checkbox invoice

Checkbox hanya memilih invoice yang **sudah ada** pada akun Kernel aktif untuk
dibuatkan preview, maksimal 10. Pilihan itu tidak membuat task baru atau membayar
otomatis. Klik **Preview … invoices**, tinjau hasilnya, lalu **Queue reviewed payments**.

Untuk menyewa database baru, klik **Rent a database**, kemudian **Ask wallet assistant**.
Tidak perlu mencentang invoice lama. Invoice kedaluwarsa dinonaktifkan; pilih task
di **Tasks and service evidence** lalu **Discard unsubmitted invoice** untuk melepas
komitmen antreannya. Pembatalan ditolak jika worker sudah memproses atau sudah ada
operation; pembayaran yang sudah dikirim harus direkonsiliasi.

## Urutan demo

Dari `C:\ProjetLomba\guardian-wallet-stage2`, jalankan runtime di satu terminal:

```powershell
npm.cmd run runtime:dev
```

Di terminal lain, jalankan frontend:

```powershell
npm.cmd run dev:web
```

Coordinator hanya diperlukan jika ingin mengelola deployment/delegasi:

```powershell
npm.cmd run onboarding
```

1. Buka `http://localhost:3000/dashboard`, connect owner pada Base Sepolia.
2. Periksa saldo dan pesan **Before running a payment**. Tombol
   **Refresh balances & checks (no AI)** tidak memerlukan inferensi model.
3. Minta database 1 MB selama 1 jam lewat wallet assistant.
4. Tinjau preview invoice 0,26 MockUSD, lalu **Queue reviewed payments**.
5. Klik **Start agent** jika antrean masih paused. Tombol ini mengaktifkan antrean;
   proses worker juga harus berjalan di terminal runtime.
6. Ikuti status sampai `completed`, kemudian jalankan **Verify database probe**
   dan **Write & read back**.

Bagian **Direct service request** membuat task yang langsung masuk antrean,
sedangkan wallet assistant membuat draft yang perlu di-queue setelah review.
Jika antrean sudah aktif, task dari Direct service request dapat langsung diproses.

## Jika demo berhenti

| Gejala | Arti dan tindakan |
| --- | --- |
| `TASK_NOT_FOUND` | Invoice tidak tersedia pada akun aktif. Refresh dan pilih invoice akun aktif atau minta quote baru. Daftar kini dibatasi pada chain/Kernel aktif. |
| Invoice expired / `EXPIRED_PLAN` | Invoice/plan terlalu lama. Buang invoice yang belum dikirim dan minta quote baru. |
| Daily payment budget habis | Batas pembayaran on-chain. Reset pukul **00:00 UTC / 07:00 WIB**; bukan kuota AI. |
| `QWEN_RATE_LIMITED` / `QWEN_DAILY_LIMIT` | Kuota/rate limit AI API. Ikuti waktu retry/reset; saldo dan risk checks tetap bisa dibaca tanpa AI. |
| Policy expired | Izin pembayaran owner kedaluwarsa. Login ulang tidak memperpanjang policy. |
| `planned` tidak berubah | Periksa terminal worker; Start agent bukan bukti proses worker hidup. Pastikan provider agent/signer juga berjalan. |
| `Cannot find package ... tsx` | Hentikan runtime lama, pastikan dependency terpasang dengan `npm.cmd install`, lalu jalankan ulang `npm.cmd run runtime:dev`. |

Diagnosis tanpa tanda tangan atau pengiriman transaksi:

```powershell
npm.cmd run wallet:diagnose
```

Tambahkan `-- --ai` untuk satu permintaan diagnosis model (menggunakan kuota API gratis):

```powershell
npm.cmd run wallet:diagnose -- --ai
```

Diagnosis menampilkan policy on-chain, komitmen antrean, invoice kedaluwarsa,
jumlah task akun lama, dan keterjangkauan provider. Kredensial tidak ditampilkan.
