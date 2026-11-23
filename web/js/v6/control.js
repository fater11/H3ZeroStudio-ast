// H3ZeroStudio Lab v6k — the ControlNet track: one extra row under the video tracks (MiniMax H3 Fun ControlNet
// Union 2.0). A video placed on it guides the segments it lies under: the server turns the clip into a control
// video (pose skeleton / depth / Canny / gray, or «ready» = as is), time-aligns it with each segment and applies the
// native ControlNet patch to the model. The track head holds the switch, the mode and the strength / range popover.
// Once the mode is applied the clip shows the processed video (filmstrip and player); off / another mode → the
// original or a new processing. The original file is never touched; processed files are cached per mode on the server.
import { T } from "../h3s_i18n.js";
import { I, setTip, popover, closePopover, menuList, checkbox, seg, btn, slider, sw } from "./kit.js";

export const CTLH = 50;
const ROWG = 4;
const MODES = ["pose", "depth", "canny", "gray", "ready"];
const ML = () => ({ pose: T("Поза"), depth: T("Глубина"), canny: "Canny", gray: T("Серый"), ready: T("Готовый контроль") });
const MS = () => ({ pose: T("Поза"), depth: T("Глубина"), canny: "Canny", gray: T("Серый"), ready: T("Готовый") });
const MT = () => ({
  pose: T("Скелет позы (RT-DETR + SDPose): движение и позы людей, без их внешности"),
  depth: T("Карта глубины (Depth Anything 3): композиция, объём и движение камеры"),
  canny: T("Контуры Canny: точные границы и силуэты"),
  gray: T("Яркость без цвета: свет, композиция и движение"),
  ready: T("Клип уже обработан (поза / глубина / контуры) — идёт в модель как есть"),
});
const fmt = (s) => (Math.round(s * 100) / 100).toFixed(2);

