import { adminGuard, adminPinOf, hitLimit, ageOf, wibToday } from "./staff.js";

// ===== Pengaman Portal Orang Tua =====
// Orang tua membuka link lalu mengetik NAMA ANAK sekali per perangkat. Server lalu memberi token bertanda tangan
// (berlaku 180 hari) yang mencakup semua saudara kandung, jadi nama salah satu anak sudah cukup.
// Tanpa token yang sah server tidak mengirim data apa pun dan tidak memberi tahu apakah ID murid itu ada.
const TOKEN_DAYS = 180;
const enc = new TextEncoder();
const b64u = u8 => { let s = ""; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const hmacKey = env => crypto.subtle.importKey("raw", enc.encode("dojang-portal-v1|" + adminPinOf(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
async function makeToken(env, ids) {
  const payload = b64u(enc.encode(JSON.stringify({ ids, exp: Date.now() + TOKEN_DAYS * 864e5 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(payload)));
  return payload + "." + b64u(sig);
}
export async function tokenIds(env, tok) {
  const i = String(tok || "").indexOf(".");
  if (i < 1 || !adminPinOf(env)) return null;
  try {
    const payload = tok.slice(0, i);
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(env), fromB64u(tok.slice(i + 1)), enc.encode(payload)))) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(payload)));
    if (!p.exp || p.exp < Date.now() || !Array.isArray(p.ids)) return null;
    return p.ids.map(x => String(x).toLowerCase());
  } catch (e) { return null; }
}
// Nama dicocokkan tanpa membedakan huruf besar/kecil, tanda baca, dan spasi.
// Diterima: nama lengkap, atau salah satu kata dari nama (minimal 3 huruf), kecuali kata umum seperti "Muhammad".
const COMMON = new Set(["muhammad", "muhamad", "mohammad", "mohamad", "mochammad", "mochamad", "muhammed", "moh", "muh", "mhd"]);
const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function nameMatches(typed, fullName) {
  const t = norm(typed), f = norm(fullName);
  if (!t || !f) return false;
  if (t === f) return true;
  if (t.includes(" ") || t.length < 3 || COMMON.has(t)) return false;
  return f.split(" ").includes(t);
}
const NEED = () => Response.json({ error: "verify", need: "name" }, { status: 401, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body || body.action !== "verify") return Response.json({ error: "bad request" }, { status: 400 });
  if (!adminPinOf(env)) return Response.json({ error: "Server belum diatur." }, { status: 500 });
  if (!(await hitLimit(env, request, "pv", 10, 15 * 60000)))
    return Response.json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." }, { status: 429 });
  const id = String(body.id || "").trim().replace(/^\/+|\/+$/g, "").slice(0, 120);
  const typed = String(body.name || "").slice(0, 120);
  const rs = await env.DB.prepare("SELECT id, data FROM docs WHERE coll = 'students'").all();
  const students = rs.results.map(r => { try { return { id: r.id, ...JSON.parse(r.data) }; } catch (e) { return null; } }).filter(Boolean);
  const idLow = id.toLowerCase();
  const st = students.find(s => String(s.id).trim() === id) || students.find(s => String(s.id).trim().toLowerCase() === idLow);
  const WRONG = Response.json({ error: "Nama anak tidak cocok. Periksa ejaannya lalu coba lagi." }, { status: 403 });
  if (!st) return WRONG;
  // batas tambahan per murid (menahan tebakan dari banyak jaringan sekaligus)
  if (!(await hitLimit(env, request, "pvs", 30, 60 * 60000, String(st.id))))
    return Response.json({ error: "Terlalu banyak percobaan untuk murid ini. Coba lagi nanti." }, { status: 429 });
  const fk = fKey(st);
  const family = fk ? students.filter(s => s.id === st.id || fKey(s) === fk) : [st];
  if (!family.some(s => nameMatches(typed, s.n))) return WRONG;
  return Response.json({ ok: true, token: await makeToken(env, family.map(s => String(s.id))), ids: family.map(s => String(s.id)) }, { headers: { "Cache-Control": "no-store" } });
}

const cleanWa = s => String(s || "").replace(/\D/g, "").replace(/^0/, "62");
function fKey(st) {
  const w = cleanWa(st && st.wa);
  if (w.length >= 9) return "wa:" + w;
  const o = String((st && st.ortu) || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (o.length >= 3) return "ortu:" + o;
  return "";
}

export async function onRequestGet({ request, env }) {
  const rawId = new URL(request.url).searchParams.get("id") || "";
  const id = rawId.trim().replace(/^\/+|\/+$/g, "");
  if (!id) {
    return Response.json({ error: "id required" }, {
      status: 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
  // admin yang sudah masuk (PIN) boleh langsung; selain itu wajib token hasil verifikasi nama anak
  if (request.headers.get("X-Dojang-Pin")) {
    const bad = await adminGuard(request, env, adminPinOf(env));
    if (bad) return bad;
  } else {
    const ids = await tokenIds(env, request.headers.get("X-Portal-Token"));
    if (!ids || !ids.includes(id.toLowerCase())) return NEED();
  }


  // satu baris rusak dilewati saja, jangan menggagalkan seluruh portal
  const getCol = async name => {
    const { results } = await env.DB.prepare("SELECT id, data FROM docs WHERE coll = ?").bind(name).all();
    return results.map(r => { try { return { id: r.id, ...JSON.parse(r.data) }; } catch (e) { return null; } }).filter(Boolean);
  };

  const [students, attendance, payments, evaluations, classes, pengumuman] = await Promise.all([
    getCol("students"), getCol("attendance"), getCol("payments"), getCol("evaluations"), getCol("classes"), getCol("pengumuman")
  ]);

  const idLow = id.toLowerCase();
  const st = students.find(s => String(s.id || "").trim() === id)
    || students.find(s => String(s.id || "").trim().toLowerCase() === idLow);

  if (!st) {
    return Response.json({ error: "not found" }, {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    });
  }

  const sid = String(st.id).trim();
  const sidLow = sid.toLowerCase();

  const hasId = ids => {
    if (!ids) return false;
    if (Array.isArray(ids)) return ids.some(x => String(x || "").trim().toLowerCase() === sidLow);
    if (typeof ids === "object") {
      return Object.entries(ids).some(([k, v]) => Boolean(v) && String(k || "").trim().toLowerCase() === sidLow);
    }
    return false;
  };

  const payMap = new Map();
  payments.forEach(p => {
    const ym = String(p.month || p.id || "").trim().slice(0, 7);
    if (!ym) return;
    const paid = hasId(p.ids);
    payMap.set(ym, Boolean(payMap.get(ym)) || paid);
  });

  if (Array.isArray(st.paidMonths)) {
    st.paidMonths.forEach(m => {
      const ym = String(m || "").trim().slice(0, 7);
      if (ym) payMap.set(ym, true);
    });
  }

  const normalizedPayments = [...payMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, lunas]) => ({ id: ym, month: ym, lunas }));

  const fk = fKey(st);
  const siblings = fk
    ? students
        .filter(s => s.id !== st.id && !s.cuti && fKey(s) === fk)
        .map(s => ({ id: s.id, n: s.n, unit: s.unit || "Terazza" }))
    : [];

  // hanya data yang ditampilkan di portal orang tua (tanpa nomor WA & data internal lain)
  const SHOW = ["id","n","a","bi","v","unit","gender","ortu","fee","cuti","cutiKet","cutiTgl","sejak","sk","siap","pct","note","sabukHist"];
  const studentOut = {};
  for (const k of SHOW) if (st[k] !== undefined) studentOut[k] = st[k];
  if (st.lahir) studentOut.a = ageOf(st.lahir, st.a);      // usia ikut bertambah tiap tahun (tanggal lahir sendiri tidak dikirim)

  return Response.json({
    student: studentOut,
    siblings,
    attendance: attendance.map(a => ({ id: a.id, hadir: hasId(a.ids) })),
    payments: normalizedPayments,
    evaluations: evaluations
      .filter(e => e.ev && (e.ev[sid] || e.ev[id]))
      .map(e => ({
        id: e.id,
        date: e.date || String(e.id || "").slice(0, 10),
        coach: e.coach || "Pelatih",
        ...(e.ev[sid] || e.ev[id])
      })),
    classes,
    // pengumuman yang sedang berlaku untuk semua unit atau unit anak ini
    announcements: (() => {
      const t = wibToday(), u = String(st.unit || "Terazza").trim().toLowerCase();
      return pengumuman
        .filter(a => String(a.mulai || "") <= t && String(a.sampai || "") >= t && (!a.unit || String(a.unit).trim().toLowerCase() === u))
        .sort((a, b) => String(b.mulai || "").localeCompare(String(a.mulai || "")))
        .map(a => ({ judul: String(a.judul || "").slice(0, 120), isi: String(a.isi || "").slice(0, 1500), unit: String(a.unit || "").slice(0, 40), mulai: a.mulai, sampai: a.sampai }));
    })()
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
}
