# Setup Dojang HQ (Cloudflare Pages + D1)

Aplikasi ini terdiri dari satu halaman `index.html` dan kode server di `functions/api/*.js`.
Semuanya berjalan di Cloudflare Pages, datanya di database Cloudflare D1.

## 1. Database D1
1. Cloudflare dashboard → Storage & Databases → D1 SQL database → Create → nama `dojang-db`.
2. Buka database itu → tab Console → paste isi `schema.sql` → Execute.
   (Tabel `audit_log` untuk Riwayat Aktivitas dibuat otomatis oleh server.)

## 2. Project Pages
Workers & Pages → Create → Pages → hubungkan ke repo GitHub `dojang-hq` (cabang `main`).
Setiap perubahan di `main` otomatis di-deploy. Kalau tidak otomatis:
Workers & Pages → dojang-hq → Deployments → Retry deployment.

## 3. Bindings
Project `dojang-hq` → Settings → Bindings → Add:
- **D1 database**: Variable name `DB`, database `dojang-db` (wajib).
- **Workers AI**: Variable name `AI` (untuk Analisa Video mode AI Cloud; gratis dengan kuota harian).

## 4. Variabel (Settings → Variables and Secrets)
Pilih tipe **Secret** untuk semua PIN dan API key, jangan tipe Text.

| Nama | Wajib | Kegunaan |
|---|---|---|
| `DOJANG_PIN` | ya | PIN admin untuk membuka & mengubah data. Juga kunci link Portal Orang Tua. |
| `ANALYZE_PIN` | ya | Kunci akun pelatih & Analisa Video. **Isi sama dengan `DOJANG_PIN`.** |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | tidak | Kalau ingin Analisa Video AI Cloud memakai Gemini / Claude, bukan Workers AI. |
| `ANALYZE_PROVIDER` | tidak | `cf`, `gemini`, atau `claude` untuk memaksa pilihan layanan AI. |
| `CF_MODEL`, `GEMINI_MODEL`, `ANALYZE_MODEL` | tidak | Mengganti model AI bawaan. |

Catatan PIN:
- Tidak ada PIN bawaan. Kalau `DOJANG_PIN` dan `ANALYZE_PIN` kosong, admin tidak bisa masuk.
- Pakai PIN panjang (minimal 8 angka). **Jangan pakai `251025`**, karena PIN itu pernah tertulis di kode yang publik.
- `ADMIN_PIN` tidak dipakai lagi (menu Update App sudah dihapus) dan boleh dihapus.
- Mengganti `DOJANG_PIN` membuat semua orang tua harus mengetik nama anak lagi.
  Mengganti `ANALYZE_PIN` membuat semua pelatih harus masuk lagi.
- Setelah mengubah variabel, lakukan deploy ulang, lalu tutup dan buka lagi aplikasinya (kadang perlu dua kali).

## 5. Masuk ke aplikasi
- **Admin**: tab Admin → masukkan PIN. Terkunci otomatis setelah 12 jam tidak dipakai.
- **Pelatih**: tab Pelatih → Daftar. Akun baru baru bisa dipakai setelah admin menekan **Setujui**
  di menu Pelatih → Akun Login Pelatih. Kata sandi minimal 8 karakter, berisi huruf dan angka.
- **Orang tua**: buka link portal (`/?portal=ID`) lalu ketik nama anak sekali per HP
  (nama lengkap atau salah satu katanya, minimal 3 huruf). Berlaku 180 hari dan mencakup saudara kandung.
  Nomor WA pelatih di halaman profil pelatih hanya tampil di HP yang sudah membuka portal ini.

Salah PIN/kata sandi 15x dari satu jaringan dalam 15 menit akan diblokir sementara selama 15 menit.

## 6. Catatan fitur
- **Absensi & iuran** hanya mengirim centang yang berubah, jadi centang pelatih dan admin tidak saling menimpa.
  Kalau tidak ada sinyal, centang disimpan di HP (muncul tanda kuning "belum terkirim") dan dikirim otomatis saat online.
  Kalau server menolak, centang dikembalikan dan muncul pesan.
- **Tanggal lahir** murid (opsional): kalau diisi, usia dihitung otomatis setiap tahun.
- **Riwayat kenaikan sabuk** dicatat setiap kali murid diluluskan (mulai dari versi ini), tampil di Laporan murid dan Portal Orang Tua.
- **Pengumuman** (menu Pengumuman): tampil di Portal Orang Tua dan Dashboard selama tanggal berlaku, bisa untuk semua unit atau satu unit.
- **Ringkasan bulanan** (menu Ringkasan bulanan): murid baru, iuran masuk, kehadiran, naik sabuk, per unit; bisa disalin ke WA atau diunduh CSV.

## 7. Cadangan data
- Menu **Data → Unduh cadangan (.json)** secara berkala (aplikasi mengingatkan setiap 7 hari).
- Cloudflare D1 juga punya **Time Travel**: database bisa dikembalikan ke kondisi pada waktu tertentu
  dalam 7 hari terakhir (paket gratis) atau 30 hari (paket Workers Paid). Caranya lewat terminal:
  `npx wrangler d1 time-travel info dojang-db` (lihat titik waktu) dan
  `npx wrangler d1 time-travel restore dojang-db --timestamp=<waktu>` (mengembalikan seluruh database).
  Hati-hati: restore mengganti **semua** data ke kondisi saat itu.
- **Riwayat aktivitas** (menu Pelatih) mencatat setiap simpan & hapus data selama 90 hari, sehingga
  bisa dilihat kapan dan apa yang berubah.

## 8. Keamanan repo
Repo GitHub sebaiknya dijadikan **private** (GitHub → Settings → General → Danger Zone → Change visibility).
Deploy Cloudflare yang tersambung ke GitHub tetap berjalan walau repo private.
