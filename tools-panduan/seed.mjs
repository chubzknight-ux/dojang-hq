// Mengisi data contoh lewat API asli (dipakai merekam video panduan)
export async function seedSaas(base) {
  const login = await (await fetch(base + "/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: "garuda", pin: "demo1234" }) })).json();
  const H = { "content-type": "application/json", "X-Dojang-Admin-Token": login.token };
  return { ...(await seedWith(base, H)), token: login.token, H };
}
export async function seedHq(base) {
  const login = await (await fetch(base + "/api/login", { method: "POST", headers: { "X-Dojang-Pin": "demo-pin-2026" } })).json();
  const H = { "content-type": "application/json", "X-Dojang-Pin": login.token };
  return { ...(await seedWith(base, H)), token: login.token, H };
}
const put = (base, H, coll, id, body) => fetch(`${base}/api/docs/${coll}/${id}`, { method: "PUT", headers: H, body: JSON.stringify(body) }).then(r => { if (!r.ok) console.error("seed gagal", coll, id, r.status); });
async function seedWith(base, H) {
  const SK = ["Poomsae", "Kyorugi", "Kekuatan", "Kelenturan", "Disiplin"];
  const kids = [
    ["alya-putri", "Alya Putri", "Perempuan", "Ibu Rina", 9, 1, 88, [82, 60, 70, 85, 92], "Utama", "081200000001"],
    ["raka-pratama", "Raka Pratama", "Laki-laki", "Bpk. Doni", 11, 2, 62, [68, 74, 80, 55, 70], "Utama", "081200000002"],
    ["nadia-wijaya", "Nadia Wijaya", "Perempuan", "Ibu Rina", 8, 0, 91, [75, 48, 55, 78, 95], "Utama", "081200000001"],
    ["kevin-santoso", "Kevin Santoso", "Laki-laki", "Bpk. Hendra", 13, 3, 74, [80, 82, 76, 66, 78], "Cabang Timur", "081200000004"],
    ["dinda-lestari", "Dinda Lestari", "Perempuan", "Ibu Sari", 10, 1, 55, [60, 58, 62, 70, 80], "Cabang Timur", "081200000005"],
    ["bagas-wibowo", "Bagas Wibowo", "Laki-laki", "Bpk. Joko", 12, 2, 68, [72, 66, 70, 64, 75], "Cabang Timur", "081200000006"]
  ];
  for (const k of kids) await put(base, H, "students", k[0], { n: k[1], gender: k[2], ortu: k[3], unit: k[8], fee: null, a: k[4], v: 2, bi: k[5], pct: k[6], sk: Object.fromEntries(SK.map((s, i) => [s, k[7][i]])), note: "Semangat latihannya bagus, tingkatkan kelenturan.", cuti: false, cutiKet: "", cutiTgl: "", foto: false, wa: k[9], sejak: "2026-01-05" });
  const day = (d, ids) => put(base, H, "attendance", d, { ids: Object.fromEntries(ids.map(i => [i, true])), unit: "Utama" });
  await day("2026-11-10", ["alya-putri", "raka-pratama", "nadia-wijaya"]);
  await day("2026-11-13", ["alya-putri", "nadia-wijaya"]);
  await day("2026-11-17", ["alya-putri", "raka-pratama", "nadia-wijaya"]);
  await day("2026-11-20", ["alya-putri", "raka-pratama"]);
  await put(base, H, "payments", "2026-10", { ids: Object.fromEntries(kids.map(k => [k[0], true])) });
  await put(base, H, "payments", "2026-11", { ids: { "alya-putri": true, "kevin-santoso": true } });
  await put(base, H, "units", "utama", { name: "Utama" });
  await put(base, H, "units", "cabang-timur", { name: "Cabang Timur" });
  await put(base, H, "coaches", "sabeum-andi", { name: "Sabeum Andi", bio: "Sabuk hitam Dan 3, pelatih sejak 2015", wa: "081211112222" });
  await put(base, H, "classes", "k1", { unit: "Utama", h: "Selasa & Kamis", j: "16.00–17.30", l: "GOR Kota", p: "Sabeum Andi" });
  await put(base, H, "classes", "k2", { unit: "Utama", h: "Sabtu", j: "08.00–09.30", l: "GOR Kota", p: "Sabeum Andi" });
  await put(base, H, "classes", "k3", { unit: "Cabang Timur", h: "Rabu", j: "15.30–17.00", l: "Aula SD Timur", p: "Sabeum Andi" });
  return { kids };
}

export async function seedPr(base, H) {
  const r = await fetch(base + "/api/champion", { method: "POST", headers: H, body: JSON.stringify({ action: "setpr", items: ["kuda", "squat", "plank", "cossack", "kupu", "jerapah", "lompat", "bridge"].map(k => ({ k, t: 20 })), mode: "acak", n: 2, note: "Semangat latihan di rumah ya! 💪" }) });
  if (!r.ok) console.error("seedPr gagal", r.status, await r.text());
}

export async function ensureBilling(base) {
  const SA = { "content-type": "application/json", "X-Dojang-User": "superadmin", "X-Dojang-Pin": "demo-super-2026" };
  const r = await fetch(base + "/api/billing", { method: "POST", headers: SA, body: JSON.stringify({ action: "settings", settings: { plans: [{ name: "Basic", price: 150000, note: "Sampai 60 murid" }, { name: "Pro", price: 300000, note: "Murid tanpa batas + Analisa Video AI" }], discounts: { "3": 0, "6": 5, "12": 10 }, bank: { bank: "BCA", number: "1234567890", holder: "PT Dojang Digital" }, contactWa: "6281211112222" } }) });
  if (!r.ok) console.error("billing settings gagal", r.status);
}
export async function makeClaimedInvoice(base, club = "garuda", plan = "basic", months = 3) {
  const c = await (await fetch(base + "/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", club, plan, months, name: "Ibu Rina" }) })).json();
  if (c.invoice) await fetch(base + "/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "claim", invoice: c.invoice.id, note: "a/n Rina Wijaya" }) });
}
