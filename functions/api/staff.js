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

async function isOwner(request, env) {
  const pin = request.headers.get("X-Dojang-Pin") || "";
  if (!env.ANALYZE_PIN || !pin) return false;
  return same(await sha(pin), await sha(env.ANALYZE_PIN));
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

async function makeToken(env, u) {
  const payload = toB64u(enc.encode(JSON.stringify({ u: u.username, pv: u.pv, exp: Date.now() + TOKEN_DAYS * 864e5 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload)));
  return payload + "." + toB64u(sig);
}
async function userFromToken(request, env) {
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
    "SELECT coll,id,data FROM docs WHERE coll IN ('students','attendance','evaluations','classes','coaches','units')"
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
  return J({ user: { name: u.name, username: u.username, role: "pelatih" }, ...out });
}

// ===== POST: login (publik) + kelola akun (hanya Super Admin) =====
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return J({ error: "Permintaan tidak valid" }, 400);

  if (body.action === "login") {
    if (!env.ANALYZE_PIN) return J({ error: "Server belum siap: variabel ANALYZE_PIN belum diisi di Cloudflare." }, 500);
    const username = clip(body.username, 40).trim().toLowerCase();
    const password = clip(body.password, 100);
    const u = validUser(username) ? await getUser(env, username) : null;
    const bad = { error: "Nama pengguna atau kata sandi salah." };

    if (!u) { await pbkdf2(password, rand(16)); return J(bad, 401); }   // samakan waktu respons

    if (u.lockUntil && u.lockUntil > Date.now()) {
      const m = Math.ceil((u.lockUntil - Date.now()) / 60000);
      return J({ error: "Terlalu banyak percobaan. Coba lagi dalam " + m + " menit." }, 429);
    }
    const good = same(await pbkdf2(password, fromB64(u.salt)), fromB64(u.hash));
    if (!good) {
      u.fails = (u.fails || 0) + 1;
      if (u.fails >= MAX_FAILS) { u.lockUntil = Date.now() + LOCK_MIN * 60000; u.fails = 0; }
      await putUser(env, username, u);
      return J(bad, 401);
    }
    if (!u.active) return J({ error: "Akun ini dinonaktifkan. Hubungi admin." }, 403);
    u.fails = 0; u.lockUntil = 0; u.lastLogin = new Date().toISOString();
    await putUser(env, username, u);
    return J({ token: await makeToken(env, u), user: { name: u.name, username: u.username, role: "pelatih" } });
  }

  // ---- semua aksi di bawah ini khusus Super Admin ----
  if (!env.ANALYZE_PIN) return J({ error: "Variabel ANALYZE_PIN belum diisi di Cloudflare (harus sama dengan PIN admin)." }, 500);
  if (!(await isOwner(request, env))) return J({ error: "Hanya Super Admin yang boleh mengelola akun." }, 403);

  if (body.action === "list") {
    const rs = await env.DB.prepare("SELECT id,data FROM docs WHERE coll='staff'").all();
    const users = rs.results.map(r => {
      const d = JSON.parse(r.data);
      return { username: r.id, name: d.name, active: !!d.active, lastLogin: d.lastLogin || "", createdAt: d.createdAt || "" };
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
    if (password) {
      const salt = rand(16);
      u.salt = toB64(salt);
      u.hash = toB64(await pbkdf2(password, salt));
      u.pv = toB64u(rand(9));          // mengganti ini membuat semua sesi lama otomatis keluar
      u.fails = 0; u.lockUntil = 0;
    }
    u.updatedAt = new Date().toISOString();
    await putUser(env, username, u);
    return J({ ok: true, created: !old });
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