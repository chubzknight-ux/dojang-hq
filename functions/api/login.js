import { adminGuard, adminPinOf, makeAdminToken } from "./staff.js";

// POST /api/login  (header X-Dojang-Pin = PIN admin) -> {token}
// Token dipakai aplikasi sebagai pengganti PIN, sehingga PIN tidak tersimpan di HP.
// Percobaan salah dihitung & dibatasi oleh adminGuard (15x / 15 menit per jaringan).
export async function onRequestPost({ env, request }) {
  const pin = adminPinOf(env);
  const h = (request.headers.get("X-Dojang-Pin") || "").trim();
  if (h.startsWith("t1.")) return Response.json({ error: "Masukkan PIN, bukan token." }, { status: 400 });
  const bad = await adminGuard(request, env, pin);
  if (bad) return bad;
  return Response.json({ ok: true, token: await makeAdminToken(env, pin) }, { headers: { "cache-control": "no-store" } });
}
