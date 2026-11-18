// Dojang HQ - Akun Pelatih (multi user)
// Super Admin = PIN admin yang sudah ada (ANALYZE_PIN). Pelatih = akun terpisah, hanya bisa MELIHAT laporan.
// Tabel D1: memakai tabel "docs" yang sama, koleksi "staff".

const J = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
});

const enc = new TextEncoder();
const ITER = 100000;               // batas maksimum PBKDF2 di Cloudflare Workers
const TOKEN_DAYS = 14;
const MAX_FAILS = 5;
const LOCK_MIN = 15;

const toB64 = u8 => { let s = ""; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64u = u8 => toB64(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => fromB64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function sha(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}
async function pbkdf2(pass, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(pass)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256));
}
async function hmacKey(env) {
  return crypto.subtle.importKey("raw", enc.encode("dojang-staff-v1|" + env.ANALYZE_PIN), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function isOwner(request, env) {
  const pin = request.headers.get("X-Dojang-Pin") || "";
  if (!env.ANALYZE_PIN || !pin) return false;
  return same(await sha(pin), await sha(env.ANALYZE_PIN));
}

export const slugName = s => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
const validSid = id => /^[A-Za-z0-9_-]{1,120}$/.test(id);
const permOf = u => ({ absen: !!(u && u.perm && u.perm.absen), nilai: !!(u && u.perm && u.perm.nilai) });

// Validasi lembar penilaian milik pelatih (dipakai juga oleh coach.js)
export function cleanEvalDoc(user, id, d) {
  if (!permOf(user).nilai) return { error: "Akun ini belum diberi izin mengisi penilaian.", status: 403 };
  if (!d || typeof d !== "object" || Array.isArray(d) || !d.ev || typeof d.ev !== "object" || Array.isArray(d.ev))
    return { error: "Data penilaian tidak valid.", status: 400 };
  if (JSON.stringify(d).length > 200000) return { error: "Data terlalu besar.", status: 413 };
  const m = /^(\d{4}-\d{2}-\d{2})__([A-Za-z0-9_-]{1,80})$/.exec(String(id || ""));
  if (!m || m[2] !== slugName(user.name)) return { error: "Anda hanya boleh mengisi lembar penilaian atas nama Anda sendiri.", status: 403 };
  const ev = {};
  for (const [sid, row] of Object.entries(d.ev)) {
    if (!validSid(sid) || !row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "n") o.n = clip(v, 600);
      else if (/^[a-z]{1,12}$/.test(k) && v !== "" && v != null) { const x = Number(v); if (x >= 1 && x <= 5) o[k] = Math.round(x); }
    }
    ev[sid] = o;
  }
  return { clean: { date: m[1], coach: user.name, updatedAt: clip(d.updatedAt, 20), ev } };
}

function cleanAttendance(user, id, d) {
  if (!permOf(user).absen) return { error: "Akun ini belum diberi izin mengisi absensi.", status: 403 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(id || ""))) return { error: "Tanggal absensi tidak valid.", status: 400 };
  if (!d || typeof d !== "object" || !d.ids || typeof d.ids !== "object" || Array.isArray(d.ids)) return { error: "Data absensi tidak valid.", status: 400 };
  const keys = Object.keys(d.ids);
  if (keys.length > 3000) return { error: "Data terlalu besar.", status: 413 };
  const ids = {};
  for (const k of keys) if (validSid(k)) ids[k] = !!d.ids[k];
  return { clean: { date: id, ids } };
}

const validUser = u => /^[a-z0-9._-]{3,30}$/.test(u);
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);

async function getUser(env, username) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE coll='staff' AND id=?").bind(username).first();
  return r ? JSON.parse(r.data) : null;
}
async function putUser(env, username, data) {
  await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES('staff',?,?)").bind(username, JSON.stringify(data)).run();
}

