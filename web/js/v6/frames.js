// H3ZeroStudio Lab v6h/v6i — clip generation mode REF | FLF, both in the one «Референсы» block of the inspector.
// REF = references / characters (up to 9 pictures, the default). FLF = the same block limited to two picture slots
// «Первый» / «Последний» (images only); the engine picks itself: first only = i2v, first + last = fl2va,
// last only = l2va; no frame set = still the REF path (warned).
// Storage: REF keeps seg.refs / seg.cards, FLF keeps seg.kf {mode, first, last} — separate, so switching the mode
// never loses either list (v6h seg.kf {on, first, last} is read as mode "flf"/"ref" with the same slots).
// An explicit first frame starts the clip from that picture (replaces the continuation of the previous clip);
// a last frame alone keeps the continuation and makes the clip arrive at that picture.
import { T } from "../h3s_i18n.js";
import { I, btn, seg, section, setTip, popover, closePopover, empty } from "./kit.js";

export const KF_LABEL = () => ({ t2v: T("Текст → видео"), i2v: T("Картинка → видео (i2v)"), flf: T("Первый + последний кадр (FLF)"), l2v: T("Приход к последнему кадру (L2VA)") });
const IMG_CATS = ["character", "location", "other"];

export function installFrames(Studio, { C, h }) {
  const base = Studio.prototype.inspRefs, baseAdd = Studio.prototype.addRef, baseToggle = Studio.prototype.toggleRef, baseChar = Studio.prototype.charAdd;
  const isFlf = (s) => !!s && !s.source && (s.kf?.mode || (s.kf?.on ? "flf" : "ref")) === "flf";
  Object.assign(Studio.prototype, {
    kfMode(i) { const s = this.seg(i); return s ? C.kfMode(this.p, s) : "t2v"; },
    isFlf(i) { return isFlf(this.seg(i)); },
    setKf(i, patch) {
      this.mutate((p) => {
        const s = p.segments[i]; if (!s) return;
        const kf = { mode: "ref", first: "", last: "", ...(s.kf || {}), ...patch };
        delete kf.on;   // derived from mode
        s.kf = C.normalizeKf(kf);
      });
    },
    /** FLF: a media item dropped / picked for the clip goes into a frame slot — pictures only. */
    kfTake(i, id, which = null) {
      const a = this.p.assets.find((x) => x.id === id), s = this.seg(i);
      if (!a || !s) return false;
      if (!IMG_CATS.includes(a.category)) { this.toast(T("В режиме FLF — только картинки: первый и последний кадр. Видео, звук и персонажи — в режиме REF."), true); return false; }
      const w = which || (!s.kf?.first ? "first" : !s.kf?.last ? "last" : null);
      if (!w) { this.toast(T("Оба кадра уже заданы — уберите один или перетащите картинку на нужный слот"), true); return false; }
      this.setKf(i, { mode: "flf", [w]: id }); return true;
    },
    addRef(i, id) { return this.isFlf(i) ? this.kfTake(i, id) : baseAdd.call(this, i, id); },
    toggleRef(i, id) {
      const s = this.seg(i);
      if (!this.isFlf(i)) return baseToggle.call(this, i, id);
      if (s.kf?.first === id) return this.setKf(i, { first: "" });
      if (s.kf?.last === id) return this.setKf(i, { last: "" });
      return this.kfTake(i, id);
    },
    charAdd(t, id) {
      if (t && typeof t.seg === "number" && this.isFlf(t.seg)) return this.toast(T("В режиме FLF персонажи не используются — переключите отрезок в REF"), true);
      return baseChar ? baseChar.call(this, t, id) : undefined;
    },
    /** One FLF slot in the reference grid (same cell as a reference): picture + × or «+», drop target. */
    kfSlot(i, which) {
      const s = this.seg(i), aid = s.kf?.[which] || "", a = aid ? this.p.assets.find((x) => x.id === aid) : null;
      const label = which === "first" ? T("Первый") : T("Последний"), full = which === "first" ? T("Первый кадр") : T("Последний кадр");
      const cell = h("div", { class: "v6-ref v6-kf-cell" + (a ? "" : " is-add"), "data-kf": which, role: "button", tabindex: "0" });
      if (a) {
        const x = h("button", { type: "button", class: "v6-ref-x", "aria-label": T("Убрать"), html: I.close });
        x.onclick = (e) => { e.stopPropagation(); this.setKf(i, { [which]: "" }); };
        cell.append(h("img", { src: this.assetUrl(a), alt: "", draggable: "false" }), x);
        setTip(cell, T("{0}: «{1}» — клик заменит", full, a.name));
        cell.oncontextmenu = (e) => this.assetMenu?.(e, a);
      } else {
        cell.append(h("i", { class: "v6-ic", html: I.plus }));
        setTip(cell, T("{0}: выбрать картинку из медиатеки или перетащить сюда", full));
      }
      cell.append(h("span", { class: "v6-ref-tag v6-kf-tag" }, label));
      cell.onclick = () => this.kfPicker(cell, i, which);
      cell.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); cell.classList.add("is-over"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("is-over"));
      cell.addEventListener("drop", (e) => {
        cell.classList.remove("is-over"); e.preventDefault(); e.stopPropagation();
        const id = e.dataTransfer.getData("application/x-h3s-asset");
        if (e.dataTransfer.getData("application/x-h3s-card")) return this.toast(T("В режиме FLF персонажи не используются — переключите отрезок в REF"), true);
        if (id) this.kfTake(i, id, which);
      });
      return cell;
    },
    kfPicker(anchor, i, which) {
      const fileIn = h("input", { type: "file", accept: "image/*", hidden: true });
      fileIn.onchange = async () => {
        const fs = [...fileIn.files]; fileIn.value = ""; const before = new Set(this.p.assets.map((a) => a.id));
        await this.uploadFiles(fs);
        const nw = this.p.assets.find((a) => !before.has(a.id) && IMG_CATS.includes(a.category));
        if (nw) this.setKf(i, { mode: "flf", [which]: nw.id });
        else if (fs.length) this.toast(T("В режиме FLF — только картинки: первый и последний кадр. Видео, звук и персонажи — в режиме REF."), true);
        closePopover();
      };
      const imgs = this.p.assets.filter((a) => IMG_CATS.includes(a.category) && a.file);
      const cur = this.seg(i)?.kf?.[which] || "";
      const list = h("div", { class: "v6-pick-l" });
      if (!imgs.length) list.append(empty(I.image, T("В проекте пока нет картинок"), btn({ icon: I.upload, label: T("Загрузить…"), kind: "tinted", size: "sm", onclick: () => fileIn.click() })));
      for (const a of imgs) {
        const tile = h("button", { type: "button", class: "v6-pick-it" + (a.id === cur ? " on" : "") },
          h("img", { src: this.assetUrl(a), alt: "", loading: "lazy", draggable: "false" }), h("span", null, a.name), a.id === cur ? h("i", { class: "v6-pick-ck", html: I.check }) : null);
        tile.onclick = () => { closePopover(); this.setKf(i, { mode: "flf", [which]: a.id === cur ? "" : a.id }); };
        list.append(tile);
      }
      popover(this.root, anchor, h("div", { class: "v6-pick" },
        h("div", { class: "v6-pick-h" }, h("b", null, which === "first" ? T("Первый кадр") : T("Последний кадр"))), list,
        h("div", { class: "v6-pick-f" }, btn({ icon: I.upload, label: T("С компьютера…"), size: "sm", onclick: () => fileIn.click() })), fileIn), { width: 360, align: "start" });
    },
    /** v6m «Вписать кадр»: how the first / last frame meets the canvas (project setting, same for both frames). */
    kfFitBlock() {
      const g = this.p.settings, [fit] = C.kfFit(this.p);
      const opts = [{ value: "crop", label: T("Обрезать"), tip: T("По центру, без полей: кадр заполняет холст, лишнее по краям срезается (по умолчанию)") },
        { value: "pad", label: T("С полями"), tip: T("Весь кадр виден: вписан в холст, поля размыты или чёрные") },
        { value: "stretch", label: T("Растянуть"), tip: T("Растянуть на весь холст без сохранения пропорций") }];
      if (fit === "legacy") opts.push({ value: "legacy", label: T("Как раньше"), tip: T("Как до v6m: первый кадр растянут, последний обрезан. Сохранено для старых клипов — их дубли не устаревают.") });
      const set = (patch) => this.mutate((p) => { Object.assign(p.settings, patch); });
      const lb = h("span", { class: "v6-lbl" }, T("Вписать кадр"));
      setTip(lb, T("Как первый и последний кадр ложатся на холст ролика, если пропорции картинки другие. Одинаково для обоих кадров."));
      const kids = [h("div", { class: "v6-fld v6-kf-fitrow" }, lb), seg(opts, fit, (v) => set({ kf_fit: v }), { size: "sm", full: true, cls: "v6-kf-fit", label: T("Вписать кадр") })];
      if (fit === "pad") kids.push(seg([{ value: "blur", label: T("Размытые поля") }, { value: "black", label: T("Чёрные поля") }], g.kf_pad === "black" ? "black" : "blur", (v) => set({ kf_pad: v }), { size: "sm", full: true, cls: "v6-kf-pad" }));
      return h("div", { class: "v6-kf-fitbox" }, ...kids);
    },
    /** v6i: the mode selector + FLF slots live in the «Референсы» block (inspRefs); no separate section. */
    inspFrames() { return null; },
    inspRefs(i, s) {
      if (s.source) return base.call(this, i, s);   // footage / vid2vid clips keep their own path
      const flf = isFlf(s);
      const ctl = seg([{ value: "ref", label: "REF", tip: T("Референсы: картинки, видео, звук и персонажи отрезка (модель ref2va)") },
        { value: "flf", label: "FLF", tip: T("Кадры: первый и/или последний кадр (i2v / fl2va / l2va — выбирается само)") }],
        flf ? "flf" : "ref", (v) => {
          if (v === "flf" && ((s.refs || []).length || (s.cards || []).length)) {
            this.toast(T("REF и FLF нельзя совмещать: сначала удалите референсы и персонажей сцены."), true);
            return;
          }
          this.setKf(i, { mode: v });
        }, { full: true, size: "sm", cls: "v6-kf-ctl", label: T("Режим генерации") });
      if (!flf) {
        const el = base.call(this, i, s);
        el.classList.add("v6-kf"); el.dataset.mode = "ref";
        el.querySelector(".v6-sec-h")?.after(ctl);
        return el;
      }
      const [fa, la] = C.kfAssets(this.p, s), mode = fa && la ? "flf" : la ? "l2v" : fa ? "i2v" : "t2v";
      const grid = h("div", { class: "v6-refs v6-kf-grid" }, this.kfSlot(i, "first"), this.kfSlot(i, "last"));
      grid.addEventListener("dragover", (e) => { e.preventDefault(); grid.classList.add("is-over"); });
      grid.addEventListener("dragleave", () => grid.classList.remove("is-over"));
      grid.addEventListener("drop", (e) => { grid.classList.remove("is-over"); e.preventDefault();
        if (e.dataTransfer.getData("application/x-h3s-card")) return this.toast(T("В режиме FLF персонажи не используются — переключите отрезок в REF"), true);
        const id = e.dataTransfer.getData("application/x-h3s-asset"); if (id) this.kfTake(i, id); });
      const kids = [ctl, grid];
      const it = this.items()[i], ext = i > 0 && s.link === "extend" && !s.gap;
      if (mode === "t2v") kids.push(h("p", { class: "v6-note is-warn v6-kf-none" }, T("Кадры не заданы: добавьте первый (i2v), последний (l2va) или оба (fl2va). Пока кадров нет, клип генерируется как REF.")));
      else {
        kids.push(h("div", { class: "v6-kf-mode is-" + mode, "data-mode": mode }, h("span", { class: "v6-lbl" }, T("Авто")), h("b", null, KF_LABEL()[mode])));
        if (!fa && la && ext && it?.overlap) kids.push(h("p", { class: "v6-note" }, T("Продолжает отрезок {0} и приходит к последнему кадру.", i)));
        kids.push(this.kfFitBlock());
        const sp = C.segmentPreset(this.p, i), fl2 = (this._mp?.files?.unet || []).filter((x) => C.isFl2va(x));
        const fm = sp ? sp.flf_model || (C.isFl2va(sp.model) ? sp.model : fl2[0] || "") : "";
        if (sp && !fm) kids.push(h("div", { class: "v6-kf-warn" }, h("p", { class: "v6-note is-warn" }, T("Нет модели fl2va: выберите «Модель для FLF» в пресете или положите fl2va в models/diffusion_models.")),
          btn({ label: T("Пресеты и модели…"), size: "sm", kind: "tinted", onclick: () => this.openPrefs("models") })));
        else if (sp) kids.push(h("p", { class: "v6-note v6-kf-mdl" }, T("Модель: {0}", String(fm).split(/[\\/]/).pop())));
      }
      const nr = (s.refs || []).length, nc = (s.cards || []).length;
      if (nr || nc) kids.push(h("p", { class: "v6-note" }, T("Референсы и персонажи отрезка сохранены — вернутся в режиме REF.")));
      { // v6m: the slots preview the fit on the canvas aspect
        const [cw, ch] = C.resolution(this.p.settings), [fit, pad] = C.kfFit(this.p);
        grid.style.setProperty("--kf-ar", `${cw} / ${ch}`);
        grid.classList.add("is-fit-" + fit); if (pad) grid.classList.add("is-pad-" + pad);
        for (const im of grid.querySelectorAll(".v6-kf-cell > img")) im.before(h("img", { class: "v6-kf-bg", src: im.src, alt: "", draggable: "false" }));
      }
      const cnt = h("span", { class: "v6-cap" }, T("{0} из {1}", (fa ? 1 : 0) + (la ? 1 : 0), 2));
      const sec = section(T("Референсы"), cnt, ...kids);
      sec.classList.add("v6-kf"); sec.dataset.mode = "flf";
      return sec;
    },
  });
}
