// H3ZeroStudio Lab — FX entry point. attach(editor) after the studio root is in the DOM, detach(editor) on close.
// Everything here is a skin/effects layer: it never changes studio state, only classes, CSS vars and overlay canvases.
import { FX, LEVELS, SPRING, publishSprings } from "./fx_core.js";
import { GLBackground } from "./fx_gl.js";
import { Sparks } from "./fx_sparks.js";
import { Interact } from "./fx_interact.js";
import { ParticleText } from "./fx_ptext.js";
import { FX_CSS } from "./fx_css.js";
import { SKIN_CSS } from "./fx_skin.js";
import { PRO_CSS } from "./fx_pro.js";
import { Chrome } from "./fx_chrome.js";
// start WAAPI animations on the main-thread timeline immediately (never left "pending" if the compositor stalls)
const anim = (el, k, o) => { const a = el.animate(k, o); try { if (a.startTime == null) a.startTime = document.timeline.currentTime; } catch {} return a; };


let _introDone = false;
const PORTALS = ".h3l-menu, .h3l-dd, .h3l-lp, .h3l-monpop, .h3l-pe-modal, .h3l-tip";

function injectCss() {
  if (document.getElementById("h3l-fx-style")) return;
  const s = document.createElement("style"); s.id = "h3l-fx-style"; s.textContent = FX_CSS + SKIN_CSS + PRO_CSS; document.head.appendChild(s);
}

class LabFx {
  constructor() { this.ed = null; this.gl = null; this.sparks = null; this.ix = null; this.mos = []; this.pt = []; }

  attach(ed) {
    if (this.ed === ed && ed.root) return;
    this.detach();
    const root = ed.root; if (!root) return;
    this.ed = ed; injectCss(); publishSprings(); FX.level = FX.chosen; FX.apply();
    root.classList.add("h3l-lab");
    this.sparks = new Sparks(); this.sparks.mount();
    this.sparks.setAccent(getComputedStyle(document.documentElement).getPropertyValue("--h3l-fx-accent"));
    this.ix = new Interact(this); this.ix.attach(root);
    this.mountGL();
    this.unsub = FX.on(() => this.onLevel());
    // panels → shader glass rects
    this.ro = new ResizeObserver(() => this.gl?.markRects());
    this.ro.observe(root); this.watchPanels();
    this._rs = () => this.gl?.markRects(); addEventListener("resize", this._rs);
    // DOM watchers: modals/toasts on the root, menus/popovers on <body>, panel content swaps
    this.observe(root, (n) => this.onRootAdd(n));
    this.observe(document.body, (n) => { if (n.matches?.(PORTALS)) this.enterPortal(n); });
    this.panelKey = this.key();
    this.chrome = new Chrome(ed); this.chrome.ensure();
    this.tick = setInterval(() => this.poll(), 700);
    this._ck = (e) => { if (e.target.closest?.(".h3l-tool")) requestAnimationFrame(() => this.chrome?.syncDock()); }; root.addEventListener("click", this._ck);
    this.mountLogo();
    if (!_introDone && FX.anim) { _introDone = true; this.intro(); }
    if (root.querySelector(".h3l-modal")) for (const m of root.querySelectorAll(".h3l-modal")) this.onRootAdd(m);
  }

  detach() {
    if (!this.ed) return;
    clearInterval(this.tick); this.unsub?.(); this.chrome?.detach(); this.ed.root?.removeEventListener("click", this._ck); this.chrome = null; this.ro?.disconnect(); removeEventListener("resize", this._rs);
    for (const m of this.mos) m.disconnect(); this.mos = [];
    for (const p of this.pt) p.unmount(); this.pt = [];
    this.ix?.detach(); this.sparks?.unmount(); this.gl?.unmount();
    this.gl = this.sparks = this.ix = null; this.ed = null;
  }

