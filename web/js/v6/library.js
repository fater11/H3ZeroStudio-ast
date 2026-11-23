// H3ZeroStudio Lab v6 — «Медиатека» page: source-list sidebar + content. Media is native; character cards,
// gallery and projects use the engine panels inside the new frame.
import { T } from "../h3s_i18n.js";
import { I, btn, seg, setTip, empty } from "./kit.js";

const isImg = (a) => a.category !== "audio" && a.category !== "video";

export function installLibrary(Studio, { C, h }) {
  Object.assign(Studio.prototype, {
    renderLibrary() {
      const $ = this.$, sec = this.libSec;
      // sidebar
      const nMedia = this.p.assets.length;
      const item = (id, icon, label, count) => {
        const b = h("button", { type: "button", class: "v6-side-it" + (sec === id ? " on" : ""), "aria-current": sec === id ? "page" : null },
          h("i", { class: "v6-ic", html: icon }), h("span", null, label), count ? h("small", null, String(count)) : null);
        b.onclick = () => { if (this.libSec === id) return; this.libSec = id; this.tool = id; this.renderLeft(); };
        return b;
      };
      $.libSide.innerHTML = "";
      $.libSide.append(h("h5", null, T("Этот проект")), item("assets", I.image, T("Медиа"), nMedia),
        h("h5", null, T("Библиотека")), item("chars", I.people, T("Персонажи"), this._chars?.cards?.length || 0), item("gallery", I.gallery, T("Галерея")), item("projects", I.folder, T("Проекты")));
      // content (keep scroll / focus of the same section)
      const L = $.libMain, snap = this._libSec === sec ? this.uiSnap(L) : null; this._libSec = sec;
      L.innerHTML = ""; L.dataset.sec = sec;
      if (sec !== "help") this.helpHide?.();
      try {
        if (sec === "assets") this.libMedia(L);
        else {
          const title = { chars: T("Персонажи"), gallery: T("Галерея"), projects: T("Проекты") }[sec];
          const sub = { chars: T("Карточки внешности и голоса — общие для всех проектов"), gallery: T("Все созданные видео: черновики, финалы, апскейлы"), projects: T("Сохранённые проекты студии") }[sec];
          const body = h("div", { class: "v6-lib-body h3l-panel" }), acts = h("div", { class: "v6-lib-acts" });
          const head = h("header", { class: "v6-lib-h" }, h("div", null, h("h2", null, title), h("p", null, sub)), acts);
          L.append(head, body);
          const fn = { chars: "renderChars", gallery: "renderGallery", projects: "renderProjects" }[sec];
          this.tool = sec; this[fn](body);
          this.libAdapt(body, acts);
        }
      } catch (e) { console.error("[H3 Lab v6] library", sec, e); L.append(h("p", { class: "v6-err" }, String(e?.message || e))); }
      if (snap) { this._leftSnap = { snap, t: Date.now() }; this.uiRestore(L, snap); }
    },
    /** The engine panel's own title row → the page header: its buttons and search move up, glyph labels
     *  become icons, single-choice filters disappear, the empty text becomes the page's empty state. */
    /** Engine empty paragraphs (rendered async) → the one v6 empty state; run from the studio's mutation pass. */
    libEmpties() {
      const host = this.$?.libMain; if (!host || !host.isConnected) return;
      // engine empty paragraphs → the one v6 empty state: icon, first sentence as the phrase, the rest as a caption
      for (const em of [...host.querySelectorAll(".h3l-cempty, .h3l-gempty")]) {
        const root = em.parentElement, body = host;
        const txt = (em.textContent || "").trim(), cut = txt.search(/[.:]\s/);
        const head = cut > 0 ? txt.slice(0, cut + 1).replace(/[:.]$/, "") : txt, rest = cut > 0 ? txt.slice(cut + 2) : "";
        const icon = root.classList.contains("h3l-chars") ? I.people : em.classList.contains("h3l-cempty") ? I.people : this._libSec === "projects" ? I.folder : I.gallery;
        const notes = root.classList.contains("h3l-chars") ? [...root.querySelectorAll(":scope > .h3l-note:not(.tgt)")] : [];
        root.querySelector(":scope > .h3l-note.tgt")?.remove();
        const box = empty(icon, head, null, rest);
        for (const n of notes) { n.className = "v6-empty-s v6-empty-note"; box.append(n); }
        em.replaceWith(box);
      }
    },
    libAdapt(body, acts) {
      const root = body.firstElementChild; if (!root) return;
      const GL = { "↻": I.refresh, "+": I.plus, "⇪": I.upload, "⤓": I.download, "⧉": I.dup, "⇩": I.download, "✎": I.edit };
      const v6btn = (b, primary) => {
        const raw = (b.textContent || "").trim(), m = /^([^\p{L}\p{N}\s]+)\s*(.*)$/u.exec(raw), glyph = m?.[1] || "", text = m ? m[2] : raw;
        const icon = GL[glyph] || null;
        b.className = "v6-b is-sm " + (primary ? "is-primary" : "is-tinted") + (text ? "" : " is-icon");
        b.innerHTML = ""; if (icon) b.append(h("i", { class: "v6-ic", html: icon })); if (text) b.append(h("span", null, text));
        if (!text && b.title) { b.dataset.tip = b.title; b.removeAttribute("title"); }
      };
      const hd = root.querySelector(":scope > .h3l-row.hd, :scope > .h3l-ghead");
      if (hd) {
        for (const el of [...hd.children]) {
          if (el.matches("button")) { v6btn(el, el.classList.contains("primary")); acts.append(el); }
          else if (el.matches(".h3l-pills")) acts.append(el);
        }
        hd.remove();
      }
      const q = root.querySelector(":scope > input.h3l-in");
      if (q) { q.className = "v6-in v6-search"; acts.prepend(q); }
      for (const p of root.querySelectorAll(":scope > .h3l-pills")) if (p.children.length < 2) p.remove();
      for (const b of root.querySelectorAll(":scope > .h3l-row > .h3l-btn, :scope > .h3l-pcur .h3l-row > .h3l-btn")) v6btn(b, b.classList.contains("primary"));
    },
    leftRestore() { const ls = this._leftSnap; if (!ls || Date.now() - ls.t > 3000) return; this.uiRestore(this.$.libMain, ls.snap, true); },

    libMedia(L) {
      const f = this.mediaFilter || "all", q = (this.mediaQ || "").trim().toLowerCase();
      const fileIn = h("input", { type: "file", hidden: true, multiple: true, accept: "image/*,audio/*,video/*,.mp3,.wav,.flac,.ogg,.m4a,.mp4,.mov,.webm,.mkv" });
      fileIn.onchange = () => { this.uploadFiles([...fileIn.files]); fileIn.value = ""; };
      const CAT = { all: T("Все"), character: T("Персонажи"), location: T("Локации"), other: T("Другое"), audio: T("Аудио"), video: T("Видео") };
      const filt = seg(Object.entries(CAT).map(([value, label]) => ({ value, label })), f, (v) => { this.mediaFilter = v; this.filter = v; this.renderLeft(); }, { label: T("Тип") });
      const search = h("input", { class: "v6-in v6-search", type: "search", placeholder: T("Поиск по имени"), value: this.mediaQ || "", spellcheck: "false" });
      search.addEventListener("keydown", (e) => e.stopPropagation());
      search.oninput = () => { this.mediaQ = search.value; clearTimeout(this._mqT); this._mqT = setTimeout(() => this.renderLeft(), 160); };
      const s = this.seg();
      L.append(h("header", { class: "v6-lib-h" },
        h("div", null, h("h2", null, T("Медиа")), h("p", null, s ? T("Клик добавляет файл в референсы отрезка {0} или убирает из них", this.sel + 1) : T("Картинки, звук и видео этого проекта"))),
        h("i", { class: "v6-grow" }), search, btn({ icon: I.upload, label: T("Загрузить"), kind: "tinted", onclick: () => fileIn.click() })),
        h("div", { class: "v6-lib-tools" }, filt), fileIn);
      const used = new Set(s?.refs || []);
      const list = this.p.assets.filter((a) => (f === "all" || a.category === f) && (!q || (a.name || "").toLowerCase().includes(q)));
      const body = h("div", { class: "v6-lib-body" });
      body.addEventListener("dragover", (e) => { e.preventDefault(); body.classList.add("is-over"); });
      body.addEventListener("dragleave", (e) => { if (!body.contains(e.relatedTarget)) body.classList.remove("is-over"); });
      body.addEventListener("drop", (e) => { e.preventDefault(); body.classList.remove("is-over"); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) this.uploadFiles(fs); });
      if (!list.length) {
        body.append(empty(I.upload, this.p.assets.length ? T("В этой категории пусто") : T("Перетащите файлы сюда"),
          btn({ label: T("Выбрать файлы…"), kind: "tinted", onclick: () => fileIn.click() }), this.p.assets.length ? "" : T("Персонажи, локации и предметы станут <Picture N> в промптах; звук и видео — дорожками и футажом")));
        L.append(body); return;
      }
      const grid = h("div", { class: "v6-mgrid" });
      for (const a of list) {
        const kind = a.category === "audio" ? "aud" : a.category === "video" ? "vid" : "img";
        const thumb = kind === "img" ? h("img", { src: this.assetUrl(a), alt: "", loading: "lazy", draggable: "false" })
          : kind === "vid" && a.poster && this.posterUrl ? h("img", { src: this.posterUrl(a), alt: "", loading: "lazy", draggable: "false" })
          : h("i", { class: "v6-ic v6-mthumb-ic", html: kind === "aud" ? I.wave : I.film });
        const dur = kind !== "img" ? this.assetDuration?.(a.id) || a.duration : 0;
        const card = h("div", { class: "v6-mcard is-" + kind + (used.has(a.id) ? " is-used" : ""), draggable: "true", tabindex: "0" },
          h("div", { class: "v6-mthumb" }, thumb, used.has(a.id) ? h("span", { class: "v6-mbadge" }, h("i", { class: "v6-ic", html: I.check }), T("В отрезке")) : null,
            dur ? h("span", { class: "v6-mdur" }, C.fmtTime(dur)) : null),
          h("div", { class: "v6-mcap" }, h("b", null, a.name), h("span", null, { character: T("Персонаж"), location: T("Локация"), other: T("Другое"), audio: T("Аудио"), video: T("Видео") }[a.category] || "")));
        const more = btn({ icon: I.more, size: "sm", cls: "v6-mmore", tip: T("Действия"), onclick: (e, b) => { e.stopPropagation(); const r = b.getBoundingClientRect(); this.assetMenu({ clientX: r.left, clientY: r.bottom + 4, preventDefault() {}, stopPropagation() {} }, a); } });
        card.append(more);
        if (kind === "aud" && !a.virtual) {   // v6m: centred on the thumb (was bottom-left over the file name)
          const playing = this._previewId === a.id;
          const pl = btn({ icon: playing ? I.pause : I.play, size: "sm", cls: "v6-mplay" + (playing ? " is-playing" : ""), tip: playing ? T("Остановить") : T("Прослушать"), onclick: (e) => { e.stopPropagation(); this.previewAsset(a.id); this.renderLeft(); } });
          card.querySelector(".v6-mthumb").append(pl); if (playing) card.classList.add("is-playing");
        }
        card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("application/x-h3s-asset", a.id); if (kind === "aud") e.dataTransfer.setData("application/x-h3s-audio", a.id); if (kind === "vid") e.dataTransfer.setData("application/x-h3s-video", a.id); e.dataTransfer.effectAllowed = "copy"; });
        card.onclick = () => { if (!this.seg()) return this.toast(T("Сначала добавьте отрезок"), true); this.toggleRef(this.sel, a.id); };
        card.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); card.click(); } });
        card.addEventListener("dblclick", (e) => { e.stopPropagation(); if (!a.virtual) this.openAssetEditor(a.id); });
        card.addEventListener("contextmenu", (e) => { e.preventDefault(); this.assetMenu(e, a); });
        setTip(card, kind === "img" ? T("Двойной клик — обрезка, поворот, отражение") : kind === "aud" ? T("Меню — на звуковую дорожку или дорожку музыки") : T("Меню — на таймлайн как футаж"));
        grid.append(card);
      }
      // the last tile is the drop zone: the empty part of the canvas says what it is for
      const drop = h("button", { type: "button", class: "v6-mcard v6-mdrop" }, h("div", { class: "v6-mthumb" }, h("i", { class: "v6-ic", html: I.upload }), h("span", null, T("Перетащите файлы или нажмите"))));
      drop.onclick = () => fileIn.click();
      setTip(drop, T("Картинки, звук и видео"));
      grid.append(drop);
      body.append(grid); L.append(body);
    },

    // the assistant page lives in astpage.js (v6e)
  });
}
