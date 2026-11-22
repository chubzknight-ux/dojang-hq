// Merekam video panduan.  Pakai:
//   node --experimental-sqlite server.mjs <repo> <hq|saas> 8788 &
//   NODE_PATH=$(npm root -g) node record.mjs <hq|saas> 8788 <folder-keluar> [nama-skenario...]
import { chromium, newRec, cap, nocap, tap, typeIn, finish, sleep, smoothScroll } from "./rec.mjs";
import { seedSaas, seedHq, seedPr, ensureBilling, makeClaimedInvoice } from "./seed.mjs";

const [variant = "saas", port = "8788", outDir = "./out", ...only] = process.argv.slice(2);
const base = "http://localhost:" + port, SAAS = variant === "saas";
const seed = await (SAAS ? seedSaas : seedHq)(base);
await seedPr(base, seed.H);
const adminInit = SAAS ? { dojang_atok: seed.token, dojang_gate: "admin" } : { dojang_pin: seed.token, dojang_last_act: String(Date.now()) };
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const D = { w: 1000, h: 640, dir: outDir + "/_tmp" };
const M = { w: 390, h: 780, dir: outDir + "/_tmp", cs: "15px" };
const S = {};
const NAV = v => `nav button[data-v=${v}]`;

// 1) Masuk & Dashboard
S["01-masuk-dan-dashboard"] = async () => {
  const rc = await newRec(browser, { ...D });
  const p = rc.page;
  await p.goto(base + "/"); await sleep(700);
  await cap(p, "Buka alamat aplikasi dojang Anda. Layar pembuka muncul sebentar saat memuat.", "LANGKAH 1", 2600);
  await p.waitForSelector("#pinInp");
  await cap(p, SAAS ? "Pilih tab “Kepala Pelatih / Admin”, lalu isi nama pengguna dan PIN" : "Pilih tab “Admin”, lalu ketik PIN admin", "LANGKAH 2", 1900);
  if (SAAS) await typeIn(p, "#usrInp", "garuda");
  await typeIn(p, "#pinInp", SAAS ? "demo1234" : "demo-pin-2026");
  await tap(p, "#pinBtn", { after: 1800 });
  await p.waitForSelector(NAV("dash"));
  await cap(p, "Dashboard: jumlah murid, kehadiran terakhir, iuran bulan ini, dan jadwal kelas berikutnya", "LANGKAH 3", 3600);
  await smoothScroll(p, 520, 1800);
  await cap(p, "Gulir ke bawah untuk melihat sebaran sabuk dan murid yang siap diuji", null, 3000);
  await smoothScroll(p, -520, 1000);
  await cap(p, "Punya beberapa cabang? Pilih unit di kiri atas untuk melihat data per cabang", "LANGKAH 4", 2200);
  await p.selectOption("#unitSel", { label: /Cabang Timur/ }).catch(async () => { await p.selectOption("#unitSel", "Cabang Timur").catch(() => {}); });
  await sleep(1800);
  await cap(p, "Menu di kiri (di HP: bar bawah) untuk pindah antar fitur. Selesai! 🎉", null, 3000);
  return rc;
};

