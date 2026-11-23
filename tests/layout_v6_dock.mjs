// Lab v6 layout test: left dock (Media | Gallery) + multitrack timeline.
// At every resolution x UI scale: (a) dock / viewer / inspector / timeline never intersect and stay in the
// viewport; (b) the dock splitter resizes the dock (viewer shrinks, nothing overlaps), Ctrl+B collapses it;
// (c) track context menus opened at the far corners stay inside the viewport; (d) track heads line up with
// their rows and the last audio row is visible or reachable by scrolling; (f) no clip chrome under a band; (e) overlap bands sit inside the
// video rows with their duration label.
// usage: node tests/layout_v6_dock.mjs   (needs playwright; PWDEPS=/path/to/dir-with-playwright)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const require = createRequire((process.env.PWDEPS || "/tmp/pwdeps") + "/package.json"); const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RES = (process.env.RES || "1024x700,1280x720,1920x1080,2560x1440,3840x2160").split(",").map((x) => x.split("x").map(Number));
const SCALES = (process.env.SCALES || "75,100,125").split(",").map(Number);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".mp4": "video/mp4", ".woff2": "font/woff2" };
const srv = await new Promise((r) => { const s = http.createServer((q, res) => { const fp = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": TYPES[path.extname(fp)] || "application/octet-stream" }); fs.createReadStream(fp).pipe(res); }); s.listen(0, "127.0.0.1", () => r(s)); });
const b = await chromium.launch({ channel: process.env.PWCHANNEL || "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const SETUP = () => { const ed = window.__V6__.ed, p = ed.p;
  p.assets.push({ id: "au_v", name: "voice.wav", file: "voice.wav", subfolder: "", type: "input", category: "audio", duration: 8 }, { id: "au_m", name: "music.mp3", file: "music.mp3", subfolder: "", type: "input", category: "audio", duration: 18 });
  p.audio.clips.push({ id: "c1", asset: "au_v", lane: 0, start: 0.5, in: 0, length: 0, volume: 1, fade_in: 0, fade_out: 0 }, { id: "c2", asset: "au_m", lane: 2, start: 0, in: 0, length: 16, volume: 0.8, fade_in: 0, fade_out: 0 });
  p.segments[1].track = 1; p.settings.timeline_tracks = { vtracks: 2, names: {} };
  localStorage.removeItem("h3ls.v6.layout"); localStorage.setItem("h3ls.v6.layout", JSON.stringify({ dc: false }));
  ed.applyLayout(); ed.renderAll(); };
const RECTS = () => {
  const q = (s) => document.querySelector(s), out = [], vw = innerWidth, vh = innerHeight;
  const ix = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const parts = { dock: q(".v6-dock"), viewer: q(".v6-viewer"), insp: q(".v6-insp"), tl: q(".v6-tl") };
  const R = {}; for (const [k, e] of Object.entries(parts)) { if (!e || !e.offsetWidth) continue; R[k] = e.getBoundingClientRect(); const r = R[k]; if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.push(`${k} outside viewport`); }
  const ks = Object.keys(R); for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (ix(R[ks[i]], R[ks[j]])) out.push(`${ks[i]} ∩ ${ks[j]}`);
  // track heads vs rows
  const heads = [...document.querySelectorAll(".v6-vheads .v6-vhead")], lanes = [...document.querySelectorAll(".v6-vlane")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  if (heads.length !== lanes.length) out.push(`video heads ${heads.length} ≠ rows ${lanes.length}`);
  heads.forEach((hd, i) => { const a = hd.getBoundingClientRect(), l = lanes[i]?.getBoundingClientRect(); if (l && Math.abs(a.top - l.top) > 2.5) out.push(`V head ${i} off its row by ${(a.top - l.top).toFixed(1)}px`); });
  const ah = [...document.querySelectorAll(".v6-aheads .v6-ahead")], al = [...document.querySelectorAll(".v6-alane")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  if (ah.length !== al.length) out.push(`audio heads ${ah.length} ≠ rows ${al.length}`);
  ah.forEach((hd, i) => { const a = hd.getBoundingClientRect(), l = al[i]?.getBoundingClientRect(); if (l && Math.abs(a.top - l.top) > 2.5) out.push(`A head ${i} off its row by ${(a.top - l.top).toFixed(1)}px`); });
  const sc = q(".h3l-tscroll"), last = al[al.length - 1];
  if (sc && last) { const s = sc.getBoundingClientRect(), l = last.getBoundingClientRect(); if (l.bottom > s.bottom + 1 && sc.scrollHeight <= sc.clientHeight + 1) out.push("last audio row hidden and not scrollable"); }
  for (const band of document.querySelectorAll(".v6-ovb")) { const r = band.getBoundingClientRect(), t = q(".h3l-track.v").getBoundingClientRect(); if (r.top < t.top - 1 || r.bottom > t.bottom + 1) out.push("overlap band outside the video rows"); }
  // (f) v6d: one duration badge per overlap; clip status / duration / title never under a band
  const ixb = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  for (const band of document.querySelectorAll(".v6-ovb")) { if (band.querySelectorAll(".v6-ovb-t").length > 1) out.push("two badges on one band"); const br = band.getBoundingClientRect();
    for (const c of document.querySelectorAll(".h3l-clip .bd, .h3l-clip .t .d, .h3l-clip .t .nm")) { const cr = c.getBoundingClientRect(); if (cr.width > 1 && getComputedStyle(c).display !== "none" && ixb(br, cr) > 6) out.push("clip chrome under an overlap band: " + c.textContent.trim().slice(0, 14)); } }
  // each audio head has the lock checkbox
  if (ah.some((x) => !x.querySelector(".v6-chk[role=checkbox]"))) out.push("audio head without the H3 checkbox");
  return { out, dock: R.dock ? R.dock.width : 0, viewer: R.viewer ? R.viewer.width : 0 };
};
let fail = 0;
for (const [w, h] of RES) for (const s of SCALES) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  await page.goto(`http://127.0.0.1:${srv.address().port}/tests/harness/v6.html?scale=${s}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__V6__?.ready, null, { timeout: 20000 });
  await page.evaluate(SETUP); await page.waitForTimeout(400);
  const errs = [];
  const r0 = await page.evaluate(RECTS); errs.push(...r0.out);
  // (b) splitter drag
  const sp = await page.locator(".v6-split.l").boundingBox();
  if (sp) {
    await page.mouse.move(sp.x + sp.width / 2, sp.y + sp.height / 2); await page.mouse.down(); await page.mouse.move(sp.x + 60, sp.y + sp.height / 2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(250);
    const r1 = await page.evaluate(RECTS); errs.push(...r1.out.map((x) => "after resize: " + x));
    let moved = r1.dock > r0.dock + 10;
    if (!moved) { // already at its cap → it must still shrink
      const sp2 = await page.locator(".v6-split.l").boundingBox();
      await page.mouse.move(sp2.x + sp2.width / 2, sp2.y + sp2.height / 2); await page.mouse.down(); await page.mouse.move(sp2.x - 60, sp2.y + sp2.height / 2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(250);
      const r2 = await page.evaluate(RECTS); errs.push(...r2.out.map((x) => "after shrink: " + x));
      moved = r2.dock < r1.dock - 10;
    }
    if (!moved) errs.push(`dock splitter does not resize (${r0.dock.toFixed(0)} → ${r1.dock.toFixed(0)})`);
    await page.locator(".v6-split.l").dblclick(); await page.waitForTimeout(200);
  } else errs.push("no dock splitter");
  // Ctrl+B collapses / restores
  await page.mouse.click(Math.round(w * 0.5), Math.round(h * 0.3)); await page.keyboard.press("Control+b"); await page.waitForTimeout(250);
  const r2 = await page.evaluate(RECTS); if (r2.dock > 0) errs.push("Ctrl+B did not collapse the dock"); errs.push(...r2.out.map((x) => "collapsed: " + x));
  await page.keyboard.press("Control+b"); await page.waitForTimeout(250);
  // (c) context menus at the far corners
  const vt = await page.locator(".h3l-tscroll").boundingBox();
  for (const [x, y, nm] of [[vt.x + vt.width - 6, vt.y + 44, "video lane (right)"], [null, null, "last audio head"]]) {
    if (x === null) await page.locator(".v6-ahead").last().click({ button: "right" }); else await page.mouse.click(x, y, { button: "right" });
    await page.waitForTimeout(250);
    const pr = await page.evaluate(() => { const p = document.querySelector(".v6-pop.on"); if (!p) return null; const r = p.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    if (!pr) errs.push(`no menu on ${nm}`); else if (pr[0] < 0 || pr[1] < 0 || pr[2] > w + 0.5 || pr[3] > h + 0.5) errs.push(`menu on ${nm} outside viewport [${pr.map((v) => v | 0)}]`);
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  }
  if (errs.length) fail++;
  console.log(`${w}x${h} @${s}%: ${errs.length ? "FAIL " + errs.join("; ") : "ok"}`);
  await page.close();
}
await b.close(); srv.close();
console.log(fail ? `${fail} FAILED` : "ALL OK"); process.exit(fail ? 1 : 0);