  mountGL() {
    if (this.gl || FX.level === "off" || !this.ed?.root) return;
    const gl = new GLBackground();
    try { if (!gl.mount(this.ed.root)) return; } catch (e) { console.warn("[H3 Lab] WebGL background disabled:", e); gl.unmount(); return; }
    // panels are drawn ONLY by CSS (one card = one radius/border/shadow). The shader no longer paints its own glass
    // shapes under them: a second, shader-drawn panel could never match CSS radii/clipping/animations exactly.
    gl.rectFn = () => 0;
    gl._radius = 16 * this.zoom();
    this.gl = gl;
    document.documentElement.dataset.h3lGl = "on";
  }
  onLevel() {
    if (FX.level === "off") { this.gl?.unmount(); this.gl = null; document.documentElement.dataset.h3lGl = "off"; }
    else { this.mountGL(); this.gl?.kick(); }
    for (const p of this.pt) p.sync();
  }
  zoom() { return parseFloat(this.ed?.root?.style.zoom || "1") || 1; }

  /** Rects of the big panels in viewport px (× k = shader px); inspector cards clipped to the scroll box. */
  panelRects(out, k, max) {
    const root = this.ed?.root; if (!root) return 0;
    let n = 0;
    const push = (r, clip) => {
      if (n >= max) return;
      let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
      if (clip) { x0 = Math.max(x0, clip.left); y0 = Math.max(y0, clip.top); x1 = Math.min(x1, clip.right); y1 = Math.min(y1, clip.bottom); }
      if (x1 - x0 < 8 || y1 - y0 < 8) return;
      out[n * 4] = x0 * k; out[n * 4 + 1] = y0 * k; out[n * 4 + 2] = (x1 - x0) * k; out[n * 4 + 3] = (y1 - y0) * k; n++;
    };
    for (const el of root.querySelectorAll(":scope > .h3l-glass, :scope > .h3l-body > .h3l-glass")) push(el.getBoundingClientRect());
    const insp = root.querySelector(":scope > .h3l-body > .h3l-insp");
    if (insp) { const c = insp.getBoundingClientRect(); for (const el of insp.querySelectorAll(":scope > .h3l-glass")) { if (n >= max) break; push(el.getBoundingClientRect(), c); } }
    if (this.gl) { const hd = root.querySelector(":scope > .h3l-head"); this.gl._radius = (hd ? parseFloat(getComputedStyle(hd).borderTopLeftRadius) || 12 : 12) * this.zoom(); }
    return n;
  }
  watchPanels() {
    const body = this.ed?.root?.querySelector(":scope > .h3l-body"); if (!body || !this.ro) return;
    for (const el of body.children) this.ro.observe(el);
  }

