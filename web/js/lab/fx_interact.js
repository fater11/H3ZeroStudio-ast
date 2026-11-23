// H3ZeroStudio Lab — global interaction layer (event delegation on the studio root + body portals).
// States via classes/CSS vars only; motion is transform-ish via individual `scale`/`translate` props (compose with
// any existing `transform`), so no layout reflow. Timeline tracks are never transformed (hit-testing stays exact).
import { FX, SPRING } from "./fx_core.js";
// start WAAPI animations on the main-thread timeline immediately (never left "pending" if the compositor stalls)
const anim = (el, k, o) => { const a = el.animate(k, o); try { if (a.startTime == null) a.startTime = document.timeline.currentTime; } catch {} return a; };


export const PRESS = [
  "button:not(:disabled)", ".h3l-tool", ".h3l-pill", ".h3l-settab", ".h3l-ast-settab", ".h3l-theme", ".h3l-chip.warn",
  ".h3l-menu .it", "summary", "a.h3l-support", ".h3l-social-link", ".h3l-tog", "[role=button]", ".h3l-take", ".h3l-swatch",
].join(",");
const CARDS = ".h3l-theme, .h3l-gcard, .h3l-asset, .h3l-char, .h3l-chcard";
const MAGNET = ".h3l-social-link";   // buttons no longer drift toward the cursor: glow + lift only (keeps groups aligned)
/** Pro direction: no ripples/sparks on press, only quiet hover/press feedback. */
export const CALM = true;
export const GLOW = ".h3l-btn, .h3l-spk, .h3l-edge-btn, .h3l-play, .h3l-tool, .h3l-pill, .h3l-settab, .h3l-ast-settab";
const LIGHT = GLOW + ", .h3l-glass, .h3l-card, " + CARDS + ", .h3l-sel, .h3l-in";
const NO_MOVE = ".h3l-tl-main, .h3l-ruler, .h3l-track, .h3l-clip, .h3l-region, .h3l-phead, .h3l-split, .h3l-range, .h3l-stage";
// groups that own a single selected item → animated glide indicator between the old and the new one
const GROUPS = [
  [".h3l-pills", ".h3l-pill.on"], [".h3l-settabs", ".h3l-settab.on"], [".h3l-tools", ".h3l-tool.on"],
  [".h3l-themegrid", ".h3l-theme.on"], [".h3l-ast-settabs", ".h3l-ast-settab.on"],
];

export class Interact {
  constructor(fx) { this.fx = fx; this.hover = null; this.light = null; this.rect = null; this.lrect = null; this.ev = null; this.raf = 0; this.lastDown = null; }

  attach(root) {
    this.root = root;
    const o = { passive: true };
    this.h = {
      move: (e) => { this.ev = e; if (!this.raf) this.raf = requestAnimationFrame(() => this.onFrame()); },
      over: (e) => this.onOver(e),
      down: (e) => this.onDown(e),
      up: () => this.release(),
      input: (e) => this.onInput(e),
      scroll: () => { this.rect = this.lrect = null; this.fx.gl?.markRects(); },
      leave: () => this.clearHover(),
    };
    root.addEventListener("pointermove", this.h.move, o);
    root.addEventListener("pointerover", this.h.over, o);
    root.addEventListener("pointerleave", this.h.leave, o);
    document.addEventListener("pointerdown", this.h.down, { capture: true, passive: true });
    document.addEventListener("pointerup", this.h.up, { capture: true, passive: true });
    document.addEventListener("pointercancel", this.h.up, { capture: true, passive: true });
    root.addEventListener("input", this.h.input, o);
    root.addEventListener("scroll", this.h.scroll, { capture: true, passive: true });
  }
  detach() {
    const r = this.root; if (!r) return;
    r.removeEventListener("pointermove", this.h.move); r.removeEventListener("pointerover", this.h.over); r.removeEventListener("pointerleave", this.h.leave);
    document.removeEventListener("pointerdown", this.h.down, true); document.removeEventListener("pointerup", this.h.up, true); document.removeEventListener("pointercancel", this.h.up, true);
    r.removeEventListener("input", this.h.input); r.removeEventListener("scroll", this.h.scroll, true);
    cancelAnimationFrame(this.raf); this.root = null;
  }