// ===== Batas percobaan salah per perangkat (IP): 15x / 15 menit =====
const RL_MAX = 15, RL_WIN = 15 * 60000;
const ipOf = request => request.headers.get("CF-Connecting-IP") || "unknown";
async function rlGet(env, request) {
  const r = await env.DB.prepare("SELECT data FROM docs WHERE coll='staff_rl' AND id=?").bind(ipOf(request)).first();
  return r ? JSON.parse(r.data) : null;
}
async function rlBlocked(env, request) {
  const d = await rlGet(env, request);
  return !!d && d.n >= RL_MAX && Date.now() - d.t < RL_WIN;
}
async function rlFail(env, request) {
  let d = await rlGet(env, request);
  if (!d || Date.now() - d.t >= RL_WIN) d = { n: 0, t: Date.now() };
  d.n++;
  await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES('staff_rl',?,?)").bind(ipOf(request), JSON.stringify(d)).run();
}
const TOO_MANY = { error: "Terlalu banyak percobaan dari perangkat ini. Coba lagi beberapa menit lagi." };

// Balasan JSON dengan ETag: kalau data tidak berubah, kirim 304 (hemat kuota)
export async function jsonEtag(request, obj) {
  const body = JSON.stringify(obj);
  const h = await sha(body);
  const tag = '"' + Array.from(h.slice(0, 12), b => b.toString(16).padStart(2, "0")).join("") + '"';
  const inm = (request.headers.get("If-None-Match") || "").replace(/^W\//, "");
  const base = { "cache-control": "no-store", ETag: tag };
  if (inm === tag) return new Response(null, { status: 304, headers: base });
  return new Response(body, { status: 200, headers: { "content-type": "application/json", ...base } });
}

async function makeToken(env, u) {
  const payload = toB64u(enc.encode(JSON.stringify({ u: u.username, pv: u.pv, exp: Date.now() + TOKEN_DAYS * 864e5 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload)));
  return payload + "." + toB64u(sig);
}
export async function userFromToken(request, env) {
  const t = request.headers.get("X-Dojang-Token") || "";
  const i = t.indexOf(".");
  if (i < 1 || !env.ANALYZE_PIN) return null;
  try {
    const payload = t.slice(0, i);
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), fromB64u(t.slice(i + 1)), enc.encode(payload));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    if (!p.exp || p.exp < Date.now()) return null;
    const u = await getUser(env, p.u);
    if (!u || !u.active || u.pv !== p.pv) return null;
    return u;
  } catch (e) { return null; }
}

// ===== GET: data laporan untuk akun pelatih (tanpa iuran, tanpa nomor WA, tanpa tarif) =====
export async function onRequestGet({ request, env }) {
  const u = await userFromToken(request, env);
  if (!u) return J({ error: "unauthorized" }, 401);

  const rs = await env.DB.prepare(
    "SELECT coll,id,data FROM docs WHERE coll IN ('students','attendance','evaluations','classes','coaches','units') ORDER BY coll,id"
  ).all();

  const out = { students: [], attendance: [], evaluations: [], classes: [], coaches: [], units: [] };
  for (const r of rs.results) {
    let d;
    try { d = JSON.parse(r.data); } catch (e) { continue; }
    if (r.coll === "students") {
      delete d.wa; delete d.fee;
      out.students.push({ id: r.id, ...d });
    } else if (r.coll === "evaluations") {
      // ulasan orang tua untuk pelatih tidak ditampilkan ke pelatih
      if (d.type === "coach_eval" || String(r.id).startsWith("coach_eval__")) continue;
      out.evaluations.push({ id: r.id, ...d });
    } else if (r.coll === "units") {
      delete d.fee;
      out.units.push({ id: r.id, ...d });
    } else if (r.coll === "coaches") {
      delete d.wa; delete d.ratingSummary;
      out.coaches.push({ id: r.id, ...d });
    } else if (out[r.coll]) {
      out[r.coll].push({ id: r.id, ...d });
    }
  }
  return jsonEtag(request, { user: { name: u.name, username: u.username, role: "pelatih", perm: permOf(u), mustChange: !!u.mustChange }, ...out });
}

