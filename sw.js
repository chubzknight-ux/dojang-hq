// Dojang HQ service worker
// - Halaman (index.html): ambil dari jaringan dulu; bila sinyal lambat (>3,5 dtk) atau offline, pakai salinan tersimpan.
//   Semua tautan (?portal=..., ?pelatih=1, dst.) memakai SATU salinan index.html, jadi cache tidak membengkak.
// - Champion (/champion) punya salinan sendiri.
// - Ikon & font: dari cache dulu (jarang berubah), diperbarui diam-diam di belakang.
// - /api/ tidak pernah di-cache (data selalu langsung dari server).
const CACHE = "dojang-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (key, res) => {
  if (res && (res.ok || res.type === "opaque")) {
    const cp = res.clone();
    caches.open(CACHE).then(c => c.put(key, cp)).catch(() => {});
  }
  return res;
};

function pageFirst(req, key = "/") {
  const net = fetch(req).then(r => put(key, r));
  const timeout = new Promise(res => setTimeout(res, 3500));
  return Promise.race([net.catch(() => null), timeout]).then(r =>
    r || caches.match(key).then(c => c || net)
  );
}

function cacheFirst(req) {
  return caches.match(req).then(c => {
    const net = fetch(req).then(r => put(req, r));
    if (c) { net.catch(() => {}); return c; }
    return net;
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);

  if (u.origin === self.location.origin) {
    if (u.pathname.startsWith("/api/")) return;
    // Champion (PWA sendiri): salinan halamannya disimpan terpisah, tidak menimpa salinan index.html
    if (u.pathname === "/champion" || u.pathname === "/champion.html") {
      e.respondWith(pageFirst(req, "/champion"));
      return;
    }
    if (req.mode === "navigate" || u.pathname === "/" || u.pathname === "/index.html") {
      e.respondWith(pageFirst(req));
      return;
    }
    if (u.pathname === "/sw.js") return;
    if (u.pathname.startsWith("/panduan/")) return;   // video panduan: biarkan browser memutar langsung (butuh Range)
    e.respondWith(cacheFirst(req));
    return;
  }

  if (FONT_HOSTS.includes(u.hostname)) e.respondWith(cacheFirst(req));
});
