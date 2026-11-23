// H3ZeroStudio Lab — top overlay (2D canvas, pointer-events:none): click sparks, clipped press ripples,
// generation-start particle burst + shockwave. The rAF loop only runs while something is alive.
import { FX, schedule } from "./fx_core.js";

export class Sparks {
  constructor() { this.cv = null; this.ctx = null; this.items = []; this.raf = 0; this._loop = (t) => this.loop(t); this.on = false; this.acc = "#4f8cff"; }
  mount() {
    const cv = this.cv = document.createElement("canvas");
    cv.className = "h3l-fx-top"; cv.setAttribute("aria-hidden", "true");
    document.body.appendChild(cv);
    this.ctx = cv.getContext("2d");
    this.fit();
    this._rs = () => this.fit(); addEventListener("resize", this._rs);
  }
  unmount() { removeEventListener("resize", this._rs); this.cv?.remove(); this.cv = null; this.items.length = 0; }
  fit() { if (!this.cv) return; this.d = Math.min(devicePixelRatio || 1, 1.5); this.cv.width = Math.round(innerWidth * this.d); this.cv.height = Math.round(innerHeight * this.d); }
  setAccent(c) { if (c) this.acc = c.trim(); }
  kick() { if (!this.on && this.cv) { this.on = true; this.last = performance.now(); schedule(this._loop); } }

  /** Click Spark: short radial dashes. */
  spark(x, y, n = 9, len = 14, reach = 26) {
    if (!FX.p.sparks || !FX.anim) return;
    const t = performance.now(), a0 = Math.random() * Math.PI;
    for (let i = 0; i < n; i++) this.items.push({ k: 0, x, y, a: a0 + (i / n) * Math.PI * 2, t, life: 420, len, reach });
    this.kick();
  }
  /** Ripple clipped to the pressed element's rounded box (no DOM changes). */
  ripple(x, y, rect, radius) {
    if (!FX.anim || !rect || rect.width < 6) return;
    const R = Math.hypot(Math.max(x - rect.left, rect.right - x), Math.max(y - rect.top, rect.bottom - y));
    this.items.push({ k: 1, x, y, rect, radius, R, t: performance.now(), life: 560 });
    this.kick();
  }
  /** Generation start: particle burst + shockwave from a rect. */
  burst(rect) {
    if (!FX.anim || !rect) return;
    const t = performance.now(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const n = FX.level === "max" ? 60 : 32;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 5.5;
      this.items.push({ k: 2, x: cx + (Math.random() - 0.5) * rect.width, y: cy + (Math.random() - 0.5) * rect.height, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, t, life: 700 + Math.random() * 700, r: 0.8 + Math.random() * 2.2, w: Math.random() });
    }
    this.items.push({ k: 3, x: cx, y: cy, t, life: 900 });
    this.kick();
  }

  loop(now) {
    const c = this.ctx, d = this.d; if (!c || !this.cv) { this.on = false; return false; }
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height); c.setTransform(d, 0, 0, d, 0, 0);
    const step = Math.min(3, (now - this.last) / 16.7); this.last = now;
    let w = 0; const it = this.items;
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < it.length; i++) {
      const p = it[i], e = (now - p.t) / p.life; if (e >= 1) continue; it[w++] = p;
      if (p.k === 0) {
        const ease = 1 - Math.pow(1 - e, 3), dist = ease * p.reach, l = p.len * (1 - ease);
        c.strokeStyle = "rgba(225,232,245,.95)"; c.globalAlpha = 1 - e; c.lineWidth = 1.5; c.lineCap = "round"; c.beginPath();
        c.moveTo(p.x + Math.cos(p.a) * dist, p.y + Math.sin(p.a) * dist); c.lineTo(p.x + Math.cos(p.a) * (dist + l), p.y + Math.sin(p.a) * (dist + l)); c.stroke();
      } else if (p.k === 1) {
        const r = p.R * (1 - Math.pow(1 - e, 2.4)); const R = p.rect;
        c.save(); c.beginPath(); c.roundRect ? c.roundRect(R.left, R.top, R.width, R.height, p.radius) : c.rect(R.left, R.top, R.width, R.height); c.clip();
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, r));
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.75, "rgba(220,228,240,.10)"); g.addColorStop(1, "rgba(220,228,240,0)");
        c.globalAlpha = 1 - e; c.fillStyle = g; c.fillRect(R.left, R.top, R.width, R.height); c.restore();
      } else if (p.k === 2) {
        p.vx *= Math.pow(0.985, step); p.vy = p.vy * Math.pow(0.985, step) + 0.05 * step; p.x += p.vx * step; p.y += p.vy * step;
        c.globalAlpha = (1 - e) * (0.6 + 0.4 * Math.sin(now / 60 + p.w * 9)); c.fillStyle = p.w > 0.55 ? "#e8eef8" : this.acc;
        c.beginPath(); c.arc(p.x, p.y, p.r * (1 - e * 0.5), 0, 6.283); c.fill();
      } else if (p.k === 3) {
        const r = 10 + e * 220; c.globalAlpha = (1 - e) * 0.45; c.strokeStyle = this.acc; c.lineWidth = 1 + (1 - e) * 3;
        c.beginPath(); c.arc(p.x, p.y, r, 0, 6.283); c.stroke();
      }
    }
    it.length = w; c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    if (!w) { c.clearRect(0, 0, this.cv.width, this.cv.height); this.on = false; return false; }
    return true;
  }
}
