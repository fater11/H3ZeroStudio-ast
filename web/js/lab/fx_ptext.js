// H3ZeroStudio Lab — Particle Text wordmark (idea after React Bits "Particle Text", reimplemented in vanilla canvas).
// Text pixels are sampled into particles that assemble on mount, scatter away from the cursor and spring back.
// Writes straight into an ImageData (no per-particle draw calls), sleeps when settled, shares the Lab rAF.
// Static crisp text is kept underneath for reduced motion / low quality / no canvas.
import { FX, schedule } from "./fx_core.js";

const LIVE = new Set();
let _ptr = null;
function onPtr(e) { _ptr = e; for (const p of LIVE) p.wake(); }

export class ParticleText {
  /** host: element whose text is replaced visually (keeps its layout box); parts: [[text, "accent"|"base"], ...] */
  constructor(host, parts, o = {}) {
    this.host = host; this.parts = parts;
    this.o = Object.assign({ pad: 10, max: 6000, radius: 26, force: 5.5, dot: 1, dprCap: 2, intro: true, spread: 1 }, o);
    this.on = false; this._job = (t) => this.frame(t);
  }
  mount() {
    if (!this.host?.isConnected) return false;
    const cv = this.cv = document.createElement("canvas"); cv.className = "h3l-ptext"; cv.setAttribute("aria-hidden", "true");
    this.host.classList.add("h3l-ptext-host"); this.host.appendChild(cv);
    cv.style.setProperty("--h3l-pt-glow", String(this.o.glow ?? 0.25));
    this.ctx = cv.getContext("2d", { willReadFrequently: false });
    if (!this.ctx) { cv.remove(); return false; }
    this.build();
    LIVE.add(this);
    if (LIVE.size === 1) addEventListener("pointermove", onPtr, { passive: true });
    this.unsub = FX.on(() => this.sync());
    this.sync();
    return true;
  }
  unmount() { LIVE.delete(this); if (!LIVE.size) removeEventListener("pointermove", onPtr); this.unsub?.(); this.cv?.remove(); this.host?.classList.remove("h3l-ptext-host", "h3l-ptext-on"); this.cv = null; }
  get live() { return FX.anim && (FX.level === "max" || FX.level === "high"); }
  sync() { if (!this.cv) return; const on = this.live; this.host.classList.toggle("h3l-ptext-on", on); if (on) this.wake(); }

