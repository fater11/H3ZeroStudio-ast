// H3ZeroStudio Lab v6l — the global downloads mini-window: a small card in the bottom-right corner on every page while
// a model download runs or is paused. Per download: name, %, size, speed, ETA, pause / resume, cancel (stops and
// deletes the partial file). A click on a row opens «Настройки → Загрузка моделей». Collapses to a pill.
import { T } from "../h3s_i18n.js";
import { I, setTip } from "./kit.js";

const ACTIVE = new Set(["queued", "running", "cancelling"]);
const SHOWN = new Set(["queued", "running", "cancelling", "paused", "error", "done"]);

export function fmtEta(s) {
  if (!(s > 0) || !isFinite(s)) return "";
  s = Math.round(s);
  if (s >= 3600) return Math.floor(s / 3600) + ":" + String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function installDlMini(Studio, { h }) {
  const P = Studio.prototype, prevRender = P.renderAll;
  Object.assign(P, {
    renderAll(...a) { const r = prevRender.apply(this, a); this.dlMiniEnsure(); return r; },
    dlMiniEnsure() {
      if (this._dlm || !this.root || !this.host?.get) return;
      this._dlm = { jobs: {}, meta: {}, seen: {}, closed: false, min: false, t: null, el: null };
      this.dlMiniTick();
    },
    /** Poll now and keep polling fast (a download was started / paused / cancelled). */
    dlMiniKick() { if (!this._dlm) return this.dlMiniEnsure(); this._dlm.closed = false; clearTimeout(this._dlm.t); this.dlMiniTick(); },
    async dlMiniTick() {
      const D = this._dlm; if (!D) return;
      if (this.root && !this.root.isConnected) { clearTimeout(D.t); this._dlm = null; D.el?.remove(); return; }
      let any = false;
      try {
        const r = await this.host.get("/h3lab/models/downloads/jobs");
        D.jobs = r?.jobs || {};
        const ids = Object.keys(D.jobs).filter((id) => SHOWN.has(D.jobs[id]?.state));
        if (ids.some((id) => !D.meta[id])) {   // names: once from the catalog
          try { const s = await this.host.get("/h3lab/models/downloads"); for (const m of s?.models || []) D.meta[m.id] = { label: m.label, file: m.filename, size: m.size_bytes }; } catch (_) { /* names fall back to ids */ }
        }
        any = Object.values(D.jobs).some((j) => j && ACTIVE.has(j.state));
        this.dlMiniRender();
      } catch (_) { /* server busy / restarting: try again later */ }
      D.t = setTimeout(() => this.dlMiniTick(), any ? 1000 : 4000);
    },
    dlMiniRows() {
      const D = this._dlm, now = Date.now() / 1000, out = [];
      for (const [id, j] of Object.entries(D.jobs)) {
        if (!j || !SHOWN.has(j.state)) continue;
        if (j.state === "done" && now - (j.finished || 0) > 6) continue;   // «готово» flashes for a few seconds
        out.push([id, j]);
      }
      return out.sort((a, b) => (b[1].started || 0) - (a[1].started || 0));
    },
    dlMiniRender() {
      const D = this._dlm; if (!D || !this.root) return;
      const rows = this.dlMiniRows();
      const key = rows.map(([id, j]) => id + j.state).join("|");
      if (key !== D.closedKey) D.closed = D.closed && key === D.lastKey;
      D.lastKey = key;
      if (!rows.length || D.closed) { D.el?.remove(); D.el = null; return; }
      if (!D.el || !D.el.isConnected) {
        D.el = h("div", { class: "v6-dlm", role: "region", "aria-label": T("Загрузки") });
        this.root.append(D.el);
      }
      const act = rows.filter(([, j]) => ACTIVE.has(j.state));
      const tot = act.reduce((s, [, j]) => s + (j.total || 0), 0), got = act.reduce((s, [, j]) => s + (j.downloaded || 0), 0);
      const pct = tot ? Math.floor(100 * got / tot) : 0;
      const minB = h("button", { type: "button", class: "v6-dlm-ib", "aria-label": D.min ? T("Развернуть") : T("Свернуть"), html: I.chev, onclick: (e) => { e.stopPropagation(); D.min = !D.min; this.dlMiniRender(); } });
      const closeB = h("button", { type: "button", class: "v6-dlm-ib", "aria-label": T("Скрыть"), html: I.close, onclick: (e) => { e.stopPropagation(); D.closed = true; D.closedKey = key; this.dlMiniRender(); } });
      setTip(minB, D.min ? T("Развернуть") : T("Свернуть")); setTip(closeB, T("Скрыть — загрузка продолжится"));
      const head = h("div", { class: "v6-dlm-h" }, h("i", { class: "v6-ic", html: I.download }),
        h("b", null, act.length ? T("Загрузка моделей · {0}%", pct) : T("Загрузки")), h("span", { class: "v6-dlm-n" }, String(rows.length)), minB, closeB);
      head.addEventListener("click", () => this.openPrefs?.("downloads"));
      setTip(head, T("Открыть «Загрузка моделей»"));
      D.el.classList.toggle("is-min", D.min);
      D.el.replaceChildren(head, ...(D.min ? [] : rows.map(([id, j]) => this.dlMiniRow(id, j))));
    },
    dlMiniRow(id, j) {
      const m = this._dlm.meta[id] || {}, total = j.total || m.size || 0, got = j.downloaded || 0;
      const pct = total ? Math.min(100, Math.floor(100 * got / total)) : 0;
      const name = String(m.label || m.file || id).replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+—.*$/, "").trim();
      const fb = (n) => this.fmtBytes ? this.fmtBytes(n) : Math.round(n / 1e6) + " MB";
      let info;
      if (j.state === "running") info = [pct + "%", fb(got) + " / " + fb(total), j.speed ? fb(j.speed) + "/s" : "", j.speed && total > got ? T("ещё {0}", fmtEta((total - got) / j.speed)) : ""].filter(Boolean).join(" · ");
      else if (j.state === "queued") info = T("в очереди…");
      else if (j.state === "cancelling") info = T("остановка…");
      else if (j.state === "paused") info = T("пауза · {0}% · {1}", pct, fb(got));
      else if (j.state === "error") info = T("ошибка: {0}", String(j.error || "").slice(0, 80));
      else info = T("готово ✓");
      const busy = ACTIVE.has(j.state);
      const pr = j.state === "running" || j.state === "queued"
        ? h("button", { type: "button", class: "v6-dlm-ib", "aria-label": T("Пауза"), html: I.pause, onclick: (e) => { e.stopPropagation(); this.dlPause?.(id); } })
        : j.state === "paused" || j.state === "error"
          ? h("button", { type: "button", class: "v6-dlm-ib", "aria-label": T("Продолжить"), html: I.play, onclick: (e) => { e.stopPropagation(); this.dlStart?.(id); } })
          : null;
      if (pr) setTip(pr, pr.getAttribute("aria-label"));
      const cx = j.state !== "done" ? h("button", { type: "button", class: "v6-dlm-ib is-x", "aria-label": T("Отменить загрузку"), html: I.stop, disabled: j.state === "cancelling" || undefined,
        onclick: (e) => { e.stopPropagation(); this.dlCancel?.(id); } }) : null;
      if (cx) setTip(cx, T("Отменить: остановить и удалить недокачанный файл"));
      const row = h("div", { class: "v6-dlm-r is-" + j.state, "data-id": id },
        h("div", { class: "v6-dlm-t" }, h("span", { class: "v6-dlm-nm" }, name), pr, cx),
        h("div", { class: "v6-dlm-bar" + (busy ? " is-on" : "") }, h("i", { style: { width: pct + "%" } })),
        h("div", { class: "v6-dlm-i" }, info));
      row.addEventListener("click", () => this.openPrefs?.("downloads"));
      setTip(row.querySelector(".v6-dlm-nm"), (m.file || id) + "\n" + T("Клик — открыть «Загрузка моделей»"));
      return row;
    },
  });
}
