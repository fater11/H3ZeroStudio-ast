// Lab layout test #2:
//  (a) the header resource cluster (.h3l-sysmon) and every header item stay inside the header rect
//      (1024x768, 1280x720, 1366x768, 1920x1080, 2560x1440, 3840x2160 × 75/100/125 %);
//  (b) no "doubled card": no card-like element (own background + border + radius) sitting on top of another card-like
//      ancestor with (almost) the same rect — checked for every rail tool + inspector + timeline at 1920@100 and 1280@125;
//  (c) the WebGL layer paints no panel shapes of its own (CSS is the single card layer).
// Saves corner crops to $OUT (default /workspace/h3lab_shots/cards). usage: node tests/layout_cards.mjs
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const require = createRequire((process.env.PWDEPS || "/tmp/pwdeps") + "/package.json"); const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), OUT = process.env.OUT || "/workspace/h3lab_shots/cards"; fs.mkdirSync(OUT, { recursive: true });
const srv = await new Promise((r) => { const s = http.createServer((q, res) => { const fp = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": fp.endsWith(".html") ? "text/html" : "text/javascript" }); fs.createReadStream(fp).pipe(res); }); s.listen(0, "127.0.0.1", () => r(s)); });
const b = await chromium.launch({ channel: process.env.PWCHANNEL || "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const open = async (w, h, s) => {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  await page.addInitScript(() => { try { localStorage.setItem("h3ls.fx", JSON.stringify({ level: "low", auto: false })); } catch {} });
  await page.goto(`http://127.0.0.1:${srv.address().port}/tests/harness/studio_layout.html?w=${w}&h=${h}&scale=${s}&theme=lab`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__H3_STUDIO__?.last, null, { timeout: 30000 }); await page.waitForTimeout(900); return page;
};
const HEAD = () => { const hd = document.querySelector(".h3l-root > .h3l-head"), H = hd.getBoundingClientRect(), out = [];
  for (const el of [hd.querySelector(".h3l-sysmon"), ...hd.children]) { if (!el) continue; const r = el.getBoundingClientRect(); if (r.width < 1 || getComputedStyle(el).display === "none") continue;
    if (r.left < H.left - 0.5 || r.right > H.right + 0.5 || r.top < H.top - 0.5 || r.bottom > H.bottom + 0.5) out.push(`${el.className.split(" ")[0]} [${r.left | 0}-${r.right | 0}] outside head [${H.left | 0}-${H.right | 0}]`); }
  const sm = hd.querySelector(".h3l-sysmon"); if (sm && sm.scrollWidth > sm.clientWidth + 1) out.push("sysmon content clipped");
  return { issues: out, level: hd.dataset.h3lMon || "0" }; };
const CARDS = () => {
  const root = document.querySelector(".h3l-root"), out = [];
  const cardy = (e) => { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false;
    const bg = cs.backgroundColor.match(/[\d.]+/g); const a = bg ? (bg.length > 3 ? +bg[3] : 1) : 0;
    return (a > 0.15 || cs.backgroundImage !== "none") && parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderTopLeftRadius) > 3; };
  const els = [...root.querySelectorAll(".h3l-body *, .h3l-tl, .h3l-tl *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 60 && r.height > 40 && cardy(e); });
  for (const e of els) { let p = e.parentElement;
    while (p && p !== root) { if (cardy(p)) { const a = e.getBoundingClientRect(), c = p.getBoundingClientRect();
        if (Math.abs(a.left - c.left) < 4 && Math.abs(a.right - c.right) < 4 && Math.abs(a.top - c.top) < 4 && Math.abs(a.bottom - c.bottom) < 4) out.push(`${e.className.split(" ").slice(0, 2).join(".")} doubles ${p.className.split(" ").slice(0, 2).join(".")}`);
        break; } p = p.parentElement; } }
  const gl = window.__H3LAB_FX__?.labFx?.gl || null; if (gl && gl.nr > 0) out.push(`shader paints ${gl.nr} panel shapes`);
  return [...new Set(out)];
};
let fail = 0;
for (const [w, h] of [[1024, 768], [1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]]) for (const s of [75, 100, 125]) {
  const page = await open(w, h, s); const r = await page.evaluate(HEAD); if (r.issues.length) fail++;
  console.log(`header ${w}x${h} @${s}%: ${r.issues.length ? "FAIL " + r.issues.join("; ") : "ok"} (compaction level ${r.level})`); await page.close();
}
for (const [w, h, s] of [[1920, 1080, 100], [1280, 720, 125]]) {
  const page = await open(w, h, s);
  for (const t of ["assets", "chars", "gallery", "projects", "models", "settings", "keys", "assist", "help", "info"]) {
    await page.evaluate((t) => { const ed = window.__H3_STUDIO__.ed; ed.tool = t; ed.renderTools(); ed.renderLeft(); }, t); await page.waitForTimeout(700);
    const r = await page.evaluate(CARDS); if (r.length) fail++;
    console.log(`cards ${t} ${w}x${h} @${s}%: ${r.length ? "FAIL " + r.join("; ") : "ok"}`);
    const pr = await page.evaluate(() => { const p = document.querySelector(".h3l-body > .h3l-panel"); const r = p?.getBoundingClientRect(); return r && r.width > 20 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; });
    if (pr) for (const [cn, cx, cy] of [["tl", pr.x, pr.y], ["br", pr.x + pr.w - 48, pr.y + pr.h - 48]]) await page.screenshot({ path: path.join(OUT, `${t}_${cn}_${w}x${h}_s${s}.png`), clip: { x: Math.max(0, cx - 12), y: Math.max(0, cy - 12), width: 60, height: 60 } });
  }
  await page.close();
}
await b.close(); srv.close(); console.log(fail ? `${fail} check(s) failed` : "all checks pass"); process.exit(fail ? 1 : 0);
