# Wallet owner dan Base Sepolia

Tahap ini memerlukan interaksi Anda di browser: memasang extension, membuat wallet
dan menyimpan recovery material pribadi. Setelah itu agent dapat memeriksa alamat/
saldo publik dan menyiapkan deployment. Tidak ada wallet atau private key yang
dibuatkan diam-diam oleh aplikasi.

## 1. Buat wallet owner

1. Buka https://metamask.io/download melalui browser Chrome/Edge/Firefox yang akan
   dipakai untuk dashboard.
2. Pilih **Browser Extension**, lalu pasang extension untuk browser tersebut.
3. Buka MetaMask dan pilih **Create a new wallet**; ikuti proses pembuatan wallet.
4. Simpan password/recovery material secara pribadi. Yang diperlukan proyek/chat
   hanya **alamat publik**: `0x` diikuti 40 karakter hex.
5. Gunakan account baru ini untuk demonstrasi testnet. Account pertama menjadi owner
   yang menetapkan policy dan menandatangani izin session.

## 2. Tambahkan Base Sepolia

Di daftar jaringan MetaMask, gunakan **Add a custom network** bila Base Sepolia
belum tersedia. Nama menu dapat berbeda antar versi extension.

| Field | Nilai |
| --- | --- |
| Network name | Base Sepolia |
| RPC URL | `https://sepolia.base.org` |
| Chain ID | `84532` |
| Currency symbol | `ETH` |
| Block explorer | `https://sepolia.basescan.org` |

Simpan, lalu pilih jaringan **Base Sepolia**. Detail ini sesuai dokumentasi resmi:
https://docs.base.org/base-chain/quickstart/connecting-to-base.

## 3. Salin alamat publik

Klik nama/alamat account di MetaMask untuk menyalinnya. Alamat dapat diberikan ke
agent melalui chat untuk disimpan sebagai OWNER_ADDRESS dan diperiksa saldo
testnet-nya. Recovery phrase, password, private key atau file keystore tetap lokal.

Jika ingin mengisi sendiri dari terminal VS Code di root proyek:

```powershell
npm.cmd run setup:services -- --only wallet
```

Isi **alamat owner**. Alamat Kernel dan Guardian dapat dilewati dengan Enter sampai
keduanya benar-benar di-deploy. Ketiganya berbeda:

- **Owner:** account MetaMask Anda, menandatangani konfigurasi dan izin.
- **Kernel:** smart account yang akan memegang MockUSD/gas dan menjalankan pembayaran.
- **Guardian:** kontrak executor module yang menegakkan policy.

## 4. Isi ETH testnet

**Update:** project ZeroDev sekarang memberikan kutipan bootstrap bersponsor.
Gunakan [Sponsored Setup](SPONSORED_SETUP.md) dan halaman `/setup` untuk jalur owner
yang dapat bersaldo ETH nol. Bagian faucet di bawah menyimpan hasil troubleshooting;
pengisian saldo native bukan syarat untuk UserOperation yang mendapat sponsor.

Di terminal VS Code pada root repository, jalankan `npm.cmd run owner:setup`, lalu
buka **http://localhost:3000/setup** di browser yang memiliki MetaMask.

Gas memakai **ETH pada jaringan Base Sepolia**. Halaman
https://faucets.chain.link/base-sepolia menampilkan faucet native ETH, tetapi klaim
wallet proyek ditolak karena mensyaratkan minimal **1 LINK di Ethereum Mainnet**.
Karena itu faucet tersebut bukan jalur pendanaan yang tersedia untuk wallet ini.

Quicknode menolak wallet proyek ini dengan pesan **Invalid ETH mainnet balance**;
halaman yang aktif tidak membuktikan wallet baru memenuhi syarat. Tautan CDP portal
sebelumnya juga menghasilkan Page not found bagi pengguna. Keduanya tidak dipakai
sebagai jalur utama. Kita mencari gas testnet gratis tanpa mengisi mainnet hanya
untuk memenuhi syarat faucet. Dokumentasi funding Base:
https://docs.base.org/base-chain/tools/network-faucets.

### Pemeriksaan sponsor gas ZeroDev

```powershell
npm.cmd run wallet:sponsorship
```

Probe menggunakan alamat owner publik, signature stub dan `shouldConsume=false`.
Ia tidak mengirim transaksi, membuat account, atau meminta private key owner.
Pemeriksaan awal menemukan `policyMissing=true`; setelah policy diaktifkan, kutipan
berhasil diperoleh. Buka project ZeroDev → **Gas Policies**
→ pilih **Base Sepolia** → konfigurasi gas sponsorship. Dokumentasi resminya:
https://docs.zerodev.app/get-started/sdks/setup-project.

Kutipan yang berhasil menghasilkan `testnet_sponsorship_quote_available`; itu belum
membuktikan deployment berhasil atau menjamin layanan gratis. Kuota/gas credit/billing
mengikuti plan akun. Paymaster membayar gas UserOperation; ia tidak menambah saldo
ETH pada MetaMask. Jalur bootstrap/worker bersponsor kini terimplementasi dan diuji
pada fork. Aktivasi runtime dilakukan setelah tanda tangan owner dan verifikasi
deployment, sesuai [panduan sponsored setup](SPONSORED_SETUP.md).

Saldo ETH dan token uji adalah hal berbeda. MockUSD akan disiapkan dalam deployment;
saldo MockUSD tidak membayar native gas. Setelah faucet berhasil:

```powershell
npm.cmd run wallet:check
```

Perintah ini membaca chain ID, alamat, saldo dan code dari satu block. Ia tidak
menandatangani atau mengirim transaksi. Saldo nonzero belum membuktikan cukup untuk
semua deployment; estimasi gas akan diperiksa pada tahap deployment.

## 5. Deployer dan session

Deployment menggunakan credential terpisah dari runtime agent. Hardhat sudah
mendukung keystore terenkripsi. Deployer belum dikonfigurasi di workspace ini.
Owner tetap menandatangani perubahan izin melalui wallet/alat owner lokal, sementara
worker menerima session key yang dibatasi. Langkah keystore/deployment dilakukan
setelah alamat dan saldo testnet tersedia.

Status `pending_wallet_setup`, `pending_deployment` dan worker disabled normal selama
tahap ini. Target berikutnya: Guardian + MockUSD, Kernel account, funding account,
otorisasi session, lalu transaksi publik yang receipt-nya dapat diperiksa.