// 2) Murid & Absensi
S["02-murid-dan-absensi"] = async () => {
  const rc = await newRec(browser, { ...D, init: adminInit });
  const p = rc.page;
  await p.goto(base + "/"); await p.waitForSelector(NAV("mur")); await sleep(900);
  await tap(p, NAV("mur"), { after: 900 });
  await cap(p, "Menu Murid: daftar semua murid beserta sabuk dan unitnya", "MURID", 2600);
  await typeIn(p, "#fSearchInp", "alya"); await cap(p, "Cari murid dengan mengetik namanya", null, 1800);
  await p.fill("#fSearchInp", ""); await p.dispatchEvent("#fSearchInp", "input"); await sleep(500);
  await tap(p, "button[data-a=add]", { after: 700 });
  await cap(p, "Tekan “Tambah murid”, lalu isi datanya", null, 2000);
  await typeIn(p, "#fn", "Citra Maharani", { delay: 60 });
  await p.selectOption("#fgender", { index: 2 }).catch(() => {}); await sleep(500);
  await typeIn(p, "#fortu", "Ibu Dewi", { delay: 60 });
  await typeIn(p, "#fu", "Utama", { delay: 60 });
  await typeIn(p, "#fw", "081234567890", { delay: 50 });
  await cap(p, "Nomor WhatsApp orang tua dipakai untuk menyalin pesan tagihan & laporan", null, 2600);
  await tap(p, "button[data-a=save]", { after: 1400 });
  await cap(p, "Murid tersimpan. Tombol 🔗 Portal menyalin tautan untuk orang tua, 🏆 Champion untuk latihan PR", null, 3600);
  await tap(p, NAV("abs"), { after: 900 });
  await cap(p, "Menu Absensi: pilih tanggal, lalu centang murid yang hadir", "ABSENSI", 3000);
  for (const i of [0, 1, 2, 4]) await tap(p, "input[data-ab]", { nth: i, after: 450 });
  await cap(p, "Tersimpan otomatis. Tanpa sinyal pun aman: dikirim sendiri saat online kembali", null, 3400);
  await tap(p, "button[data-a=copyAttRep]", { after: 700 });
  await cap(p, "“Salin Ringkasan WA” membuat rekap kehadiran siap kirim ke grup", null, 2800);
  return rc;
};

// 3) Iuran, Pengumuman, Ringkasan bulanan
S["03-iuran-pengumuman-ringkasan"] = async () => {
  const rc = await newRec(browser, { ...D, init: adminInit });
  const p = rc.page;
  await p.goto(base + "/"); await p.waitForSelector(NAV("iur")); await sleep(900);
  await tap(p, NAV("iur"), { after: 900 });
  await cap(p, "Menu Iuran: tabel pembayaran per murid per bulan", "IURAN", 2800);
  const cb = p.locator("#app input[type=checkbox]");
  for (const i of [0, 1, 3]) await tap(p, "#app input[type=checkbox]", { nth: i, after: 500 }).catch(() => {});
  await cap(p, "Centang murid yang sudah membayar. Tarif diatur per unit di menu Jadwal & Unit", null, 3400);
  await tap(p, NAV("umum"), { after: 900 });
  await cap(p, "Menu Pengumuman: kabar untuk orang tua dan pelatih", "PENGUMUMAN", 2800);
  await typeIn(p, "#umJudul", "Libur latihan 25 Desember", { delay: 55 });
  await typeIn(p, "#app textarea", "Latihan libur Natal. Latihan lagi hari Sabtu 27 Desember pukul 08.00.", { delay: 35 });
  await p.fill("#umMulai", "2026-11-22"); await p.fill("#umSampai", "2026-12-31"); await sleep(700);
  await cap(p, "Atur tanggal tayang dan unit tujuan (semua unit atau satu unit)", null, 2600);
  await tap(p, "button[data-a=umSave]", { after: 1400 });
  await cap(p, "Pengumuman tampil di Dashboard dan Portal Orang Tua sesuai tanggal tayang", null, 3200);
  await tap(p, NAV("rkp"), { after: 1000 });
  await cap(p, "Ringkasan bulanan: murid baru, iuran masuk, kehadiran per unit, dan naik sabuk", "RINGKASAN", 3600);
  await tap(p, "button[data-a=rkpCopy]", { after: 700 });
  await cap(p, "Salin untuk WhatsApp atau unduh CSV. Hanya Admin yang melihatnya karena memuat iuran", null, 3200);
  return rc;
};

