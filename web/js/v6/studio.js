// H3ZeroStudio Lab v6 — the new front end. Studio extends the editor ENGINE (project model, undo, generation,
// run watch, takes, timeline interaction, menus) and replaces every view: shell, toolbar, pages, viewer,
// inspector, library, assistant host, settings window, welcome, command palette and toasts.
import * as C from "../h3s_core.js";
import { H3Editor, PALETTE } from "../h3s_editor.js";
import { injectStyle } from "../h3s_style.js";
import { T, plural, tServer, lang } from "../h3s_i18n.js";
import { applyUiScale, uiScaleSetting, uiLayoutViewport, uiScaleFactor } from "../h3s_ui_scale.js";
import { h, I, btn, seg, setTip, popover, closePopover, menuList, installTips, empty, glyphIcons, capLabels } from "./kit.js";
import { V6_CSS, applyScheme } from "./css.js";
import { installInspector } from "./insp.js";
import { installLibrary } from "./library.js";
import { installAstPage } from "./astpage.js";
import { installGhost } from "./ghost.js";
import { installMarks } from "./marks.js";
import { installPrefs } from "./prefs.js";
import { monogram } from "./logo.js";
import { installExtras } from "./extras.js";
import { installDock } from "./dock.js";
import { installTracks } from "./tracks.js";
import { installGenPv } from "./genpv.js";
import { installFrames } from "./frames.js";
import { installControl } from "./control.js";
import { installDlMini } from "./dlmini.js";
import { installSwap } from "./swap.js";
import { installFace } from "./face.js";
import { installTour } from "./tour.js";
import "./i18n_v6.js";