  onOver(e) {
    const t = e.target;
    const el = t.closest?.(MAGNET + "," + CARDS);
    if (el !== this.hover) { this.unHover(); this.hover = el && !el.closest(NO_MOVE) && this.root.contains(el) ? el : null; this.rect = null; }
    const li = t.closest?.(LIGHT);
    if (li !== this.light) {
      if (this.light) this.light.classList.remove("h3l-lit");
      this.light = li; this.lrect = null;
      // place the spotlight at the real pointer BEFORE it fades in (no jump from the previous position / centre)
      if (li) { this.spot(li, e.clientX, e.clientY); li.classList.add("h3l-lit"); }
    }
  }
  unHover() {
    const el = this.hover; if (!el) return;
    el.classList.remove("h3l-mag", "h3l-tilt");
    el.style.removeProperty("--h3l-mx"); el.style.removeProperty("--h3l-my"); el.style.removeProperty("--h3l-rx"); el.style.removeProperty("--h3l-ry");
    this.hover = null;
  }
  clearHover() { this.unHover(); if (this.light) { this.light.classList.remove("h3l-lit"); this.light = null; } }

  /** rAF-throttled pointer work: cached rects (read once per hover), CSS var writes only. */
  onFrame() {
    this.raf = 0; const e = this.ev; if (!e) return;
    this.fx.gl?.pointer(e.clientX, e.clientY);
    if (!FX.anim) return;
    if (this.light) this.spot(this.light, e.clientX, e.clientY);
    const el = this.hover; if (!el || e.buttons) return;
    const r = this.rect || (this.rect = el.getBoundingClientRect());
    const nx = (e.clientX - r.left) / (r.width || 1) - 0.5, ny = (e.clientY - r.top) / (r.height || 1) - 0.5;
    if (el.matches(CARDS)) {
      el.classList.add("h3l-tilt");
      el.style.setProperty("--h3l-ry", (nx * 7).toFixed(2) + "deg"); el.style.setProperty("--h3l-rx", (-ny * 7).toFixed(2) + "deg");
    } else {
      // magnetic pull: moves toward the cursor (never away from it), max ~3px
      const k = Math.min(3, Math.max(r.width, r.height) * 0.08);
      el.classList.add("h3l-mag");
      el.style.setProperty("--h3l-mx", (nx * k).toFixed(2) + "px"); el.style.setProperty("--h3l-my", (ny * k).toFixed(2) + "px");
    }
  }

  /** spotlight position as % of the element's border box. getBoundingClientRect is post-zoom/post-transform and the
   *  pointer is in the same viewport space, so the ratio is exact at any UI scale; % is then resolved by CSS in the
   *  element's own (zoomed) box. Rect cached per hover; the cache is dropped on scroll/resize. */
  spot(li, x, y) {
    const r = this.lrect || (this.lrect = li.getBoundingClientRect());
    const fx = Math.max(-20, Math.min(120, (x - r.left) / (r.width || 1) * 100)), fy = Math.max(-20, Math.min(120, (y - r.top) / (r.height || 1) * 100));
    li.style.setProperty("--h3l-lx", fx.toFixed(1) + "%"); li.style.setProperty("--h3l-ly", fy.toFixed(1) + "%");
  }