// 4) Portal Orang Tua
S["04-portal-orang-tua"] = async () => {
  const rc = await newRec(browser, { ...M });
  const p = rc.page;
  await p.goto(base + "/?portal=alya-putri" + (SAAS ? "&club=garuda" : "")); await p.waitForSelector("#pvName"); await sleep(600);
  await cap(p, "Orang tua membuka tautan Portal yang dikirim dari menu Murid (🔗 Portal)", "PORTAL ORANG TUA", 3200);
  await typeIn(p, "#pvName", "Alya", { delay: 110 });
  await cap(p, "Demi keamanan, cukup ketik nama anak. Hanya sekali per HP", null, 2600);
  await tap(p, "#pvBtn", { after: 2200 });
  await p.waitForSelector(".hero");
  await cap(p, "Terbuka! Progres sabuk, kehadiran, dan skor latihan anak", null, 3000);
  await smoothScroll(p, 520, 1700); await cap(p, "Nilai keterampilan dan catatan dari pelatih", null, 2600);
  await smoothScroll(p, 560, 1700); await cap(p, "Status iuran, jadwal kelas, dan pengumuman dari dojang", null, 2800);
  await smoothScroll(p, 600, 1700); await sleep(1200);
  await smoothScroll(p, -1500, 2200);
  await cap(p, "Tombol 🏆 Champion membuka latihan PR di rumah untuk anak", null, 3200);
  return rc;
};

// 5) Champion: pelatih mengatur PR, lalu anak berlatih
S["05-champion"] = async () => {
  const rc = await newRec(browser, { ...M, init: adminInit });
  const p = rc.page;
  await p.goto(base + "/champion?pelatih=1"); await p.waitForSelector("#gMode"); await sleep(900);
  await cap(p, "Pelatih / admin: buka menu 🏆 Champion (PR) untuk mengatur latihan di rumah", "CHAMPION · PELATIH", 3200);
  await smoothScroll(p, 330, 1200);
  await cap(p, "Lihat siapa yang sudah dan belum latihan hari ini, lalu kirim rekap ke WhatsApp", null, 3200);
  await smoothScroll(p, 520, 1400);
  await cap(p, "Pilih PR: sama untuk semua, atau 🎲 acak per anak (tiap anak dapat latihan berbeda)", null, 3600);
  await p.selectOption("#gMode", { index: 1 }).catch(() => {}); await sleep(900);
  await cap(p, "Atur jumlah latihan per anak, lalu 💾 Simpan PR dan 📢 umumkan ke orang tua", null, 3400);
  await nocap(p);
  // bagian anak
  await p.evaluate(() => { try { localStorage.removeItem("dojang_atok"); localStorage.removeItem("dojang_pin"); } catch (e) {} });
  await p.goto(base + "/champion?id=alya-putri"); await p.waitForSelector("#slName"); await sleep(700);
  await cap(p, "Anak / murid: buka tautan Champion, lalu ketik namanya sendiri", "CHAMPION · ANAK", 3000);
  await typeIn(p, "#slName", "Alya Putri", { delay: 90 });
  await tap(p, "#slGo", { after: 2500 });
  await cap(p, "Beranda Champion: bintang, hari beruntun, dan PR dari pelatih khusus untuknya", null, 3600);
  await p.screenshot({ path: outDir + "/_dbg_champ_home.png" });
  return rc;
};

