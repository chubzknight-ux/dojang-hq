# Perekam video panduan

Merekam video panduan langsung dari aplikasi yang sungguh berjalan: `server.mjs` menjalankan kode API asli (`functions/api`) dengan database SQLite di memori dan data contoh, lalu Playwright merekam layar dengan keterangan dan kursor.

```bash
# 1) jalankan server contoh (Node 22+), mis. untuk repo SaaS
node --experimental-sqlite server.mjs /path/ke/dojang-hq-saas saas 8788 &
# 2) rekam semua skenario (atau tambahkan nama sebagian, mis. 04 05)
NODE_PATH=$(npm root -g) node --experimental-sqlite record.mjs saas 8788 ./out
# 3) kecilkan ukuran + buat poster (ffmpeg)
for f in out/*.webm; do ffmpeg -i $f -c:v libvpx-vp9 -crf 38 -b:v 0 -an ${f%.webm}.small.webm; done
```
Untuk repo Dojang HQ pribadi pakai `hq` sebagai varian (skenario khusus SaaS dilewati). Hasil taruh di folder `panduan/` repo (nama berkas dipakai halaman Panduan).
