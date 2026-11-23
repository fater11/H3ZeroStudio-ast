// H3ZeroStudio Lab — FX core: quality levels, persistence, reduced-motion, spring easing, shared state.
// Vanilla ES module, no deps. Effects read `FX.level` / `FX.motion`; CSS reads :root[data-h3l-fx] / [data-h3l-motion].

const KEY = "h3ls.fx";
export const LEVELS = ["max", "high", "low", "off"];

/** Per-level budgets. scale = shader resolution vs CSS px (DPR capped at 1.5 first). */
export const PRESET = {
  max:  { scale: 0.62, fps: 60, oct: 5, caus: 5, glass: 1, sparks: 1, blur: 1 },
  high: { scale: 0.46, fps: 60, oct: 4, caus: 3, glass: 1, sparks: 1, blur: 1 },
  low:  { scale: 0.30, fps: 30, oct: 3, caus: 0, glass: 1, sparks: 0, blur: 0 },
  off:  { scale: 0,    fps: 0,  oct: 0, caus: 0, glass: 0, sparks: 0, blur: 0 },
};

function load() {
  try { return Object.assign({ level: "low", busyFreeze: true, auto: true }, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { return { level: "low", busyFreeze: true, auto: true }; }
}

const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

export const FX = {
  cfg: load(),
  /** level actually in use (the governor may step below the chosen one) */
  level: "max",
  motion: "full",          // "full" | "reduced"
  busy: false,
  stats: { fps: 0, drawMs: 0, scale: 0, level: "", auto: "", frames: 0 },
  _subs: new Set(),
  get chosen() { return LEVELS.includes(this.cfg.level) ? this.cfg.level : "low"; },
  set(patch) {
    Object.assign(this.cfg, patch);
    try { localStorage.setItem(KEY, JSON.stringify(this.cfg)); } catch {}
    if ("level" in patch) this.level = this.chosen;
    this.apply();
  },
  setAutoLevel(lv) { if (lv !== this.level) { this.level = lv; this.apply(); } },
  apply() {
    const de = document.documentElement;
    this.motion = mq?.matches ? "reduced" : "full";
    de.dataset.h3lFx = this.level;
    de.dataset.h3lMotion = this.motion;
    for (const f of this._subs) { try { f(this); } catch (e) { console.warn("[H3 Lab fx]", e); } }
  },
  on(f) { this._subs.add(f); return () => this._subs.delete(f); },
  get p() { return PRESET[this.level] || PRESET.max; },
  /** true when decorative motion should run */
  get anim() { return this.level !== "off" && this.motion !== "reduced"; },
};
FX.level = FX.chosen;
mq?.addEventListener?.("change", () => FX.apply());

/** Damped spring (mass 1) sampled into a CSS linear() easing; returns { easing, ms }. */
export function springEasing(stiffness = 170, damping = 18, samples = 48) {
  const dt = 1 / 120; let x = 0, v = 0; const pts = []; let t = 0;
  // simulate until settled
  for (let i = 0; i < 2400; i++) {
    const a = stiffness * (1 - x) - damping * v; v += a * dt; x += v * dt; t += dt; pts.push(x);
    if (i > 30 && Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01) break;
  }
  const out = []; const n = pts.length;
  for (let i = 0; i <= samples; i++) out.push(+(i === 0 ? 0 : pts[Math.min(n - 1, Math.round((i / samples) * (n - 1)))]).toFixed(4));
  out[out.length - 1] = 1;
  return { easing: `linear(${out.join(", ")})`, ms: Math.round(t * 1000) };
}

export const SPRING = {
  soft: springEasing(140, 16),     // panels, modals
  snappy: springEasing(320, 22),   // buttons release
  bouncy: springEasing(260, 17),   // toggles, glide indicator
};

/** Publish springs as CSS custom properties once. */
export function publishSprings() {
  const st = document.documentElement.style;
  for (const [k, s] of Object.entries(SPRING)) { st.setProperty(`--h3l-sp-${k}`, s.easing); st.setProperty(`--h3l-sp-${k}-ms`, s.ms + "ms"); }
}

/** Accent as 0..1 rgb from a CSS color string like #4f8cff. */
export function hexRgb(hex, fb = [0.31, 0.55, 1]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return fb;
  const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** One shared requestAnimationFrame for every Lab effect. A job returns true to stay scheduled. */
const _jobs = new Set(); let _raf = 0;
function _frame(now) {
  _raf = 0;
  for (const j of _jobs) { let keep = false; try { keep = j(now); } catch (e) { console.warn("[H3 Lab fx] job", e); } if (!keep) _jobs.delete(j); }
  if (_jobs.size && !document.hidden) _raf = requestAnimationFrame(_frame);
}
export function schedule(job) { _jobs.add(job); if (!_raf && !document.hidden) _raf = requestAnimationFrame(_frame); }
if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", () => { if (!document.hidden && _jobs.size && !_raf) _raf = requestAnimationFrame(_frame); });