// 6) Akun pelatih: admin membuat akun, pelatih masuk
S["06-akun-pelatih"] = async () => {
  const rc = await newRec(browser, { ...D, init: adminInit });
  const p = rc.page;
  await p.goto(base + "/"); await p.waitForSelector(NAV("pel")); await sleep(900);
  await tap(p, NAV("pel"), { after: 1000 });
  await cap(p, "Menu Pelatih: kelola profil pelatih dan akun login mereka", "AKUN PELATIH", 3000);
  await p.locator("#stfName").scrollIntoViewIfNeeded(); await sleep(700);
  await cap(p, "Buat akun: isi nama, nama pengguna, dan kata sandi (min. 8 karakter, huruf + angka)", null, 3400);
  await typeIn(p, "#stfName", "Sabeum Budi", { delay: 60 });
  await typeIn(p, "#stfUser", "budi", { delay: 70 });
  await typeIn(p, "#stfPass", "Ksatria2026", { delay: 70 });
  await tap(p, "#stfPA", { after: 500 }); await tap(p, "#stfPN", { after: 500 });
  await cap(p, "Beri izin: centang Absensi dan/atau Penilaian. Tanpa izin, pelatih hanya bisa melihat", null, 3600);
  await tap(p, "button[data-a=stfSave]", { after: 1600 });
  await cap(p, "Akun dibuat. Bagikan nama pengguna & kata sandi lewat WhatsApp. Pelatih juga bisa daftar sendiri lewat tautan lalu Anda setujui", null, 4400);
  await tap(p, "#logoutBtn", { after: 1800 });
  await p.waitForSelector("button[data-gate=coach]");
  await cap(p, "Pelatih masuk lewat tab “Pelatih”", "PELATIH MASUK", 2400);
  await tap(p, "button[data-gate=coach]", { after: 600 });
  if (SAAS) await typeIn(p, "#clubInp", "garuda", { delay: 70 });
  await typeIn(p, "#usrInp", "budi", { delay: 70 });
  await typeIn(p, "#pinInp", "Ksatria2026", { delay: 70 });
  await tap(p, "#pinBtn", { after: 2400 });
  await cap(p, "Saat pertama masuk, pelatih diminta mengganti kata sandi awal dengan miliknya sendiri", null, 3600);
  await typeIn(p, 'input[placeholder^="Kata sandi lama"]', "Ksatria2026", { delay: 60 });
  await typeIn(p, 'input[placeholder^="Kata sandi baru"]', "SabukHitam88", { delay: 60 });
  await tap(p, 'button:has-text("Simpan"):visible', { after: 1800 });
  await cap(p, "Pelatih hanya melihat murid di unitnya, tanpa nomor WA atau data iuran", null, 3800);
  await tap(p, NAV("abs"), { after: 1000 });
  await cap(p, "Mengisi absensi dan penilaian sesuai izin yang diberikan. Selesai! 🎉", null, 3200);
  return rc;
};