// ===== POST: login (publik) + kelola akun (hanya Super Admin) =====
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return J({ error: "Permintaan tidak valid" }, 400);

  if (body.action === "login") {
    if (!env.ANALYZE_PIN) return J({ error: "Server belum siap: variabel ANALYZE_PIN belum diisi di Cloudflare." }, 500);
    if (await rlBlocked(env, request)) return J(TOO_MANY, 429);
    const username = clip(body.username, 40).trim().toLowerCase();
    const password = clip(body.password, 100);
    const u = validUser(username) ? await getUser(env, username) : null;
    const bad = { error: "Nama pengguna atau kata sandi salah." };

    if (!u) { await pbkdf2(password, rand(16)); await rlFail(env, request); return J(bad, 401); }   // samakan waktu respons

    if (u.lockUntil && u.lockUntil > Date.now()) {
      const m = Math.ceil((u.lockUntil - Date.now()) / 60000);
      return J({ error: "Terlalu banyak percobaan. Coba lagi dalam " + m + " menit." }, 429);
    }
    const good = same(await pbkdf2(password, fromB64(u.salt)), fromB64(u.hash));
    if (!good) {
      u.fails = (u.fails || 0) + 1;
      if (u.fails >= MAX_FAILS) { u.lockUntil = Date.now() + LOCK_MIN * 60000; u.fails = 0; }
      await putUser(env, username, u);
      await rlFail(env, request);
      return J(bad, 401);
    }
    if (!u.active) return J({ error: "Akun ini dinonaktifkan. Hubungi admin." }, 403);
    u.fails = 0; u.lockUntil = 0; u.lastLogin = new Date().toISOString();
    await putUser(env, username, u);
    return J({ token: await makeToken(env, u), user: { name: u.name, username: u.username, role: "pelatih", perm: permOf(u) }, mustChange: !!u.mustChange });
  }

  // ---- pelatih mengganti kata sandinya sendiri ----
  if (body.action === "change_password") {
    const user = await userFromToken(request, env);
    if (!user) return J({ error: "unauthorized" }, 401);
    const oldp = clip(body.old, 100), next = clip(body.next, 100);
    if (next.length < 6) return J({ error: "Kata sandi baru minimal 6 karakter." }, 400);
    if (user.lockUntil && user.lockUntil > Date.now()) return J({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, 429);
    const good = same(await pbkdf2(oldp, fromB64(user.salt)), fromB64(user.hash));
    if (!good) {
      user.fails = (user.fails || 0) + 1;
      if (user.fails >= MAX_FAILS) { user.lockUntil = Date.now() + LOCK_MIN * 60000; user.fails = 0; }
      await putUser(env, user.username, user);
      return J({ error: "Kata sandi lama salah." }, 400);
    }
    const salt = rand(16);
    user.salt = toB64(salt);
    user.hash = toB64(await pbkdf2(next, salt));
    user.pv = toB64u(rand(9));         // sesi di perangkat lain otomatis keluar
    user.fails = 0; user.lockUntil = 0; user.mustChange = false; user.updatedAt = new Date().toISOString();
    await putUser(env, user.username, user);
    return J({ ok: true, token: await makeToken(env, user) });
  }

  // ---- pelatih menyimpan absensi / penilaian (sesuai izin akunnya) ----
  if (body.action === "write") {
    const user = await userFromToken(request, env);
    if (!user) return J({ error: "unauthorized" }, 401);
    const id = clip(body.id, 140);
    let r;
    if (body.coll === "attendance") {
      r = cleanAttendance(user, id, body.data);
      if (r.clean && body.patch === true) {            // gabungkan hanya yang berubah, supaya tidak menimpa centang pelatih lain
        const old = await env.DB.prepare("SELECT data FROM docs WHERE coll='attendance' AND id=?").bind(id).first();
        const oldIds = old ? (JSON.parse(old.data).ids || {}) : {};
        r.clean.ids = { ...oldIds, ...r.clean.ids };
      }
    }
    else if (body.coll === "evaluations") r = cleanEvalDoc(user, id, body.data);
    else return J({ error: "Akun pelatih tidak boleh mengubah data ini." }, 403);
    if (r.error) return J({ error: r.error }, r.status || 400);
    await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES(?,?,?)").bind(body.coll, id, JSON.stringify(r.clean)).run();
    return J({ ok: true });
  }

  // ---- semua aksi di bawah ini khusus Super Admin ----
  if (!env.ANALYZE_PIN) return J({ error: "Variabel ANALYZE_PIN belum diisi di Cloudflare (harus sama dengan PIN admin)." }, 500);
  if (await rlBlocked(env, request)) return J(TOO_MANY, 429);
  if (!(await isOwner(request, env))) { await rlFail(env, request); return J({ error: "Hanya Super Admin yang boleh mengelola akun." }, 403); }

  if (body.action === "list") {
    const rs = await env.DB.prepare("SELECT id,data FROM docs WHERE coll='staff'").all();
    const users = rs.results.map(r => {
      const d = JSON.parse(r.data);
      return { username: r.id, name: d.name, active: !!d.active, perm: permOf(d), lastLogin: d.lastLogin || "", createdAt: d.createdAt || "" };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return J({ users });
  }

  if (body.action === "save") {
    const username = clip(body.username, 40).trim().toLowerCase();
    const name = clip(body.name, 80).trim();
    const password = body.password == null ? "" : clip(body.password, 100);
    if (!validUser(username)) return J({ error: "Nama pengguna 3-30 karakter: huruf kecil, angka, titik, strip atau garis bawah." }, 400);
    if (!name) return J({ error: "Nama pelatih wajib diisi." }, 400);
    if (password && password.length < 6) return J({ error: "Kata sandi minimal 6 karakter." }, 400);

    const old = await getUser(env, username);
    if (!old && !password) return J({ error: "Akun baru wajib diberi kata sandi (minimal 6 karakter)." }, 400);

    const u = old || { username, role: "pelatih", active: true, createdAt: new Date().toISOString() };
    u.name = name;
    if (body.perm && typeof body.perm === "object") u.perm = { absen: !!body.perm.absen, nilai: !!body.perm.nilai };
    if (!u.perm) u.perm = { absen: false, nilai: false };
    if (password) {
      const salt = rand(16);
      u.salt = toB64(salt);
      u.hash = toB64(await pbkdf2(password, salt));
      u.pv = toB64u(rand(9));          // mengganti ini membuat semua sesi lama otomatis keluar
      u.fails = 0; u.lockUntil = 0;
      u.mustChange = true;             // sandi dari admin -> pelatih wajib menggantinya saat pertama masuk
    }
    u.updatedAt = new Date().toISOString();
    await putUser(env, username, u);
    return J({ ok: true, created: !old });
  }

  if (body.action === "bulk_create") {
    // buatkan akun untuk banyak pelatih sekaligus: sandi acak berbeda tiap orang, hanya-lihat, wajib ganti sandi
    const names = Array.isArray(body.names) ? body.names.slice(0, 50) : [];
    const AL = "abcdefghjkmnpqrstuvwxyz23456789";
    const created = [], skipped = [];
    const all = await env.DB.prepare("SELECT id,data FROM docs WHERE coll='staff'").all();
    const have = new Set(all.results.map(r => slugName(JSON.parse(r.data).name)));   // nama yang sudah punya akun
    for (const raw of names) {
      const name = clip(raw, 80).trim();
      if (!name) continue;
      if (have.has(slugName(name))) { skipped.push(name); continue; }
      let base = slugName(name).slice(0, 24);
      if (base === "item") base = "pelatih";
      if (base.length < 3) base = "pelatih-" + base;
      let username = "", exists = false;
      for (let n = 1; n <= 20; n++) {
        const cand = n === 1 ? base : base + "-" + n;
        const old = await getUser(env, cand);
        if (!old) { username = cand; break; }
        if (slugName(old.name) === slugName(name)) { exists = true; break; }
      }
      if (exists || !username) { skipped.push(name); continue; }
      const password = Array.from(rand(8), b => AL[b % AL.length]).join("");
      const salt = rand(16);
      await putUser(env, username, {
        username, name, role: "pelatih", active: true, perm: { absen: false, nilai: false },
        salt: toB64(salt), hash: toB64(await pbkdf2(password, salt)), pv: toB64u(rand(9)),
        fails: 0, lockUntil: 0, mustChange: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      have.add(slugName(name));
      created.push({ name, username, password });
    }
    return J({ ok: true, created, skipped });
  }

  if (body.action === "toggle") {
    const username = clip(body.username, 40).trim().toLowerCase();
    const u = await getUser(env, username);
    if (!u) return J({ error: "Akun tidak ditemukan." }, 404);
    u.active = !!body.active;
    u.pv = toB64u(rand(9));            // putus sesi yang sedang berjalan
    await putUser(env, username, u);
    return J({ ok: true });
  }

  if (body.action === "delete") {
    const username = clip(body.username, 40).trim().toLowerCase();
    if (!validUser(username)) return J({ error: "Nama pengguna tidak valid." }, 400);
    await env.DB.prepare("DELETE FROM docs WHERE coll='staff' AND id=?").bind(username).run();
    return J({ ok: true });
  }

  return J({ error: "Aksi tidak dikenal" }, 400);
}