  build() {
    const host = this.host, cs = getComputedStyle(host), pad = this.o.pad;
    const W = host.offsetWidth, H = host.offsetHeight;   // layout px (unaffected by the studio's CSS zoom)
    const r = host.getBoundingClientRect(); const zoom = W ? r.width / W : 1;
    const d = Math.min(devicePixelRatio || 1, this.o.dprCap) * zoom;
    const cw = W + pad * 2, ch = H + pad * 2;
    Object.assign(this.cv.style, { left: -pad + "px", top: -pad + "px", width: cw + "px", height: ch + "px" });
    const bw = this.bw = Math.max(1, Math.round(cw * d)), bh = this.bh = Math.max(1, Math.round(ch * d));
    this.cv.width = bw; this.cv.height = bh; this.d = d; this.cssW = cw;
    // rasterise the wordmark offscreen
    const off = document.createElement("canvas"); off.width = bw; off.height = bh; const o = off.getContext("2d");
    o.scale(d, d); o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; o.textBaseline = "middle";
    const ls = parseFloat(cs.letterSpacing) || 0; let x = pad; const y = pad + H / 2 + 0.5;
    const acc = getComputedStyle(document.documentElement).getPropertyValue("--h3l-fx-accent").trim() || "#4f8cff";
    for (const [t, kind] of this.parts) {
      o.fillStyle = kind === "accent" ? acc : "#e6e9ef";
      for (const ch of t) { o.fillText(ch, x, y); x += o.measureText(ch).width + ls; }
    }
    this.off = off;   // full-resolution raster: shown at rest so the wordmark is crisp, particles only while moving
    const img = o.getImageData(0, 0, bw, bh).data;
    // pick a sampling step so the particle count stays under the cap
    let on = 0; for (let i = 3; i < img.length; i += 4) if (img[i] > 24) on++;
    const step = Math.max(1, Math.ceil(Math.sqrt(on / this.o.max)));
    const pts = [];
    for (let py = 0; py < bh; py += step) for (let px = 0; px < bw; px += step) {
      const i = (py * bw + px) * 4; const a = img[i + 3]; if (a < 24) continue;
      pts.push(px, py, img[i], img[i + 1], img[i + 2], step > 1 ? 255 : a);
    }
    const n = this.n = pts.length / 6;
    this.hx = new Float32Array(n); this.hy = new Float32Array(n); this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.col = new Uint32Array(n);
    const intro = this.o.intro && FX.anim;
    for (let k = 0; k < n; k++) {
      const px = pts[k * 6], py = pts[k * 6 + 1];
      this.hx[k] = px; this.hy[k] = py;
      if (intro) { const a = Math.random() * 6.283, rr = (0.3 + Math.random()) * bw * 0.5 * this.o.spread; this.x[k] = bw / 2 + Math.cos(a) * rr; this.y[k] = bh / 2 + Math.sin(a) * rr * 0.4; }
      else { this.x[k] = px; this.y[k] = py; }
      this.col[k] = ((pts[k * 6 + 5] << 24) | (pts[k * 6 + 4] << 16) | (pts[k * 6 + 3] << 8) | pts[k * 6 + 2]) >>> 0;   // ABGR (little endian)
    }
    this.step = step; this.dot = Math.max(1, Math.round(step * this.o.dot));
    this.image = this.ctx.createImageData(bw, bh); this.buf = new Uint32Array(this.image.data.buffer);
    this.draw(intro ? -1 : 0);
  }
  wake() { if (!this.on && this.cv && this.live) { this.on = true; this.lt = 0; schedule(this._job); } }
  frame() {
    if (!this.cv || !this.live) { this.on = false; return false; }
    let mx = -1e4, my = -1e4;
    if (_ptr) { const r = this.cv.getBoundingClientRect(); const s = this.bw / (r.width || 1); mx = (_ptr.clientX - r.left) * s; my = (_ptr.clientY - r.top) * s; }
    const R = this.o.radius * this.d, R2 = R * R, F = this.o.force * this.d;
    const now = performance.now(), sub = Math.max(1, Math.min(6, Math.round((now - (this.lt || now - 16.7)) / 16.7))); this.lt = now;   // fixed 60 Hz steps
    let moving = 0, dsum = 0; const n = this.n, x = this.x, y = this.y, vx = this.vx, vy = this.vy, hx = this.hx, hy = this.hy;
    for (let st = 0; st < sub; st++) { moving = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx, dy = y[i] - my, q = dx * dx + dy * dy;
      if (q < R2) { const f = (1 - q / R2) * F / (Math.sqrt(q) + 0.5); vx[i] += dx * f; vy[i] += dy * f; }
      vx[i] = (vx[i] + (hx[i] - x[i]) * 0.075) * 0.82; vy[i] = (vy[i] + (hy[i] - y[i]) * 0.075) * 0.82;
      x[i] += vx[i]; y[i] += vy[i];
      const dd = Math.abs(hx[i] - x[i]) + Math.abs(hy[i] - y[i]); if (st === sub - 1 && dd > dsum) dsum = dd;
      if (vx[i] * vx[i] + vy[i] * vy[i] > 0.0025 || dd > 0.3) moving++;
    } }
    // crossfade to the crisp raster as the particles converge (largest displacement under ~2 css px)
    const md = dsum / this.d; this.draw(md < 2 ? 1 - md / 2 : -1);
    if (!moving) { for (let i = 0; i < n; i++) { x[i] = hx[i]; y[i] = hy[i]; } this.draw(0); this.on = false; return false; }   // settled → sleep
    return true;
  }
  /** crisp: 0 = at rest (crisp raster only), (0..1] = particles + raster at that opacity, -1 = particles only */
  draw(crisp = 0) {
    if (crisp === 0 && this.off) { this.ctx.clearRect(0, 0, this.bw, this.bh); this.ctx.drawImage(this.off, 0, 0); return; }
    const b = this.buf, w = this.bw, h = this.bh, dot = this.dot; b.fill(0);
    for (let i = 0; i < this.n; i++) {
      const px = this.x[i] | 0, py = this.y[i] | 0; if (px < 0 || py < 0 || px >= w - dot || py >= h - dot) continue;
      const c = this.col[i]; let o = py * w + px;
      for (let yy = 0; yy < dot; yy++, o += w) for (let xx = 0; xx < dot; xx++) b[o + xx] = c;
    }
    this.ctx.putImageData(this.image, 0, 0);
    if (crisp > 0 && this.off) { this.ctx.globalAlpha = crisp; this.ctx.drawImage(this.off, 0, 0); this.ctx.globalAlpha = 1; }
  }
}
