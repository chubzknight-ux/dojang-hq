# Setup Dojang HQ dengan database D1 dan login

Folder ini untuk project Pages BARU. Jangan pakai folder dojang-web yang lama.

## 1. Buat database D1
1. Cloudflare dashboard → Storage & Databases → D1 SQL database → Create → nama `dojang-db`.
2. Buka database itu → tab Console → paste isi `schema.sql` → Execute.

## 2. Deploy ke Pages
Dari terminal, di folder induk folder ini:

    npx wrangler pages deploy dojang-web-d1 --project-name dojang-hq

Atau lewat dashboard: Workers & Pages → Create → Pages → Upload assets, lalu upload folder ini.
Folder `functions/` ikut terbawa dan menjadi API.

## 3. Hubungkan D1 ke Pages
Project `dojang-hq` → Settings → Bindings → Add → D1 database
- Variable name: `DB`
- Database: `dojang-db`

## 4. Isi email yang boleh mengubah data
Project `dojang-hq` → Settings → Environment variables → Add
- Name: `ALLOWED_EMAILS`
- Value: `email1@gmail.com,email2@gmail.com` (dipisah koma, huruf kecil)

Lalu deploy ulang (Deployments → Retry deployment, atau jalankan perintah deploy lagi).

## 5. Pasang login (Cloudflare Access)
Zero Trust (dash.cloudflare.com → Zero Trust) → Access → Applications → Add → Self-hosted
- Application domain: `dojang-hq.pages.dev`
- Policy: Allow → Include → Emails → daftar email pelatih dan pemilik
- Login: One-time PIN (kode dikirim ke email). Gratis untuk sampai 50 pengguna.

Setelah itu buka link, masukkan email, lalu masukkan kode yang dikirim.

## 6. Pindahkan data lama
1. Di versi claude.ai, menu Data → Unduh cadangan (.json).
2. Di versi web, menu Data → Impor, pilih file tadi.

## Catatan
- Data di web tersimpan di D1, bukan di browser, jadi sinkron antar HP.
- Halaman memperbarui data setiap 15 detik dan langsung setelah setiap simpan.
- Email yang login tapi tidak ada di ALLOWED_EMAILS hanya bisa melihat, tidak bisa menyimpan.

## Keamanan login (wajib dibaca sebelum deploy)
Variabel di Project `dojang-hq` → Settings → Environment variables:
- `DOJANG_PIN`: PIN admin untuk membuka & mengubah data. **Tidak ada lagi PIN bawaan.** Kalau `DOJANG_PIN` kosong, dipakai `ANALYZE_PIN`; kalau keduanya kosong, admin tidak bisa masuk.
- `ANALYZE_PIN`: dipakai untuk kelola akun pelatih & Analisa Video (sebaiknya sama dengan `DOJANG_PIN`).
- `ADMIN_PIN`: dipakai menu Update App.

Gunakan PIN yang panjang (minimal 8 angka) dan jangan pakai `251025`, karena PIN itu pernah tertulis di kode yang publik.
Salah PIN/kata sandi 15x dari satu jaringan dalam 15 menit akan diblokir sementara selama 15 menit.

Pelatih bisa mendaftar sendiri lewat tab **Pelatih → Daftar**. Akun baru tidak bisa dipakai sebelum admin menekan **Setujui** di menu Pelatih → Akun Login Pelatih.
