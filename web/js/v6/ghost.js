// H3ZeroStudio Lab v6f — clip drag ghost. While a timeline clip is dragged (sideways: free / magnet reorder; up/down:
// to another video or audio track) a small lifted card of the clip follows the pointer, the clip itself stays in
// place dimmed (the hole is obvious), the cursor is «grabbing». The engine's drag code is untouched: this only
// watches the same pointer gesture with the same thresholds and draws on top (insertion marker / lane highlight stay).
import { T } from "../h3s_i18n.js";

const HX = 5, VY = 8, VYA = 10;              // the engine's thresholds: sideways 5 px, video rows 8 px, audio rows 10 px
const OFF_X = 14, OFF_Y = 12;               // card offset from the pointer (bottom-right of it, as NLEs do)

export function installGhost(Studio, { h }) {
  Object.assign(Studio.prototype, {
    ghostInstall() {
      if (this._ghostOn || !this.root) return; this._ghostOn = true;
      this.root.addEventListener("pointerdown", (e) => this.ghostDown(e), true);
    },
    ghostDown(e) {
      if (e.button !== 0 || this.page && this.page !== "edit") return;
      const t = e.target; if (!t?.closest) return;
      const v = t.closest(".h3l-clip"), a = !v && t.closest(".h3l-audio.clip");
      if (v && (t.closest(".hr, .h3l-cb, .tk, .bd, .acts, button") || !this.$.tinner?.contains(v))) return;
      if (a && t.closest(".th, .fd, button")) return;
      if (!v && !a) return;
      this.ghostEnd();
      const G = this._ghost = { x0: e.clientX, y0: e.clientY, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, el: null, kind: v ? "v" : "a", ev: e };
      if (v) { G.i = (this.$.clips || []).indexOf(v); if (G.i < 0) return this.ghostEnd(); G.id = this.p.segments[G.i]?.id; }
      else { const at = a.parentElement, k = [...at.querySelectorAll(":scope > .h3l-audio.clip")].indexOf(a); G.cid = this.p.audio?.clips?.[k]?.id; G.src = a; if (!G.cid) return this.ghostEnd(); }
      G.card = this.ghostCard(v || a, G.kind);
      G.move = (ev) => this.ghostMove(ev); G.up = () => this.ghostEnd();
      window.addEventListener("pointermove", G.move, true);
      window.addEventListener("pointerup", G.up, true); window.addEventListener("pointercancel", G.up, true); window.addEventListener("blur", G.up);
    },
    /** May this gesture become a drag in the engine? (same rules as freeDrag / clipDown / trkDragStart / audio rows) */
    ghostCanDrag(G, dx, dy) {
      if (G.kind === "a") return Math.abs(dy) >= VYA && (this.atrkState?.().list.length || 0) > 1;
      const side = Math.abs(dx) >= HX && (this.magnetOn?.(G.ev) ? this.p.segments.length > 1 : !this.run?.active);
      const up = Math.abs(dy) >= VY && ((this._nv | 0) >= 2 || G.alt);
      return side || up;
    },
    ghostMove(ev) {
      const G = this._ghost; if (!G) return;
      if (!(ev.buttons & 1)) return this.ghostEnd();
      const dx = (ev.clientX - G.x0) / (this.uiS || 1), dy = ev.clientY - G.y0;
      if (!G.el) {
        if (!this.ghostCanDrag(G, dx, dy)) return;
        G.el = G.card; document.body.append(G.el);
        document.documentElement.classList.add("v6-grabbing"); this.root.classList.add("v6-gdrag");
        requestAnimationFrame(() => G.el?.classList.add("on"));
      }
      this.ghostMark(); requestAnimationFrame(() => this.ghostMark());   // again after the engine re-renders the row
      G.el.style.transform = `translate3d(${Math.round(ev.clientX + OFF_X)}px, ${Math.round(ev.clientY + OFF_Y)}px, 0) scale(${this.uiS || 1})`;   // body px = viewport px; the card follows the UI scale
    },
    /** The dragged clip (the engine may re-render it while dragging): dim it, keep it in place. */
    ghostMark() {
      const G = this._ghost; if (!G) return;
      let el = null;
      if (G.kind === "v") { const i = this.p.segments.findIndex((s) => s.id === G.id); el = i >= 0 ? this.$.clips?.[i] : null; }
      else { const k = (this.p.audio?.clips || []).findIndex((c) => c.id === G.cid); if (k >= 0) el = G.src?.isConnected ? G.src : this.$.tinner?.querySelector(".h3l-track.a")?.querySelectorAll(":scope > .h3l-audio.clip")[k] || null; }
      if (el !== G.mk) { G.mk?.classList.remove("v6-gsrc"); G.mk = el; }
      el?.classList.add("v6-gsrc");
    },
    ghostEnd() {
      const G = this._ghost; if (!G) return; this._ghost = null;
      window.removeEventListener("pointermove", G.move, true);
      window.removeEventListener("pointerup", G.up, true); window.removeEventListener("pointercancel", G.up, true); window.removeEventListener("blur", G.up);
      G.el?.remove(); G.mk?.classList.remove("v6-gsrc");
      for (const x of this.root?.querySelectorAll(".v6-gsrc") || []) x.classList.remove("v6-gsrc");
      document.documentElement.classList.remove("v6-grabbing"); this.root?.classList.remove("v6-gdrag");
    },
    /** A compact card of the clip: picture (filmstrip frame / poster / colour), name, duration. */
    ghostCard(src, kind) {
      const card = h("div", { class: "v6-ghost" + (kind === "a" ? " is-aud" : ""), "aria-hidden": "true" });
      const pic = h("div", { class: "v6-ghost-pic" });
      if (kind === "v") {
        const tile = src.querySelector(".strip i"), cs = getComputedStyle(src);
        pic.style.background = `linear-gradient(135deg, ${cs.getPropertyValue("--c1") || "#3a3a3c"}, ${cs.getPropertyValue("--c2") || "#2c2c2e"})`;
        if (tile && tile.style.backgroundImage) {
          const W = 72, tw = parseFloat(tile.style.width) || W, s = W / tw;
          const [bw, bh] = (tile.style.backgroundSize || "").split(" ").map(parseFloat), bx = parseFloat((tile.style.backgroundPosition || "0").split(" ")[0]) || 0;
          pic.style.backgroundImage = tile.style.backgroundImage;
          if (bw && bh) { pic.style.backgroundSize = `${bw * s}px ${bh * s}px`; pic.style.backgroundPosition = `${bx * s}px 50%`; } else pic.style.backgroundSize = "cover";
        } else if (src.querySelector(".rf img")?.src) { pic.style.backgroundImage = `url("${src.querySelector(".rf img").src}")`; pic.style.backgroundSize = "cover"; pic.style.backgroundPosition = "center"; }
        else { const bg = cs.backgroundImage; if (bg && bg !== "none" && /url\(/.test(bg)) { pic.style.backgroundImage = bg.match(/url\([^)]*\)/)[0]; pic.style.backgroundSize = "cover"; pic.style.backgroundPosition = "center"; } }
        const n = src.querySelector(".t .n")?.textContent || "", nm = src._full || src.querySelector(".t .nm")?.textContent || T("Отрезок {0}", n), d = src.querySelector(".t .d")?.textContent || "";
        card.append(pic, h("div", { class: "v6-ghost-tx" }, h("b", null, (n ? n + " · " : "") + nm), d ? h("span", null, d) : null));
      } else {
        const lb = src.querySelector(".lbl"), nm = (lb?.firstChild?.textContent || lb?.textContent || "").replace(/^[♫⊠]\s*/, "");
        const wf = src.querySelector("canvas.wf");
        if (wf) { try { pic.style.backgroundImage = `url(${wf.toDataURL()})`; pic.style.backgroundSize = "cover"; } catch {} }
        const sec = (parseFloat(src.style.width) || 0) / ((this.ppf || 1) * 24);
        card.append(pic, h("div", { class: "v6-ghost-tx" }, h("b", null, nm), sec > 0.05 ? h("span", null, T("{0} с", sec.toFixed(1))) : null));
      }
      return card;
    },
  });
}
