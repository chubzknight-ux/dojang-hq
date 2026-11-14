export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id");
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

  const st = students.find(s => s.id === id);
  if (!st) return Response.json({ error: "not found" }, { status: 404 });

  const fk = fKey(st);
  const siblings = fk
    ? students.filter(s => s.id !== st.id && !s.cuti && fKey(s) === fk).map(s => ({ id: s.id, n: s.n, unit: s.unit || "Terazza" }))
    : [];

  return Response.json({
    student: st,
    siblings,
    attendance: attendance.map(a => ({ id: a.id, hadir: !!(a.ids && a.ids[id]) })),
    payments: payments.map(p => ({ id: p.id, lunas: !!(p.ids && p.ids[id]) })),
    evaluations: evaluations.filter(e => e.ev && e.ev[id]).map(e => ({ id: e.id, date: e.date || e.id.slice(0, 10), coach: e.coach || "Pelatih", ...e.ev[id] })),
    classes
  });
}
