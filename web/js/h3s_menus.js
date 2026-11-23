import { T } from "./h3s_i18n.js";
import { uiLocalPoint, uiLocalDelta, uiLocalSize, uiLocalBounds } from "./h3s_ui_scale.js";
// Context menus (clips, audio clips, assets) and «Сохранить видео» (server-side export to a chosen folder).
// labels are text, never HTML: "<Video>" in a label used to become a real <video> element (a big blurred block)
// a leading glyph/emoji of a label («✎ Черновик», «⊠ Зафиксировать») goes into the icon slot, so all labels line up
const GLYPH = /^((?:\p{Extended_Pictographic}|\p{S}|\uFE0F|\u200D)+)\s+(.+)$/u;
export const splitGlyph = (icon, label) => { if (icon) return [icon, String(label ?? "")]; const g = GLYPH.exec(String(label ?? "")); return g ? [g[1], g[2]] : ["", String(label ?? "")]; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function installMenus(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    /** Generic menu: entries = {icon, label, fn, dis, danger, hint, why, sub:[entries]} | "sep" | {el} | null. */
    /** Folder input + «▤ Обзор…' (native dialog on the ComfyUI computer). */
    folderPicker(input) {
      const btn = h("button", { class: "h3l-btn sm", type: "button", title: T("Выбрать папку в окне проводника (на компьютере, где запущен ComfyUI)"), html: T("<span>▤ Обзор…</span>") });
      btn.onclick = async () => {
        btn.disabled = true; btn.style.opacity = ".6";
        try { const p = await this.host.pickFolder(input.value); if (p) { input.value = p; input.dispatchEvent(new Event("change")); } }
        catch (e) { this.toast(String(e.message || e), true); }
        finally { btn.disabled = false; btn.style.opacity = ""; }
      };
      input.style.flex = "1 1 auto"; input.style.minWidth = "0";
      return h("div", { class: "h3l-row", style: { gap: "6px" } }, input, btn);
    },

    /** Dropdown anchored under a control; matches width; keyboard arrows/Enter/Esc. */
    openAnchoredMenu(anchor, title, entries, opts = {}) {
      const r = anchor.getBoundingClientRect();
      // Pass viewport coords into openMenu; it converts for the zoomed root.
      const fake = { clientX: r.left, clientY: r.bottom + 4, preventDefault() {}, stopPropagation() {} };
      const m = this.openMenu(fake, title, entries);
      const matchW = opts.matchWidth !== false;
      const localW = uiLocalSize(r.width);
      if (matchW) {
        const w = Math.max(localW, 160);
        m.style.minWidth = w + "px";
        m.style.width = w + "px";
      }
      const bounds = uiLocalBounds(this.root);
      const mr = m.getBoundingClientRect();
      const mw = uiLocalSize(mr.width), mh = uiLocalSize(mr.height);
      const below = uiLocalPoint(r.left, r.bottom + 4, this.root);
      const above = uiLocalPoint(r.left, r.top - 4, this.root);
      let left = below.x, top = below.y;
      if (left + mw > bounds.w - 8) left = Math.max(8, bounds.w - mw - 8);
      if (top + mh > bounds.h - 8) top = Math.max(8, above.y - mh);
      m.style.left = left + "px";
      m.style.top = top + "px";
      const items = [...m.querySelectorAll(":scope > .it:not(.dis)")];
      let idx = Math.max(0, items.findIndex((el) => el.classList.contains("on")));
      const focusItem = (i) => {
        items.forEach((el) => el.classList.remove("kb"));
        if (!items.length) return;
        idx = (i + items.length) % items.length;
        items[idx].classList.add("kb");
        items[idx].scrollIntoView({ block: "nearest" });
      };
      if (items.length) focusItem(idx);
      const onKey = (e) => {
        if (!this.$.menu) { window.removeEventListener("keydown", onKey, true); return; }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.closeMenu(); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); focusItem(idx + 1); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); focusItem(idx - 1); return; }
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); items[idx]?.click(); }
      };
      this._menuKeyOff = onKey;
      window.addEventListener("keydown", onKey, true);
      return m;
    },

    /** Themed select: button.h3l-sel opening h3l-menu (groups via .hd, check via .on). */
    themedSelect({ value, options, groups, title, className, sm, disabled, emptyLabel, onChange } = {}) {
      const flat = groups
        ? groups.flatMap((g) => (g.options || []).map((o) => ({ ...o, _g: g.label })))
        : (options || []);
      const cur = flat.find((o) => String(o.value) === String(value));
      const lab = cur ? cur.label : (emptyLabel != null ? emptyLabel : (flat[0]?.label ?? "—"));
      const cls = "h3l-sel" + (sm ? " sm" : "") + (className ? " " + className : "");
      const btn = h("button", { type: "button", class: cls, title: title || "", disabled: disabled || undefined },
        h("span", { class: "h3l-dd-lab" }, lab));
      const open = (e) => {
        if (disabled) return;
        e?.preventDefault?.(); e?.stopPropagation?.();
        if (this.$.menu && this._ddAnchor === btn) { this.closeMenu(); return; }
        this._ddAnchor = btn;
        const entries = [];
        const pushOpt = (o) => entries.push({
          label: o.label, on: String(o.value) === String(value), dis: !!o.dis,
          fn: () => { onChange?.(o.value); },
        });
        if (groups) {
          for (const g of groups) {
            if (g.label) entries.push({ el: h("div", { class: "hd" }, g.label) });
            for (const o of (g.options || [])) pushOpt(o);
          }
        } else {
          for (const o of (options || [])) pushOpt(o);
        }
        this.openAnchoredMenu(btn, null, entries);
      };
      btn.onclick = open;
      btn.onkeydown = (e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); open(e); }
      };
      return btn;
    },

    openMenu(e, title, entries) {
      e.preventDefault(); e.stopPropagation();
      this.closeMenu();
      const build = (list, isSub = false) => {
        // a submenu lives inside its parent menu, whose backdrop-filter makes a nested one transparent → solid
        const m = h("div", { class: "h3l-menu" + (isSub ? " sub solid" : " h3l-glass") }, !isSub && title ? h("div", { class: "hd" }, title) : null);
        for (const it of list) {
          if (!it) continue;
          if (it === "sep") { m.append(h("div", { class: "sep" })); continue; }
          if (it.el) { m.append(it.el); continue; }
          if (it.why) { m.append(h("div", { class: "why" }, it.why)); continue; }
          const el = h("div", { class: "it" + (it.dis ? " dis" : "") + (it.danger ? " danger" : "") + (it.sub ? " has-sub" : "") + (it.on ? " on" : ""), title: it.title || null,
            html: (() => { const [ic, lb] = splitGlyph(it.icon ? it.icon : "", it.label); return `<i class="ic">${it.icon ? ic : esc(ic)}</i>` + `<span class="lb">${esc(lb)}</span>`; })() + (it.hint ? `<kbd>${esc(it.hint)}</kbd>` : "") + (it.sub ? "<b class='ar'>›</b>" : "") });
          if (it.sub) {
            let sm = null;
            el.addEventListener("pointerenter", () => {
              m.querySelectorAll(":scope > .h3l-menu.sub").forEach((x) => x.remove());
              if (it.dis) return;
              sm = build(it.sub, true); m.append(sm);
              const r = el.getBoundingClientRect(), mr = m.getBoundingClientRect(), sr = sm.getBoundingClientRect();
              const dRight = uiLocalDelta(r.right - mr.left, 0).x;
              const dTop = uiLocalDelta(0, r.top - mr.top).y;
              const sw = uiLocalSize(sr.width), sh = uiLocalSize(sr.height);
              const bounds = uiLocalBounds(this.root);
              const menuLocal = uiLocalPoint(mr.left, mr.top, this.root);
              const left = (uiLocalPoint(r.right, 0, this.root).x + sw + 8 > bounds.w) ? (-sw + 2) : (uiLocalSize(mr.width) - 2);
              sm.style.left = left + "px";
              sm.style.top = Math.min(dTop - 6, bounds.h - menuLocal.y - sh - 8) + "px";
            });
          } else if (!it.dis) el.onclick = (ev) => { ev.stopPropagation(); if (!it.keep) this.closeMenu(); it.fn?.(); };
          if (!it.sub) el.addEventListener("pointerenter", () => m.querySelectorAll(":scope > .h3l-menu.sub").forEach((x) => x.remove()));
          if (!it.title) el.addEventListener("pointerenter", () => {   // native tooltip only for a cut-off label
            const lb = el.querySelector(".lb");
            if (lb && lb.scrollWidth > lb.clientWidth + 1) el.title = String(it.label ?? ""); else el.removeAttribute("title");
          });
          m.append(el);
        }
        return m;
      };
      const m = this.$.menu = build(entries);
      this.root.append(m);
      const bounds = uiLocalBounds(this.root);
      const r = m.getBoundingClientRect();
      const mw = uiLocalSize(r.width), mh = uiLocalSize(r.height);
      const pt = uiLocalPoint(e.clientX, e.clientY, this.root);
      m.style.left = Math.min(pt.x, bounds.w - mw - 8) + "px";
      m.style.top = Math.max(8, Math.min(pt.y, bounds.h - mh - 8)) + "px";
      this._menuOff = (ev) => { if (!m.contains(ev.target)) this.closeMenu(); };
      setTimeout(() => window.addEventListener("pointerdown", this._menuOff, true), 0);
      return m;
    },

    /** Inline slider row for a menu (applies live). */
    menuSlider(label, val, min, max, step, fmt, onInput) {
      const r = h("input", { class: "h3l-range", type: "range", min, max, step, value: val });
      const v = h("span", { class: "v" }, fmt(val));
      const sp = () => r.style.setProperty("--p", ((r.value - min) / (max - min) * 100) + "%"); sp();
      r.oninput = () => { sp(); v.textContent = fmt(Number(r.value)); onInput(Number(r.value)); };
      r.addEventListener("pointerdown", (e) => e.stopPropagation());
      return { el: h("div", { class: "ctl" }, h("span", { class: "l" }, label), r, v) };
    },

    // ---------------------------------------------------------------- clip menu
    clipMenu(e, i) {
      if (this.sel !== i) { this.sel = i; this.renderInspector(); this.renderTimeline(); this.renderPreview(); }
      const s = this.seg(i), stale = this.isStale(i), busy = !!this.run.active, st = this.segGenState(i);
      const f = Math.round(this.frameAt(e.clientX)), it = this.items()[i];
      const takes = (s.takes || []).map((t, k) => ({ label: T("Дубль {0} · сид {1}", k + 1, t.seed ?? "?") + (t.result?.fr ? " · " + T("лицо") : "") + (t.created ? ` · ${new Date(t.created * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""),
        on: t.id === s.active_take, fn: () => this.selectTake(i, t.id), dis: busy || !!s.freeze }));
      this.openMenu(e, s.name || T("Отрезок {0}", i + 1), [
        { icon: ICON.spark, label: stale ? T("Сгенерировать") : T("Сгенерировать (уже готов)"), fn: () => this.genSegment(i), dis: !st.ok || !stale },
        { icon: ICON.dice, label: T("Ещё дубль (новый сид)"), fn: () => this.newTake(i), dis: !st.ok },
        stale && s.result && this.restoreTake?.(i) ? { label: T("↺ Восстановить входы дубля"), title: T("Вернуть всё, что изменилось с этого дубля (один шаг отмены) — без перегенерации"), fn: () => this.restoreAll(i), dis: busy } : null,
        stale && s.result && this.restoreTake?.(i) ? { label: T("↺ Восстановить… (выбрать поля)"), fn: () => this.openRestorePanel(i) } : null,
        s.gap ? { label: T("✕ Убрать промежуток перед отрезком"), fn: () => this.removeGap(i) } : null,
        !st.ok && !busy && !s.freeze ? { why: st.why } : null,
        takes.length > 1 ? { label: T("Дубли ({0}/{1})", this.takeIndex(s, s.active_take) + 1, takes.length), sub: takes } : null,
        { icon: this.constructor.VIEWER_ICONS?.view || "", label: T("Удобный просмотр"), title: T("Этот клип во весь экран: масштаб до ×4, покадрово, скорость, петля"), fn: () => this.viewerForClip(i), dis: !this.viewerClipSpec(i) },
        { label: T("⇢ Bridge: изменить сегмент, сохранить следующий…"), title: T("Создать участок с контекстом до и после. Промпт редактируется в участке, а кеш следующего сегмента сохраняется. Короткое начало следующего перекрывается результатом Bridge."), fn: () => this.bridgeSegment(i), dis: busy || !s.result?.video || !this.seg(i + 1)?.result?.video },
        { label: T("↻ Перегенерировать участок…"), title: T("Выделить часть ролика вокруг этого места и пересоздать только её (контекст до и после сохраняется). Основной способ — кнопка «Участок» над таймлайном"), fn: () => this.regionAt(f), dis: busy || !s.result?.video && !C.isFootage(s) },
        s.freeze ? { label: T("⊡ Разморозить"), fn: () => this.unfreezeSeg(i) } : { label: T("⊠ Зафиксировать"), fn: () => this.freezeSeg(i), dis: busy || stale },
        ...this.stageMenuEntries(i),
        ...this.finalMenuEntries(i),
        ...this.upMenuEntries(i),
        "sep",
        { label: T("⤓ Сохранить фрагмент (этот отрезок)…"), fn: () => this.saveDialog({ mode: "clip", i }), dis: !s.result?.video },
        { label: T("▶ Открыть в плеере"), fn: () => { this.sel = i; this.pvMode = "segment"; this.playhead = it.start + (i ? it.overlap : 0); this.renderAll(); this.scrollToPlayhead?.(); } },
        "sep",
        s.result || (s.takes || []).length ? { label: T("ℹ Параметры генерации"), title: T("Промпт, модель, LoRA, сид, шаги, апскейл — как было при генерации"), fn: () => this.openGenMeta({ segIndex: i }) } : null,
        s.result || (s.takes || []).length ? { label: T("↺ Повторить"), title: T("Восстановить промпт, референсы, пресет и настройки этого дубля"), fn: () => this.repeatFromMeta(this.genMetaOf(i)) } : null,
        { icon: ICON.copy, label: T("Копировать промпт и референсы"), fn: () => this.copySegSpec(i) },
        { label: T("⧉ Вставить промпт и референсы"), fn: () => this.pasteSegSpec(i), dis: !this._segClip, title: this._segClip ? T("Из «{0}»", this._segClip.from) : T("Сначала скопируйте у другого отрезка") },
        "sep",
        { icon: ICON.plus, label: T("Продлить отсюда"), title: T("Новый отрезок сразу после этого, продолжает его"), fn: () => this.insertAfter(i, "extend") },
        { label: T("Новая сцена после"), title: T("Новый отрезок после этого — монтажная склейка, без продолжения"), fn: () => this.insertAfter(i, "cut") },
        i > 0 && s.link === "extend" && !C.isFootage(s) ? { label: T("⟷ Перекрытие ({0} кадр.)", it.overlap || 0), dis: !!s.freeze, sub: [{ label: T("По умолчанию (из настроек)"), on: (s.overlap_blocks ?? -1) === -1, fn: () => this.setSegOverlap(i, -1) }]
          .concat([{ label: "Hard Cut · 0 s", on: s.overlap_blocks === -2, fn: () => this.setSegOverlap(i, -2) }], Array.from({ length: C.MAX_OVERLAP_BLOCKS + 1 }, (_, o) => ({ label: this.ovLabel(o), on: s.overlap_blocks === o, fn: () => this.setSegOverlap(i, o) }))) } : null,
        i > 0 ? { label: s.link === "cut" ? T("Сделать продолжением предыдущего") : T("Сделать новой сценой"), fn: () => this.mutate((p) => { p.segments[i].link = s.link === "cut" ? "extend" : "cut"; }), dis: !!s.freeze } : null,
        { icon: ICON.cut, label: T("Разрезать здесь"), fn: () => { this.playhead = f; this.split(); }, hint: "S", dis: !!s.freeze },
        { icon: ICON.copy, label: T("Дублировать"), fn: () => this.duplicate(), hint: "D" },
        { label: T("◆ Маркер здесь"), fn: () => this.addMarker(f), hint: "M" },
        (s.takes || []).length > 1 ? { label: T("⌀ Удалить другие дубли"), fn: () => this.clearTakes(i), dis: busy } : null,
        "sep",
        { icon: ICON.trash, label: T("Удалить"), fn: () => this.deleteSeg(i), danger: true, hint: "Del" },
      ]);
    },

    copySegSpec(i) {
      const s = this.seg(i);
      this._segClip = { prompt: s.prompt, refs: [...s.refs], overrides: JSON.parse(JSON.stringify(s.overrides || {})), from: s.name || T("Отрезок {0}", i + 1) };
      this.toast(T("Промпт и референсы скопированы · правый клик по другому отрезку → «Вставить»"));
    },
    pasteSegSpec(i) {
      const c = this._segClip; if (!c) return;
      if (this.seg(i)?.freeze) return this.toast(T("Отрезок зафиксирован — разморозьте, чтобы менять"), true);
      this.mutate((p) => { const s = p.segments[i]; s.prompt = c.prompt; s.refs = [...c.refs]; s.overrides = JSON.parse(JSON.stringify(c.overrides)); });
      this.toast(T("Вставлено из «{0}» в отрезок {1}", c.from, i + 1));
    },
    insertAfter(i, link) {
      const base = this.seg(i), s = this.newSegment(base);
      s.link = link; if (link === "cut") s.refs = base.refs.filter((r) => this.p.assets.find((a) => a.id === r)?.category === "character");
      this.mutate((p) => { p.segments.splice(i + 1, 0, s); }, { render: "none" });
      this.sel = i + 1; this.pvMode = "segment";
      const it = this.items()[this.sel]; this.playhead = it.start + it.overlap;
      this.renderAll(); this.scrollToPlayhead?.();
      if (!this.pastMarkerHint()) this.toast(link === "cut" ? T("Новая сцена вставлена") : T("Отрезок вставлен — продолжит предыдущий"));
    },
    clearTakes(i) {
      const s = this.seg(i); if (!s) return;
      if (!confirm(T("Удалить {0} дубл(я/ей) отрезка {1}, кроме текущего?", s.takes.length - 1, i + 1))) return;
      this.mutate((p) => { const x = p.segments[i]; x.takes = x.takes.filter((t) => t.id === x.active_take).slice(-1); });
      this.toast(T("Остался только текущий дубль"));
    },

    // ---------------------------------------------------------------- audio clip menu
    audioMenu(e, id) {
      const c = this.audioClipById(id); if (!c) return;
      const a = this.audioAsset(c.asset), sp = this.clipSpan(c), music = (c.lane | 0) >= C.MUSIC_LANE;
      const set = (fn, co) => this.mutate((p) => { const x = p.audio.clips.find((k) => k.id === id); if (x) fn(x); }, { coalesce: co, render: "none" });
      const relayout = () => { this.renderTimeline(); this.audioPanelRefresh(); };
      const t = this.frameAt(e.clientX) / C.FPS;
      this.openMenu(e, (music ? "♫ " : "⊠ ") + (a?.name || c.asset), [
        this.menuSlider(T("Громкость"), c.volume ?? 1, 0, 2, 0.05, (v) => Math.round(v * 100) + "%", (v) => { set((x) => { x.volume = v; }, "avol" + id); relayout(); }),
        this.menuSlider(T("Фейд in"), c.fade_in || 0, 0, Math.min(10, sp.len), 0.1, (v) => v.toFixed(1) + T(" с"), (v) => { set((x) => { x.fade_in = v; }, "afi" + id); relayout(); }),
        this.menuSlider(T("Фейд out"), c.fade_out || 0, 0, Math.min(10, sp.len), 0.1, (v) => v.toFixed(1) + T(" с"), (v) => { set((x) => { x.fade_out = v; }, "afo" + id); relayout(); }),
        !music ? { why: T("Громкость и фейды на дорожках 1–2 меняют фиксируемый звук (отрезки под клипом перегенерируются)") } : null,
        "sep",
        { label: T("Дорожка"), sub: [[0, T("⊠ Дорожка 1 (фиксация)")], [1, T("⊠ Дорожка 2 (фиксация)")], [2, T("♫ Музыка (поверх видео)")]].map(([l, lb]) => ({ label: lb, on: c.lane === l, fn: () => { this.ensureAudioLane(l); this.mutate((p) => { p.audio.clips.find((k) => k.id === id).lane = l; }); } })) },
        { icon: ICON.cut, label: T("Разрезать здесь"), hint: "S", fn: () => { this.playhead = Math.round(t * C.FPS); this.selAudio = id; this.splitAudio(); } },
        { icon: ICON.copy, label: T("Дублировать"), fn: () => { const nid = C.newId("ac"); this.mutate((p) => { p.audio.clips.push({ ...JSON.parse(JSON.stringify(c)), id: nid, start: Math.round((sp.end) * 1000) / 1000 }); p.audio.clips.sort((x, y) => x.start - y.start || x.lane - y.lane); }); this.selAudio = nid; } },
        { label: T("✎ Посмотреть / изменить файл…"), fn: () => this.openAssetEditor(c.asset), dis: c.asset === C.AUDIO_INPUT_ID },
        { label: T("Параметры клипа"), fn: () => this.selectAudio(id) },
        "sep",
        { icon: ICON.trash, label: T("Удалить"), hint: "Del", danger: true, fn: () => this.deleteAudio(id) },
      ]);
    },

    // ---------------------------------------------------------------- asset menu
    assetMenu(e, a) {
      const kind = a.category === "video" ? "video" : a.category === "audio" ? "audio" : "image";
      const seg = this.seg(), inSeg = !!seg?.refs.includes(a.id);
      const pics = ["character", "location", "other"];
      this.openMenu(e, a.name, [
        { label: T("✎ Посмотреть / изменить…"), title: kind === "image" ? T("Обрезка, поворот, зеркало, уменьшение") : kind === "audio" ? T("Обрезка, громкость, нормализация, фейды") : T("Обрезка по времени, уменьшение, кадрирование, кадр/звук в ассеты"), fn: () => this.openAssetEditor(a.id), dis: !!a.virtual, hint: T("2×клик") },
        seg ? { icon: inSeg ? ICON.minus || "" : ICON.plus, label: inSeg ? T("Убрать из референсов отрезка {0}", this.sel + 1) : T("В референсы отрезка {0}", this.sel + 1) + (kind === "video" ? ` (<Video ${C.videoRefs(this.p, seg).length + 1}>)` : kind === "audio" ? ` (<Audio ${C.audioRefs(this.p, seg).length + 1}>)` : " (<Picture>)"),
          title: (seg.name ? `«${seg.name}»: ` : "") + (inSeg ? T("убрать этот ассет из референсов выбранного отрезка") : T("добавить ассет в референсы выбранного отрезка")), fn: () => this.toggleRef(this.sel, a.id) } : null,
        kind === "video" ? { icon: ICON.film || "", label: T("На таймлайн (футаж)"), fn: () => this.addFootage(a.id) } : null,
        kind === "audio" ? { label: T("⊠ На аудиодорожку (фиксация)"), fn: () => this.addAudioClip(a.id, this.playhead / C.FPS, 0) } : null,
        kind === "audio" ? { label: T("♫ На дорожку музыки"), fn: () => this.addAudioClip(a.id, this.playhead / C.FPS, C.MUSIC_LANE) } : null,
        kind === "image" ? { label: T("Категория"), sub: pics.map((k) => ({ label: { character: T("Персонаж"), location: T("Локация"), other: T("Другое") }[k], on: a.category === k, fn: () => this.mutate((p) => { p.assets.find((x) => x.id === a.id).category = k; }) })) } : null,
        "sep",
        a.orig ? { label: T("↺ Вернуть оригинал"), fn: () => this.mutate((p) => { const x = p.assets.find((y) => y.id === a.id); x.file = x.orig.filename; x.subfolder = x.orig.subfolder; x.type = x.orig.type; x.orig = null; x.edit = null; }) } : null,
        { label: T("Переименовать…"), fn: () => { const n = prompt(T("Имя ассета"), a.name); if (n && n.trim()) this.mutate((p) => { p.assets.find((x) => x.id === a.id).name = n.trim(); }); }, dis: !!a.virtual },
        { icon: ICON.trash, label: T("Убрать из проекта"), danger: true, dis: !!a.virtual, fn: () => {
          if (kind === "video") return this.removeVideoAsset(a.id);
          this.mutate((p) => { p.assets = p.assets.filter((x) => x.id !== a.id); p.audio.clips = p.audio.clips.filter((c) => c.asset !== a.id); for (const s of p.segments) s.refs = s.refs.filter((r) => r !== a.id); });
        } },
      ]);
    },

    // ---------------------------------------------------------------- «Сохранить видео»
    /** opt.mode: "all" | "range" | "clip" (opt.i). */
    saveDialog(opt = {}) {
      this.closeSaveDialog();
      const fullOk = this.fullCurrent();
      const its = this.items();
      const allReady = () => this.genCount() > 0 && its.length >= this.genCount() && its.slice(0, this.genCount()).every((it, k) =>
        !!this.p.segments[k]?.result?.video && !this.isStale(k));
      let mode = opt.mode || (fullOk || allReady() ? "all" : this.seg()?.result?.video ? "clip" : "all");
      let ci = opt.i ?? Math.max(0, this.sel);
      const ld = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
      const folder = h("input", { class: "h3l-in", value: ld("h3ls.exportDir", ""), placeholder: T("по умолчанию: ComfyUI/output/h3labstudio/export"), title: T("Папка на компьютере, где запущен ComfyUI (например D:\\Видео\\H3). Относительный путь — внутри ComfyUI/output") });
      const d = new Date(), z = (x) => String(x).padStart(2, "0");   // local time (toISOString would be UTC)
      const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}`;
      const name = h("input", { class: "h3l-in", value: `${(this.p.name || "h3").replace(/[\\/:*?"<>|]/g, "_")}_${stamp}` });
      const modernExport = !!this.isModern?.();
      const lastPathAtOpen = this.lastExport?.path || "";
      const historyKey = "h3ls.exportHistory." + this.p.id;
      const exportHistory = (() => { try { const a = JSON.parse(ld(historyKey, "[]")); return Array.isArray(a) ? a : []; } catch { return []; } })();
      let saveNameSuffix = "";
      const pathPreview = h("div", { class: "h3l-modern-save-path", role: "status" });
      const updateDestination = () => {
        const dir = folder.value.trim() || "ComfyUI/output/h3labstudio/export";
        const file = (name.value.trim() || T("без имени")) + saveNameSuffix + ".mp4";
        pathPreview.textContent = T("Планируемый путь (при совпадении имени добавится номер): ") + dir.replace(/[\\\\/]+$/, "") + "\\\\" + file;
      };
      folder.addEventListener("input", updateDestination);
      folder.addEventListener("change", updateDestination); // native folder picker dispatches change
      name.addEventListener("input", updateDestination);
      updateDestination();
      const exportSteps = h("div", { class: "h3l-modern-export-step", role: "status" },
        [T("1. Подготовка"), T("2. Сборка"), T("3. Копирование"), T("4. Готово")].map((x) => h("span", null, x)));
      const markExport = (stage) => {
        const n = { prep: 0, assemble: 1, copy: 2, done: 3, error: -1 }[stage];
        [...exportSteps.children].forEach((e, i) => e.classList.toggle("on", n === i));
      };
      const historyList = h("div", { class: "h3l-modern-export-history" });
      const renderHistory = () => {
        historyList.replaceChildren(...exportHistory.slice(0, 5).map((entry) => h("button", {
          class: "h3l-btn sm", title: T("Скопировать путь: ") + entry.path,
          onclick: () => { navigator.clipboard?.writeText(entry.path); this.toast(T("Путь скопирован")); },
        }, entry.path)));
      };
      renderHistory();
      const vEnd = this.totalFrames();
      const fIn = h("input", { class: "h3l-in sm", type: "number", step: "0.1", min: 0, value: ((this._rangeIn ?? 0) / C.FPS).toFixed(2) });
      const fOut = h("input", { class: "h3l-in sm", type: "number", step: "0.1", min: 0, value: ((this._rangeOut ?? vEnd) / C.FPS).toFixed(2) });
      const phBtn = (inp, title) => h("button", { class: "h3l-btn sm", title, onclick: () => { inp.value = (this.playhead / C.FPS).toFixed(2); upd(); } }, T("⌖ плейхед"));
      const music = C.musicClips(this.p).length > 0 || (this.p.audio.video_volume ?? 1) !== 1;
      const mixT = this.toggle(T("Микс: музыка + звук видео ") + Math.round((this.p.audio.video_volume ?? 1) * 100) + "%", this._exportMix !== false, (v) => { this._exportMix = v; mixT.classList.toggle("on", v); }, T("Дорожка «Музыка» и громкость звука видео применяются к файлу"));
      mixT.onclick = () => { this._exportMix = this._exportMix === false; mixT.classList.toggle("on", this._exportMix !== false); };
      // Saved per project, but not in generation settings: it affects only the
      // assembled/exported video, never the original take masters or H3 sampling.
      const colourKey = "h3ls.exportColour." + this.p.id;
      let exportColour = ld(colourKey, this.p.settings?.continuation_method === "h3studio" ? "1" : "0") === "1";
      const colourT = this.toggle(T("Цветокоррекция Studio (Lab)"), exportColour, null,
        T("Включить выравнивание яркости и цвета при сохранении. Исходные сегменты не изменяются."));
      colourT.onclick = () => {
        if (saving) return;
        exportColour = !exportColour;
        colourT.classList.toggle("on", exportColour);
        try { localStorage.setItem(colourKey, exportColour ? "1" : "0"); } catch (e) {}
        upd();
      };
      // Save Video now always uses scene-by-scene FFmpeg pipe export.
      // The old disk-backed stitcher stays internal for complex spans/upscales.
      const exportPipe = true;
      const exportStream = true;
      // Hardware codec and FFmpeg stitching are selected internally now.
      // No advanced export-mode controls are needed in the Save dialog.
      const info = h("div", { class: "h3l-note" });
      const pills = h("div", { class: "h3l-pills" });
      const segSel = h("select", { class: "h3l-sel sm" }, its.map((it, k) => h("option", { value: k, selected: k === ci }, `${k + 1}. ${this.p.segments[k].name || T("Отрезок ") + (k + 1)}`)));
      segSel.onchange = () => { ci = Number(segSel.value); upd(); };
      const rowR = h("div", { class: "h3l-row" }, h("span", null, T("с")), fIn, phBtn(fIn, T("Начало = плейхед")), h("span", null, T("по")), fOut, phBtn(fOut, T("Конец = плейхед")));
      const rowC = h("div", { class: "h3l-row" }, segSel);
      const go = h("button", { class: "h3l-btn primary", html: (ICON.save || "⤓") + T("<span>Сохранить</span>") });
      let saving = false;
      // Live export progress is a separate UI state: generation steps may be zero
      // while cached clips are being decoded, joined and the final MP4 is encoded.
      const meterLabel = h("div", { style: { fontWeight: "600" } }, T("Подготовка сохранения…"));
      const meterFill = h("div", { style: { height: "100%", width: "0%", background: "var(--accent, #278be8)", borderRadius: "8px", transition: "width .2s ease" } });
      const meterBar = h("div", { style: { height: "8px", overflow: "hidden", background: "rgba(128,128,128,.25)", borderRadius: "8px" } }, meterFill);
      const meterDetail = h("div", { style: { fontSize: "12px", opacity: ".75" } }, "");
      const meter = h("div", { class: "h3l-save-progress", role: "status", "aria-live": "polite",
        style: { display: "none", padding: "10px", borderRadius: "8px", background: "rgba(128,128,128,.08)", marginTop: "8px" } },
        meterLabel, meterBar, meterDetail);
      let meterStage = "", meterStarted = 0, meterDone = 0, meterTotal = Math.max(1, its.length);
      const updateMeter = (e = {}) => {
        if (!saving && !this._pendingVideoSave && !["save_done", "save_error"].includes(e.event)) return;
        meter.style.display = "";
        if (e.event === "save_done") {
          meterFill.style.width = "100%"; meterLabel.textContent = T("✓ Видео сохранено");
          meterDetail.textContent = this.lastExport?.path || ""; return;
        }
        if (e.event === "save_error") {
          meterLabel.textContent = T("Ошибка сохранения"); meterFill.style.width = "0%"; return;
        }
        const stage = e.stage || (e.event === "save_copy" ? "copy" : this._pendingVideoSave?.stage || "assemble");
        if (meterStage !== stage || e.event === "start") {
          meterStage = stage; meterStarted = Date.now(); meterDone = 0;
          meterTotal = Math.max(1, Number(e.segments) || its.length);
        }
        if (e.event === "seg_done") meterDone = Math.max(meterDone, Number(e.seg) + 1);
        const phase = e.phase || this.run?.phase || "";
        let label, ratio = meterDone / meterTotal, detail = "";
        if (stage === "copy") { label = T("Копирование видео в выбранную папку…"); ratio = 0; }
        else if (phase === "export_encode") {
          const done = Math.max(0, Number(e.fd) || 0), total = Math.max(1, Number(e.fn) || 1);
          ratio = Math.min(1, done / total);
          label = T("Кодирование итогового MP4: {0}/{1} кадров", done, total);
          if (Number.isFinite(e.eta)) detail = T("Осталось примерно {0}", C.fmtDur(e.eta));
        } else if (phase === "stitch") { label = T("Склейка отрезков в один ролик…"); ratio = 0; }
        else if (phase === "audio_mix") { label = T("Сведение звуковой дорожки…"); ratio = 0; }
        else {
          const n = Math.min(meterTotal, Math.max(1, Number(e.seg) + 1 || meterDone + 1));
          label = stage === "colour" ? T("Цветокоррекция: отрезок {0} из {1}", n, meterTotal)
            : T("Подготовка видео: отрезок {0} из {1}", n, meterTotal);
          const elapsed = (Date.now() - meterStarted) / 1000;
          if (meterDone && meterDone < meterTotal)
            detail = T("Осталось примерно {0}", C.fmtDur(elapsed / meterDone * (meterTotal - meterDone)));
        }
        const percent = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(1);
        meterFill.style.width = percent + "%";
        meterLabel.textContent = label;
        const hasPercent = stage !== "copy" && phase !== "stitch" && phase !== "audio_mix";
        meterDetail.textContent = (hasPercent ? percent + "% · " : "")
          + (detail || T("Прошло {0}", C.fmtDur((Date.now() - meterStarted) / 1000)));
      };
      /** Never silently export an outdated MP4. The current timeline is assembled on Save. */
      const timelineSource = () => this.fullCurrent() && this.p.result?.full?.video
        && this.p.result.full.export_colour === exportColour
        && Boolean(this.p.result.full.export_pipe) === exportPipe
        ? { video: this.p.result.full.video, frames: this.p.result.full.frames || vEnd, via: "current" } : null;
      const src = () => {
        if (mode === "clip") {
          const s = this.p.segments[ci], it = its[ci];
          const tl = timelineSource();
          if (tl && it) { const ov = ci ? it.overlap : 0; return { source: tl.video, range: [it.start + ov, Math.min(it.end, vEnd)], tl: 0, why: "", via: tl.via }; }
          if (s?.result?.video && !this.isStale(ci)) {
            // Raw clip exports can skip assembly. A coloured clip, or a clip
            // requiring colour, must be assembled from its original take cache.
            const alreadyColoured = String(s.result.video.filename || "").includes("_studio_c3");
            if (!exportColour && !alreadyColoured)
              return { source: s.result.video, range: null, tl: it?.start || 0, why: "" };
            const prefixReady = its.slice(0, ci + 1).every((_, k) =>
              !!this.p.segments[k]?.result?.video && !this.isStale(k));
            if (prefixReady && it) {
              const ov = ci ? it.overlap : 0;
              return { source: null, needsAssembly: true, range: [it.start + ov, Math.min(it.end, vEnd)],
                tl: 0, frames: it.end, upto: ci };
            }
            return { why: T("Для цветокоррекции нужны готовые предыдущие отрезки") };
          }
          return { why: T("Отрезок не сгенерирован (или изменён) — сначала «Сгенерировать»") };
        }
        const tl = timelineSource();
        if (!tl && !allReady()) return { why: T("Не все отрезки готовы — сначала сгенерируйте недостающие") };
        if (mode === "all") return { source: tl?.video || null, needsAssembly: !tl, range: null, tl: 0, frames: tl?.frames || vEnd };
        const a = Math.round(Number(fIn.value) * C.FPS), b = Math.round(Number(fOut.value) * C.FPS);
        if (!(b > a)) return { why: T("Конец фрагмента должен быть позже начала") };
        return { source: tl?.video || null, needsAssembly: !tl, range: [Math.max(0, a), Math.min(b, tl?.frames || vEnd)], tl: 0, frames: tl?.frames || vEnd };
      };
      const upd = () => {
        pills.innerHTML = "";
        for (const [k, l] of [["all", T("Весь ролик")], ["range", T("Фрагмент (с – по)")], ["clip", T("Отрезок")]]) pills.append(h("div", { class: "h3l-pill" + (mode === k ? " on" : ""), onclick: () => { mode = k; upd(); } }, l));
        rowR.style.display = mode === "range" ? "" : "none"; rowC.style.display = mode === "clip" ? "" : "none";
        saveNameSuffix = mode === "clip" ? T("_отрезок{0}", ci + 1) : mode === "range" ? `_${fIn.value}-${fOut.value}s` : "";
        if (modernExport) updateDestination();
        const x = src();
        go.disabled = !!x.why || !!this._pendingVideoSave || saving || !!this.run.active;
        const len = x.range ? (x.range[1] - x.range[0]) / C.FPS : mode === "all" ? (x.frames || vEnd) / C.FPS : (its[ci]?.frames || 0) / C.FPS;
        info.textContent = x.why || T("≈ {0} с · mp4 H.264 + AAC · файл не перезаписывается (добавится _2, _3…)", len.toFixed(2))
          + (x.needsAssembly ? T(" · сначала соберём готовые отрезки из кэша") : "")
          + (exportColour ? T(" · цветокоррекция включена") : T(" · без цветокоррекции"))
          + (x.needsAssembly && exportPipe ? T(" · потоковый экспорт без RGB-кэша") : "");
        info.classList.toggle("err", !!x.why);
      };
      go.onclick = async () => {
        const x = src(); if (x.why || saving || this._pendingVideoSave || this.run.active) return;
        saving = true; go.disabled = true; go.classList.add("busy");
        if (modernExport) markExport("prep");
        try { localStorage.setItem("h3ls.exportDir", folder.value.trim()); } catch (e) {}
        const body = { source: x.source, range: x.range, folder: folder.value.trim(),
          name: name.value.trim() + (mode === "clip" ? T("_отрезок{0}", ci + 1) : mode === "range" ? `_${fIn.value}-${fOut.value}s` : ""),
          timeline_start: x.tl, encoder: "cpu" };
        if (music && this._exportMix !== false) body.project = this.p;
        else body.project = this.p.id;
        const saveFile = async (video) => {
          if (!video) throw new Error(T("Сборка не вернула итоговое видео"));
          if (modernExport) markExport("copy");
          updateMeter({ event: "save_copy", stage: "copy" });
          const r = await this.host.exportVideo({ ...body, source: video });
          this.lastExport = r;
          updateMeter({ event: "save_done" });
          if (modernExport) {
            markExport("done");
            exportHistory.unshift({ path: r.path, at: new Date().toISOString() });
            exportHistory.splice(10);
            try { localStorage.setItem(historyKey, JSON.stringify(exportHistory)); } catch {}
            renderHistory();
          }
          this.toast(T("Сохранено: {0} ({1} с)", r.path, r.seconds.toFixed(2)));
          info.textContent = `✓ ${r.path}`; info.classList.remove("err");
          const cp = h("button", { class: "h3l-btn sm", onclick: () => { navigator.clipboard?.writeText(r.path); this.toast(T("Путь скопирован")); } }, T("Скопировать путь"));
          info.append(" ", cp);
          if (modernExport) {
            const dir = String(r.path || "").replace(/[\\\\/][^\\\\/]+$/, "");
            info.append(" ", h("button", { class: "h3l-btn sm", onclick: () => { navigator.clipboard?.writeText(dir); this.toast(T("Папка скопирована")); } }, T("Скопировать папку")));
            pathPreview.textContent = T("Сохранено в: ") + r.path;
          }
        };
        const fail = (e) => {
          updateMeter({ event: "save_error" });
          if (modernExport) markExport("error");
          this.toast(T("Не удалось сохранить: ") + (e?.message || e), true);
          info.textContent = T("Ошибка: ") + (e?.message || e);
          info.classList.add("err");
        };
        if (x.needsAssembly) {
          // "Save video" is the only action that assembles/exports the final MP4.
          // Studio needs its cached Lab colour pass before the no-sampling assembly.
          // Complex edits and frozen Studio takes still require the legacy pipeline.
          const exportSegments = x.upto >= 0 ? this.p.segments.slice(0, x.upto + 1) : this.p.segments;
          const legacy = !!(this.p.regions?.length || C.lockClips(this.p)?.length
            || its.slice(0, exportSegments.length).some((it) => it.gap)
            || exportSegments.some((s) => s.upscale || s.fr || s.ar || s.freeze
              || (s.source && !s.source.swap && !Number(s.source.denoise))));
          if (legacy && !confirm(T("В проекте есть дополнительные обработки, футаж, паузы или заблокированный звук. Для сохранения используется совместимая полная сборка; она может занять больше времени и места на диске. Продолжить?"))) {
            saving = false; go.disabled = false; go.classList.remove("busy");
            return;
          }
          const pending = {
            stage: legacy ? "full" : exportColour ? "colour" : "assemble",
            colour: exportColour,
            stream: exportStream,
            pipe: exportPipe,
            upto: x.upto ?? -1,
            finish: async (fullVideo) => {
              try { await saveFile(fullVideo?.video); }
              catch (e) { fail(e); }
              finally {
                if (this._pendingVideoSave === pending) this._pendingVideoSave = null;
                saving = false; go.disabled = false; go.classList.remove("busy");
                this.$?.saveModal?.__h3lRefresh?.();
              }
            },
            fail: (e) => {
              if (this._pendingVideoSave !== pending) return;
              this._pendingVideoSave = null;
              fail(e); saving = false; go.disabled = false; go.classList.remove("busy");
              this.$?.saveModal?.__h3lRefresh?.();
            },
          };
          this._pendingVideoSave = pending;
          updateMeter({ event: "save_start", stage: pending.stage });
          if (modernExport) markExport("assemble");
          info.textContent = pending.stage === "colour"
            ? T("Подготавливаем цветокоррекцию для сохранения видео…")
            : pending.stage === "full"
              ? T("Обрабатываем сложный проект для сохранения видео…")
              : T("Собираем готовые отрезки из кэша без генерации…");
          try { await this.generate({ operation: pending.stage, upto: pending.upto }); }
          catch (e) { pending.fail(e); }
          return;
        }
        try { await saveFile(x.source); }
        catch (e) { fail(e); }
        finally { saving = false; go.disabled = false; go.classList.remove("busy"); }
      };
      fIn.onchange = upd; fOut.onchange = upd;
      const box = h("div", { class: "h3l-save h3l-glass" },
        h("div", { class: "hd" }, h("b", null, T("⤓ Сохранить видео")), h("i", { class: "grow" }), h("button", { class: "h3l-btn sm icon", onclick: () => this.closeSaveDialog() }, "✕")),
        this.field(T("Что сохранить"), pills), rowR, rowC,
        this.field(T("Папка"), this.folderPicker(folder)), this.field(T("Имя файла (.mp4)"), name),
        modernExport ? pathPreview : null,
        colourT, music ? mixT : null, info, meter,
        modernExport ? exportSteps : null,
        modernExport ? this.field(T("Последние сохранения · клик — скопировать путь"), historyList) : null,
        h("div", { class: "h3l-row" }, h("i", { class: "grow" }), h("button", { class: "h3l-btn", onclick: () => this.closeSaveDialog() }, T("Закрыть")), go));
      if (this._exportMix !== false) mixT.classList.add("on");
      const modal = this.$.saveModal = h("div", { class: "h3l-modal" }, box);
      modal.__h3lProgress = updateMeter;
      modal.__h3lRefresh = () => {
        upd();  // a dialog reopened during assembly re-enables Save when the job ends
        if (modernExport && !this._pendingVideoSave && this.lastExport?.path && this.lastExport.path !== lastPathAtOpen && !saving) {
          info.textContent = "✓ " + this.lastExport.path;
          info.classList.remove("err");
          markExport("done");
          pathPreview.textContent = T("Сохранено в: ") + this.lastExport.path;
          info.append(" ", h("button", { class: "h3l-btn sm", onclick: () => { navigator.clipboard?.writeText(this.lastExport.path); this.toast(T("Путь скопирован")); } }, T("Скопировать путь")));
        }
      };
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) this.closeSaveDialog(); });
      box.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") this.closeSaveDialog(); if (e.key === "Enter" && !go.disabled) go.click(); });
      this.root.append(modal);
      upd();
      name.focus(); name.select();
    },
    closeSaveDialog() {
      // The user already clicked Save: hiding this dialog must not cancel the
      // pending assembly/export. Completion still reports the chosen file path.
      if (this.$?.saveModal) { this.$.saveModal.remove(); this.$.saveModal = null; this.focusSink?.(); }
    },
  });
}
