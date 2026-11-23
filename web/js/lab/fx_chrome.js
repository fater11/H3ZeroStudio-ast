// H3ZeroStudio Lab — chrome additions that need a little DOM: rail dock indicator, transport scrubber,
// header resource meters, CTA shine. All are decorative overlays (pointer-events none) except the scrubber,
// which calls the editor's own seek(). Transform/opacity-only updates, no layout reads per frame.
import { lang } from "../h3s_i18n.js";
const FPS = 24;
const DYN_EMPTY = { ru: "Нет данных — график появится во время генерации", en: "No data yet — fills in during generation", zh: "暂无数据 — 生成时显示", th: "ยังไม่มีข้อมูล — จะแสดงระหว่างการสร้าง" };
const tc = (f) => { const s = Math.max(0, f) / FPS; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 100)).padStart(2, "0")}`; };

export class Chrome {
  constructor(ed) { this.ed = ed; this.dock = null; this.scrub = null; this.orig = null; }
  ensure() {
    const ed = this.ed, root = ed?.root; if (!root) return;
    if (!root.style.getPropertyValue("--h3l-t-dyn")) root.style.setProperty("--h3l-t-dyn", JSON.stringify(DYN_EMPTY[lang()] || DYN_EMPTY.en));
    // --- dock indicator (slides between rail items)
    const tools = root.querySelector(".h3l-body > .h3l-tools");
    if (tools && (!this.dock || !this.dock.isConnected)) { this.dock = document.createElement("i"); this.dock.className = "h3l-fx-dock"; this.dock.setAttribute("aria-hidden", "true"); tools.prepend(this.dock); }
    this.syncDock();
    // --- short left panel (small window / big UI scale): compact assistant composer so the chat stays usable
    const left = root.querySelector(".h3l-body > .h3l-panel");
    if (left && left !== this._left) { this._ro?.disconnect(); this._left = left;
      this._ro = new ResizeObserver(([en]) => { const hh = en.contentRect.height; left.classList.toggle("h3l-short", hh < 600); left.classList.toggle("h3l-tiny", hh < 470); });
      this._ro.observe(left); }
    // --- scrubber in the transport bar
    const tr = root.querySelector(".h3l-transport");
    if (tr && (!this.scrub || !this.scrub.isConnected)) this.mountScrub(tr);
    if (!this.orig && typeof ed.updatePlayhead === "function") {
      this.orig = ed.updatePlayhead; const self = this;
      ed.updatePlayhead = function (...a) { const r = self.orig.apply(this, a); self.syncScrub(); return r; };
    }
    this.syncScrub();
    // --- header fit: compact the resource cluster step by step until the header content fits its own box
    const head = root.querySelector(":scope > .h3l-head");
    if (head && head !== this._head) { this._hro?.disconnect(); this._head = head; this._hro = new ResizeObserver(() => this.fitHead()); this._hro.observe(head); this.fitHead(); }
    if (this._head) this.fitHead();   // values/chips change width without resizing the header
    // --- header meters
    for (const m of root.querySelectorAll(".h3l-head .h3l-sysmon .m")) {
      const v = parseFloat(m.querySelector("b")?.textContent || ""); const k = isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0;
      if (m._v !== k) { m._v = k; m.style.setProperty("--h3l-v", k.toFixed(3)); m.classList.toggle("hot", k > .9); }
    }
    // --- pro: every range shows its filled part (one slider style)
    const fill = (r) => { const mn = +r.min || 0, mx = r.max === "" ? 100 : +r.max, v = +r.value; const k = mx > mn ? (v - mn) / (mx - mn) * 100 : 0; r.style.setProperty("--h3l-fill", Math.max(0, Math.min(100, k)).toFixed(1) + "%"); };
    for (const r of root.querySelectorAll('input[type="range"]')) fill(r);
    if (!this._rangeL) { this._rangeL = (e) => { if (e.target?.type === "range") fill(e.target); }; document.addEventListener("input", this._rangeL, true); }
    // --- pro: resources collapse into one icon button (details in the popover); dot tints amber/red when high
    const sm = root.querySelector(".h3l-head .h3l-sysmon");
    if (sm) {
      if (!sm.querySelector(".h3l-mon-ic")) { const i = document.createElement("i"); i.className = "h3l-mon-ic"; i.setAttribute("aria-hidden", "true");
        i.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M7 13l3-3 2.5 2.5L17 8M9 21h6M12 17v4"/></svg>';
        sm.insertBefore(i, sm.firstChild); }
      sm.classList.toggle("is-hot", !!sm.querySelector(".m.hot"));
      const sum = [...sm.querySelectorAll(".m")].map((m) => (m.querySelector("small")?.textContent || "").trim() + " " + (m.querySelector("b")?.textContent || "").trim()).filter((x) => x.trim()).join(" · ");
      const t = (this._monT || (this._monT = sm.title || "")) + (sum ? "\n" + sum : "");
      if (sm.title !== t) sm.title = t;
    }
  }
  /** levels: 0 all · 1 −temp · 2 −GPU load · 3 −RAM · 4 −CPU (VRAM only) · 5 dot only (popover still on click) */
  fitHead() {
    const head = this._head; if (!head?.isConnected) return;
    const sm = head.querySelector(".h3l-sysmon");
    const fits = () => head.scrollWidth <= head.clientWidth + 1 && (!sm || sm.scrollWidth <= sm.clientWidth + 1) && [...head.children].every((c) => c.offsetLeft + c.offsetWidth <= head.clientWidth + 1);
    head.dataset.h3lMon = "5"; return;   // pro: the resource cluster is always one icon (popover on click)
    let lv = +(head.dataset.h3lMon || 0);
    if (fits()) {   // relax one step at a time while it still fits (no flicker: revert if it doesn't)
      while (lv > 0) { head.dataset.h3lMon = String(lv - 1); if (fits()) lv--; else { head.dataset.h3lMon = String(lv); break; } }
    } else { while (!fits() && lv < 5) head.dataset.h3lMon = String(++lv); }
  }
  syncDock() {
    const d = this.dock; if (!d) return; const on = d.parentElement?.querySelector(".h3l-tool.on");
    if (!on) { d.style.opacity = "0"; return; }
    const y = on.offsetTop + (on.offsetHeight - 50) / 2;   // offset* are layout-relative, unaffected by zoom/transforms
    if (d._y !== y) { d._y = y; d.style.transform = `translateY(${y}px)`; d.style.opacity = "1"; }
  }
  mountScrub(tr) {
    const s = document.createElement("div"); s.className = "h3l-fx-scrub"; s.setAttribute("role", "slider"); s.setAttribute("aria-label", "Scrub");
    s.innerHTML = '<i class="tr"></i><i class="fl"></i><i class="hv"></i><i class="th"></i><span class="tip"></span>';
    const tip = s.querySelector(".tip");
    const frac = (e) => { const r = s.getBoundingClientRect(); return { f: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))), w: r.width, x: e.clientX - r.left }; };
    const z = () => parseFloat(this.ed.root?.style.zoom || "1") || 1;
    s.addEventListener("pointermove", (e) => { const { f, x } = frac(e); s.style.setProperty("--h3l-hx", (x / z()).toFixed(1) + "px"); tip.textContent = tc(f * this.total()); if (s._drag) this.ed.seek(f * this.total()); });
    s.addEventListener("pointerdown", (e) => { if (e.button) return; s._drag = true; s.setPointerCapture(e.pointerId); this.ed.seek(frac(e).f * this.total()); });
    const up = () => { s._drag = false; }; s.addEventListener("pointerup", up); s.addEventListener("pointercancel", up);
    tr.prepend(s); this.scrub = s; this._w = 0;
    new ResizeObserver(() => { this._w = s.clientWidth; this.syncScrub(true); }).observe(s);
  }
  total() { try { return Math.max(1, this.ed.totalFrames()); } catch { return 1; } }
  syncScrub(force) {
    const s = this.scrub; if (!s) return;
    const p = Math.max(0, Math.min(1, (this.ed.playhead || 0) / this.total()));
    if (!force && Math.abs(p - (s._p ?? -1)) < 1e-4) return; s._p = p;
    s.style.setProperty("--h3l-sp", p.toFixed(4)); s.style.setProperty("--h3l-sx", (p * (this._w || s.clientWidth)).toFixed(1) + "px");
    s.setAttribute("aria-valuenow", Math.round(p * 100));
  }
  detach() { this._ro?.disconnect(); this._hro?.disconnect(); if (this.orig && this.ed) this.ed.updatePlayhead = this.orig; this.orig = null; this.dock?.remove(); this.scrub?.remove(); }
}
