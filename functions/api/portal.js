export async function onRequestGet({ request, env }) {
  const rawId = new URL(request.url).searchParams.get("id");
  const id = String(rawId || "").trim();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const clean = s => String(s || "").replace(/\D/g, "").replace(/^0/, "62");
  const fKey = st => {
    const w = clean(st && st.wa);
    if (w.length >= 9) return "wa:" + w;
    const o = String((st && st.ortu) || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (o.length >= 3) return "ortu:" + o;
    return "";
  };

  const getCol = async name => {
    const { results } = await env.DB.prepare("SELECT id, data FROM docs WHERE col = ?").bind(name).all();
    return results.map(r => ({ id: r.id, ...JSON.parse(r.data) }));
  };

  const [students, attendance, payments, evaluations, classes] = await Promise.all([
    getCol("students"), getCol("attendance"), getCol("payments"), getCol("evaluations"), getCol("classes")
  ]);

  const idLow = id.toLowerCase();
  const st = students.find(s => String(s.id || "").trim() === id)
    || students.find(s => String(s.id || "").trim().toLowerCase() === idLow);
  if (!st) return Response.json({ error: "not found" }, { status: 404 });

  const sid = String(st.id).trim();
  const sidLow = sid.toLowerCase();

  const isIdChecked = mapObj => {
    if (!mapObj || typeof mapObj !== "object") return false;
    if (mapObj[sid] === true || mapObj[id] === true) return true;
    for (const [k, v] of Object.entries(mapObj)) {
      if (v === true && (String(k).trim() === sid || String(k).trim().toLowerCase() === sidLow)) return true;
    }
    return false;
  };

  const payByMonth = new Map();
  for (const p of payments) {
    const ymKey = String(p.month || p.id || "").trim().slice(0, 7);
    if (!ymKey) continue;
    const paid = Boolean(p.lunas === true || p.paid === true || isIdChecked(p.ids));
    payByMonth.set(ymKey, Boolean(payByMonth.get(ymKey)) || paid);
  }

  const fk = fKey(st);
  const siblings = fk
    ? students.filter(s => s.id !== st.id && !s.cuti && fKey(s) === fk).map(s => ({ id: s.id, n: s.n, unit: s.unit || "Terazza" }))
    : [];

  return new Response(JSON.stringify({
    student: st,
    siblings,
    attendance: attendance.map(a => ({ id: a.id, hadir: isIdChecked(a.ids) })),
    payments: [...payByMonth.entries()].map(([ymId, lunas]) => ({ id: ymId, lunas })),
    evaluations: evaluations.filter(e => e.ev && (e.ev[sid] || e.ev[id])).map(e => ({
      id: e.id,
      date: e.date || String(e.id || "").slice(0, 10),
      coach: e.coach || "Pelatih",
      ...(e.ev[sid] || e.ev[id])
    })),
    classes
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0"
    }
  });
}