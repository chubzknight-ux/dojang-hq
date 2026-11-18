// Manifest aplikasi (PWA). Dibuat dinamis supaya aplikasi yang dipasang langsung membuka halaman yang tepat:
//  - Admin / pelatih:  "/"
//  - Orang tua:        "/?portal=ID"
//  - Portal pelatih:   "/?pelatih=1"
const KEYS = ["portal", "pelatih", "coach", "profil_pelatih"];

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  let start = "/";
  let mode = "admin";
  try {
    const u = new URL(url.searchParams.get("start") || "/", url.origin);
    if (u.origin === url.origin && u.pathname === "/") {
      const q = new URLSearchParams();
      for (const k of KEYS) {
        const v = u.searchParams.get(k);
        if (v !== null && /^[A-Za-z0-9_.-]{0,120}$/.test(v)) q.set(k, v);
      }
      const qs = q.toString();
      if (qs) start = "/?" + qs;
      if (q.has("portal")) mode = "parent";
      else if (q.has("pelatih") || q.has("coach")) mode = "coach";
      else if (q.has("profil_pelatih")) mode = "profile";
    }
  } catch (e) { /* pakai bawaan */ }

  const names = {
    admin:   ["Dojang HQ", "Dojang HQ", "Manajemen Supreme Taekwondo Club"],
    parent:  ["Portal Orang Tua - Supreme TKD", "Portal STC", "Perkembangan latihan ananda di Supreme Taekwondo Club"],
    coach:   ["Pelatih - Supreme TKD", "Pelatih STC", "Portal penilaian pelatih Supreme Taekwondo Club"],
    profile: ["Profil Pelatih - Supreme TKD", "Pelatih STC", "Profil pelatih Supreme Taekwondo Club"]
  }[mode];

  const manifest = {
    id: start,
    name: names[0],
    short_name: names[1],
    description: names[2],
    start_url: start,
    scope: "/",
    display: "standalone",
    background_color: "#F4F5F8",
    theme_color: "#0E1430",
    lang: "id",
    categories: ["sports", "education", "business"],
    icons: [
      { src: "/api/icon?s=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/icon?s=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/icon?s=maskable", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" }
  });
}