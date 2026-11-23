// H3ZeroStudio Lab v6f — timeline markers («заметки»): right-click menu on the flag, a visible «Удалить» in the
// inspector card, Delete / Backspace delete the selected marker (before any clip / gap / region / audio).
// The engine's marker code (h3s_markers.js) is untouched: deleteMarker / updateMarker / seek are reused.
import { T } from "../h3s_i18n.js";
import { I } from "./kit.js";

export function installMarks(Studio) {
  const base = Object.getPrototypeOf(Studio.prototype);
  Object.assign(Studio.prototype, {
    renderMarkers(inner, ppf) {
      base.renderMarkers.call(this, inner, ppf);
      // inner may be a DocumentFragment (off-DOM build): no :scope there
      const flags = [...inner.children].filter((c) => c.classList.contains("h3l-mk")), list = this.p.markers || [];
      flags.forEach((f, k) => {
        const m = list[k]; if (!m) return;
        f.dataset.mid = m.id;
        f.addEventListener("contextmenu", (e) => this.markerMenu(e, m.id));
      });
    },
    markerMenu(e, id) {
      const m = this.marker(id); if (!m) return;
      e.preventDefault(); e.stopPropagation();
      if (this.selMarker !== id) { this.selMarker = id; this.selAudio = null; this.selTrack = null; this.renderAll(); }
      const ph = Math.round(this.playhead);
      this.openMenu(e, m.label || T("Маркер"), [
        { icon: I.play || "", label: T("Перейти к маркеру"), fn: () => this.seek(m.frame) },
        { label: T("Переместить к плейхеду"), dis: ph === m.frame, fn: () => { this.updateMarker(id, (x) => { x.frame = ph; }); this.renderAll(); } },
        "sep",
        { icon: I.trash, label: T("Удалить"), danger: true, hint: "Del", fn: () => this.deleteMarker(id) },
      ]);
    },
    /** Delete / Backspace on the timeline: a selected marker goes first. true = handled. */
    markerKey(e) {
      if (!this.selMarker || this.page !== "edit" || e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.key !== "Delete" && e.key !== "Backspace") return false;
      const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) && !t.classList.contains("h3l-sink")) return false;
      if (this.pe || this.ae || this.viewer || this.$.menu || document.querySelector(".v6-pop.on, .v6-scrim")) return false;
      if (!this.marker(this.selMarker)) { this.selMarker = null; return false; }
      e.preventDefault(); e.stopPropagation(); this.deleteMarker(this.selMarker); return true;
    },
  });
}