const LS = "h3ls.v6.";
export const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(LS + k)); return v ?? d; } catch { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const tc = (frames) => { const s = Math.max(0, frames) / C.FPS; const m = Math.floor(s / 60), ss = Math.floor(s % 60), cs = Math.floor((s % 1) * 100);
  return `${m}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`; };
export const secs = (frames) => T("{0} с", (frames / C.FPS).toFixed(1));
export const LOCALE = () => ({ ru: "ru-RU", en: "en-GB", th: "th-TH", zh: "zh-CN" })[lang()] || "ru-RU";
const LIB = new Set(["assets", "chars", "gallery", "projects"]);
const PREF = { settings: "general", models: "models", keys: "keys", help: "help", about: "about" };

function injectV6() {
  if (document.getElementById("h3l-v6-style")) return;
  const s = document.createElement("style"); s.id = "h3l-v6-style"; s.textContent = V6_CSS; document.head.appendChild(s);
}

export class Studio extends H3Editor {
  constructor(host) {
    super(host);
    this.page = "edit"; this.libSec = "assets"; this.inspTab = "seg"; this.tool = "assets";
  }

  // ------------------------------------------------------------------ lifecycle
  open() {
    injectStyle(); injectV6();
    if (this.root) return;
    this.p = C.normalizeProject(this.host.load());
    if (this.sel >= this.p.segments.length || this.sel < 0) this.sel = this.p.segments.length ? 0 : -1;
    const de = document.documentElement;
    de.dataset.v6 = "1"; de.dataset.h3lTheme = "v6"; de.dataset.h3lUiBlur = "on"; de.style.colorScheme = "dark";
    applyScheme();
    this.root = h("div", { class: "h3l-root v6", tabindex: "-1" });
    // keys handled inside the studio never leak to ComfyUI (they still reach the focused control first)
    this.root.addEventListener("keydown", (e) => e.stopPropagation());
    this.root.dataset.page = this.page;
    applyUiScale(uiScaleSetting(), false, this.root);
    this.$ = {};
    this.build();
    document.body.appendChild(this.root);
    this.bindGlobal();
    this.renderAll();
    this.focusSink();
    this.host.options?.().then((o) => { if (o?.samplers?.length) { this.opts = o; if (this.root) { this.renderInspector(); this.prefsRefresh?.(); } } }).catch(() => {});
    this.globSync?.(); this.mpSync?.(); this.filesSync?.(); this.timerSync?.(); this.monitorStart?.();
    requestAnimationFrame(() => { if (this.root) { this.renderTimeline(); this.layoutStage(); this.root.classList.add("is-in"); } });
    this.reattachInflight?.();
    setTimeout(() => this.maybeShowWelcome?.(), 400);
  }
  close() {
    if (!this.root) return;
    closePopover(); this.prefsClose?.(true); this.paletteClose?.(); this._glyphMO?.disconnect();
    super.close();
    delete document.documentElement.dataset.v6;
  }

  /** The engine parks focus on a hidden sink for its hotkeys; menus, windows and keyboard-focused v6 controls keep theirs. */
  focusSink() {
    const a = document.activeElement;
    if (a && a !== this.$?.sink && this.root?.contains(a) && ((this._tour && a.closest(".v6-tour")) || a.closest(".v6-pop, .v6-win, .v6-qp") || (a.matches(":focus-visible") && a.closest(".v6-dcard, .v6-vhead, .v6-chk")))) return;
    super.focusSink();
  }

  // ------------------------------------------------------------------ shell
  build() {
    const $ = this.$;
    $.sink = h("input", { class: "h3l-sink", readonly: true, tabindex: "-1", "aria-hidden": "true", autocomplete: "off" });
    $.head = h("header", { class: "v6-tb" });
    $.tools = h("div", { hidden: true });   // the engine's rail slot (unused: navigation is the page switcher)
    // pages
    $.center = h("div", { class: "v6-viewer h3l-center" });
    $.insp = h("aside", { class: "v6-insp h3l-insp" });
    $.tl = h("div", { class: "v6-tl h3l-tl" });
    $.splitR = h("div", { class: "v6-split v", "aria-hidden": "true" });
    $.splitT = h("div", { class: "v6-split hz", "aria-hidden": "true" });
    this.buildDock();
    $.pEdit = h("main", { class: "v6-page v6-edit", "data-p": "edit" }, $.dock, $.splitL, $.center, $.splitR, $.insp, $.splitT, $.tl);
    $.libSide = h("nav", { class: "v6-side" });
    $.libMain = h("div", { class: "v6-lib-main" });
    $.pLib = h("main", { class: "v6-page v6-lib", "data-p": "library" }, $.libSide, $.libMain);
    // Assistant page: [chat list | open conversation | assistant settings] (v6e)
    $.astSide = h("nav", { class: "v6-ast-side", "aria-label": T("Диалоги") });
    $.astHost = h("div", { class: "v6-ast-host" });
    $.astSet = h("aside", { class: "v6-ast-set", "aria-label": T("Настройки ассистента") });
    $.pAst = h("main", { class: "v6-page v6-ast", "data-p": "assist" }, $.astSide, $.astHost, $.astSet);
    $.pSwap = h("main", { class: "v6-page v6-swap", "data-p": "swap" });
    $.left = $.libMain;
    $.body = h("div", { class: "v6-pages" }, $.pEdit, $.pLib, $.pAst, $.pSwap);
    this.root.append($.sink, $.head, $.body);
    this.buildToolbar();
    this.applyLayout();
    this.splitV6($.splitR, "insp", -1); this.splitV6($.splitT, "tl", -1); this.splitV6($.splitL, "dock", 1);
    this.root.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this._ptrDown = true; clearTimeout(this._sinkT);
      this._keepChatSelect = !!e.target?.closest?.(".h3l-ast-bubble,.h3l-ast-reasonbody,.h3l-final");
    });
    this.ghostInstall();   // v6f: a lifted card of the clip follows the pointer while a timeline clip is dragged
    this.root.addEventListener("focusout", () => this.scheduleFocusSink());
    this.root.addEventListener("pointerup", () => this.scheduleFocusSink());
    this.buildCenter();
    this.buildTimeline();
    for (const ev of ["dragover", "dragenter"]) this.root.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); });
    this.root.addEventListener("drop", (e) => {
      const files = [...(e.dataTransfer?.files || [])];
      if (!e.defaultPrevented && files.length && !e.target.closest?.(".v6-ast-host")) this.uploadFiles(files);
      e.preventDefault(); e.stopPropagation();
    });
    this.root.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    this.root.addEventListener("contextmenu", (e) => {
      e.stopPropagation();
      const t = e.target;
      if (this.page === "edit" && this.trkMenu?.(e)) return;
      if ((t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) || t?.closest?.(".h3l-ast-bubble,.h3l-ast-reasonbody,.h3l-final")) return;
      e.preventDefault();
    });
    this._hideTip = installTips(this.root);
    // engine panels keep rendering text glyphs in their buttons: swap them for icons, batched per frame
    let gq = 0;
    this._glyphMO = new MutationObserver(() => { if (!gq) gq = requestAnimationFrame(() => { gq = 0; if (this.root) { glyphIcons(this.root); capLabels(this.root); this.libEmpties?.(); } }); });
    this._glyphMO.observe(this.root, { childList: true, subtree: true });
  }

  /** Dock width / inspector width / timeline height (own storage key: old widths are ignored). */
  layoutRaw() { return { ...lsGet("layout", {}) }; }
  layoutSave(L) { lsSet("layout", L); }
  layoutV6() {
    const { W, H } = uiLayoutViewport(this.root), L = this._dragLayout || lsGet("layout", {});
    this._shortVp = H < 640;
    const insp = clamp(L.insp || (W >= 2200 ? 380 : W >= 1500 ? 340 : 312), 288, Math.min(520, W * 0.4));
    // default timeline height: room for every track row (the last audio row is never below the fold)
    let need = 0;
    if (!L.tl && this.p) { const rows = this.trkLayout?.().nv || 1, arows = this.atrkState?.().list.length || 1; need = 40 + 36 + rows * (rows > 1 ? (H < 640 ? 46 : 52) : 64) + (rows - 1) * 4 + 8 + arows * 38 + 8 + 14; }
    // short windows: the player keeps at least ~half of the height, the timeline scrolls (sticky heads) instead
    const tlMax = H < 640 ? H * 0.5 : H * 0.56;
    const tl = clamp(L.tl || Math.min(Math.max(need, Math.round(H * (H > 1000 ? 0.3 : 0.34))), L.tl ? 1e9 : tlMax), 188, Math.max(200, tlMax));
    const dock = clamp(L.dock || (W >= 2200 ? 320 : W >= 1500 ? 280 : 248), 216, Math.max(216, Math.min(440, W * 0.3)));
    const dc = L.dc === undefined ? W < 900 : !!L.dc;
    return { insp, tl, dock, dc: dc && W > 0, ic: !!L.ic && W > 0 };
  }
  applyLayout() {
    if (!this.root) return;
    const L = this.layoutV6();
    // grid tracks are set on the grid itself (not inherited custom properties): a splitter drag restyles one element
    const g = this.$?.pEdit;
    if (g) { g.style.gridTemplateColumns = `${L.dc ? 0 : L.dock}px ${L.dc ? 0 : 1}px minmax(0,1fr) ${L.ic ? 0 : 1}px ${L.ic ? 0 : L.insp}px`; g.style.gridTemplateRows = `minmax(0,1fr) 1px ${L.tl}px`; }
    if (this.root.classList.contains("v6-insp-off") !== L.ic) this.root.classList.toggle("v6-insp-off", L.ic);
    if (this.root.classList.contains("v6-dock-off") !== L.dc) { this.root.classList.toggle("v6-dock-off", L.dc); if (!L.dc && this.$?.dock && !this.$.dock.firstChild) requestAnimationFrame(() => this.renderDock?.()); }
    this.syncDockBtn?.();
  }
  layoutSizes() { const L = this.layoutV6(); return { lw: 0, rw: L.insp, th: L.tl, lc: true, rc: L.ic }; }
  togglePanel() { const L = lsGet("layout", {}); L.ic = !L.ic; lsSet("layout", L); this.applyLayout(); this.renderTimeline(); this.layoutStage(); this.syncToolbar(); }
  splitV6(el, key, dir) {
    el.addEventListener("dblclick", () => { const L = lsGet("layout", {}); delete L[key]; lsSet("layout", L); this.applyLayout(); this._resize?.(); });
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; e.preventDefault();
      if (key === "dock" && this.layoutV6().dc) return;
      const start = this.layoutV6()[key], p0 = key === "tl" ? e.clientY : e.clientX; el.classList.add("on"); this.root.classList.add("v6-resizing");
      let raf = 0, last = e;
      const apply = () => { raf = 0; const d = (((key === "tl" ? last.clientY : last.clientX) - p0) * dir) / Math.max(0.5, uiScaleFactor() || 1);
        const L = this._dragLayout || (this._dragLayout = { ...lsGet("layout", {}) }); L[key] = Math.round(start + d); this.applyLayout(); this.layoutStage(); };
      const move = (ev) => { last = ev; if (!raf) raf = requestAnimationFrame(apply); };
      const up = () => { if (raf) { cancelAnimationFrame(raf); apply(); } if (this._dragLayout) { const L = lsGet("layout", {}); L[key] = this.layoutV6()[key]; this._dragLayout = null; lsSet("layout", L); } el.classList.remove("on"); this.root.classList.remove("v6-resizing"); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); this.renderTimeline(); this.layoutStage(); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
  }

  // ------------------------------------------------------------------ navigation
  setPage(p, sec = null) {
    if (sec && LIB.has(sec)) this.libSec = sec;
    const changed = this.page !== p; this.page = p;
    this.root.dataset.page = p;
    if (p === "library") this.tool = this.libSec; else if (p === "assist") this.tool = "assist"; else if (LIB.has(this.tool) === false && this.tool !== "assist") this.tool = this.libSec;
    this.syncToolbar();
    if (p === "assist") { this.openAssistPage(); }
    else if (p === "swap") this.renderSwap();
    else this.renderLeft();
    if (p === "edit" && changed) requestAnimationFrame(() => { this.renderTimeline(); this.layoutStage(); });
    const pg = { edit: this.$.pEdit, library: this.$.pLib, assist: this.$.pAst, swap: this.$.pSwap }[p];
    if (changed && pg) { pg.classList.remove("v6-enter"); void pg.offsetWidth; pg.classList.add("v6-enter"); }
  }
  /** Engine calls renderTools() after changing this.tool: map it onto pages / settings. */
  renderTools() {
    const t = this.tool;
    if (t in PREF) { this.tool = this.page === "assist" ? "assist" : this.libSec; this.openPrefs(PREF[t]); return; }
    if (t === "assist" && this.page !== "assist") { this.page = "assist"; this.root.dataset.page = "assist"; }
    else if (LIB.has(t) && this.page === "library") this.libSec = t;
    this.syncToolbar();
  }
  renderLeft() {
    if (!this.root) return;
    if (this.tool === "settings" && this._prefs) { this.prefsRender(); return; }
    if (this.page === "library") { this.$.left = this.$.libMain; this.tool = this.libSec; this.renderLibrary(); }
    else if (this.page === "assist") { this.$.left = this.$.astHost; this.tool = "assist"; this.renderAssistPage(); }
    else if (this.page === "edit") this.renderDock?.();
  }
  openSettings(section) { this.openPrefs(section ? this.prefsSectionOf(section) : "general"); }
  openModelDownloads() { this.openPrefs("downloads"); this.refreshModelDownloads?.(); }
  openAssist() { this.setPage("assist"); }
  openAssistPage() {
    if (!this._ast) super.openAssist(); else { this.renderLeft(); this.astConnect?.(true); }
  }
  closeAssist() { super.closeAssist(); this.setPage("edit"); }

  renderAll() {
    if (!this.root) return;
    this.renderHeader(); this.renderLeft(); this.renderInspector(); this.renderTimeline(); this.renderPreview();
    if (this.page !== "edit") this.renderDock?.();
    if (this.page === "swap") this.renderSwap();
    this.prefsRefresh?.();
  }

  // ------------------------------------------------------------------ toolbar
  buildToolbar() {
    const $ = this.$, tb = $.head;
    $.tbProj = h("button", { type: "button", class: "v6-proj", "aria-haspopup": "dialog" },
      h("span", { class: "v6-mark", "aria-hidden": "true" }, monogram(22)), h("span", { class: "v6-lab", "aria-hidden": "true" }, "lab"), h("span", { class: "v6-proj-n" }), h("i", { class: "v6-ic v6-proj-c", html: I.chev }));
    setTip($.tbProj, T("Проект: переименовать, открыть другой"));
    $.tbProj.onclick = () => this.projectPopover($.tbProj);
    $.tbPages = seg([
      { value: "edit", label: T("Монтаж"), icon: I.edit, tip: T("Монтаж"), key: "Ctrl+1" },
      { value: "swap", label: T("Замена персонажа"), icon: I.people, tip: T("Эксперимент: замена персонажа на видео"), key: "Ctrl+4" },
      { value: "library", label: T("Медиатека"), icon: I.library, tip: T("Медиатека"), key: "Ctrl+2" },
      { value: "assist", label: T("Ассистент"), icon: I.assist, tip: T("Ассистент"), key: "Ctrl+3" },
    ], this.page, (v) => this.setPage(v), { cls: "v6-pages-sw", label: T("Раздел") });
    $.tbUndo = btn({ icon: I.undo, tip: T("Отменить"), key: "Ctrl+Z", onclick: () => this.undo() });
    $.tbRedo = btn({ icon: I.redo, tip: T("Повторить"), key: "Ctrl+Shift+Z", onclick: () => this.redo() });
    // activity view: fixed width — idle summary or the run's progress; the toolbar never reflows
    $.act = h("div", { class: "v6-act", role: "status", "aria-live": "polite" },
      h("i", { class: "v6-act-bar" }), h("span", { class: "v6-act-dot" }),
      h("div", { class: "v6-act-tx" }, h("span", { class: "v6-act-1" }), h("span", { class: "v6-act-2" })));
    $.actWarn = btn({ icon: I.warn, cls: "v6-act-warn", tip: T("Предупреждения перед запуском"), onclick: (e, b) => this.warnPopover(b) });
    $.actStop = btn({ icon: I.stop, cls: "v6-act-stop", tip: T("Остановить генерацию"), onclick: () => this.stop() });
    $.actStop.setAttribute("aria-label", T("Остановить генерацию"));
    $.act.append($.actWarn, $.actStop);
    $.act.addEventListener("click", (e) => { if (!e.target.closest(".v6-b")) this.activityPopover($.act); });
    setTip($.act, T("Ход генерации и последние запуски"));
    $.tbMon = this.monitorEl ? this.monitorEl() : null;
    if ($.tbMon) { $.tbMon.classList.add("v6-b", "is-icon", "v6-mon"); $.tbMon.insertAdjacentHTML("afterbegin", `<i class="v6-ic">${I.gauge}</i>`); setTip($.tbMon, T("Ресурсы компьютера")); $.tbMon.removeAttribute("title"); }
    $.tbShare = btn({ icon: I.share, tip: T("Сохранить видео"), onclick: () => this.saveDialog() });
    $.tbMore = btn({ icon: I.more, tip: T("Ещё"), cls: "v6-tb-more", onclick: (e, b) => this.morePopover(b) });
    $.tbGear = btn({ icon: I.gear, tip: T("Настройки"), key: "Ctrl+,", onclick: () => this.openPrefs() });
    $.tbHelp = btn({ icon: I.help, tip: T("Обучение: обзор студии по шагам"), cls: "v6-tb-help", onclick: () => this.startTour?.() });
    $.tbGen = btn({ icon: I.spark, label: T("Сгенерировать"), kind: "primary", cls: "v6-gen", key: "Ctrl+Enter", onclick: () => this.generate() });
    // the monitor button joins the other icon buttons: alone it got a wide 8px gap on each side and
    // read as a bigger block than its neighbours
    tb.append(h("div", { class: "v6-tb-l" }, $.tbProj),
      h("div", { class: "v6-tb-c" }, $.tbPages),
      h("div", { class: "v6-tb-r" }, h("div", { class: "v6-tb-grp" }, $.tbUndo, $.tbRedo), $.act,
        h("div", { class: "v6-tb-grp" }, $.tbMon, $.tbShare, $.tbMore, $.tbHelp, $.tbGear), $.tbGen));
    // pick the roomiest toolbar density whose content fits with the page switcher still centred
    const L = tb.children[0], C = tb.children[1], R = tb.children[2];
    const natural = (el) => { let w = 0, n = 0; for (const c of el.children) { if (c.offsetWidth) { w += c.offsetWidth; n++; } } return w + Math.max(0, n - 1) * 8; };
    const fit = () => {
      const W = tb.clientWidth - 24 - 24;
      // "h" = full density minus the «?» (the tour stays in «Ещё» and Ctrl+K)
      for (const sz of ["", "h", "s", "xs", "xxs"]) { tb.dataset.size = sz; if (2 * Math.max(natural(L), natural(R)) + C.offsetWidth <= W) break; }
      requestAnimationFrame(() => $.tbPages.place(false));
    };
    this._tbFit = fit;
    try { new ResizeObserver(fit).observe(tb); } catch {}
  }
  syncToolbar() { const $ = this.$; $.tbPages?.set(this.page, true); }

  renderHeader() {
    const $ = this.$; if (!$.act) return;
    const est = C.estimate(this.p), kind = C.runKind(this.p.settings), r = this.run;
    const pn = $.tbProj.querySelector(".v6-proj-n"), name = this.p.name || T("Без названия");
    if (pn.textContent !== name) { pn.textContent = name; this._tbFit?.(); }
    $.tbUndo.disabled = !this.undoStack.length; $.tbRedo.disabled = !this.redoStack.length;
    $.actWarn.hidden = !est.warnings.length || !!r.active; $.actWarn._list = est.warnings;
    if (est.warnings.length) {
      // say what the triangle means right in the tooltip; the count sits next to it
      const w0 = String(est.warnings[0]); const first = w0[0].toLocaleUpperCase() + w0.slice(1);
      setTip($.actWarn, [T("Перед запуском: {0}", first), est.warnings.length > 1 ? T("И ещё {0}", est.warnings.length - 1) : "", T("Нажмите, чтобы посмотреть все")].filter(Boolean).join("\n"));
      $.actWarn.setAttribute("aria-label", T("Предупреждения: {0}", est.warnings.length));
      let c = $.actWarn.querySelector(".v6-act-wn"); if (!c) { c = h("span", { class: "v6-act-wn" }); $.actWarn.append(c); }
      c.textContent = est.warnings.length > 1 ? String(est.warnings.length) : "";
    }
    $.actStop.hidden = !r.active;
    $.act.classList.toggle("is-run", !!r.active);
    $.runPill = r.active ? $.act : null;
    if (!r.active) {
      const n = est.segments, done = this.p.segments.filter((s, i) => s.result && !this.isStale?.(i)).length;
      // two lines; the parts after the first are dropped first when the toolbar gets narrow
      const a1 = $.act.querySelector(".v6-act-1"), a2 = $.act.querySelector(".v6-act-2");
      if (n) a1.replaceChildren(h("span", {}, `${n} ${plural(n, T("отрезок"), T("отрезка"), T("отрезков"))} · ${secs(est.frames)}`), h("span", { class: "v6-act-opt" }, ` · ${est.width}×${est.height}`));
      else a1.textContent = T("Пустой проект");
      const mode = kind === "draft" ? T("Черновик") : kind === "refine" ? T("Черновик → финал") : T("Финал");
      const eta = this.etaText?.(est);
      if (!n) a2.textContent = T("Добавьте отрезок на таймлайне");
      else a2.replaceChildren(h("span", { class: "v6-act-opt" }, mode + " · "), h("span", {}, done === n ? T("всё готово") : T("готово {0} из {1}", done, n)), eta ? h("span", { class: "v6-act-opt" }, " · " + eta) : "");
      setTip($.act, [T("Ход генерации и последние запуски"), a1.textContent, a2.textContent].join("\n"));
      $.act.dataset.state = est.warnings.length ? "warn" : done && done === n ? "ok" : "idle";
      $.act.querySelector(".v6-act-bar").style.transform = "scaleX(0)";
    } else $.act.dataset.state = "run";
    $.tbGen.disabled = !!r.active || !this.p.segments.length;
    $.tbGen.classList.toggle("is-busy", !!r.active);
    $.tbGen.querySelector(".v6-bl").textContent = r.active ? T("Генерация…") : T("Сгенерировать");
    setTip($.tbGen, kind === "draft" ? T("Сгенерировать черновик") : kind === "refine" ? T("Сгенерировать: черновик, затем финал") : T("Сгенерировать"), "Ctrl+Enter");
    this.updateRunUI();
  }
  etaText(est) {
    const rate = this.p.stats?.sec_per_unit; if (!rate) return "";
    const sigs = this.sigs(); let units = 0;
    this.items().forEach((it, i) => { const s = this.p.segments[i]; if (!(s.result && s.result.sig === sigs[i])) units += C.effectiveParams(this.p, i).steps * it.frames * est.width * est.height / 1e6; });
    return units ? "≈ " + C.fmtDur(units * rate) : "";
  }
  updateRunUI() {
    const $ = this.$, r = this.run;
    if (r.active && $.act) {
      $.runPill = $.act;
      // the engine writes the phase text into the first <span> and the progress into the first <i>
      const bar = $.act.querySelector(".v6-act-bar"), t1 = $.act.querySelector(".v6-act-1");
      const fake = { querySelector: (s) => (s === "i" ? { style: {} } : t1) };
      const keep = $.runPill; $.runPill = Object.assign(fake, { title: "" });
      super.updateRunUI();
      $.runPill = keep;
      const u = r.phase === "upscale" && r.up && r.up.seg === r.seg ? r.up : null;
      const frac = r.total ? Math.min(1, ((r.done || 0) + (u && u.tile ? u.tile / u.tiles : 0)) / r.total) : 0;
      bar.style.transform = `scaleX(${frac.toFixed(4)})`;
      const t2 = $.act.querySelector(".v6-act-2");
      t2.textContent = r.queued ? T("Ждёт своей очереди в ComfyUI") : r.elapsed != null ? T("Прошло {0}", C.fmtDur(r.elapsed)) + (r.eta != null && r.done ? T(" · осталось {0}", C.fmtDur(r.eta)) : "") : T("Подготовка…");
      // the engine phrases include the remaining time: keep line 1 short
      t1.textContent = t1.textContent.replace(/ · (осталось|left|เหลือ|剩余).*$/i, "");
    } else { $.runPill = null; super.updateRunUI(); }
  }

  warnPopover(anchor) {
    const list = anchor._list || [];
    popover(this.root, anchor, h("div", { class: "v6-pop-pad v6-warnlist" }, h("h4", null, T("Перед запуском")), list.map((w) => h("p", null, w))), { align: "end", width: 340 });
  }
  activityPopover(anchor) {
    const tm = this._tm || {}, hist = (tm.hist || []).slice(0, 6);
    const ST = { done: T("готово"), error: T("ошибка"), interrupted: T("прервано"), running: T("идёт") };
    const fmt = (sec) => { sec = Math.max(0, Math.round(sec || 0)); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, "0")}`; };
    const rows = hist.length ? hist.map((r) => h("div", { class: "v6-run" }, h("span", { class: "v6-run-d " + r.status }),
      h("div", { class: "v6-run-t" }, h("b", null, ({ gen: T("Генерация"), upscale: T("Апскейл"), final: T("Финал") })[r.what] || tServer(r.what || "") || T("Запуск")), h("small", null, new Date(r.start * 1000).toLocaleString(LOCALE(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + " · " + (ST[r.status] || r.status) + (r.segments ? " · " + T("{0} отр.", r.segments) : ""))),
      h("span", { class: "v6-run-tm" }, fmt(r.status === "running" ? Date.now() / 1000 + (tm.off || 0) / 1000 - r.start : r.dur ?? (r.end - r.start)))))
      : [h("p", { class: "v6-muted" }, T("Запусков пока не было"))];
    const dyn = this.$.dyn;
    const body = h("div", { class: "v6-pop-pad v6-actpop" },
      this.run.active ? h("div", null, h("h4", null, T("Сейчас")), h("p", { class: "v6-actnow" }, this.$.act.querySelector(".v6-act-1").textContent), dyn) : null,
      h("h4", null, T("Последние запуски")), h("div", { class: "v6-runs" }, rows));
    popover(this.root, anchor, body, { align: "center", width: 380, onClose: () => { if (dyn && dyn.parentElement !== this.$.dynHold) this.$.dynHold?.append(dyn); } });
    if (dyn) requestAnimationFrame(() => this.drawDyn?.());
  }
  projectPopover(anchor) {
    const name = h("input", { class: "v6-in v6-proj-in", value: this.p.name || "", spellcheck: "false", "aria-label": T("Название проекта") });
    name.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { name.blur(); closePopover(); } });
    name.addEventListener("input", () => this.mutate((p) => { p.name = name.value; }, { coalesce: "pname", render: "light" }));
    const est = C.estimate(this.p);
    popover(this.root, anchor, h("div", { class: "v6-pop-pad" },
      h("label", { class: "v6-lbl" }, T("Название проекта")), name,
      h("p", { class: "v6-muted v6-proj-meta" }, `${est.segments} ${plural(est.segments, T("отрезок"), T("отрезка"), T("отрезков"))} · ${secs(est.frames)} · ${est.width}×${est.height}`),
      menuList([{ icon: I.folder, label: T("Все проекты"), fn: () => this.setPage("library", "projects") },
        { icon: I.gallery, label: T("Галерея результатов"), fn: () => this.setPage("library", "gallery") },
        { icon: I.share, label: T("Сохранить видео…"), fn: () => this.saveDialog() }])), { width: 300 });
    requestAnimationFrame(() => { name.focus(); name.select(); });
  }
  morePopover(anchor) {
    const nFinal = this.finalCandidates?.().length || 0, hasDraft = (this.p.segments || []).some((s, i) => this.hasDraft?.(i));
    popover(this.root, anchor, menuList([
      hasDraft ? { icon: I.up, label: nFinal ? T("Финал из черновиков ({0})", nFinal) : T("Финал из черновиков"), dis: !nFinal || this.run.active, fn: () => this.finalFromDraft(null) } : null,
      { icon: I.up, label: T("Апскейл всего ролика"), dis: this.run.active || !this.p.segments.length, fn: () => this.upscaleAll() },
      { icon: I.memory, label: T("Освободить видеопамять"), fn: () => this.freeMemory() },
      "sep",
      { icon: I.command, label: T("Все команды"), key: "Ctrl+K", fn: () => this.openPalette() },
      { icon: I.spark, label: T("Обучение"), fn: () => this.startTour?.() },
      { icon: I.key, label: T("Горячие клавиши"), fn: () => this.openPrefs("keys") },
      { icon: I.help, label: T("Справка"), fn: () => this.openPrefs("help") },
      { icon: I.info, label: T("О программе"), fn: () => this.openPrefs("about") },
      "sep",
      { icon: I.close, label: T("Свернуть студию"), key: "Esc", fn: () => this.close() },
    ]), { align: "end", width: 280 });
  }

  // ------------------------------------------------------------------ viewer
  buildCenter() {
    const $ = this.$;
    $.pvTabs = h("div", { class: "v6-vsrc" });
    $.swapCompareBtn = btn({ label: T("До / после"), cls: "v6-swap-compare",
      tip: T("Сравнить исходное видео и готовый Swap-отрезок с синхронным воспроизведением"),
      onclick: () => this.galCompareSwap(this.sel) });
    $.swapCompareBtn.style.display = "none";
    $.pvInfo = h("div", { class: "v6-vinfo" });
    $.frame = h("div", { class: "h3l-frame v6-frame" });
    $.stage = h("div", { class: "h3l-stage v6-stage" }, $.frame);
    $.video = h("video", { playsinline: true, preload: "auto" });
    $.video.addEventListener("ended", () => this.onEnded());
    $.video.addEventListener("loadedmetadata", () => this.layoutStage());
    $.playBtn = btn({ icon: I.play, cls: "v6-play", tip: T("Воспроизвести"), key: T("Пробел"), onclick: () => this.togglePlay() });
    $.time = h("div", { class: "v6-tc" });
    $.volBtn = btn({ icon: I.vol, tip: T("Звук"), onclick: () => { this.vol.muted = !this.vol.muted; this.userGesture = true; this.autoMuted = false; this.saveVol(); this.applyVolume(); } });
    $.volR = h("input", { class: "v6-range v6-vol", type: "range", min: 0, max: 1, step: 0.02, value: this.vol.v, "aria-label": T("Громкость") });
    $.volR.oninput = () => { this.vol.v = Number($.volR.value); this.vol.muted = this.vol.v === 0; this.userGesture = true; this.autoMuted = false; this.saveVol(); this.applyVolume(); };
    $.volR.addEventListener("keydown", (e) => e.stopPropagation());
    $.scrub = h("div", { class: "v6-scrub", role: "slider", "aria-label": T("Позиция") }, h("i", { class: "v6-scrub-tr" }, h("i", { class: "v6-scrub-fl" })), h("i", { class: "v6-scrub-th" }));
    const frac = (e) => { const r = $.scrub.getBoundingClientRect(); return clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1); };
    $.scrub.addEventListener("pointerdown", (e) => { if (e.button) return; $.scrub.setPointerCapture(e.pointerId); $.scrub.classList.add("on"); this.seek(frac(e) * this.totalFrames()); $.scrub._d = true; });
    $.scrub.addEventListener("pointermove", (e) => { if ($.scrub._d) this.seek(frac(e) * this.totalFrames()); });
    const up = () => { $.scrub._d = false; $.scrub.classList.remove("on"); }; $.scrub.addEventListener("pointerup", up); $.scrub.addEventListener("pointercancel", up);
    $.hud = h("div", { class: "v6-hud" },
      h("div", { class: "v6-hud-g" }, btn({ icon: I.prev, tip: T("Предыдущий отрезок"), key: "[", onclick: () => this.jumpSeg(-1) }), $.playBtn, btn({ icon: I.next, tip: T("Следующий отрезок"), key: "]", onclick: () => this.jumpSeg(1) })),
      $.time, $.scrub,
      h("div", { class: "v6-hud-g" }, h("div", { class: "v6-volbox" }, $.volBtn, $.volR),
        btn({ icon: I.view, tip: T("Просмотр: масштаб, покадрово, скорость"), onclick: () => this.viewerFromPlayer() }),
        btn({ icon: I.fs, tip: T("Во весь экран"), key: "F", onclick: () => this.toggleMainFullscreen() })));
    $.dynHold = h("div", { hidden: true });
    $.dockBtn = btn({ icon: I.sidebar, cls: "v6-dock-btn", tip: T("Медиа и галерея"), key: "Ctrl+B", onclick: () => this.toggleDock() });
    this.syncDockBtn = () => { const off = this.root.classList.contains("v6-dock-off"); $.dockBtn.classList.toggle("is-on", !off); $.dockBtn.setAttribute("aria-pressed", String(!off)); setTip($.dockBtn, off ? T("Показать медиа и галерею") : T("Скрыть медиа и галерею"), "Ctrl+B"); };
    $.center.append(h("div", { class: "v6-vtop" }, $.dockBtn, $.pvTabs, $.swapCompareBtn,
      h("i", { class: "v6-grow" }), $.pvInfo), $.stage, $.hud, $.dynHold);
    $.dynHold.append(this.buildDyn());
    $.stage.addEventListener("dblclick", (e) => { if (e.target.closest("button, a, input")) return; this.viewerFromPlayer(); });
    this.applyVolume();
    try { new ResizeObserver(() => this.layoutStage()).observe($.stage); } catch {}
  }
  saveVol() { try { localStorage.setItem("h3ls.volume", JSON.stringify(this.vol)); } catch {} }
  applyVolume() {
    super.applyVolume();
    const $ = this.$, v = this.vol.muted ? 0 : this.vol.v;
    if ($.volBtn) { const ic = $.volBtn.querySelector(".v6-ic") || $.volBtn; const off = this.vol.muted || !v || this.autoMuted; $.volBtn.innerHTML = `<i class="v6-ic">${off ? I.mute : I.vol}</i>`; $.volBtn.classList.toggle("is-warn", !!this.autoMuted); setTip($.volBtn, this.autoMuted ? T("Браузер запустил видео без звука — нажмите, чтобы включить") : off ? T("Включить звук") : T("Выключить звук")); void ic; }
    if ($.volR) $.volR.style.setProperty("--fill", (Number($.volR.value) * 100).toFixed(1) + "%");
  }
  startPlayback() { super.startPlayback(); this.paintPlay(); }
  stopPlayback() { super.stopPlayback(); this.paintPlay(); }
  paintPlay() { const b = this.$?.playBtn; if (!b) return; b.innerHTML = `<i class="v6-ic">${this.playing ? I.pause : I.play}</i>`; setTip(b, this.playing ? T("Пауза") : T("Воспроизвести"), T("Пробел")); }
  layoutStage() {
    const $ = this.$; if (!$.stage || this.viewer?.comp) return;
    const [w, hh] = C.resolution(this.p.settings);
    const W = $.stage.clientWidth - 48, H = $.stage.clientHeight - 24;
    if (W <= 0 || H <= 0) return;
    const sc = Math.min(W / w, H / hh);
    $.frame.style.width = Math.floor(w * sc) + "px"; $.frame.style.height = Math.floor(hh * sc) + "px";
  }
  updateTime() {
    const $ = this.$; if (!$.time) return;
    const total = this.totalFrames();
    if (!$.time.firstChild) $.time.append(h("b"), h("span"));
    $.time.firstChild.textContent = tc(this.playhead); $.time.lastChild.textContent = tc(total);
    if ($.tlTc) { $.tlTc.firstChild.textContent = tc(this.playhead); $.tlTc.lastChild.textContent = T("кадр {0}", Math.round(this.playhead)); }
    if ($.scrub) { const k = total ? clamp(this.playhead / total, 0, 1) : 0; $.scrub.style.setProperty("--k", k.toFixed(5)); $.scrub.setAttribute("aria-valuenow", String(Math.round(k * 100))); }
  }
  renderPreview() {
    super.renderPreview();
    const $ = this.$; if (!$.frame) return;
    if ($.swapCompareBtn) {
      const s = this.sel >= 0 ? this.seg(this.sel) : null;
      $.swapCompareBtn.style.display = s?.source?.swap && s?.result?.video && !this.isStale(this.sel) ? "" : "none";
    }
    const src = this.src, whole = src && (src.kind === "comp" || (src.kind === "full" && !src.old));
    // source switch
    $.pvTabs.innerHTML = "";
    const opts = [{ value: "full", label: T("Весь ролик"), tip: this.fullCurrent?.() ? T("Готовый итоговый ролик") : T("Сборка таймлайна на лету") },
      { value: "segment", label: this.sel >= 0 ? T("Отрезок {0}", this.sel + 1) : T("Отрезок"), disabled: this.sel < 0 }];
    if (this.hasOldFull?.()) opts.push({ value: "old", label: T("Прошлый итог"), tip: T("Последний собранный ролик — не совпадает с текущим таймлайном") });
    const cur = src?.old ? "old" : whole || !src ? "full" : "segment";
    $.pvTabs.append(seg(opts, cur, (v) => { this.browseRunPreview(); this.pvMode = v; this.renderPreview(); }, { size: "sm", label: T("Что показывать") }));
    if (this.run?.active) $.pvTabs.append(btn({
      label: this.followRun === false ? T("↩ К генерации") : T("▶ Смотреть готовые"),
      size: "sm", kind: "tinted",
      tip: this.followRun === false ? T("Вернуться к живому предпросмотру") : T("Смотреть готовые отрезки, пока идёт генерация"),
      onclick: () => this.followRun === false ? this.followRunPreview() : this.browseRunPreview(true),
    }));
    // concise caption instead of the engine's service text
    const its = this.items(), n = this.genCount();
    const ready = its.filter((it, i) => i < n && this.seg(i)?.result?.video && !this.isStale(i)).length;
    let info = "";
    if (src?.kind === "segment") { const s = this.seg(); info = (s?.result?.frames ? secs(s.result.frames) : "") + (this.isStale(this.sel) ? " · " + T("изменён после генерации") : ""); }
    else if (src?.kind === "full") info = src.old ? T("устарел") : T("Итоговый ролик · {0}", secs(this.p.result.full.frames));
    else if (this.p.segments.length) info = T("Готово {0} из {1}", ready, n);
    $.pvInfo.textContent = info;
    // empty / placeholder frames → one short phrase + one action
    const ph = $.frame.querySelector(".h3l-comp-ph, .h3l-ph-empty");
    if (ph) {
      const s = src?.seg >= 0 ? this.seg(src.seg) : this.seg();
      const i = src?.seg >= 0 ? src.seg : this.sel;
      const past = i >= 0 && i >= n;
      const thumb = ph.style?.backgroundImage && ph.style.backgroundImage !== "none" ? ph.style.backgroundImage : "";
      const title = !this.p.segments.length ? T("Пока пусто") : s ? (past ? T("Отрезок {0} за маркером конца", i + 1) : T("Отрезок {0} ещё не создан", i + 1)) : T("Пауза между отрезками");
      const sub = !this.p.segments.length ? T("Добавьте отрезок и опишите, что в нём происходит") : past ? T("Сдвиньте маркер конца, чтобы включить его") : s ? (s.prompt?.trim() ? "" : T("Опишите его в инспекторе справа")) : T("Чёрный кадр и тишина");
      const act = !this.p.segments.length ? btn({ icon: I.plus, label: T("Добавить отрезок"), kind: "tinted", onclick: () => this.extend() })
        : s && !past && !this.run.active ? btn({ icon: I.spark, label: T("Создать отрезок {0}", i + 1), kind: "tinted", onclick: () => this.generate({ upto: i, only: i }) }) : null;
      ph.replaceWith(h("div", { class: "v6-vempty" + (thumb ? " has-bg" : ""), style: thumb ? { "--bg": thumb } : null }, h("div", { class: "v6-vempty-in" },
        h("b", null, title), sub ? h("span", null, sub) : null, act)));
    }
  }
  updatePlayhead(follow = false) { super.updatePlayhead(follow); }

  // ------------------------------------------------------------------ timeline (engine lanes + new toolbar)
  buildTimeline() {
    super.buildTimeline();
    const $ = this.$, bar = $.tl.querySelector(".h3l-tl-bar");
    // the engine's controls that its renderers update: keep them alive (end length field, mode, zoom)
    $.endAuto.remove(); $.endIn.remove(); $.zoomR.remove();
    const mag = this.magnetButton?.(), reg = this.regionToolbar?.() || [];
    bar?.remove();
    $.endIn.className = "v6-in v6-endin"; $.endIn.setAttribute("aria-label", T("Длина ролика, секунды"));
    $.endIn.addEventListener("keydown", (e) => e.stopPropagation());
    $.endSeg = seg([{ value: "auto", label: T("Авто"), tip: T("Конец ролика = конец последнего отрезка") }, { value: "fixed", label: T("Фикс"), tip: T("Маркер конца стоит на месте") }],
      this.p.end_mode === "auto" ? "auto" : "fixed", (v) => this.setEndMode(v), { size: "sm", label: T("Длина ролика") });
    $.zoomR.className = "v6-range v6-zoom"; $.zoomR.addEventListener("keydown", (e) => e.stopPropagation());
    $.zoomR.addEventListener("input", () => $.zoomR.style.setProperty("--fill", $.zoomR.value + "%"));
    $.tlTc = h("div", { class: "v6-tltc" }, h("b"), h("span"));
    const ib = (icon, tip, key, fn) => btn({ icon, tip, key, onclick: fn });
    for (const el of [mag, ...reg]) {
      if (!el || el.tagName !== "BUTTON") { el?.classList?.add("v6-reghint"); continue; }
      el.classList.add("v6-legacy-tool");
      const g = el?.querySelector?.(":scope > b"); if (g) g.outerHTML = `<i class="v6-ic">${el.classList.contains("h3l-magbtn") ? I.magnet : I.region}</i>`;
    }
    $.tlBar = h("div", { class: "v6-tlbar" },
      h("div", { class: "v6-tlbar-l" },
        btn({ icon: I.plus, label: T("Отрезок"), kind: "tinted", size: "sm", tip: T("Добавить отрезок в конец"), key: "E", onclick: () => this.extend() }),
        h("span", { class: "v6-vsep" }),
        Object.assign(ib(I.cut, T("Разрезать по плейхеду"), "S", () => this.split()), { _cut: 1 }),
        ib(I.dup, T("Дублировать отрезок"), "D", () => this.duplicate()),
        ib(I.trash, T("Удалить отрезок"), "Del", () => this.deleteSeg(this.sel)),
        ib(I.marker, T("Маркер на плейхеде"), "M", () => this.addMarker()),
        h("span", { class: "v6-vsep" }), ...reg, mag),
      $.tlTc,
      h("div", { class: "v6-tlbar-r" },
        h("span", { class: "v6-lbl-in" }, T("Длина")), $.endSeg, h("label", { class: "v6-in-wrap sm" }, $.endIn, h("span", { class: "v6-in-sfx" }, T("с"))),
        h("span", { class: "v6-vsep" }),
        ib(I.minus, T("Отдалить"), "−", () => this.setZoomBy(0.7)), $.zoomR, ib(I.plus, T("Приблизить"), "+", () => this.setZoomBy(1.4)),
        ib(I.fit, T("Вписать весь ролик"), "", () => this.fitZoom())));
    $.tl.prepend($.tlBar);
    { // density: labels go first, then the zoom slider; the timecode stays centred and never overlaps
      const tb = $.tlBar, [L, C, R] = tb.children;
      const natural = (el) => { let w = 0, n = 0; for (const c of el.children) { if (c.offsetWidth) { w += c.offsetWidth; n++; } } return w + Math.max(0, n - 1) * 6; };
      const fit = () => { const W = tb.clientWidth - 18 - 24; for (const sz of ["", "s", "xs"]) { tb.dataset.size = sz; if (2 * Math.max(natural(L), natural(R)) + C.offsetWidth <= W) break; } };
      this._tlFit = fit; try { new ResizeObserver(fit).observe(tb); } catch {}
    }
    // the engine toggles .on on $.endAuto children: give it an invisible mirror
    $.endAuto = h("div", { hidden: true }, h("div", { "data-m": "auto" }), h("div", { "data-m": "fixed" }));
    $.tlInfo = h("span", { hidden: true });
  }
  renderTimeline() {
    super.renderTimeline();
    const $ = this.$;
    try { this.tracksPost?.(); } catch (e) { console.error("[H3 Lab v6] tracks", e); }
    $.endSeg?.set(this.p.end_mode === "auto" ? "auto" : "fixed");
    if ($.zoomR) $.zoomR.style.setProperty("--fill", $.zoomR.value + "%");
    for (const b of $.tlBar?.querySelectorAll(".v6-legacy-tool") || []) { if (b.title) { setTip(b, b.title.split("\n")[0]); b.removeAttribute("title"); } }
    this._tlFit?.();
  }

  // ------------------------------------------------------------------ keys
  onKey(e) {
    if (!this.root) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key;
    if (this._tour) { this._tour.key(e); return; }   // «Обучение» owns the keyboard while open
    if (this._palette) { e.stopPropagation(); this._palette.key?.(e); return; }   // the palette owns the keyboard
    if (this.$.saveModal && k === "Escape") { e.preventDefault(); e.stopPropagation(); this.closeSaveDialog?.(); return; }   // also from inside its fields
    if (this._qp && (k === "Escape" || (k === " " && !/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || "")))) {
      e.preventDefault(); e.stopPropagation();
      const m = this._qp.querySelector("video, audio");
      if (k === " " && m && !e.target?.closest?.(".v6-dcard")) { m.paused ? m.play().catch(() => {}) : m.pause(); } else this.qpClose();
      return;
    }
    if (k === " " && !ctrl && e.target?.closest?.(".v6-dcard") && this.root.contains(e.target)) return;   // Space on a dock card = quick preview (the card's own key)
    if (ctrl && !e.shiftKey && !e.altKey && e.code === "KeyB" && this.page === "edit" && !this._prefs) { e.preventDefault(); e.stopPropagation(); this.toggleDock(); return; }
    if (e.target?.closest?.(".v6-pop") && k !== "Escape" && this.root.contains(e.target)) return;   // menus / popovers own the keyboard (their own listeners)
    const tg = e.target, inField = tg && tg.tagName === "INPUT" && !tg.classList.contains("h3l-sink") && /^(text|search|number|)$/.test(tg.type || "");
    if (inField && k === "Enter" && this.root.contains(tg)) { e.stopPropagation(); e.preventDefault(); tg.blur(); if (tg.closest(".v6-pop")) closePopover(); this.focusSink(); return; }
    if (k === "Escape" && this.root.querySelector(".v6-pop:not(.off)")) {
      e.preventDefault(); e.stopPropagation(); closePopover(); return;
    }   // a popover may exist before its opening animation adds .on
    if (ctrl && (k === "k" || k === "K" || e.code === "KeyK")) { e.preventDefault(); e.stopPropagation(); this.openPalette(); return; }
    if (ctrl && (e.code === "Comma")) { e.preventDefault(); e.stopPropagation(); this.openPrefs(); return; }
    if (ctrl && !e.shiftKey && !e.altKey && ["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code)) { e.preventDefault(); e.stopPropagation(); this.setPage(["edit", "library", "assist", "swap"][+e.code.slice(-1) - 1]); return; }
    if (this._prefs || document.querySelector(".v6-scrim")) {
      // a v6 window is open: Esc is handled by the window, typing works, timeline keys are off.
      // v6e: keys aimed inside the studio still reach their own controls (radio groups, lists, search);
      // the root's bubble-phase stopper keeps them from ComfyUI. Only keys aimed elsewhere are stopped here.
      if (!this.root.contains(e.target)) e.stopPropagation();
      if (this.$.menu && k === "Escape") { e.preventDefault(); this.closeMenu(); }
      const t = e.target; const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (!typing && ctrl && e.code === "KeyZ") { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      return;
    }
    if (k === "Escape" && this.page !== "edit" && !this.$.menu && !(e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") && !this.pe && !this.ae && !this.viewer && !this.$.saveModal) {
      e.preventDefault(); e.stopPropagation(); if (this.page === "assist" && this._ast?.setOpen) { this._ast.setOpen = false; this.renderLeft(); } else this.setPage("edit"); return;
    }
    if (this.page !== "edit" && !ctrl) {
      // timeline hotkeys only on the edit page (library / assistant: typing, Space scrolls)
      const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (!typing && k !== "Escape" && !this.pe && !this.ae && !this.viewer) { if (!this.root.contains(e.target)) e.stopPropagation(); return; }
    }
    if (this.markerKey?.(e)) return;
    if (this.ctlKey?.(e)) return;   // v6k: Del / Backspace delete the selected ControlNet clip   // v6f: Del / Backspace delete the selected marker (never the clip under it)
    return super.onKey(e);
  }

  // ------------------------------------------------------------------ toast
  toast(msg, err = false, action = null) {
    if (!this.root) return;
    if (typeof msg === "string") msg = tServer(msg);
    const old = this.$.toastEl;
    if (old) { old.classList.remove("on"); setTimeout(() => old.remove(), 160); }
    const t = this.$.toastEl = h("div", { class: "v6-toast" + (err ? " is-err" : ""), role: err ? "alert" : "status" },
      h("i", { class: "v6-ic", html: err ? I.warn : I.check }), h("span", { class: "v6-toast-t" }, msg));
    if (action) t.append(btn({ label: action.label, size: "sm", kind: "tinted", onclick: () => { t.remove(); action.fn(); } }));
    const st = this.page === "edit" && !this.root.classList.contains("v6-welcome-on") ? this.$.stage : null;
    if (st && st.isConnected && st.clientHeight > 80) { t.classList.add("in-stage"); st.append(t); } else this.root.append(t);
    requestAnimationFrame(() => t.classList.add("on"));
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.classList.remove("on"); setTimeout(() => t.remove(), 200); }, action ? 6000 : err ? 5000 : 2400);
  }
}

installInspector(Studio, { C, h, PALETTE });
installLibrary(Studio, { C, h });
installAstPage(Studio, { C, h });
installGhost(Studio, { h });
installMarks(Studio);
installPrefs(Studio, { C, h });
installExtras(Studio, { C, h });
installDock(Studio, { C, h });
installTracks(Studio, { C, h });
installGenPv(Studio, { C, h });
installFrames(Studio, { C, h });
installControl(Studio, { C, h });
installFace(Studio, { C, h });
installTour(Studio, { C, h });
installDlMini(Studio, { h });
installSwap(Studio, { C, h, I, btn });