export function installControl(Studio, { C, h }) {
  const P = Studio.prototype;
  const prevSource = P.currentSource, prevPreview = P.renderPreview, prevSplit = P.split;
  Object.assign(P, {
    ctl() { return this.p.control || C.normalizeControl(null); },
    ctlRowOn() { const c = this.p.control; return !!(c && (c.row || (c.clips || []).length)); },
    ctlEdit(fn, opt) {
      this.mutate((p) => {
        const ct = C.normalizeControl(p.control || {}, null);
        fn(ct, p);
        p.control = C.normalizeControl(ct, new Set(p.assets.filter((a) => a.category === "video").map((a) => a.id)));
      }, opt);
    },
    ctlClip(id) { return (this.ctl().clips || []).find((c) => c.id === id) || null; },
    ctlAsset(c) { return c ? this.p.assets.find((a) => a.id === c.asset) || null : null; },
    ctlSpan(c) { return C.controlClipSpan(this.p, c); },
    ctlDur(a) { return Number(a?.duration) || (Number(a?.frames) || 0) / C.FPS; },
    ctlRef(a) { return { filename: a.file, subfolder: a.subfolder || "", type: a.type || "input" }; },
    ctlPKey(c) { const ct = this.ctl(), a = this.ctlAsset(c); return [a?.id, a?.file, ct.mode, JSON.stringify(C.controlParamsKey(ct.mode, ct.params))].join("|"); },
    ctlJobOf(c) { return (this._ctlJobs || {})[this.ctlPKey(c)] || null; },
    /** Processed view of a clip: { info (strip / frames), ref } when ready, else null. */
    ctlProcessed(c) { const ct = this.ctl(); if (!ct.on || ct.mode === "ready") return null; const j = this.ctlJobOf(c); return j?.state === "done" && j.ref ? j : null; },

    // ---------------------------------------------------------------- processing jobs (server: /h3lab/control/*)
    ctlEnsure(c) {
      const ct = this.ctl(), a = this.ctlAsset(c); if (!ct.on || ct.mode === "ready" || !a?.file) return;
      this._ctlJobs = this._ctlJobs || {};
      const pk = this.ctlPKey(c); if (this._ctlJobs[pk]) return;
      const j = this._ctlJobs[pk] = { state: "queued", done: 0, total: 0 };
      Promise.resolve(this.host.call?.("/h3lab/control/process", { ref: this.ctlRef(a), mode: ct.mode, params: ct.params }))
        .then((d) => this.ctlApply(pk, d?.job || { state: "error", error: T("нет ответа сервера") }))
        .catch((e) => this.ctlApply(pk, { state: "error", error: String(e?.message || e) }));
      return j;
    },
    ctlApply(pk, job) {
      const j = (this._ctlJobs || {})[pk]; if (!j) return;
      const was = j.state;
      Object.assign(j, job);
      if (j.state === "done" && j.ref && !j.info) {
        Promise.resolve(this.host.videoInfo?.(j.ref, true)).then((inf) => { j.info = inf || {}; if (this.root) { this.renderTimeline(); if (this.selCtl) this.renderPreview(); } }).catch(() => { j.info = {}; });
      }
      if (j.state === "queued" || j.state === "running") this.ctlPoll();
      if (was !== j.state && this.root) { this.renderTimeline(); if (this.selCtl) { this.renderInspector(); this.renderPreview(); } }
      else this.ctlProgDom();
    },
    ctlPoll() {
      if (this._ctlPollT) return;
      this._ctlPollT = setInterval(async () => {
        const run = Object.entries(this._ctlJobs || {}).filter(([, j]) => j.key && (j.state === "queued" || j.state === "running"));
        if (!run.length || !this.root) { clearInterval(this._ctlPollT); this._ctlPollT = null; return; }
        for (const [pk, j] of run) {
          try {
            const d = await this.host.get("/h3lab/control/status", { key: j.key });
            if (!d?.job) { delete this._ctlJobs[pk]; this.renderTimeline(); continue; }   // server restarted: ask again
            this.ctlApply(pk, d.job);
          } catch {}
        }
      }, 900);
    },
    ctlProgDom() {
      for (const el of this.$.tinner?.querySelectorAll(".v6-ctl-clip") || []) {
        const c = this.ctlClip(el.dataset.id), j = c && this.ctlJobOf(c), pr = el.querySelector(".v6-ctl-prog"); if (!pr || !j) continue;
        const k = j.total ? j.done / j.total : 0;
        pr.style.setProperty("--k", (k * 100).toFixed(1) + "%");
        const t = el.querySelector(".v6-ctl-pt"); if (t) t.textContent = T("Обработка {0}%", Math.round(k * 100));
      }
    },
    ctlModels() {
      if (this._ctlSt === undefined) {
        this._ctlSt = null;
        Promise.resolve(this.host.get?.("/h3lab/control/status")).then((d) => { this._ctlSt = d?.status || {}; if (this.root && this.ctlRowOn()) { this.renderTimeline(); if (this.selCtl) this.renderInspector(); } }).catch(() => { this._ctlSt = {}; });
      }
      return this._ctlSt || {};
    },
    ctlPatchMissing() { const st = this.ctlModels(); return "patch" in st && !st.patch; },
    /** v6l: Union 2.0 missing / incomplete → the v1 patch is used ({bad: [...]}) — else null. */
    ctlFallback() { const st = this.ctlModels(); return st.patch && st.patch_fallback ? { name: st.patch, bad: st.patch_bad || [] } : null; },
    ctlPatchText() {
      const st = this.ctlModels(), bad = (st.patch_bad || []).map((b) => b.file);
      if (this.ctlPatchMissing()) return T("Нет готовой модели ControlNet Union — генерация с этой дорожкой будет остановлена. Скачайте модель в «Настройки → Модели» или выключите дорожку.") + (bad.length ? "\n" + T("Недокачано (не загружается): {0}", bad.join(", ")) : "");
      const fb = this.ctlFallback(); if (!fb) return "";
      return (bad.length ? T("ControlNet Union 2.0 недокачан — используется запасная модель v1") : T("ControlNet Union 2.0 не скачан — используется запасная модель v1")) + "\n" + fb.name + (bad.length ? "\n" + T("Недокачано (не загружается): {0}", bad.join(", ")) : "");
    },
    /** Once per session: a toast when the track has clips and the patch is the v1 fallback / missing. */
    ctlPatchToast() {
      const st = this._ctlSt; if (!st || !("patch" in st) || this._ctlToasted || !(this.ctl().clips || []).length || !this.ctl().on) return;
      const miss = this.ctlPatchMissing(), fb = this.ctlFallback(); if (!miss && !fb) return;
      this._ctlToasted = true;
      this.toast(miss ? T("ControlNet: нет готовой модели — генерация с дорожкой ControlNet будет остановлена") : (fb.bad.length ? T("ControlNet: Union 2.0 недокачан — используется v1") : T("ControlNet: Union 2.0 не скачан — используется v1")), true,
        { label: T("Загрузки…"), fn: () => this.openPrefs?.("downloads") });
    },

    // ---------------------------------------------------------------- row, clips, head
    /** After tracksPost: the control row below V1 (its height is part of --video-h, see syncTimelineMetrics). */
    ctlPost(vt, nv, rowH) {
      for (const x of vt.querySelectorAll(":scope > .v6-ctl-lane, :scope > .v6-ctl-clip")) x.remove();
      this.ctlSegMarks();
      const tl = this.$.tl;
      if (tl && !tl._ctlSel) {   // a click anywhere else on the timeline (not the ruler / playhead) leaves the control clip
        tl._ctlSel = true;
        tl.addEventListener("pointerdown", (e) => {
          if (!this.selCtl || e.target.closest?.(".v6-ctl-clip, .v6-ctl-head, .h3l-ruler, .h3l-phead, .v6-pop")) return;
          for (let n = e.target; n && n !== tl; n = n.parentElement) if (n._cut) return;   // the scissors cut the selected control clip
          const old = this.selCtl; this.selCtl = null;
          requestAnimationFrame(() => { if (this.root && String(this._inspKey || "").startsWith(old + "|")) { this.renderInspector(); this.renderTimeline(); this.renderPreview(); } });
        }, true);
      }
      if (!this.ctlRowOn()) return;
      const ct = this.ctl(), ppf = this.ppf, y = nv * (rowH + ROWG);
      this.ctlModels();
      const lane = h("div", { class: "v6-ctl-lane" + (ct.on ? "" : " is-off"), style: { top: y + "px", height: CTLH + "px" } });
      if (!ct.clips.length) lane.append(h("span", { class: "v6-alane-h" }, T("Перетащите сюда видео — по нему пойдёт ControlNet")));
      this.ctlInstallDrop(lane);
      lane.addEventListener("contextmenu", (e) => this.ctlMenu(e, null));
      vt.append(lane);
      for (const c of ct.clips) {
        const a = this.ctlAsset(c), [s0, s1] = this.ctlSpan(c), x = s0 * C.FPS * ppf, w = Math.max(6, (s1 - s0) * C.FPS * ppf);
        if (ct.on) this.ctlEnsure(c);
        const job = this.ctlJobOf(c), pro = this.ctlProcessed(c);
        const el = h("div", { class: "v6-ctl-clip" + (this.selCtl === c.id ? " is-sel" : "") + (ct.on ? "" : " is-off") + (pro ? " is-proc" : ""),
          dataset: { id: c.id, mode: ct.mode }, style: { left: x + "px", width: w + "px", top: y + "px", height: CTLH + "px" } });
        this.ctlStrip(el, c, a, pro, w);
        const name = a?.name || a?.file || c.asset;
        const chip = h("span", { class: "v6-ctl-chip" }, h("b", null, ct.on ? MS()[ct.mode] : T("выкл")), h("span", null, name));
        if (c.audio) { const snd = h("i", { class: "v6-ic v6-ctl-snd" + (ct.on ? "" : " is-off"), html: I.vol, "aria-label": T("Звук в H3") }); chip.append(snd); }
        el.append(chip);
        let tip = name + "\n" + (ct.on ? T("ControlNet: {0} · сила {1}", ML()[ct.mode], ct.strength) : T("ControlNet выключен — клип ни на что не влияет"));
        if (ct.on && ct.mode !== "ready" && job) {
          if (job.state === "queued" || job.state === "running") {
            el.classList.add("is-busy");
            el.append(h("i", { class: "v6-ctl-prog", style: { "--k": ((job.total ? job.done / job.total : 0) * 100).toFixed(1) + "%" } }),
              h("span", { class: "v6-ctl-pt" }, T("Обработка {0}%", Math.round(job.total ? job.done / job.total * 100 : 0))));
            tip += "\n" + T("Готовлю контрольное видео: пока показан оригинал");
          } else if (job.state === "missing") {
            el.classList.add("is-warn"); chip.prepend(h("i", { class: "v6-ic", html: I.warn }));
            tip += "\n" + T("Нет модели препроцессора: {0}. Скачайте в «Настройки → Модели»", (job.missing || []).join(", "));
          } else if (job.state === "error") {
            el.classList.add("is-warn"); chip.prepend(h("i", { class: "v6-ic", html: I.warn }));
            tip += "\n" + T("Не удалось обработать: {0}", job.error || "");
          }
        }
        if (c.audio) { el.classList.add("has-snd"); tip += "\n" + (ct.on ? T("Звук в H3: звук клипа идёт в генерацию") : T("Звук в H3 включён, но ControlNet выключен")); }
        if (ct.on && (this.ctlPatchMissing() || this.ctlFallback())) tip += "\n" + this.ctlPatchText();
        setTip(chip, tip);
        const hl = h("i", { class: "v6-ctl-h is-l" }), hr = h("i", { class: "v6-ctl-h is-r" });
        setTip(hl, T("Подрезать начало")); setTip(hr, T("Подрезать конец"));
        el.append(hl, hr);
        el.addEventListener("pointerdown", (e) => this.ctlDrag(e, c.id, el));
        el.addEventListener("contextmenu", (e) => this.ctlMenu(e, c.id));
        vt.append(el);
      }
    },
    /** Filmstrip of the processed file (or the original while processing / off / «ready»). */
    ctlStrip(el, c, a, pro, wd) {
      const info = pro?.info?.strip ? pro.info : this.videoStrip?.(a) || (a?.strip && a.strip_n ? a : null);
      if (!info?.strip) return;
      const n = info.strip_n || 1, frames = info.frames || a?.frames || 1;
      const ar = a?.width && a?.height ? a.width / a.height : 16 / 9, tw = Math.max(24, CTLH * ar, wd / 120);
      const url = this.host.url(info.strip), box = h("div", { class: "v6-ctl-strip" }), cnt = Math.min(120, Math.ceil(wd / tw));
      for (let k = 0; k < cnt; k++) {
        const f = c.in * C.FPS + (k * tw + tw / 2) / this.ppf, idx = Math.max(0, Math.min(n - 1, Math.floor(f / frames * n)));
        box.append(h("i", { style: { left: k * tw + "px", width: tw + "px", backgroundImage: `url("${url}")`, backgroundSize: `${n * tw}px ${CTLH}px`, backgroundPosition: `${-idx * tw}px 0` } }));
      }
      el.append(box);
    },
    /** «CN» mark on segments a control clip guides (warning tint when the take was made without the patch). */
    ctlSegMarks() {
      const its = this.items(), ct = this.ctl(), sigs = this.sigs();
      (this.$.clips || []).forEach((el, i) => {
        el?.querySelector(".kfb.is-ctl")?.remove();
        const s = this.p.segments[i]; if (!el || !s || C.isFootage(s) || !its[i]) return;
        const cw = C.controlWindow(this.p, its[i]); if (!cw) return;
        const t = el.querySelector(".t"); if (!t) return;
        const r = s.result, cur = r && (!r.sig || r.sig === sigs[i]), miss = cur && r.ctl && r.ctl.ok === false;
        const b = h("span", { class: "kfb is-ctl" + (miss ? " is-warn" : ""), "data-mode": "cn" }, "CN");
        setTip(b, miss ? T("Дубль создан без ControlNet: не было модели. Скачайте её и создайте отрезок заново") : T("ControlNet: {0} · сила {1}", ML()[ct.mode], ct.strength));
        const nm = t.querySelector(".nm"); nm ? nm.after(b) : t.append(b);
      });
    },
    ctlHead(hv) {
      if (!this.ctlRowOn()) return;
      const ct = this.ctl();
      const modeB = h("button", { type: "button", class: "v6-ctl-mode", "aria-haspopup": "dialog" }, h("span", null, MS()[ct.mode]), h("i", { class: "v6-ic", html: I.chev }));
      setTip(modeB, T("Режим, сила и диапазон ControlNet") + "\n" + ML()[ct.mode] + ": " + MT()[ct.mode]);
      modeB.addEventListener("click", (e) => { e.stopPropagation(); this.ctlPop(modeB); });
      const on = checkbox(ct.on, (v) => { this.ctlEdit((c) => { c.on = v; }); this.toast(v ? T("ControlNet включён: отрезки под клипами следуют контрольному видео") : T("ControlNet выключен: клипы на дорожке ни на что не влияют")); },
        { tip: T("Включить / выключить ControlNet"), aria: T("ControlNet"), cls: "is-mini" });
      const row = h("div", { class: "v6-vhead v6-ctl-head" + (ct.on ? "" : " is-off"), tabindex: "0", role: "button", "aria-haspopup": "menu", style: { height: CTLH + "px", marginTop: ROWG + "px" } },
        h("div", { class: "v6-ctl-hl" }, h("b", { class: "v6-vhead-k" }, "CN"), h("span", { class: "v6-ctl-hn" }, "ControlNet"), on), modeB);
      setTip(row.querySelector(".v6-vhead-k"), T("Дорожка ControlNet: видео на ней управляет отрезками над ним · правый клик — меню"), "Shift+F10");
      if (ct.on && (this.ctlPatchMissing() || this.ctlFallback())) {   // v6l: v1 fallback / no patch — visible in the head
        const miss = this.ctlPatchMissing(), w = h("button", { type: "button", class: "v6-ctl-pw" + (miss ? " is-err" : ""), "aria-label": miss ? T("Нет модели ControlNet") : T("Запасная модель v1") },
          h("i", { class: "v6-ic", html: I.warn }), h("span", null, miss ? T("нет модели") : "v1"));
        setTip(w, this.ctlPatchText() + "\n" + T("Клик — открыть загрузки"));
        w.addEventListener("click", (e) => { e.stopPropagation(); this.openPrefs?.("downloads"); });
        w.addEventListener("pointerdown", (e) => e.stopPropagation());
        row.querySelector(".v6-ctl-hl")?.append(w);
      }
      queueMicrotask(() => this.ctlPatchToast());
      row.addEventListener("contextmenu", (e) => this.ctlMenu(e, null));
      this.trkKeys?.(row);
      hv.append(row);
    },
    /** Head popover: the mode list, then strength / range / the mode's parameters. */
    ctlPop(anchor) {
      const ct = this.ctl(), st = this.ctlModels().modes || {};
      const list = h("div", { class: "v6-ctl-modes", role: "radiogroup", "aria-label": T("Режим ControlNet") }, MODES.map((m) => {
        const b = h("button", { type: "button", class: "v6-ctl-mi" + (ct.mode === m ? " on" : ""), role: "radio", "aria-checked": String(ct.mode === m) },
          h("b", null, ML()[m]), h("span", null, MT()[m]), st[m] && !st[m].ok ? h("i", { class: "v6-ic", html: I.warn }) : null);
        if (st[m] && !st[m].ok) setTip(b, T("Нет модели: {0}", st[m].missing.join(", ")));
        b.addEventListener("click", () => { this.ctlSetMode(m); for (const x of list.children) { const o = x === b; x.classList.toggle("on", o); x.setAttribute("aria-checked", String(o)); } const s2 = pop.querySelector(".v6-ctl-set"); if (s2) s2.replaceWith(this.ctlSettings()); });
        return b;
      }));
      const pop = popover(this.root, anchor, h("div", { class: "v6-pop-pad v6-ctl-pop" }, h("div", { class: "v6-lbl" }, T("Режим")), list, h("div", { class: "v6-menu-sep" }), this.ctlSettings()), { width: 320 });
      return pop;
    },
    ctlModeMenu() {
      const ct = this.ctl(), st = this.ctlModels().modes || {};
      return menuList(MODES.map((m) => ({ label: ML()[m], on: ct.mode === m, tip: MT()[m] + (st[m] && !st[m].ok ? "\n" + T("Нет модели: {0}", st[m].missing.join(", ")) : ""), fn: () => this.ctlSetMode(m) })));
    },
    ctlSetMode(m) {
      if (this.ctl().mode === m) return;
      this.ctlEdit((c) => { c.mode = m; c.on = true; });
      this.toast(m === "ready" ? T("Режим «{0}»: клип идёт в модель как есть", ML()[m]) : T("Режим «{0}»: клип обрабатывается, оригинал не меняется", ML()[m]));
    },
    /** Strength, step range and the mode's own parameters (head popover and inspector). */
    ctlSettings() {
      const ct = this.ctl(), wrap = h("div", { class: "v6-ctl-set" });
      const line = (label, val, ctl, tip) => { const l = h("div", { class: "v6-ctl-l" }, h("span", { class: "v6-lbl" }, label), h("b", { class: "v6-ctl-v" }, val)); if (tip) setTip(l.firstChild, tip); return h("div", { class: "v6-ctl-row" }, l, ctl); };
      const sl = (key, min, max, step, scale, show, tip, label) => {
        const val = ct[key] * scale, out = show(ct[key]);
        const r = line(label, out, slider({ min, max, step, value: val, onInput: (v) => { r.querySelector(".v6-ctl-v").textContent = show(v / scale); },
          onChange: (v) => this.ctlEdit((c) => { c[key] = v / scale; if (key === "start" && c.end < c.start) c.end = c.start; if (key === "end" && c.start > c.end) c.start = c.end; }, { coalesce: "ctl" + key }) }), tip);
        return r;
      };
      wrap.append(
        sl("strength", 0, 2, 0.05, 1, (v) => Number(v).toFixed(2), T("Насколько строго видео следует контролю. 1 — как задумано моделью, меньше — свободнее, больше — жёстче"), T("Сила")),
        sl("start", 0, 100, 1, 100, (v) => Math.round(v * 100) + "%", T("С какой доли шагов включается контроль. 0% — с первого шага"), T("Начало")),
        sl("end", 0, 100, 1, 100, (v) => Math.round(v * 100) + "%", T("До какой доли шагов действует контроль. Меньше 100% — последние шаги свободны, детали чище"), T("Конец")));
      const pr = ct.params, setP = (k, v) => this.ctlEdit((c) => { c.params = { ...c.params, [k]: v }; }, { coalesce: "ctlp" + k });
      if (ct.mode === "canny") {
        for (const [k, lab] of [["canny_lo", T("Порог низкий")], ["canny_hi", T("Порог высокий")]]) {
          const r = line(lab, pr[k].toFixed(2), slider({ min: 1, max: 99, step: 1, value: Math.round(pr[k] * 100), onInput: (v) => { r.querySelector(".v6-ctl-v").textContent = (v / 100).toFixed(2); }, onChange: (v) => setP(k, v / 100) }));
          wrap.append(r);
        }
      } else if (ct.mode === "depth") {
        wrap.append(h("div", { class: "v6-ctl-row" }, h("span", { class: "v6-lbl" }, T("Модель глубины")),
          seg([{ value: "small", label: "Small", tip: T("Depth Anything 3 Small — быстрее (137 МБ)") }, { value: "base", label: "Base", tip: T("Depth Anything 3 Base — точнее (542 МБ)") }], pr.depth_model, (v) => setP("depth_model", v), { size: "sm", full: true, label: T("Модель глубины") })));
      } else if (ct.mode === "pose") {
        wrap.append(h("div", { class: "v6-ctl-row is-chk" }, checkbox(pr.pose_hands, (v) => setP("pose_hands", v), { label: T("Кисти рук") }), checkbox(pr.pose_face, (v) => setP("pose_face", v), { label: T("Лицо") })));
      }
      if (this.ctlPatchMissing() || this.ctlFallback()) wrap.append(this.ctlMissingNote());
      return wrap;
    },
    ctlMissingNote() {
      const miss = this.ctlPatchMissing();
      return h("div", { class: "v6-ctl-miss" + (miss ? "" : " is-fb") }, h("i", { class: "v6-ic", html: I.warn }),
        h("p", { class: "v6-note" }, this.ctlPatchText()),
        btn({ label: T("Загрузки…"), size: "sm", onclick: () => { closePopover(); this.openPrefs?.("downloads"); } }));
    },
    ctlMenu(e, id) {
      e.preventDefault(); e.stopPropagation();
      const ct = this.ctl(), pt = { x: e.clientX, y: e.clientY };
      let items;
      if (id) {
        const c = this.ctlClip(id); if (!c) return;
        if (this.selCtl !== id) this.ctlSelect(id);
        const a = this.ctlAsset(c), [s0] = this.ctlSpan(c);
        items = [{ head: a?.name || a?.file || T("Клип ControlNet") },
          { icon: I.play, label: T("Перейти к началу клипа"), fn: () => this.seek(Math.round(s0 * C.FPS)) },
          { icon: I.eye, label: this._ctlOrig ? T("В плеере: обработанное") : T("В плеере: оригинал"), dis: !ct.on || ct.mode === "ready", fn: () => { this._ctlOrig = !this._ctlOrig; this.renderPreview(); this.renderInspector(); } },
          (() => { const [a0, a1] = this.ctlSpan(c), t = this.playhead / C.FPS, inside = t > a0 + 2 / C.FPS && t < a1 - 2 / C.FPS;
            return { icon: I.cut, label: T("Разрезать по плейхеду"), key: "S", dis: !inside, tip: inside ? "" : T("Поставьте плейхед внутрь клипа"), fn: () => this.ctlSplit(id) }; })(),
          { icon: I.vol, label: T("Звук в H3"), on: !!c.audio, tip: this.ctlAudioTip(), fn: () => this.ctlAudio(id, !c.audio) },
          "sep", { icon: I.trash, label: T("Удалить клип"), danger: true, key: "Del", fn: () => this.ctlDelete(id) }];
      } else {
        items = [{ head: T("Дорожка ControlNet") },
          ...MODES.map((m) => ({ label: ML()[m], on: ct.mode === m, tip: MT()[m], fn: () => this.ctlSetMode(m) })), "sep",
          { icon: I.check, label: ct.on ? T("Выключить ControlNet") : T("Включить ControlNet"), fn: () => this.ctlEdit((c) => { c.on = !c.on; }) },
          ct.clips.length ? { icon: I.trash, label: T("Удалить дорожку"), dis: true, tip: T("На дорожке есть клипы — сначала удалите их") } : { icon: I.trash, label: T("Удалить дорожку"), danger: true, fn: () => this.ctlEdit((c) => { c.row = false; }) }];
      }
      this.trkPop(pt, menuList(items));
    },
    ctlAddRow() { this.ctlEdit((c) => { c.row = true; }); this.toast(T("Дорожка ControlNet добавлена: перетащите на неё видео (позу, глубину, движение)")); },
    ctlAdd(assetId, sec) {
      const a = this.p.assets.find((x) => x.id === assetId); if (!a || a.category !== "video") return this.toast(T("На дорожку ControlNet можно положить только видео"), true);
      const id = C.newId("cc");
      this.ctlEdit((c) => { c.row = true; c.clips.push({ id, asset: assetId, start: Math.max(0, Math.round(sec * C.FPS) / C.FPS), in: 0, length: 0 }); });
      this.ctlSelect(id);
      const ct = this.ctl();
      this.toast(ct.on ? (ct.mode === "ready" ? T("Клип на дорожке ControlNet — идёт в модель как есть") : T("Клип на дорожке ControlNet: готовлю «{0}»", ML()[ct.mode])) : T("Клип добавлен, ControlNet выключен"));
    },
    ctlAudioTip() { return T("Звук в H3: звук этого видео (с учётом обрезки и места на таймлайне) идёт в генерацию как закреплённый звук — как клип дорожки звука с «Закрепить в H3». Извлекать звук не нужно. Закреплённый клип на дорожке звука в том же месте важнее"); },
    /** v6l «Звук в H3»: the clip's sound → the H3 audio input (the server treats it as a lock clip). */
    ctlAudio(id, v) {
      this.ctlEdit((ct) => { const x = ct.clips.find((k) => k.id === id); if (!x) return; if (v) x.audio = true; else delete x.audio; });
      this.toast(v ? T("Звук клипа ControlNet пойдёт в H3 — отрезки под ним перегенерируются") : T("Звук клипа ControlNet больше не идёт в H3"));
      this.renderAll();
    },
    ctlDelete(id) {
      if (this.selCtl === id) this.selCtl = null;
      this.ctlEdit((c) => { c.clips = c.clips.filter((x) => x.id !== id); c.row = true; });
      this.toast(T("Клип ControlNet удалён"));
    },
    ctlSelect(id) {
      const c = this.ctlClip(id); if (!c) return;
      this.selCtl = id; this.selAudio = null; this.selTrack = null; this.selMarker = null; this.selRegion = null; this.pvMode = "segment"; this.inspTab = "seg";
      const [s0, s1] = this.ctlSpan(c), f = this.playhead / C.FPS;
      if (f < s0 || f >= s1) this.playhead = Math.round(s0 * C.FPS);
      this.renderAll();
    },
    ctlInstallDrop(lane) {
      const isV = (e) => { const ty = [...(e.dataTransfer?.types || [])]; return ty.includes("application/x-h3s-video") || ty.includes("application/x-h3s-gal"); };
      lane.addEventListener("dragover", (e) => { if (!isV(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; lane.classList.add("is-drop"); });
      lane.addEventListener("dragleave", () => lane.classList.remove("is-drop"));
      lane.addEventListener("drop", (e) => {
        lane.classList.remove("is-drop"); if (!isV(e)) return;
        e.preventDefault(); e.stopPropagation();
        let id = e.dataTransfer.getData("application/x-h3s-video");
        const gk = e.dataTransfer.getData("application/x-h3s-gal");
        if (!id && gk) { const g = (this._gal?.items || []).find((x) => x.id + x.pid === gk); if (g) id = this.galAsset(g); }
        if (id) this.ctlAdd(id, Math.max(0, this.frameAt(e.clientX)) / C.FPS);
      });
    },
    /** Is a drag / pointer event over the control row? (the video-row drop code leaves it to the row) */
    ctlHit(e) {
      if (e.target?.closest?.(".v6-ctl-lane, .v6-ctl-clip")) return true;
      const ln = this.$.tinner?.querySelector(".v6-ctl-lane"); if (!ln) return false;
      const r = ln.getBoundingClientRect(); return e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2;
    },
    /** Snap points (seconds) for a control clip edge: segment boundaries, the playhead, other control clips, 0. */
    ctlSnapPts(id) {
      const pts = [0, this.playhead / C.FPS];
      for (const it of this.items()) pts.push(it.start / C.FPS, it.end / C.FPS);
      for (const c of this.ctl().clips || []) if (c.id !== id) { const [a, b] = this.ctlSpan(c); pts.push(a, b); }
      return pts;
    },
    /** Move (body) / trim (edges: the handles or the outer 10 px) of a control clip; a click selects it. Edges and
     *  the moved clip snap to segment boundaries, the playhead and other control clips (Alt — no snapping). The
     *  in-point moves with the left edge, so the frames stay where they were in time (the filmstrip does not slide). */
    ctlDrag(e, id, el) {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      const c0 = this.ctlClip(id); if (!c0) return;
      const a = this.ctlAsset(c0), dur = this.ctlDur(a), [s0, s1] = this.ctlSpan(c0), len0 = s1 - s0;
      const r = el.getBoundingClientRect(), s = this.uiS || 1, edge = 10 * s;
      const hk = e.target.closest?.(".v6-ctl-h");
      const kind = hk ? (hk.classList.contains("is-l") ? "l" : "r") : e.clientX - r.left < edge ? "l" : r.right - e.clientX < edge ? "r" : "m";
      const x0 = e.clientX, ppf = this.ppf, F = 1 / C.FPS, pts = this.ctlSnapPts(id), thr = 8 / ppf / C.FPS;   // 8 px in seconds
      const strip = el.querySelector(".v6-ctl-strip"), st0 = strip ? parseFloat(strip.style.left || "0") : 0;
      const snapT = (t, ev) => { if (ev.altKey) return { t, hit: null }; let best = null; for (const p of pts) if (Math.abs(p - t) <= thr && (best == null || Math.abs(p - t) < Math.abs(best - t))) best = p; return best == null ? { t, hit: null } : { t: best, hit: best }; };
      const q = (t) => Math.round(t * C.FPS) / C.FPS;
      let nv = null, guide = null, tip = null;
      const move = (ev) => {
        const d = (ev.clientX - x0) / s / ppf / C.FPS; if (!nv && Math.abs(ev.clientX - x0) < 3) return;
        let hit = null;
        if (kind === "m") {
          let st = Math.max(0, s0 + d);
          const A = snapT(st, ev), B = snapT(st + len0, ev);
          if (A.hit != null && (B.hit == null || Math.abs(A.t - st) <= Math.abs(B.t - st - len0))) { st = A.t; hit = A.hit; } else if (B.hit != null) { st = Math.max(0, B.t - len0); hit = B.hit; }
          st = q(st); nv = { start: st, in: c0.in, length: c0.length };
        } else if (kind === "l") {
          let ns = snapT(s0 + d, ev); hit = ns.hit;
          const dd = q(Math.min(Math.max(ns.t - s0, -c0.in, -s0), len0 - F));
          nv = { start: q(s0 + dd), in: q(c0.in + dd), length: q(len0 - dd) };
        } else {
          const mx = dur > 0 ? dur - c0.in : len0 + 3600;
          const ne = snapT(s1 + d, ev); hit = ne.hit;
          nv = { start: s0, in: c0.in, length: q(Math.min(mx, Math.max(F, ne.t - s0))) };
        }
        const len = kind === "m" ? len0 : nv.length;
        el.style.left = nv.start * C.FPS * ppf + "px";
        el.style.width = Math.max(6, len * C.FPS * ppf) + "px";
        if (strip && kind === "l") strip.style.left = st0 - (nv.in - c0.in) * C.FPS * ppf + "px";   // frames stay put in time
        el.classList.add("is-drag");
        if (!guide) { guide = h("i", { class: "v6-ctl-snap", "aria-hidden": "true" }); el.parentElement?.append(guide); }
        guide.hidden = hit == null; if (hit != null) guide.style.left = hit * C.FPS * ppf + "px";
        if (!tip) { tip = h("div", { class: "h3l-tip v6-ctl-tip" }); document.body.append(tip); }
        tip.style.left = ev.clientX + 12 + "px"; tip.style.top = ev.clientY - 34 + "px";
        tip.textContent = kind === "m" ? T("старт {0} с", fmt(nv.start)) : T("из файла {0}–{1} с · длина {2} с", fmt(nv.in), fmt(nv.in + len), fmt(len));
      };
      const up = () => {
        window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true);
        guide?.remove(); tip?.remove();
        if (!nv) { this.ctlSelect(id); return; }
        const v = nv;
        this.ctlEdit((ct) => { const c = ct.clips.find((x) => x.id === id); if (!c) return; c.start = v.start; c.in = v.in; if (kind !== "m") c.length = dur > 0 && Math.abs(v.length - (dur - v.in)) < 0.5 / C.FPS ? 0 : v.length; });
        this.selCtl = id; this.renderAll();
      };
      window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);
    },
    /** S / scissors / menu on a selected control clip: cut it at the playhead (two pieces of the same file). */
    ctlSplit(id = this.selCtl) {
      const c = this.ctlClip(id); if (!c) return false;
      const [a0, a1] = this.ctlSpan(c), t = Math.round(this.playhead) / C.FPS;
      if (t <= a0 + 1 / C.FPS || t >= a1 - 1 / C.FPS) { this.toast(T("Поставьте плейхед внутрь клипа"), true); return true; }
      const nid = C.newId("cc"), local = Math.round((t - a0) * C.FPS) / C.FPS, wasEnd = !(Number(c.length) > 0);
      this.ctlEdit((ct) => {
        const x = ct.clips.find((k) => k.id === id); if (!x) return;
        const rest = Math.round((a1 - a0 - local) * C.FPS) / C.FPS;
        x.length = local;
        ct.clips.push({ id: nid, asset: x.asset, start: Math.round(t * C.FPS) / C.FPS, in: Math.round(((Number(x.in) || 0) + local) * C.FPS) / C.FPS, length: wasEnd ? 0 : rest });
      });
      this.selCtl = nid; this.renderAll();
      this.toast(T("Клип ControlNet разрезан · Del — удалить выбранный кусок"));
      return true;
    },
    split(...a) { if (this.selCtl && this.ctlClip(this.selCtl)) return this.ctlSplit(this.selCtl); return prevSplit.apply(this, a); },
    /** Del / Backspace: the selected control clip (before any segment). */
    ctlKey(e) {
      if (!this.selCtl || this.page !== "edit" || e.ctrlKey || e.metaKey || e.altKey) return false;
      const isS = (e.code === "KeyS" || e.key === "s" || e.key === "S") && !e.shiftKey;
      if (e.key !== "Delete" && e.key !== "Backspace" && !isS) return false;
      const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) && !t.classList.contains("h3l-sink")) return false;
      if (this.pe || this.ae || this.viewer || this.$.menu || document.querySelector(".v6-pop.on, .v6-scrim")) return false;
      if (!this.ctlClip(this.selCtl)) { this.selCtl = null; return false; }
      e.preventDefault(); e.stopPropagation();
      if (isS) return this.ctlSplit(this.selCtl);
      this.ctlDelete(this.selCtl); return true;
    },

    // ---------------------------------------------------------------- inspector + player
    ctlCard() {
      const c = this.ctlClip(this.selCtl); if (!c) { this.selCtl = null; return null; }
      const ct = this.ctl(), a = this.ctlAsset(c), [s0, s1] = this.ctlSpan(c), job = this.ctlJobOf(c), pro = this.ctlProcessed(c);
      const its = this.items(), guided = its.filter((it) => !C.isFootage(this.p.segments[it.index]) && C.controlWindow(this.p, it)?.clip === c.id).map((it) => it.index + 1);
      let status = "";
      if (!ct.on) status = T("ControlNet выключен — клип ни на что не влияет");
      else if (ct.mode === "ready") status = T("Готовый контроль: клип идёт в модель как есть");
      else if (!job || job.state === "queued" || job.state === "running") status = T("Обработка «{0}»: {1}%", ML()[ct.mode], Math.round(job?.total ? job.done / job.total * 100 : 0));
      else if (job.state === "done") status = T("Обработано: «{0}» · оригинал не изменён", ML()[ct.mode]);
      else if (job.state === "missing") status = T("Нет модели препроцессора: {0}. Скачайте в «Настройки → Модели»", (job.missing || []).join(", "));
      else status = T("Не удалось обработать: {0}", job.error || "");
      const warn = ct.on && job && (job.state === "missing" || job.state === "error");
      return h("div", { class: "v6-ctl-card" },
        h("div", { class: "v6-shead" }, h("b", { class: "v6-vhead-k" }, "CN"), h("span", { class: "v6-atrk-n" }, a?.name || a?.file || c.asset), h("span", { class: "v6-cnt" }, `${fmt(s0)}–${fmt(s1)} ${T("с")}`)),
        h("div", { class: "v6-ctl-row is-sw" }, h("span", { class: "v6-lbl" }, T("ControlNet")), sw(ct.on, (v) => this.ctlEdit((x) => { x.on = v; }), { label: T("ControlNet") })),
        h("div", { class: "v6-ctl-row v6-ctl-snd-row" }, checkbox(!!c.audio, (v) => this.ctlAudio(c.id, v), { label: T("Звук в H3"), tip: this.ctlAudioTip() }),
          c.audio ? h("p", { class: "v6-note" }, !ct.on ? T("ControlNet выключен — звук клипа сейчас не идёт в генерацию") : T("Звук клипа (с учётом обрезки) идёт в H3 как закреплённый звук. Где на дорожке звука есть клип «Закрепить в H3», берётся он")) : null),
        h("div", { class: "v6-ctl-row" }, h("span", { class: "v6-lbl" }, T("Режим")),
          h("div", { class: "v6-ctl-grid", role: "radiogroup", "aria-label": T("Режим ControlNet") }, MODES.map((m) => {
            const b = h("button", { type: "button", class: "v6-ctl-gi" + (ct.mode === m ? " on" : ""), role: "radio", "aria-checked": String(ct.mode === m) }, MS()[m]);
            setTip(b, MT()[m]); b.addEventListener("click", () => this.ctlSetMode(m)); return b; }))),
        h("p", { class: "v6-note" + (warn ? " is-warn" : "") }, status),
        ct.on && ct.mode !== "ready" ? h("div", { class: "v6-ctl-row" }, h("span", { class: "v6-lbl" }, T("В плеере")),
          seg([{ value: "proc", label: T("Обработанное"), disabled: !pro }, { value: "orig", label: T("Оригинал") }], this._ctlOrig || !pro ? "orig" : "proc", (v) => { this._ctlOrig = v === "orig"; this.renderPreview(); }, { size: "sm", full: true, label: T("В плеере") })) : null,
        this.ctlSettings(),
        h("p", { class: "v6-note" }, guided.length ? T("Управляет отрезками: {0}. Кадры контроля совпадают по времени; за краями клипа держится крайний кадр", guided.join(", ")) : T("Под клипом нет отрезков — он пока ни на что не влияет")),
        h("p", { class: "v6-note" }, T("На таймлайне {0}–{1} с · из файла {2}–{3} с · тяните края, чтобы обрезать, S — разрезать по плейхеду", fmt(s0), fmt(s1), fmt(c.in), fmt(c.in + s1 - s0))));
    },
    currentSource() {
      const c = this.selCtl && this.pvMode !== "full" && this.pvMode !== "old" ? this.ctlClip(this.selCtl) : null;
      if (c) {
        const a = this.ctlAsset(c), pro = this._ctlOrig ? null : this.ctlProcessed(c);
        if (a?.file) {
          const [s0, s1] = this.ctlSpan(c);
          return { kind: "segment", foot: true, ctl: true, proc: !!pro, ref: pro ? pro.ref : this.ctlRef(a), start: Math.round(s0 * C.FPS), off: c.in, end: Math.round(s1 * C.FPS), asset: a };
        }
      }
      return prevSource.call(this);
    },
    renderPreview() {
      prevPreview.call(this);
      const src = this.src, $ = this.$; if (!src?.ctl || !$.frame) return;
      const ct = this.ctl(), c = this.ctlClip(this.selCtl), job = c && this.ctlJobOf(c);
      const badge = $.frame.querySelector(".h3l-badge-live");
      const what = !ct.on ? T("выключен") : ct.mode === "ready" ? ML().ready : src.proc ? T("{0} · обработанное", ML()[ct.mode]) : job && (job.state === "queued" || job.state === "running") ? T("{0} · оригинал (идёт обработка)", ML()[ct.mode]) : T("{0} · оригинал", ML()[ct.mode]);
      if (badge) badge.textContent = "ControlNet · " + what;
      if ($.pvInfo) $.pvInfo.textContent = (src.asset?.name || src.asset?.file || "") + " · " + T("из файла с {0} с", fmt(src.off || 0));
      const pill = $.pvTabs?.querySelector('.v6-seg-it[data-v="segment"] span'); if (pill) pill.textContent = T("Клип ControlNet");
    },
  });
}