  onDown(e) {
    if (e.button > 0) return;
    const t = e.target;
    this.lastDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    const el = t.closest?.(PRESS);
    if (!el || el.closest(".h3l-fx-ignore")) return;
    const inStudio = this.root?.contains(el) || el.closest(".h3l-menu,.h3l-dd,.h3l-lp,.h3l-modal,.h3l-pe-modal,.h3l-monpop");
    if (!inStudio) return;
    const r = el.getBoundingClientRect();
    // squash amount capped to ~1.2px per side so an edge press never slides off the element
    const s = Math.max(0.94, 1 - 2.4 / Math.max(r.width, r.height, 1));
    if (!el.closest(NO_MOVE)) { el.style.setProperty("--h3l-sq", s.toFixed(4)); el.classList.add("h3l-down"); this.down = el; }
    if (FX.anim && !CALM) {
      const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8;
      const z = r.width / (el.offsetWidth || r.width);
      this.fx.sparks?.ripple(e.clientX, e.clientY, r, rad * z);
      if (el.matches(".primary")) this.fx.sparks?.spark(e.clientX, e.clientY, 10, 12, 30);   // sparks only on primary actions
      this.fx.gl?.ripple(e.clientX, e.clientY, el.matches(".primary") ? 1 : 0.45);
      if (el.matches(".h3l-head-actions .h3l-btn.primary")) { this.fx.sparks?.burst(r); this.fx.gl?.ripple(e.clientX, e.clientY, 1.6); }
    }
    this.glideStart(el);
  }
  release() {
    const el = this.down; if (!el) return; this.down = null;
    el.classList.remove("h3l-down");
    if (FX.anim && el.animate) anim(el, [{ scale: el.style.getPropertyValue("--h3l-sq") || "0.97" }, { scale: "1" }], { duration: SPRING.snappy.ms, easing: SPRING.snappy.easing });
  }

  onInput(e) {
    const t = e.target;
    if (t.matches?.('input[type="range"]')) { t.classList.add("h3l-val"); clearTimeout(t._h3lv); t._h3lv = setTimeout(() => t.classList.remove("h3l-val"), 450); }
  }

  // ---- selected-state glide (FLIP ghost on body; real DOM untouched)
  glideStart(el) {
    if (!FX.anim) return;
    for (const [g, on] of GROUPS) {
      const grp = el.closest(g); if (!grp) continue;
      const item = el.closest(on.replace(".on", ""));
      if (!item || item.matches(on)) return;
      const old = grp.querySelector(":scope " + on) || grp.querySelector(on);
      if (!old) return;
      const from = old.getBoundingClientRect(), grpRect = grp.getBoundingClientRect(), cls = g;
      setTimeout(() => requestAnimationFrame(() => this.glideEnd(cls, on, from, grpRect, el)), 0);
      return;
    }
  }
  glideEnd(gsel, on, from, grpRect, clicked) {
    let to = clicked.isConnected && clicked.matches(on) ? clicked : null;
    if (!to) {   // the group was re-rendered: find the new selected item at the same place
      const cx = grpRect.left + grpRect.width / 2, cy = grpRect.top + grpRect.height / 2;
      for (const g of document.querySelectorAll(gsel)) { const r = g.getBoundingClientRect(); if (Math.abs(r.left + r.width / 2 - cx) < 40 && Math.abs(r.top + r.height / 2 - cy) < 40) { to = g.querySelector(on); break; } }
    }
    if (!to) return;
    const t = to.getBoundingClientRect(); if (!t.width) return;
    const ghost = document.createElement("div"); ghost.className = "h3l-fx-glide";
    const rad = getComputedStyle(to).borderTopLeftRadius;
    Object.assign(ghost.style, { left: t.left + "px", top: t.top + "px", width: t.width + "px", height: t.height + "px", borderRadius: rad });
    document.body.appendChild(ghost);
    const dx = from.left - t.left, dy = from.top - t.top, sx = from.width / t.width, sy = from.height / t.height;
    const a = anim(ghost, [
      { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: 0.95 },
      { transform: "none", opacity: 0.9, offset: 0.7 },
      { transform: "none", opacity: 0 },
    ], { duration: SPRING.bouncy.ms + 160, easing: SPRING.bouncy.easing });
    a.onfinish = a.oncancel = () => ghost.remove();
    to.animate?.([{ filter: "brightness(1.6)" }, { filter: "none" }], { duration: 520, easing: "ease-out" });
  }
}
