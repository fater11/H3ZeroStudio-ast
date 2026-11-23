import { T } from "./h3s_i18n.js";
import { installedSwapLora } from "./v6/swap.js";
// Video assets: uploaded video files and frozen segments.
//  * on the timeline (drag onto the empty part of the video track / «Продлить»): a footage clip. «Как есть» —
//    VAE-encoded and used unchanged; the next segment continues from its tail. «Перегенерировать» — vid2vid from
//    the footage with partial denoise (prompt and refs apply). Split a long file into clips to regenerate only part.
//  * in a segment's references (drag onto a clip / its refs): <Video k> motion reference (H3 ref_videos, max 3, 2-15 s).
export const isVideo = (f) => (f.type || "").startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(f.name || "");

export function installVideo(Editor, { C, h, ICON }) {
  Object.assign(Editor.prototype, {
    videoAssets() { return this.p.assets.filter((a) => a.category === "video"); },

    posterUrl(a) { return a.poster ? this.host.url(a.poster) : ""; },

    /** Filmstrip of a video asset (older projects: fetched once on demand). */
    videoStrip(a) {
      if (!a) return null;
      if (a.strip && a.strip_n) return a;
      this._stripReq = this._stripReq || {};
      const rk = a.id + "|" + a.file;
      if (!this._stripReq[rk] && a.file && this.host.videoInfo) {
        this._stripReq[rk] = true;
        this.host.videoInfo({ filename: a.file, subfolder: a.subfolder, type: a.type || "input" }, true).then((inf) => {
          if (!inf?.strip) return;
          const x = this.p.assets.find((k) => k.id === a.id); if (!x) return;
          x.strip = inf.strip; x.strip_n = inf.strip_n; if (!x.frames) x.frames = inf.frames; if (!x.poster) x.poster = inf.poster;
          this.scheduleSave?.(); if (this.root) this.renderTimeline(); this._onAssetMeta?.();
        }).catch(() => {});
      }
      return null;
    },

    /** Footage segment (or frozen one without its preview) playable straight from the source file. */
    footageSource(i) {
      const s = this.seg(i), it = this.items()[i]; if (!s || !it) return null;
      let a = null, off = 0;
      if (s.source) { a = this.p.assets.find((x) => x.id === s.source.asset); off = s.source.in / C.FPS; }
      else if (s.freeze) { a = this.p.assets.find((x) => x.category === "video" && x.frozen === s.id); }
      if (!a?.file) return null;
      return { kind: "segment", ref: { filename: a.file, subfolder: a.subfolder, type: a.type || "input" }, start: it.start, off, end: it.end, foot: true, asset: a };
    },

    async uploadVideoAssets(files) {
      let n = 0;
      for (const f of files) {
        try {
          const r = await this.host.upload(f, this.p.id);
          const ref = { filename: r.name, subfolder: r.subfolder || "", type: r.type || "input" };
          let info = {};
          try { info = await this.host.videoInfo(ref, false); } catch (e) { this.toast(T("{0}: не удалось прочитать видео ({1})", f.name, e.message || e), true); continue; }
          const id = C.newId("vd");
          this.mutate((p) => { p.assets.push({ id, name: (f.name || r.name).replace(/\.[^.]+$/, ""), file: r.name, subfolder: ref.subfolder, type: ref.type, category: "video",
            duration: info.duration, frames: info.frames, width: info.width, height: info.height, has_audio: info.has_audio, poster: info.poster, strip: info.strip || null, strip_n: info.strip_n || 0, frozen: "" }); }, { render: "none" });
          n++;
        } catch (e) { this.toast(T("Не удалось загрузить ") + f.name + ": " + (e.message || e), true); }
      }
      if (n) { this.renderAll(); this.toast(T("Видео загружено: {0} · перетащите на дорожку (футаж) или на отрезок (референс <Video>)", n)); }
    },

    /** A frozen segment becomes a video asset (its preview mp4 with sound). */
    registerFrozenAsset(i, fr) {
      if (!fr?.video) return;
      const id = "fz_" + fr.key, s = this.p.segments[i];
      this.mutate((p) => {
        if (p.assets.some((a) => a.id === id)) return;
        p.assets.push({ id, name: T("{0} · зафикс.", s.name || T("Отрезок ") + (i + 1)), file: fr.video.filename, subfolder: fr.video.subfolder, type: fr.video.type || "output",
          category: "video", duration: fr.frames / C.FPS, frames: fr.frames, width: 0, height: 0, has_audio: true, poster: fr.poster || null, frozen: s.id });
      }, { render: "none" });
    },

    videoTiles(used) {
      const list = this.videoAssets();
      return list.map((a) => {
        const del = h("div", { class: "del", title: T("Убрать из проекта (файл остаётся)"), html: ICON.trash.replace("<svg", '<svg style="width:13px;height:13px"') });
        del.onclick = (e) => { e.stopPropagation(); this.removeVideoAsset(a.id); };
        const card = h("div", { class: "h3l-asset video" + (used?.has(a.id) ? " used" : ""), draggable: "true",
          title: T("{0}\n{1}{2}{3}\nПеретащите на пустую часть видеодорожки — футаж (продолжить / перегенерировать часть).\nНа отрезок или клик — референс <Video> выбранного отрезка.", a.name, C.fmtTime(a.duration || 0), a.width ? ` · ${a.width}×${a.height}` : "", a.has_audio ? T(" · со звуком") : "") },
          a.poster ? h("img", { src: this.posterUrl(a), loading: "lazy", draggable: "false" }) : h("div", { class: "ph" }, "◫"),
          h("div", { class: "cat video" }, a.frozen ? T("⊠ Фикс") : T("Видео")), del,
          h("div", { class: "dur" }, C.fmtTime(a.duration || 0)),
          h("div", { class: "cap" }, h("div", null, a.name)));
        card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-h3s-asset", a.id); e.dataTransfer.setData("application/x-h3s-video", a.id); e.dataTransfer.effectAllowed = "copy"; });
        card.onclick = () => this.toggleRef(this.sel, a.id);
        card.addEventListener("dblclick", (e) => { e.stopPropagation(); this.openAssetEditor(a.id); });
        card.addEventListener("contextmenu", (e) => this.assetMenu?.(e, a));
        if (a.orig) card.append(h("div", { class: "edt", title: T("Обработанная копия (оригинал сохранён)") }, "✎"));
        return card;
      });
    },

    removeVideoAsset(id) {
      const used = this.p.segments.some((s) => s.source?.asset === id);
      if (used && !confirm(T("Этот файл лежит на таймлайне как футаж. Убрать ассет и превратить эти клипы в обычные отрезки?"))) return;
      this.mutate((p) => { p.assets = p.assets.filter((x) => x.id !== id); for (const s of p.segments) { s.refs = s.refs.filter((r) => r !== id); if (s.source?.asset === id) s.source = null; } });
    },

    /** Footage clip from a video asset, appended at the end (or after segment `after`). */
    addFootage(id, after = null) {
      const a = this.p.assets.find((x) => x.id === id && x.category === "video"); if (!a) return;
      const avail = a.frames || Math.round((a.duration || 5) * C.FPS);
      const frames = Math.max(C.MIN_FRAMES, Math.min(C.MAX_FRAMES, C.snapFrames(avail, "down")));
      const s = this.newSegment(null);
      Object.assign(s, { name: a.name.slice(0, 40), frames, source: { asset: id, in: 0, denoise: 0 }, link: "extend" });
      const at = after === null ? this.p.segments.length : after + 1;
      this.mutate((p) => { p.segments.splice(at, 0, s); }, { render: "none" });
      this.sel = at; this.pvMode = "segment";
      const it = this.items()[at]; if (it) this.playhead = it.start;
      this.renderAll(); this.scrollToPlayhead?.();
      if (!this.pastMarkerHint()) this.toast(T("Футаж «{0}» на таймлайне ({1} с{2}). Следующий отрезок продолжит его", a.name, (frames / C.FPS).toFixed(1), avail < frames ? "" : avail > frames ? T(", из {0} с", (avail / C.FPS).toFixed(1)) : ""));
    },

    /** The exact per-clip correction that the Sync button would apply (no project mutation). */
    swapSyncPlan(i) {
      const s = this.seg(i), src = s?.source;
      if (!src?.swap) return null;
      const asset = this.p.assets.find((a) => a.id === src.asset);
      const available = Number(asset?.frames) || 0;
      const start = Math.max(0, Math.round(this.items()[i]?.start || 0));
      const marker = Math.trunc(Number(this.p.end) || 0);
      // The fixed end marker hides the unused tail of the last segment. Align the VISIBLE
      // source frames to the timeline, not all padded sampler frames (which would replay earlier motion).
      const visible = marker ? Math.min(s.frames, Math.max(0, marker - start)) : s.frames;
      const maxIn = available - visible;
      const current = Number(src.in) || 0;
      const at = !visible ? current : maxIn >= 0 ? Math.max(0, Math.min(start, maxIn)) : null;
      return { available, visible, at, current, synced: at !== null && current === at };
    },

    /** Consecutive Swap clips using the same guide form one timeline-synchronized chain. */
    swapSyncChain(i) {
      const src = this.seg(i)?.source;
      if (!src?.swap) return { plans: [], pending: [], invalid: [] };
      const same = (j) => this.seg(j)?.source?.swap && this.seg(j).source.asset === src.asset;
      let first = i, end = i + 1;
      while (first > 0 && same(first - 1)) first--;
      while (end < this.p.segments.length && same(end)) end++;
      const plans = [];
      for (let j = first; j < end; j++) plans.push({ i: j, ...this.swapSyncPlan(j) });
      return { plans, pending: plans.filter((p) => p.at !== null && !p.synced),
        invalid: plans.filter((p) => !p.available || p.at === null) };
    },

    /** Align the entire Swap chain; do not discard results, and ask before invalidating ready takes. */
    syncSwapSource(i) {
      if (this.run?.active) return false;
      const chain = this.swapSyncChain(i);
      if (!chain.plans.length) return false;
      if (chain.invalid.length) {
        this.toast(T("Не все Swap-отрезки помещаются в источник. Используйте «Авторазделить видео» или уменьшите длительность."), true);
        return false;
      }
      if (!chain.pending.length) {
        this.toast(T("✓ Вся цепочка Swap уже синхронизирована с таймлайном."));
        return false;
      }
      const ready = chain.pending.filter((x) => !!this.seg(x.i)?.result?.video);
      if (ready.length && !confirm(T("Синхронизировать {0} Swap-отрезк(ов)? {1} готовых дубл(ей) станут устаревшими и потребуют перегенерации. Их файлы останутся на диске.",
        chain.pending.length, ready.length))) return false;
      this.mutate((p) => {
        for (const x of chain.pending) p.segments[x.i].source.in = x.at;
      });
      this.toast(T("✓ Синхронизировано {0} Swap-отрезк(ов). Готовые файлы сохранены; изменённые отрезки нужно перегенерировать.",
        chain.pending.length));
      return true;
    },

    /** Build a continuous Swap chain from one source; reuse existing clips and their IDs. */
    autoSplitSwap(i) {
      const chosen = this.seg(i), src = chosen?.source;
      if (!src?.swap || this.run?.active) return;
      while (i > 0 && this.seg(i - 1)?.source?.swap &&
             this.seg(i - 1).source.asset === src.asset) i--;
      const firstSeg = this.seg(i), firstSrc = firstSeg.source;
      const asset = this.p.assets.find((a) => a.id === firstSrc.asset);
      const available = Number(asset?.frames) || 0;
      if (!available || firstSrc.in + firstSeg.frames > available) {
        this.toast(T("Нет полного исходного видео для первого отрезка Swap."), true);
        return;
      }
      const blocks = Math.max(0, Math.min(C.MAX_OVERLAP_BLOCKS,
        Math.trunc(Number(this.p.settings.overlap_blocks) || 0)));
      const overlap = blocks ? C.overlapFrames(blocks) : 0;
      const preferred = C.snapFrames(Math.max(C.TRAINED_MIN_FRAMES,
        Math.min(C.TRAINED_MAX_FRAMES, firstSeg.frames)));
      const maxTail = Math.min(C.TRAINED_MAX_FRAMES,
        Math.max(preferred, preferred + 2 * overlap));
      const plan = [{ in: firstSrc.in, frames: firstSeg.frames }];
      while (plan.at(-1).in + plan.at(-1).frames < available && plan.length < 60) {
        const previous = plan.at(-1);
        const naturalStart = previous.in + previous.frames - overlap;
        const remaining = available - naturalStart;
        const frames = remaining <= maxTail
          ? C.snapFrames(Math.max(C.TRAINED_MIN_FRAMES, remaining), "up") : preferred;
        if (frames > available - firstSrc.in) break;
        const start = Math.max(firstSrc.in, Math.min(naturalStart, available - frames));
        if (start <= previous.in) break;
        plan.push({ in: start, frames });
      }
      if (plan.at(-1).in + plan.at(-1).frames < available) {
        this.toast(T("Не удалось покрыть исходное видео отрезками. Увеличьте длительность первого отрезка."), true);
        return;
      }
      let existing = 0;
      while (this.p.segments[i + existing]?.source?.swap &&
             this.p.segments[i + existing].source.asset === firstSrc.asset) existing++;
      const message = T("Авторазделить видео ({0} с) на {1} отрезк(ов)? Первый отрезок и его готовый результат останутся без изменений. Начало и длина последующих будут синхронизированы; лишние отрезки этой цепочки убраны с таймлайна (их файлы сохранятся).",
        (available / C.FPS).toFixed(1), plan.length);
      if (!confirm(message)) return;
      this.mutate((p) => {
        const original = p.segments.slice(i, i + existing);
        const segments = plan.map((item, k) => {
          if (k === 0) return original[0];
          const seg = original[k] || JSON.parse(JSON.stringify(original[0]));
          if (!original[k]) { seg.id = C.newId("s"); delete seg.result; delete seg.freeze; }
          seg.frames = item.frames;
          seg.link = "extend";
          seg.gap = 0;
          seg.source = { ...seg.source, asset: firstSrc.asset, in: item.in, swap: true };
          return seg;
        });
        p.segments.splice(i, existing, ...segments);
      });
      this.toast(T("Видео разделено: {0} отрезк(ов). Готовый первый отрезок сохранён.", plan.length));
    },

    /** Segment-card block of a footage clip: file range and mode (as is / vid2vid). */
    footageBlock(i) {
      const s = this.seg(i), src = s.source, a = this.p.assets.find((x) => x.id === src.asset) || {};
      const avail = a.frames || 0, set = (fn, opt) => this.mutate((p) => fn(p.segments[i].source), opt);
      const inIn = h("input", { class: "h3l-in", type: "number", min: 0, step: 0.1, value: (src.in / C.FPS).toFixed(2), title: T("С какого места файла начинается клип (секунды)") });
      inIn.onchange = () => set((x) => { x.in = Math.max(0, Math.round(Number(inIn.value) * C.FPS) || 0); });
      const end = src.in + s.frames, short = avail && end > avail;
      const item = this.items()[i], marker = Number(this.p.end) || 0;
      const visible = marker ? Math.min(s.frames, Math.max(0, marker - (item?.start || 0))) : s.frames;
      const shortVisible = !!(avail && src.in + visible > avail);
      const mode = h("div", { class: "h3l-pills" },
        h("div", { class: "h3l-pill" + (!src.denoise && !src.swap ? " on" : ""), title: T("Кадры и звук файла без изменений (VAE). Следующие отрезки продолжают их"), onclick: () => set((x) => { x.denoise = 0; delete x.swap; }) }, T("▶ Как есть")),
        h("div", { class: "h3l-pill" + (src.denoise && !src.swap ? " on" : ""), title: T("vid2vid: H3 перерисовывает этот кусок по промпту, сохраняя движение/композицию файла (denoise)"), onclick: () => set((x) => { x.denoise = x.denoise || 0.6; delete x.swap; }) }, T("↻ Перегенерировать")),
        h("div", { class: "h3l-pill" + (src.swap ? " on" : ""), title: T("Эксперимент: направляющий латент видео + Character Swap LoRA"), onclick: () => set((x) => { x.swap = true; x.denoise = 1; if (!x.swap_lora) x.swap_lora = "minimax/minimax_h3_character_swap_v1.1_ref2va_fro.safetensors"; }) }, T("◉ Замена персонажа")));
      const box = h("div", { class: "h3l-foot" },
        h("div", { class: "h3l-lbl" }, T("Футаж"), h("em", null, a.name || T("файл не найден"))),
        h("div", { class: "h3l-grid2" }, this.field(T("начало в файле, с"), inIn),
          h("div", { class: "h3l-field" }, h("div", { class: "h3l-lbl" }, T("фрагмент")), h("div", { class: "h3l-val" + (short ? " warn" : "") }, `${C.fmtTime(src.in / C.FPS)}–${C.fmtTime(end / C.FPS)}` + (avail ? T(" из {0}", C.fmtTime(avail / C.FPS)) : "")))),
        mode);
      if (src.denoise && !src.swap) {
        const r = h("input", { class: "h3l-range", type: "range", min: 0.1, max: 1, step: 0.05, value: src.denoise });
        const v = h("div", { class: "h3l-val" }, Number(src.denoise).toFixed(2));
        const sp = () => r.style.setProperty("--p", ((r.value - 0.1) / 0.9 * 100) + "%"); sp();
        r.oninput = () => { sp(); v.textContent = Number(r.value).toFixed(2); set((x) => { x.denoise = Number(r.value); }, { coalesce: "fdn" + s.id, render: "light" }); };
        box.append(h("div", null, h("div", { class: "h3l-lbl" }, T("Сила перерисовки (denoise)"), h("em", null, T("0.3 — лёгкая правка · 0.6 — новая картинка, то же движение · 1 — с нуля"))), h("div", { class: "h3l-row" }, r, v)));
      }
      if (src.swap) {
        const sync = this.swapSyncChain(i);
        if (shortVisible) box.append(h("div", { class: "h3l-note err" },
          T("⚠ Исходное видео заканчивается раньше этого Swap-отрезка: доступно {0} из {1} видимых кадров. Без исправления движение застынет. Генерация заблокирована.",
            Math.max(0, avail - src.in), visible)));
        else if (short) box.append(h("div", { class: "h3l-note" },
          T("Последние {0} служебных кадра выходят за конец источника, но обрезаются маркером конца ролика.",
            end - avail)));
        box.append(h("div", { class: "h3l-row", style: { flexWrap: "wrap", gap: "6px" } },
          h("button", { class: "h3l-btn sm", type: "button",
            disabled: !!this.run?.active || !sync.pending.length || !!sync.invalid.length,
            title: this.run?.active ? T("Дождитесь окончания генерации") :
              sync.invalid.length ? T("Некоторые отрезки длиннее исходного видео — используйте авторазделение") :
              !sync.pending.length ? T("Все Swap-отрезки этого видео уже совпадают с таймлайном") :
              T("Синхронизировать {0} отрезк(ов) с позицией на таймлайне; готовые файлы сохранятся", sync.pending.length),
            onclick: () => this.syncSwapSource(i) },
            sync.invalid.length ? T("⚠ Источник слишком короткий") :
              !sync.pending.length ? T("✓ Цепочка синхронизирована") :
              T("⇆ Синхронизировать с таймлайном ({0})", sync.pending.length)),
          h("button", { class: "h3l-btn sm", type: "button",
            disabled: !!this.run?.active || !avail,
            title: T("Разделить весь исходник на связные отрезки с перекрытием; готовый первый не меняется"),
            onclick: () => this.autoSplitSwap(i) }, T("✂ Авторазделить видео"))));
        box.append(this.swapLoraBlock(i));
      }
      box.append(h("div", { class: "h3l-note" }, src.swap
        ? T("Эксперимент Character Swap: исходный клип задаёт движения, референс <Picture 1> — внешность. На этом проходе denoise не используется.")
        : src.denoise
          ? T("Промпт и референсы ниже применяются. Чтобы перегенерировать только часть файла — разрежьте футаж (S) и включите «Перегенерировать» у нужного куска.")
          : T("Промпт не используется. Отрезок после футажа продолжит его с перекрытием, как обычное продление.") + (short ? T(" ⚠ Файл короче клипа — последний кадр держится.") : "")));
      return box;
    },


    /** Per-segment Swap model overrides; a different LoRA/strength produces a new cache key and take. */
    swapLoraBlock(i) {
      const s = this.seg(i), src = s?.source;
      if (!src?.swap) return null;
      if (!this._mp?.files?.lora && !this._swapInspectorLoraAsked && typeof this.mpLoad === "function") {
        this._swapInspectorLoraAsked = true;
        void this.mpLoad().then(() => {
          if (this.root && this.sel === i && this.seg(i)?.source?.swap) this.renderInspector();
        }).catch((e) => console.warn("[H3ZeroStudio] Swap model list:", e));
      }
      const files = this._mp?.files?.lora || [];
      const installed = installedSwapLora(files, src.swap_lora);
      const chosen = installed || src.swap_lora || "";
      const parts = (name) => String(name || "").split(/[\\/]/);
      const basename = (name) => parts(name).at(-1) || "";
      const folder = (name) => parts(name).slice(0, -1).join(" / ") || "models/loras";
      const busy = !!this.run?.active;
      const choice = h("button", { class: "h3l-sw-lora-choice", type: "button", title: chosen,
        "aria-expanded": "false", disabled: busy },
        h("b", null, chosen ? basename(chosen) : T("Выберите LoRA…")),
        h("small", null, chosen ? folder(chosen) : T("Папки моделей ComfyUI")));
      const search = h("input", { class: "h3l-in h3l-sw-lora-search", type: "search",
        placeholder: T("Поиск по имени или папке…"), "aria-label": T("Поиск Swap LoRA"), disabled: busy });
      const count = h("small", { class: "h3l-note" });
      const list = h("div", { class: "h3l-sw-lora-list", role: "listbox", style: { display: "none" },
        "aria-label": T("Установленные LoRA") });
      const show = (open) => { list.style.display = open ? "block" : "none"; choice.setAttribute("aria-expanded", String(open)); };
      const apply = (file) => {
        if (file === src.swap_lora) return show(false);
        this.mutate((p) => { p.segments[i].source.swap_lora = file; });
      };
      const matched = () => files.filter((file) => file.toLowerCase().includes(search.value.trim().toLowerCase()));
      const update = () => {
        const found = matched();
        count.textContent = T("Найдено: {0} из {1}", found.length, files.length);
        list.replaceChildren(...(found.length ? found.map((file) =>
          h("button", { class: "h3l-sw-lora-option" + (file === chosen ? " on" : ""), type: "button",
            role: "option", "aria-selected": String(file === chosen), title: file, onclick: () => apply(file) },
            h("b", null, basename(file)), h("small", null, folder(file)))) :
          [h("div", { class: "h3l-sw-lora-empty" }, files.length ? T("LoRA не найдены") : T("Список LoRA пуст — обновите его"))]));
      };
      choice.onclick = () => { const open = list.style.display === "none"; show(open); if (open) search.focus(); };
      search.onfocus = () => show(true);
      search.oninput = () => { update(); show(true); };
      search.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); show(false); choice.focus(); }
        if (e.key === "Enter") { const found = matched(); if (found.length === 1) { e.preventDefault(); apply(found[0]); } }
      };
      update();
      const strength = Number(src.swap_lora_strength ?? 1);
      const v = h("span", { class: "h3l-val" }, strength.toFixed(2) + "×");
      const range = h("input", { class: "h3l-range h3l-sw-lora-strength", type: "range",
        min: "0.5", max: "1.5", step: "0.05", value: strength, disabled: busy });
      range.oninput = () => {
        const n = Number(range.value);
        v.textContent = n.toFixed(2) + "×";
        this.mutate((p) => { p.segments[i].source.swap_lora_strength = n; },
          { coalesce: "swapLoraStrength" + s.id, render: "light" });
      };
      range.onkeydown = (e) => e.stopPropagation();
      const st = this.segGenState?.(i) || { ok: true };
      const sourceShort = C.swapSourceOverruns(this.p, this.items())
        .some((issue) => issue.index === i);
      return h("div", { class: "h3l-sw-lora-panel" },
        h("div", { class: "h3l-row h3l-sw-lora-head" },
          h("b", null, T("Swap LoRA этого отрезка")),
          h("button", { class: "h3l-btn sm", type: "button", disabled: busy,
            onclick: async () => { await this.mpLoad(true); if (this.root && this.sel === i) this.renderInspector(); } }, T("⟳ Обновить"))),
        choice, search, count, list,
        this._mp?.ok && !installed ? h("div", { class: "h3l-note err" }, T("Выбранная LoRA не найдена в ComfyUI — выберите установленную")) : null,
        h("div", { class: "h3l-row" }, h("span", { class: "h3l-lbl" }, T("Сила Swap LoRA")), v),
        range,
        h("div", { class: "h3l-note" }, T("1.00× — исходная сила. Изменения сохраняются в этом отрезке; старый дубль останется в истории.")),
        src.swap_mask ? h("label", { class: "h3l-row h3l-sw-mask-guard" },
          h("input", { type: "checkbox", checked: src.swap_mask.guard === true, disabled: busy,
            onchange: (e) => this.mutate((p) => {
              const mask = p.segments[i].source?.swap_mask;
              if (!mask) return;
              if (e.target.checked) mask.guard = true;
              else delete mask.guard;
            }) }),
          T("SAM 3.1 · защита от перескока маски (эксперимент)")) : null,
        h("button", { class: "h3l-btn sm primary", type: "button",
          disabled: busy || !st.ok || sourceShort || (!!this._mp?.ok && !installed),
          title: sourceShort ? T("Исходное видео короче отрезка — сначала синхронизируйте или авторазделите") :
            (st.why || T("Перегенерировать с выбранной LoRA, включая недостающие предыдущие отрезки")),
          onclick: () => this.genSegment(i) }, T("Перегенерировать отрезок")));
    },

    videoRefChips(i, box) {
      const s = this.seg(i);
      C.videoRefs(this.p, s).forEach((a, k) => {
        const chip = h("div", { class: "h3l-ref vid" + (k >= C.MAX_REF_VIDEOS ? " over" : ""), title: T("Видео-референс «{0}» (движение/стиль; первые {1} с) · клик — вставить <Video {2}>", a.name, Math.min(15, a.duration || 15).toFixed(0), k + 1) },
          a.poster ? h("img", { src: this.posterUrl(a) }) : h("span", { class: "ico" }, "◫"), h("span", { class: "tg" }, `<Video ${k + 1}>`), h("span", null, a.name.slice(0, 14)));
        const x = h("span", { class: "x", title: T("Убрать") }, "✕");
        x.onclick = (e) => { e.stopPropagation(); this.toggleRef(i, a.id); };
        chip.append(x);
        chip.onclick = () => this.insertTag(`<Video ${k + 1}>`);
        chip.ondblclick = (e) => { e.stopPropagation(); this.openAssetEditor(a.id); };
        chip.oncontextmenu = (e) => this.assetMenu(e, a);
        box.append(chip);
      });
      return C.videoRefs(this.p, s).length;
    },
  });
}