if (SAAS) {
// 7) Super Admin: klien baru + pembayaran manual
S["07-super-admin-klien-dan-pembayaran"] = async () => {
  const rc = await newRec(browser, { ...D });
  const p = rc.page;
  await p.goto(base + "/"); await p.waitForSelector("#usrInp"); await sleep(700);
  await cap(p, "Pemilik platform masuk dengan akun Super Admin", "SUPER ADMIN", 2400);
  await typeIn(p, "#usrInp", "superadmin", { delay: 60 });
  await typeIn(p, "#pinInp", "demo-super-2026", { delay: 60 });
  await tap(p, "#pinBtn", { after: 2000 });
  await p.waitForSelector("button[data-a=newClub]");
  await cap(p, "Panel Super Admin: semua dojang klien, masa aktif, dan jumlah murid mereka", null, 3200);
  await tap(p, "button[data-a=newClub]", { after: 800 });
  await cap(p, "Tambah dojang klien baru: nama, kode, username & PIN admin, pelatih utama", null, 3000);
  await typeIn(p, "#sc_name", "Naga Emas Taekwondo", { delay: 50 });
  await typeIn(p, "#sc_id", "nagaemas", { delay: 50 });
  await typeIn(p, "#sc_user", "nagaemas", { delay: 50 });
  await typeIn(p, "#sc_pin", "naga2026", { delay: 50 });
  await typeIn(p, "#sc_hc", "Sabeum Naga", { delay: 50 });
  await p.fill("#sc_exp", "2027-11-22"); await sleep(600);
  await cap(p, "Atur paket dan tanggal masa aktif langganan", null, 2600);
  await tap(p, "button[data-a=saveClub]", { after: 1800 });
  await cap(p, "Klien tersimpan. Tombol +1 Bln / +1 Thn memperpanjang cepat, 📲 Tagih WA mengirim tautan bayar", null, 4200);
  await tap(p, NAV("pay"), { after: 1200 });
  await cap(p, "Menu Pembayaran: atur paket, harga, dan rekening / QRIS tujuan transfer", "PEMBAYARAN", 3400);
  await tap(p, "button[data-bill=addplan]", { after: 500 });
  await typeIn(p, "[data-plrow] [data-f=name]", "Starter", { nth: 0, delay: 60 }).catch(() => {});
  await typeIn(p, "[data-plrow] [data-f=price]", "100000", { nth: 0, delay: 60 }).catch(() => {});
  await typeIn(p, "#bl_d12", "10", { delay: 80 });
  await typeIn(p, "#bl_bank", "BCA", { delay: 70 });
  await typeIn(p, "#bl_no", "1234567890", { delay: 50 });
  await typeIn(p, "#bl_an", "PT Dojang Digital", { delay: 50 });
  await cap(p, "Isi paket, diskon durasi, dan rekening. Klien belum bisa membayar sebelum ini diisi", null, 3600);
  await tap(p, "button[data-bill=save]", { after: 1500 });
  await makeClaimedInvoice(base, "garuda", "starter", 3);
  await tap(p, NAV("sa"), { after: 600 }); await tap(p, NAV("pay"), { after: 1400 });
  await p.locator("text=Tagihan").first().scrollIntoViewIfNeeded().catch(() => {});
  await smoothScroll(p, 700, 1500);
  await cap(p, "Tagihan dari klien muncul di sini. Cocokkan nominal (termasuk 3 angka unik) dengan mutasi rekening", null, 4200);
  await tap(p, "button[data-bill=confirm]", { after: 700 });
  await cap(p, "Tekan Konfirmasi dua kali untuk memastikan. Masa aktif klien langsung bertambah", null, 3600);
  await tap(p, "button[data-bill=confirm]", { after: 1800 });
  await cap(p, "Pembayaran tunai atau di luar sistem bisa dicatat di bagian paling bawah. Selesai! 🎉", null, 3400);
  return rc;
};

// 8) Admin klub: perpanjang langganan
S["08-langganan-bayar"] = async () => {
  await ensureBilling(base);
  const rc = await newRec(browser, { ...D, init: adminInit });
  const p = rc.page;
  await p.goto(base + "/"); await p.waitForSelector(NAV("lgn")); await sleep(900);
  await tap(p, NAV("lgn"), { after: 1400 });
  await cap(p, "Menu Langganan: lihat masa aktif dan perpanjang kapan saja", "LANGGANAN", 3200);
  await tap(p, "input[name=pay_plan][value=pro]", { after: 700 });
  await cap(p, "1. Pilih paket", null, 1800);
  await tap(p, "button[data-m=\"12\"]", { after: 700 });
  await cap(p, "2. Pilih durasi. Makin lama makin hemat", null, 2400);
  await typeIn(p, "#pay_name", "Sabeum Andi", { delay: 70 });
  await cap(p, "3. Tekan “Buat tagihan transfer”", null, 1800);
  await tap(p, "button[data-a=pay]", { after: 1600 });
  await cap(p, "Transfer tepat sesuai nominal (termasuk 3 angka unik) ke rekening atau scan QRIS", null, 4200);
  await tap(p, "#pay_note", { after: 200 }); await typeIn(p, "#pay_note", "a/n Sabeum Andi", { delay: 70 });
  await tap(p, "button[data-a=claim]", { after: 1500 });
  await cap(p, "Tekan “Saya sudah transfer”. Pengelola mengecek, lalu masa aktif otomatis bertambah", null, 4200);
  return rc;
};
}

const names = Object.keys(S).filter(n => !only.length || only.some(o => n.includes(o)));
import fs from "node:fs"; fs.mkdirSync(outDir, { recursive: true });
for (const n of names) {
  console.log("▶", n);
  try { const rc = await S[n](); await finish(rc, `${outDir}/${n}.webm`); }
  catch (e) { console.log("  GAGAL", n, e.message.split("\n")[0]); try { await globalThis.__lastPage.screenshot({ path: (process.env.REC_DBG || "/tmp") + "/_fail_" + n + ".png" }); } catch (x) {} }
}
await browser.close();
