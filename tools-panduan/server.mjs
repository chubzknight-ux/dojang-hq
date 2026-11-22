// Server contoh untuk merekam video panduan: menjalankan kode API ASLI (functions/api) dengan database SQLite di memori.
// Pakai: node --experimental-sqlite server.mjs <folder-repo> <hq|saas> <port>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const [, , repo, variant = "saas", port = "8788"] = process.argv;
const sq = new DatabaseSync(":memory:");
sq.exec("CREATE TABLE docs(coll TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(coll,id))");
const DB = { prepare(sql) { const st = sq.prepare(sql); let a = []; const o = { bind(...x) { a = x; return o; }, async first() { return st.get(...a) || null; }, async all() { return { results: st.all(...a) }; }, async run() { const r = st.run(...a); return { meta: { changes: Number(r.changes) } }; } }; return o; } };
const env = variant === "hq"
  ? { DB, DOJANG_PIN: "demo-pin-2026", ANALYZE_PIN: "demo-pin-2026", TOKEN_SECRET: "demo-secret-panjang-1234567890" }
  : { DB, TOKEN_SECRET: "demo-secret-panjang-1234567890", SUPERADMIN_PIN: "demo-super-2026" };
if (variant === "saas") {
  sq.prepare("INSERT INTO docs VALUES('clubs','garuda',?)").run(JSON.stringify({ name: "Garuda Taekwondo Club", headCoach: "Sabeum Andi", adminUser: "garuda", adminPin: "demo1234", plan: "Basic", expiresAt: "2027-06-30" }));
  sq.prepare("INSERT INTO docs VALUES('clubs','macan',?)").run(JSON.stringify({ name: "Macan Putih Dojang", headCoach: "Sabeum Rudi", adminUser: "macan", adminPin: "demo5678", plan: "Pro", expiresAt: "2026-11-10" }));
}
const api = path.join(repo, "functions/api");
const mods = {};
const load = async n => mods[n] || (mods[n] = await import(pathToFileURL(path.join(api, n + ".js")).href));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".webm": "video/webm" };

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/api/")) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, String(v));
      headers.set("CF-Connecting-IP", "10.0.0." + (1 + Math.floor(Math.random() * 200)));
      const request = new Request("http://x" + req.url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      let name = u.pathname.slice(5), params = {};
      const m = name.match(/^docs\/([^/]+)\/([^/]+)$/);
      if (m) { name = "docs/[coll]/[id]"; params = { coll: m[1], id: decodeURIComponent(m[2]) }; }
      const mod = await load(name).catch(() => null);
      const fn = mod && mod["onRequest" + req.method[0] + req.method.slice(1).toLowerCase()];
      if (!fn) { res.writeHead(404); return res.end("{}"); }
      const r = await fn({ request, env, params });
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    let p = u.pathname === "/" ? "/index.html" : u.pathname === "/champion" ? "/champion.html" : u.pathname;
    const f = path.join(repo, p);
    if (!f.startsWith(path.resolve(repo)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
}).listen(+port, () => console.log("siap di", port));
