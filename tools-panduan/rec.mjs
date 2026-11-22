// Pustaka perekam video panduan (Playwright): keterangan di bawah layar + kursor yang bergerak sebelum klik.
import { createRequire } from "node:module";
import fs from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
export { chromium };

const CSS = `#__cap{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);width:max-content;max-width:90%;background:rgba(14,20,48,.94);color:#fff;padding:11px 18px;border-radius:14px;font:600 var(--cs,19px)/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;z-index:2147483647;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.4);border:2px solid #F2B600;transition:opacity .25s;pointer-events:none}#__cap small{display:block;font-size:.62em;color:#F2B600;font-weight:700;letter-spacing:.8px;margin-bottom:2px}#__cur{position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:rgba(242,182,0,.55);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5);z-index:2147483646;pointer-events:none;transition:transform .75s cubic-bezier(.4,0,.2,1),background .15s;transform:translate(-50px,-50px)}#__cur.dn{background:rgba(255,70,70,.8)}`;

export async function newRec(browser, { w, h, dir, cs, init }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, recordVideo: { dir, size: { width: w, height: h } }, deviceScaleFactor: 1, hasTouch: w < 600, isMobile: false, permissions: ["camera", "clipboard-read", "clipboard-write"] });
  await ctx.addInitScript(({ css, cs, init }) => {
    try { if (!sessionStorage.getItem("__rec_init")) { sessionStorage.setItem("__rec_init", "1"); for (const [k, v] of Object.entries(init || {})) localStorage.setItem(k, v); } } catch (e) {}
    const add = () => {
      if (document.getElementById("__cap") || !document.body) return;
      const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
      const c = document.createElement("div"); c.id = "__cap"; c.style.opacity = "0"; c.style.setProperty("--cs", cs); document.body.appendChild(c);
      const u = document.createElement("div"); u.id = "__cur"; document.body.appendChild(u);
    };
    document.addEventListener("DOMContentLoaded", add); new MutationObserver(add).observe(document, { childList: true, subtree: true });
  }, { css: CSS, cs: cs || "19px", init });
  const page = await ctx.newPage(); globalThis.__lastPage = page;
  page.on("pageerror", e => console.log("  PAGEERR", e.message.slice(0, 160)));
  page.on("dialog", d => d.dismiss().catch(() => {}));
  return { ctx, page };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
// keterangan (judul kecil + isi). Menunggu cukup lama agar terbaca.
export async function cap(page, text, step, ms) {
  await page.evaluate(([t, s]) => { const c = document.getElementById("__cap"); if (!c) return; c.innerHTML = (s ? `<small>${s}</small>` : "") + t; c.style.opacity = "1"; }, [text, step || ""]);
  await sleep(ms ?? Math.max(1800, text.length * 62));
}
export async function nocap(page) { await page.evaluate(() => { const c = document.getElementById("__cap"); if (c) c.style.opacity = "0"; }); }
export async function tap(page, sel, { after = 500, nth = 0 } = {}) {
  const loc = page.locator(sel).nth(nth);
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const box = await loc.boundingBox({ timeout: 6000 }).catch(() => null);
  if (box) {
    await page.evaluate(([x, y]) => { const c = document.getElementById("__cur"); if (c) c.style.transform = `translate(${x}px,${y}px)`; }, [box.x + Math.min(box.width / 2, 120), box.y + box.height / 2]);
    await sleep(850);
    await page.evaluate(() => document.getElementById("__cur")?.classList.add("dn")); await sleep(160);
  }
  try { await loc.click({ timeout: 8000 }); }
  catch (e) { await page.screenshot({ path: (process.env.REC_DBG || "/tmp") + "/_fail.png" }).catch(() => {}); throw new Error("tap gagal: " + sel + " nth=" + nth); }
  await page.evaluate(() => document.getElementById("__cur")?.classList.remove("dn"));
  await sleep(after);
}
export async function typeIn(page, sel, text, { delay = 75, nth = 0 } = {}) {
  await tap(page, sel, { after: 150, nth });
  await page.locator(sel).nth(nth).fill("");
  await page.locator(sel).nth(nth).pressSequentially(text, { delay });
  await sleep(350);
}
export async function finish(rc, outFile) {
  const vp = rc.page.video();
  await sleep(900); await rc.ctx.close();
  const p = await vp.path(); fs.copyFileSync(p, outFile); fs.unlinkSync(p);
  console.log("  tersimpan", outFile, (fs.statSync(outFile).size / 1024 | 0) + " KB");
}
export async function smoothScroll(page, dy, ms = 1400) {
  await page.evaluate(async ([dy, ms]) => { const el = document.scrollingElement || document.documentElement, y0 = el.scrollTop, t0 = performance.now(); await new Promise(r => { const f = t => { const k = Math.min(1, (t - t0) / ms); el.scrollTop = y0 + dy * (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); k < 1 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }); }, [dy, ms]);
}
