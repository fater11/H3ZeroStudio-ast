import { T } from "./h3s_i18n.js";
import { uiPlaceAtClient, uiLocalSize, uiLocalBounds, uiLocalPoint } from "./h3s_ui_scale.js";
// «Модели» rail tab: quick access to model presets, model files and the LoRA stack (rows with on/off, strength ▲▼,
// ⓘ details, drag to reorder) with a searchable folder picker for models/loras. Own code; the layout follows the
// idea of Pixaroma's LoRA Loader (ideas only).
const base = (f) => String(f || "").split(/[\\/]/).pop();
const stem = (f) => base(f).replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "");
const parts = (f) => String(f || "").split(/[\\/]/);
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  folder: svg('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>'),
  file: svg('<path d="M12 3l7 4v10l-7 4-7-4V7z"/><path d="M12 12l7-4M12 12v9M12 12L5 8"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
};

export const MT_CSS = `
.h3l-mt{overflow:auto;min-height:0;flex:1;overscroll-behavior:contain}
.h3l-root:not(.h3l-left-collapsed) .h3l-body.h3l-mtwide{grid-template-columns:76px var(--left-gap,8px) min(max(var(--lw,272px),860px),44vw) 16px minmax(0,1fr) 16px var(--right-col,372px)}
.h3l-mt-bar{padding:2px 0 10px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:12px}
.h3l-mt-barrow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.h3l-mt-cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;align-items:start}
.h3l-mt-col{min-width:0}
.h3l-mt-scope{display:flex;gap:6px;margin:4px 0 10px}
.h3l-mt-scope .h3l-pill{flex:1;text-align:center}
.h3l-mt-note{font-size:11.5px;opacity:.75;margin:4px 0 8px;line-height:1.45}
.h3l-lr-add{width:100%;justify-content:center;gap:8px;font-weight:700;padding:9px 12px;border-radius:var(--r3,9px);background:var(--grad);color:#fff;border:none;box-shadow:0 4px 14px rgba(61,111,224,.3)}
.h3l-lr-add:hover{filter:brightness(1.08)} .h3l-lr-add:disabled{opacity:.4;box-shadow:none}
.h3l-lr-bar{display:flex;align-items:center;gap:10px;margin:10px 0 6px;font-size:12px;color:var(--mut)}
.h3l-lr-bar b{color:var(--txt);font-weight:700}
.h3l-sw{position:relative;width:34px;height:20px;border-radius:20px;background:rgba(200,208,224,.18);cursor:pointer;flex:none;transition:.15s}
.h3l-sw::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:.15s}
.h3l-sw.on{background:var(--grad)} .h3l-sw.on::after{left:17px}
.h3l-sw.mixed{background:linear-gradient(90deg,rgba(79,140,255,.55),rgba(200,208,224,.18))} .h3l-sw.mixed::after{left:10px}
.h3l-lr{display:grid;grid-template-columns:12px minmax(0,1fr) auto 34px 24px 20px;gap:8px;align-items:center;padding:7px 9px;margin:5px 0;border-radius:var(--r2,12px);
  background:rgba(6,7,10,.42);border:1px solid var(--line);transition:border-color .12s,background .12s}
.h3l-lr:hover{border-color:var(--line2)}
.h3l-lr.on{background:linear-gradient(90deg,rgba(79,140,255,.10),rgba(127,176,255,.04) 60%,rgba(6,7,10,.42))}
.h3l-lr.off .nm,.h3l-lr.off .st,.h3l-lr.off .inf{opacity:.38}
.h3l-lr.drop{border-color:var(--a2);box-shadow:0 0 0 1px var(--a2) inset}
.h3l-lr .grip{cursor:grab;color:var(--mut2);font-size:11px;letter-spacing:-2px;user-select:none;text-align:center}
.h3l-lr .nm{display:flex;flex-direction:column;min-width:0;cursor:pointer;padding:1px 2px;border-radius:7px}
.h3l-lr .nm b{font-size:12.5px;font-weight:600;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3l-lr .nm small{font-size:10.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3l-lr .nm:hover b{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.h3l-lr .nm.miss b{color:var(--err)}
.h3l-lr .st{display:flex;align-items:center;gap:2px;padding:2px;border-radius:9px;background:rgba(6,7,10,.55);border:1px solid var(--line)}
.h3l-lr .st input{width:44px;border:none;background:transparent;color:var(--txt);text-align:center;font:600 12px/1 inherit;padding:4px 0;-moz-appearance:textfield}
.h3l-lr .st input::-webkit-inner-spin-button{display:none}
.h3l-lr .st .ud{display:flex;flex-direction:column;gap:1px}
.h3l-lr .st .ud button{border:none;border-radius:5px;background:rgba(200,208,224,.10);color:var(--mut);font-size:7px;line-height:1;padding:2px 5px;cursor:pointer}
.h3l-lr .st .ud button:hover{background:var(--grad);color:#fff}
.h3l-lr .inf{width:24px;height:24px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--mut);cursor:pointer;display:grid;place-items:center;padding:0}
.h3l-lr .inf svg{width:13px;height:13px} .h3l-lr .inf:hover{color:var(--txt);border-color:var(--line2)}
.h3l-lr .inf.on{background:var(--grad);border-color:transparent;color:#fff}
.h3l-lr .x{border:none;background:transparent;color:var(--mut2);cursor:pointer;padding:0;font-size:12px}
.h3l-lr .x:hover{color:var(--err)}
.h3l-lr-info{grid-column:2/-1;font-size:11.5px;color:var(--mut);display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:6px 0 1px;border-top:1px dashed var(--line);margin-top:4px}
.h3l-lr-info code{color:#b9c0ea;word-break:break-all;font-size:11px}
.h3l-lr-info input{width:64px}
.h3l-lr-info .h3l-trigger{display:flex;flex-direction:column;gap:5px;width:100%;margin-top:5px}
.h3l-lr-info .h3l-trigger textarea{width:100%;min-height:48px;resize:vertical;background:rgba(6,7,10,.55);border:1px solid var(--line);border-radius:7px;color:var(--txt);padding:6px;font:inherit}
.h3l-lr-info .h3l-trigger label{display:flex;gap:7px;align-items:center}
.h3l-lr-info .h3l-trigger input[type=checkbox]{width:auto}
.h3l-lp{position:absolute;z-index:100025;display:flex;flex-direction:column;max-height:70vh;border-radius:var(--r2,12px);background:var(--panel2);
  border:1px solid var(--line2);backdrop-filter:blur(18px) saturate(140%);box-shadow:0 18px 48px rgba(0,0,0,.6);font-size:12.5px;overflow:hidden;color:var(--txt)}
.h3l-lp::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:var(--grad);opacity:.9}
.h3l-lp .top{display:flex;align-items:center;gap:8px;margin:10px 10px 6px;padding:0 10px;border-radius:10px;background:rgba(6,7,10,.55);border:1px solid var(--line)}
.h3l-lp .top:focus-within{border-color:var(--a1);box-shadow:0 0 0 3px rgba(79,140,255,.18)}
.h3l-lp .top svg{width:14px;height:14px;color:var(--mut);flex:none}
.h3l-lp input.q{flex:1;padding:8px 0;border:none;background:transparent;color:inherit;outline:none;font:inherit}
.h3l-lp .crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:0 10px 8px;font-size:11.5px}
.h3l-lp .crumbs a{cursor:pointer;padding:2px 9px;border-radius:20px;border:1px solid var(--line);color:var(--mut);background:rgba(200,208,224,.06)}
.h3l-lp .crumbs a:hover{color:var(--txt);border-color:var(--line2)}
.h3l-lp .crumbs a.on{color:#fff;background:var(--grad);border-color:transparent}
.h3l-lp .crumbs i{color:var(--mut2);font-style:normal}
.h3l-lp .crumbs span{color:var(--mut)}
.h3l-lp .ls{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding:0 6px 8px;scrollbar-width:thin;scrollbar-color:rgba(200,208,224,.18) transparent}
.h3l-lp .ls::-webkit-scrollbar{width:8px} .h3l-lp .ls::-webkit-scrollbar-thumb{background:rgba(200,208,224,.18);border-radius:8px}
.h3l-lp .row{position:relative;display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:9px;cursor:pointer;white-space:nowrap;color:#cfd4f6}
.h3l-lp .row svg{width:15px;height:15px;flex:none;color:var(--mut2)}
.h3l-lp .row.fold svg{color:var(--a2)}
.h3l-lp .row.fold .n{font-weight:600;color:var(--txt)}
.h3l-lp .row:hover,.h3l-lp .row.hi{background:rgba(79,140,255,.14)}
.h3l-lp .row.hi::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:3px;border-radius:3px;background:var(--grad)}
.h3l-lp .row.cur .n{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700}
.h3l-lp .row .n{flex:1;overflow:hidden;text-overflow:ellipsis}
.h3l-lp .row .c{font-size:10.5px;font-weight:700;padding:1px 8px;border-radius:20px;background:rgba(200,208,224,.10);border:1px solid var(--line);color:var(--mut)}
.h3l-lp .row .d{font-size:10.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;max-width:45%}
.h3l-lp .row.back{color:var(--mut)}
.h3l-lp .empty{padding:12px;color:var(--mut)}

.h3l-lp-prev{position:fixed;z-index:100026;pointer-events:none;max-width:min(280px,40vw);max-height:min(280px,40vh);
  padding:6px;border-radius:12px;background:var(--panel2);border:1px solid var(--line2);
  box-shadow:0 16px 40px rgba(0,0,0,.55);backdrop-filter:blur(14px) saturate(140%);overflow:hidden}
.h3l-lp-prev::before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:var(--grad);opacity:.9}
.h3l-lp-prev img,.h3l-lp-prev video{display:block;max-width:100%;max-height:min(260px,38vh);border-radius:8px;background:#0a0c14}
.h3l-lp-prev .cap{margin-top:4px;font-size:10.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

export function installModelTab(Editor, { C, h }) {
  Object.assign(Editor.prototype, {
    /** The rail tab «Модели»: preset bar, LoRA stack (left column), model files (right column). */
    renderModels(L) {
      this.mpStyle();
      if (!document.getElementById("h3l-mt-style")) document.head.append(h("style", { id: "h3l-mt-style" }, MT_CSS));
      this._mtSel = this.sel;
      L.append(h("div", { class: "h3l-card h3l-mt" }, h("div", { class: "h3l-card-h" }, h("h4", null, T("Модели и LoRA")),
        h("em", { class: "h3l-note" }, T("библиотека пресетов — общая для всех проектов"))), this.mpManager()));
    },
    /** LoRA stack of preset pr; ed(fn, msg) edits the library preset. */
    mpLoraStack(pr, ed, miss) {
      const files = this._mp?.files?.lora || [];
      const n = pr.loras.length, on = pr.loras.filter((l) => l.on).length;
      this._lrInfo = this._lrInfo || new Set();
      const box = h("div", { class: "h3l-lr-stack" });
      const add = h("button", { class: "h3l-btn h3l-lr-add", disabled: n >= C.MAX_PRESET_LORAS || !files.length || undefined,
        title: files.length ? T("Добавить LoRA из models/loras (до {0})", C.MAX_PRESET_LORAS) : T("В models/loras нет файлов — «⟳ Обновить списки»") }, T("＋ Добавить LoRA"));
      add.onclick = () => this.mpLoraPicker(add, "", (f) => ed((p) => { p.loras.push({ file: f, on: true, sm: 1, sc: 1, auto_trigger: false, trigger_words: "" }); }));
      const master = h("div", { class: "h3l-sw" + (on && on === n ? " on" : on ? " mixed" : ""), title: on ? T("Выключить все LoRA") : T("Включить все LoRA") });
      master.onclick = () => n && ed((p) => { const v = !p.loras.some((l) => l.on); p.loras.forEach((l) => { l.on = v; }); });
      box.append(add, h("div", { class: "h3l-lr-bar" }, master, h("span", null, h("b", null, `${on} / ${n}`), T(" вкл.")),
        h("em", { class: "h3l-note", style: "margin-left:auto" }, n > 1 ? T("порядок — перетаскиванием ⋮⋮") : "")));
      pr.loras.forEach((l, k) => {
        const row = h("div", { class: "h3l-lr" + (l.on ? " on" : " off") });
        const grip = h("div", { class: "grip", draggable: "true", title: T("Перетащите, чтобы поменять порядок") }, "⋮⋮");
        grip.addEventListener("dragstart", (e) => { this._lrDrag = k; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(k)); });
        row.addEventListener("dragover", (e) => { if (this._lrDrag == null) return; e.preventDefault(); row.classList.add("drop"); });
        row.addEventListener("dragleave", () => row.classList.remove("drop"));
        row.addEventListener("drop", (e) => { e.preventDefault(); row.classList.remove("drop"); const from = this._lrDrag; this._lrDrag = null;
          if (from == null || from === k) return; ed((p) => { const [x] = p.loras.splice(from, 1); p.loras.splice(k, 0, x); }); });
        grip.addEventListener("dragend", () => { this._lrDrag = null; });
        const dir = parts(l.file).slice(0, -1).join(" / ");
        const nm = h("div", { class: "nm" + (miss?.has(l.file) ? " miss" : ""), title: l.file + (miss?.has(l.file) ? T("\n⚠ нет файла") : "") + T("\nКлик — выбрать другую LoRA") },
          h("b", null, stem(l.file) || T("— выберите —")), h("small", null, (miss?.has(l.file) ? T("⚠ нет файла · ") : "") + (dir || "models/loras")));
        nm.onclick = () => this.mpLoraPicker(nm, l.file, (f) => ed((p) => { p.loras[k].file = f; }));
        const linked = l.sm === l.sc;
        const setS = (v) => ed((p) => { v = Math.round(Math.max(-10, Math.min(10, v)) * 100) / 100; const x = p.loras[k]; if (x.sm === x.sc) x.sc = v; x.sm = v; });
        const num = h("input", { type: "number", step: 0.05, min: -10, max: 10, value: Number(l.sm).toFixed(2),
          title: linked ? T("Сила LoRA (модель и энкодер вместе); ⓘ — отдельно для энкодера") : T("Сила для модели; энкодер {0} (ⓘ)", l.sc) });
        num.onchange = () => setS(Number(num.value) || 0);
        num.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") num.blur(); });
        num.addEventListener("wheel", (e) => { if (document.activeElement !== num) return; e.preventDefault(); setS(Number(l.sm) + (e.deltaY < 0 ? 0.05 : -0.05)); }, { passive: false });
        const st = h("div", { class: "st" }, num, h("div", { class: "ud" },
          h("button", { title: "+0.05", onclick: () => setS(Number(l.sm) + 0.05) }, "▲"), h("button", { title: "−0.05", onclick: () => setS(Number(l.sm) - 0.05) }, "▼")));
        const key = pr.id + "|" + k;
        const inf = h("button", { class: "inf" + (this._lrInfo.has(key) ? " on" : ""), title: T("Подробнее: путь, сила для энкодера"), html: IC.info });
        inf.onclick = () => { this._lrInfo.has(key) ? this._lrInfo.delete(key) : this._lrInfo.add(key); this.mpRefreshManager(); };
        const sw = h("div", { class: "h3l-sw" + (l.on ? " on" : ""), title: l.on ? T("Выключить (останется в списке, в ключ кэша не входит)") : T("Включить") });
        sw.onclick = () => ed((p) => { p.loras[k].on = !p.loras[k].on; });
        const x = h("button", { class: "x", title: T("Убрать LoRA из стека") }, "✕");
        x.onclick = () => ed((p) => { p.loras.splice(k, 1); });
        row.append(grip, nm, st, inf, sw, x);
        if (this._lrInfo.has(key)) {
          const sc = h("input", { class: "h3l-in", type: "number", step: 0.05, min: -10, max: 10, value: l.sc });
          sc.onchange = () => ed((p) => { p.loras[k].sc = Math.round((Number(sc.value) || 0) * 100) / 100; });
          sc.addEventListener("keydown", (e) => e.stopPropagation());
          const triggerEnable = h("input", { type: "checkbox", checked: !!l.auto_trigger });
          triggerEnable.onchange = () => ed((p) => { p.loras[k].auto_trigger = triggerEnable.checked; });
          const triggerText = h("textarea", { placeholder: T("Trigger Words (через запятую)"), value: l.trigger_words || "", spellcheck: "false" });
          triggerText.onchange = () => ed((p) => { p.loras[k].trigger_words = triggerText.value.slice(0, 1000); });
          triggerText.addEventListener("keydown", (e) => e.stopPropagation());
          row.append(h("div", { class: "h3l-lr-info" }, h("code", null, "models/loras/" + l.file),
            h("label", null, T("сила энкодера "), sc), h("span", { class: "h3l-note" }, linked ? T("связана с силой модели") : T("отдельно от модели")),
            linked ? null : h("button", { class: "h3l-btn sm", onclick: () => ed((p) => { p.loras[k].sc = p.loras[k].sm; }) }, T("связать")),
            h("div", { class: "h3l-trigger" }, h("label", null, triggerEnable, "Auto Trigger Words"), triggerText)));
        }
        box.append(row);
      });
      return box;
    },

    /** Searchable folder picker over models/loras. onPick(file). */
    mpLoraPicker(anchor, cur, onPick) {
      document.querySelector(".h3l-lp")?._close?.();
      const files = (this._mp?.files?.lora || []).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      const curDir = parts(cur).slice(0, -1);
      let path = cur ? curDir : [], q = "", hi = 0, rows = [];
      const pop = h("div", { class: "h3l-lp" });
      let side = "";   // "below" | "above" — chosen once on open, kept while the user types (no jumping)
      /** Top-layer popover anchored to its button: fits the window, flips up when the space below is short,
       *  max-height = real free space (the list scrolls inside). Re-run on search, resize and ancestor scroll. */
      const place = () => {
        if (!anchor.isConnected) { close(); return; }
        const b = uiLocalBounds(this.root), r = anchor.getBoundingClientRect(), pad = 8, gap = 4;
        const tl = uiLocalPoint(r.left, r.top, this.root), br = uiLocalPoint(r.right, r.bottom, this.root);
        const W = Math.min(Math.max(br.x - tl.x, 440), b.w - 2 * pad);
        pop.style.width = W + "px";
        const below = b.h - pad - (br.y + gap), above = tl.y - gap - pad;
        if (!side) {
          pop.style.maxHeight = Math.max(below, above) + "px";
          const natural = Math.min(pop.scrollHeight, Math.round(b.h * 0.7));
          side = natural <= below || below >= above ? "below" : "above";
        }
        const room = Math.max(120, Math.min(side === "below" ? below : above, Math.round(b.h * 0.7)));
        pop.style.maxHeight = room + "px";
        const hgt = pop.offsetHeight;
        let top = side === "below" ? br.y + gap : tl.y - gap - hgt;
        top = Math.max(pad, Math.min(top, b.h - pad - hgt));
        const left = Math.max(pad, Math.min(tl.x, b.w - pad - W));
        Object.assign(pop.style, { left: left + "px", top: top + "px", right: "auto", bottom: "auto" });
        pop.dataset.side = side;
      };
      const inp = h("input", { class: "q", placeholder: T("Поиск по всем папкам…"), spellcheck: "false" });
      const crumbs = h("div", { class: "crumbs" }), ls = h("div", { class: "ls" });
      pop.append(h("div", { class: "top", html: IC.search }, inp), crumbs, ls);
      const row = (cls, icon, name, ...tail) => { const r = h("div", { class: "row " + cls }, name); r.insertAdjacentHTML("afterbegin", icon); tail.forEach((t) => t && r.append(t)); return r; };
      const pick = (f) => { close(); onPick(f); };
      const paint = () => {
        crumbs.replaceChildren(); ls.replaceChildren(); rows = [];
        const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length) {
          crumbs.append(h("span", null, T("Найдено во всех папках")));
          const hits = files.filter((f) => terms.every((t) => f.toLowerCase().includes(t)));
          for (const f of hits.slice(0, 400)) {
            const dir = parts(f).slice(0, -1).join(" / ");
            rows.push([row(f === cur ? "cur" : "", IC.file, h("span", { class: "n" }, stem(f)), dir ? h("span", { class: "d" }, dir) : null), () => pick(f), f]);
          }
          if (!hits.length) ls.append(h("div", { class: "empty" }, T("Ничего не найдено")));
        } else {
          const all = h("a", { class: path.length ? "" : "on" }, T("Все LoRA")); all.onclick = () => { path = []; hi = 0; paint(); };
          crumbs.append(all);
          path.forEach((p, j) => { const a = h("a", { class: j === path.length - 1 ? "on" : "" }, p); a.onclick = () => { path = path.slice(0, j + 1); hi = 0; paint(); }; crumbs.append(h("i", null, "/"), a); });
          const pre = path.length ? path.join("/") + "/" : "";
          const inDir = files.filter((f) => f.replace(/\\/g, "/").startsWith(pre));
          const sub = new Map(), here = [];
          for (const f of inDir) {
            const rest = parts(f).slice(path.length);
            if (rest.length > 1) sub.set(rest[0], (sub.get(rest[0]) || 0) + 1); else here.push(f);
          }
          if (path.length) rows.push([row("back", IC.back, h("span", { class: "n" }, T("Назад"))), () => { path = path.slice(0, -1); hi = 0; paint(); }]);
          for (const [d, c] of [...sub].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" })))
            rows.push([row("fold", IC.folder, h("span", { class: "n" }, d), h("span", { class: "c", title: T("{0} файл.", c) }, String(c))), () => { path = [...path, d]; hi = 0; paint(); }]);
          for (const f of here) rows.push([row(f === cur ? "cur" : "", IC.file, h("span", { class: "n" }, stem(f))), () => pick(f), f]);
          if (!rows.length) ls.append(h("div", { class: "empty" }, T("Пусто")));
        }
        hi = Math.min(hi, Math.max(0, rows.length - 1));
        rows.forEach(([el, fn, file], j) => {
          el.onclick = fn;
          if (j === hi) el.classList.add("hi");
          if (file) {
            el.addEventListener("pointerenter", (ev) => showPrev(file, ev));
            el.addEventListener("pointermove", (ev) => movePrev(ev));
            el.addEventListener("pointerleave", hidePrev);
          }
          ls.append(el);
        });
        if (pop.isConnected) place();
      };
      const prevCache = this._loraPrevCache || (this._loraPrevCache = new Map());   // file -> 'yes'|'no'|HTMLImageElement
      let prevEl = null, prevFile = null, prevTimer = 0;
      const hidePrev = () => { clearTimeout(prevTimer); prevTimer = 0; prevEl?.remove(); prevEl = null; prevFile = null; };
      const placePrev = (ev) => {
        if (!prevEl) return;
        uiPlaceAtClient(ev.clientX, ev.clientY, prevEl, this.root, { offsetX: 14, offsetY: 14, pad: 8 });
      };
      const movePrev = (ev) => { if (prevEl) placePrev(ev); };
      const showPrev = (file, ev) => {
        if (prevFile === file && prevEl) { placePrev(ev); return; }
        hidePrev();
        prevFile = file;
        const cached = prevCache.get(file);
        if (cached === "no") return;
        const url = "/h3lab/lora/preview?file=" + encodeURIComponent(file);
        const mount = (media) => {
          if (prevFile !== file) return;
          hidePrev();
          prevFile = file;
          prevEl = h("div", { class: "h3l-lp-prev" }, media, h("div", { class: "cap", title: file }, stem(file)));
          (this.root || document.body).append(prevEl);
          placePrev(ev);
        };
        if (cached && cached !== "yes") { mount(cached.cloneNode(true)); return; }
        prevTimer = setTimeout(async () => {
          try {
            const r = await fetch(url, { method: "GET" });
            if (!r.ok) { prevCache.set(file, "no"); return; }
            const ct = (r.headers.get("content-type") || "").toLowerCase();
            const blob = await r.blob();
            const kind = ((blob.type || ct) || "").toLowerCase();
            if (kind.startsWith("video/")) { prevCache.set(file, "no"); return; }
            const obj = URL.createObjectURL(blob);
            const media = h("img", { src: obj, alt: stem(file) });
            prevCache.set(file, media);
            mount(media.cloneNode(true));
          } catch (e) { prevCache.set(file, "no"); }
        }, 120);
      };
      const onMove = () => { if (pop.isConnected) { hidePrev(); place(); } };
      const onScroll = (e) => { if (!pop.contains(e.target)) onMove(); };   // the modal / page scrolled — follow the button
      const close = () => { hidePrev(); pop.remove(); document.removeEventListener("pointerdown", outside, true);
        window.removeEventListener("resize", onMove); document.removeEventListener("scroll", onScroll, true); setTimeout(() => this.focusSink?.(), 0); };
      const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
      pop._close = close;
      pop.addEventListener("mousedown", (e) => { if (e.target !== inp) e.preventDefault(); });   // clicks keep the search field focused
      inp.oninput = () => { q = inp.value; hi = 0; paint(); };
      // the editor's window-level key handler stops every key in capture; it hands the picker's keys over as "h3lkey"
      const seen = new WeakSet();   // the same key can arrive twice (direct + the editor's "h3lkey" relay)
      const onKey = (e) => {
        if (seen.has(e)) return; seen.add(e);
        if (e.key === "Escape") { e.preventDefault?.(); close(); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, Math.min(rows.length - 1, hi + (e.key === "ArrowDown" ? 1 : -1))); paint(); ls.querySelector(".hi")?.scrollIntoView({ block: "nearest" }); }
        else if (e.key === "Enter") { e.preventDefault(); rows[hi]?.[1](); }
        else if (e.key === "Backspace" && !inp.value && path.length) { path = path.slice(0, -1); paint(); }
      };
      inp.addEventListener("h3lkey", (ev) => onKey(ev.detail));
      inp.addEventListener("keydown", (e) => { if (/^(Escape|ArrowDown|ArrowUp|Enter)$/.test(e.key) || (e.key === "Backspace" && !inp.value)) { e.stopPropagation(); onKey(e); } });
      (this.root || document.body).append(pop);   // inside the editor root: the studio's theme variables apply
      document.addEventListener("pointerdown", outside, true);
      paint();   // fill first, then measure: placing an empty shell made the full list overflow the window
      window.addEventListener("resize", onMove);
      document.addEventListener("scroll", onScroll, true);
      inp.focus();
      setTimeout(() => pop.isConnected && inp.focus(), 40);   // the editor re-focuses its key sink after a click
      ls.querySelector(".cur")?.scrollIntoView({ block: "nearest" });
      return pop;
    },
  });
}
