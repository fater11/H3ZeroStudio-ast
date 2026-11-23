// Lab layout test: the timeline must sit in its own row and never cover the side panels.
// Checks (a) bounding rects of .h3l-tl vs every body column (rail, assets panel, preview, inspector) don't intersect,
// (b) hit-testing: points just above the timeline land in their panel, points just inside the timeline land in it,
// (c) panels' visible children don't spill under the timeline. Runs Lab harness at 4 resolutions x 3 UI scales.
// usage: node tests/layout_overlap.mjs   (needs playwright; PWDEPS=/path/to/dir-with-playwright)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const require = createRequire((process.env.PWDEPS || "/tmp/pwdeps") + "/package.json"); const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RES = (process.env.RES || "1280x720,1920x1080,2560x1440,3840x2160").split(",").map((x) => x.split("x").map(Number));
const SCALES = (process.env.SCALES || "75,100,125").split(",").map(Number);
const srv = await new Promise((r) => { const s = http.createServer((q, res) => { const fp = path.join(ROOT, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": fp.endsWith(".html") ? "text/html" : "text/javascript" }); fs.createReadStream(fp).pipe(res); }); s.listen(0, "127.0.0.1", () => r(s)); });
const b = await chromium.launch({ channel: process.env.PWCHANNEL || "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const CHECK = () => {
  const root = document.querySelector(".h3l-root"), out = [];
  const tl = root.querySelector(".h3l-tl"); if (!tl) return ["no timeline"];
  const T = tl.getBoundingClientRect(); const ix = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const cols = [...root.querySelectorAll(".h3l-body > *")].filter((e) => !e.contains(tl) && e.getBoundingClientRect().height > 4);
  for (const c of cols) {
    const R = c.getBoundingClientRect(), nm = c.className.split(" ")[0];
    if (ix(R, T)) out.push(`rect ${nm} [${R.top | 0}-${R.bottom | 0}] intersects timeline [${T.top | 0}-${T.bottom | 0}]`);
    // visible descendants (cards, inputs) clipped by the column — none may paint below the column bottom
    const vis = [...c.querySelectorAll(".h3l-card,.h3l-glass,.h3l-ast-compose,textarea,button")].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 2 && r.top < R.bottom && r.bottom > R.bottom + 1 && getComputedStyle(c).overflow === "visible"; });
    if (vis.length) out.push(`${nm}: ${vis.length} children spill below the column`);
    // hit-test 4px above the column bottom: must be the column, not the timeline
    for (const fx of [0.25, 0.5, 0.75]) { const x = R.left + R.width * fx, y = R.bottom - 4; const e = document.elementFromPoint(x, y); if (e && tl.contains(e)) { out.push(`${nm}: timeline covers panel at (${x | 0},${y | 0})`); break; } }
  }
  for (const fx of [0.1, 0.5, 0.9]) { const x = T.left + T.width * fx, y = T.top + 4; const e = document.elementFromPoint(x, y); if (e && !tl.contains(e) && !e.closest(".h3l-split,.h3l-fx-bg,.h3l-fx-sparks")) { out.push(`timeline top covered by ${e.className || e.tagName} at x=${x | 0}`); break; } }
  if (T.bottom > innerHeight + 1) out.push(`timeline bottom ${T.bottom | 0} > viewport ${innerHeight}`);
  return out;
};
let fail = 0;
for (const [w, h] of RES) for (const s of SCALES) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  await page.goto(`http://127.0.0.1:${srv.address().port}/tests/harness/studio_layout.html?w=${w}&h=${h}&scale=${s}&theme=lab`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__H3_STUDIO__?.last, null, { timeout: 30000 });
  // wait out the cinematic intro (panels rise in with transforms) so rects are the settled layout
  await page.waitForFunction(() => !document.querySelector(".h3l-fx-intro") && !document.getAnimations().some((a) => a.effect?.target?.closest?.(".h3l-body,.h3l-tl") && a.playState === "running" && isFinite(a.effect.getComputedTiming().endTime)), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
  const r = await page.evaluate(CHECK); if (r.length) fail++;
  console.log(`${w}x${h} @${s}%: ${r.length ? "FAIL " + r.join("; ") : "ok"}`); await page.close();
}
await b.close(); srv.close(); console.log(fail ? `${fail} configuration(s) failed` : "all configurations pass"); process.exit(fail ? 1 : 0);