  observe(target, fn) {
    const mo = new MutationObserver((recs) => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) fn(n); });
    mo.observe(target, { childList: true }); this.mos.push(mo);
  }

  key() { const e = this.ed; return `${e?.tool}|${e?._setTab}|${e?.sel}`; }
  poll() {
    const ed = this.ed; if (!ed?.root) return;
    const busy = !!ed.run?.active;
    if (busy !== FX.busy) { FX.busy = busy; const de = document.documentElement; de.dataset.h3lBusy = busy ? "1" : "0"; de.dataset.h3lFrozen = busy && FX.cfg.busyFreeze ? "1" : "0"; this.gl?.markRects(); this.gl?.kick(); }
    this.chrome?.ensure();
    const k = this.key();
    if (k !== this.panelKey) { const [t0, s0] = this.panelKey.split("|"); const [t1, s1] = k.split("|"); this.panelKey = k; if (t0 !== t1 || s0 !== s1) this.enterPanel(ed.$.left); else this.enterPanel(ed.$.insp, true); this.gl?.markRects(); this.watchPanels(); }
    if (this.logo && !this.logo.host.isConnected) { this.logo.unmount(); this.pt = this.pt.filter((p) => p !== this.logo); this.logo = null; this.mountLogo(); }
  }

  // ------------------------------------------------------------- entrances
  intro() {
    const root = this.ed.root; root.classList.add("h3l-fx-intro");
    root.querySelectorAll(".h3l-tools > .h3l-tool").forEach((t, i) => t.style.setProperty("--h3l-n", i));
    this.gl?.playIntro();
    setTimeout(() => root.classList.remove("h3l-fx-intro"), 1700);
  }
  origin(box) {
    const d = this.ix?.lastDown; if (!d || performance.now() - d.t > 1500) return "50% 40%";
    const r = box.getBoundingClientRect(); if (!r.width) return "50% 40%";
    return `${Math.max(0, Math.min(100, (d.x - r.left) / r.width * 100)).toFixed(1)}% ${Math.max(0, Math.min(100, (d.y - r.top) / r.height * 100)).toFixed(1)}%`;
  }
  onRootAdd(n) {
    if (!FX.anim) return;
    if (n.matches?.(".h3l-modal")) {
      anim(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
      const box = n.firstElementChild;
      if (box) {
        box.style.transformOrigin = this.origin(box);
        anim(box, [{ opacity: 0, scale: "0.9", translate: "0 16px", filter: "blur(10px)" }, { opacity: 1, scale: "1", translate: "0 0", filter: "blur(0px)" }],
          { duration: SPRING.soft.ms, easing: SPRING.soft.easing });
      }
      if (n.querySelector(".h3l-welcome")) this.welcome(n);
      this.gl?.ripple(innerWidth / 2, innerHeight / 2, 0.8);
    } else if (n.matches?.(".h3l-toast")) {
      anim(n, [{ opacity: 0, translate: "0 22px", scale: "0.88" }, { opacity: 1, translate: "0 0", scale: "1" }], { duration: SPRING.bouncy.ms, easing: SPRING.bouncy.easing });
    }
  }
  enterPortal(n) {
    if (!FX.anim) return;
    if (n.matches(".h3l-tip")) { anim(n, [{ opacity: 0, translate: "0 4px" }, { opacity: 1, translate: "0 0" }], { duration: 160, easing: "ease-out" }); return; }
    n.style.transformOrigin = this.origin(n);
    anim(n, [{ opacity: 0, scale: "0.94", translate: "0 -6px", filter: "blur(4px)" }, { opacity: 1, scale: "1", translate: "0 0", filter: "blur(0px)" }], { duration: SPRING.snappy.ms, easing: SPRING.snappy.easing });
    let i = 0; for (const it of n.querySelectorAll(".it")) { if (i > 14) break; anim(it, [{ opacity: 0, translate: "-6px 0" }, { opacity: 1, translate: "0 0" }], { duration: 260, delay: 18 * i++, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }); }
  }
  /** fluid panel swap: content rises in, rows stagger, the panel title resolves from blur letter by letter */
  enterPanel(panel, soft = false) {
    if (!panel || !FX.anim) return;
    anim(panel, [{ opacity: 0.55, translate: "0 8px" }, { opacity: 1, translate: "0 0" }], { duration: 380, easing: SPRING.soft.easing });
    if (soft) return;
    const sc = panel.querySelector(".h3l-scroll"); let i = 0;
    if (sc) for (const row of sc.children) { if (i > 14) break; anim(row, [{ opacity: 0, translate: "0 12px" }, { opacity: 1, translate: "0 0" }], { duration: 420, delay: 30 + i++ * 24, easing: SPRING.soft.easing, fill: "backwards" }); }
    const h3 = panel.querySelector(".h3l-ph h3, .h3l-ph b");
    if (h3) this.splitReveal(h3);
  }
  splitReveal(el) {
    if (el.dataset.h3lSplit || el.children.length || (el.textContent || "").length > 42) return;
    const txt = el.textContent; el.dataset.h3lSplit = "1"; el.setAttribute("aria-label", txt);
    el.textContent = "";
    [...txt].forEach((c, i) => { const s = document.createElement("span"); s.className = "h3l-ch"; s.setAttribute("aria-hidden", "true"); s.style.setProperty("--i", i); s.textContent = c === " " ? "\u00a0" : c; el.appendChild(s); });
  }
  welcome(modal) {
    modal.classList.add("h3l-fx-welcome");
    const box = modal.querySelector(".h3l-welcome"); if (!box || box.querySelector(".h3l-fx-hero")) return;
    const hero = document.createElement("div"); hero.className = "h3l-fx-hero";
    const word = document.createElement("span"); word.className = "h3l-fx-word"; word.innerHTML = "<b>H3</b>ZeroStudio"; word.setAttribute("aria-label", "H3ZeroStudio");
    const tag = document.createElement("small"); tag.textContent = "LAB · EXPERIMENTAL UI";
    hero.append(word, tag); box.prepend(hero);
    const t = box.querySelector(".hd b"); if (t) this.splitReveal(t);
    this.gl?.playIntro();
    requestAnimationFrame(() => { const p = new ParticleText(word, [["H3", "accent"], ["ZeroStudio", "base"]], { pad: 30, radius: 60, force: 6, glow: .32, max: 26000, spread: 1.6 });
      if (p.mount()) { this.pt.push(p); const done = () => { p.unmount(); this.pt = this.pt.filter((x) => x !== p); };
        const mo = new MutationObserver(() => { if (!modal.isConnected) { done(); mo.disconnect(); } }); mo.observe(this.ed.root, { childList: true }); } });
  }
  mountLogo() {
    const host = this.ed?.root?.querySelector(".h3l-logo > span"); if (!host) return;
    const go = () => { if (!host.isConnected || this.logo) return; const p = new ParticleText(host, [["H3", "accent"], ["ZeroStudio", "base"]], { pad: 10, radius: 22, force: 5, max: 7000, dprCap: 2, glow: .22 });
      if (p.mount()) { this.logo = p; this.pt.push(p); } };
    (document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(go));
  }

  // ------------------------------------------------------------- settings UI
  settingsSection(h, T) {
    const lv = FX.chosen;
    const names = { max: T("MAX"), high: T("Высокое"), low: T("Низкое"), off: T("Выкл") };
    const pills = h("div", { class: "h3l-pills h3l-fx-levels" }, LEVELS.map((id) => h("div", {
      class: "h3l-pill" + (id === lv ? " on" : ""), title: id === "off" ? T("Без шейдеров и анимаций — как обычная студия") : "",
      onclick: () => { FX.set({ level: id }); this.ed?.renderLeft?.(); } }, names[id])));
    const stat = h("span", { class: "h3l-fx-stat" }, "");
    const upd = () => { const s = FX.stats; stat.textContent = FX.level === "off" ? T("эффекты выключены") : `${s.fps || "—"} fps · ${s.drawMs} ms CPU · ×${s.scale} · ${s.level}${s.auto ? " · auto " + s.auto : ""}`; };
    upd(); const iv = setInterval(() => { if (!stat.isConnected) clearInterval(iv); else upd(); }, 1000);
    const chk = (key, label, title) => this.ed?.toggle ? this.ed.toggle(label, !!FX.cfg[key], (v) => FX.set({ [key]: v }), title)
      : h("label", { class: "h3l-fx-chk", title }, h("input", { type: "checkbox", checked: !!FX.cfg[key], onchange: (e) => FX.set({ [key]: e.target.checked }) }), label);
    return h("div", { class: "h3l-fx-settings" },
      h("span", { class: "h3l-lbl" }, T("Эффекты фона")),
      pills, stat,
      h("div", { class: "h3l-fx-chks" },
        chk("auto", T("Авто-снижение при падении FPS"), T("Если кадры не успевают, сначала снижается разрешение шейдера, потом уровень")),
        chk("busyFreeze", T("Заморозить фон во время генерации"), T("Иначе фон идёт на 24 fps в пониженном разрешении"))),
      FX.motion === "reduced" ? h("div", { class: "h3l-note" }, T("В системе включено «уменьшение движения» — анимации выключены")) : null);
  }
}

export const labFx = new LabFx();
if (typeof window !== "undefined") window.__H3LAB_FX__ = { FX, labFx };
