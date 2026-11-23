// H3ZeroStudio Lab v6 — left dock of the Montage page (as in Resolve / Premiere): «Медиа» (this project's files)
// and «Галерея» (generated videos). Everything drags onto the timeline; double click or Space opens a quick
// preview over the player. Resizable (splitter, double click = default) and collapsible.
import { T } from "../h3s_i18n.js";
import { I, btn, seg, setTip, empty } from "./kit.js";

const KIND = () => ({ take: T("Дубль"), draft: T("Черновик"), refine: T("Финал"), upscale: T("Апскейл"), region: T("Участок"), final: T("Ролик") });

export function installDock(Studio, { C, h }) {
  Object.assign(Studio.prototype, {
    buildDock() {
      const $ = this.$;
      $.dock = h("aside", { class: "v6-dock", "aria-label": T("Медиа и галерея") });
      $.splitL = h("div", { class: "v6-split v l", "aria-hidden": "true" });
      this.dockTab = this.dockTab || "media";
    },
    renderDock() {
      const $ = this.$, D = $.dock; if (!D || this.page !== "edit" || this.root.classList.contains("v6-dock-off")) return;
      const snap = this._dockTabR === this.dockTab ? this.uiSnap(D) : null; this._dockTabR = this.dockTab;
      D.innerHTML = "";
      const tabs = seg([{ value: "media", label: T("Медиа") }, { value: "gallery", label: T("Галерея") }], this.dockTab, (v) => { this.dockTab = v; this.renderDock(); }, { size: "sm", full: true, label: T("Медиа и галерея") });
      D.append(h("div", { class: "v6-dock-h" }, tabs));   // v6f: one dock toggle only — the button in the player bar (Ctrl+B)
      const body = h("div", { class: "v6-dock-b", tabindex: "-1" });
      D.append(body);
      if (this.dockTab === "media") this.dockMedia(body); else this.dockGallery(body);
      if (snap) this.uiRestore(D, snap);
    },
    dockCard({ thumb, name, sub, dur, kind, drag, onPreview, onMenu, onEnter, used }) {
      const card = h("div", { class: "v6-dcard is-" + kind + (used ? " is-used" : ""), draggable: "true", tabindex: "0", role: "button" },
        h("div", { class: "v6-dthumb" }, thumb || h("i", { class: "v6-ic", html: kind === "aud" ? I.wave : I.film }), dur ? h("span", { class: "v6-mdur" }, dur) : null,
          used ? h("span", { class: "v6-dused", "aria-label": T("В отрезке") }, h("i", { class: "v6-ic", html: I.check })) : null),
        kind === "aud" ? h("div", { class: "v6-dcap is-row" }, h("b", null, name), dur ? h("span", { class: "v6-ddur" }, dur) : null)
          : h("div", { class: "v6-dcap" }, h("b", null, name), sub ? h("span", null, sub) : null));
      setTip(card, name + "\n" + T("Перетащите на таймлайн · двойной клик — просмотр"), T("Пробел"));
      card.addEventListener("dragstart", (e) => { drag(e.dataTransfer); e.dataTransfer.effectAllowed = "copy"; this.hideTip?.(); });
      card.addEventListener("dblclick", (e) => { e.stopPropagation(); onPreview(); });
      card.addEventListener("keydown", (e) => {
        if (e.key === " ") { e.preventDefault(); e.stopPropagation(); this._qp ? this.qpClose() : onPreview(); }
        else if (e.key === "Enter" && onEnter) { e.preventDefault(); e.stopPropagation(); onEnter(); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault(); e.stopPropagation();
          const all = [...card.parentElement.querySelectorAll(".v6-dcard")], i = all.indexOf(card);
          const cols = Math.max(1, Math.round(card.parentElement.clientWidth / Math.max(1, card.offsetWidth)));
          const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols : -cols;
          all[Math.max(0, Math.min(all.length - 1, i + d))]?.focus();
          if (this._qp) all[Math.max(0, Math.min(all.length - 1, i + d))]?.dispatchEvent(new MouseEvent("dblclick"));
        }
      });
      if (onMenu) card.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); onMenu(e); });
      return card;
    },
    dockMedia(body) {
      const q = (this.dockQ || "").trim().toLowerCase();
      const fileIn = h("input", { type: "file", hidden: true, multiple: true, accept: "image/*,audio/*,video/*,.mp3,.wav,.flac,.ogg,.m4a,.mp4,.mov,.webm,.mkv" });
      fileIn.onchange = () => { this.uploadFiles([...fileIn.files]); fileIn.value = ""; };
      const search = h("input", { class: "v6-in v6-search sm", type: "search", placeholder: T("Поиск"), value: this.dockQ || "", spellcheck: "false", "aria-label": T("Поиск по имени") });
      search.addEventListener("keydown", (e) => e.stopPropagation());
      search.oninput = () => { this.dockQ = search.value; clearTimeout(this._dqT); this._dqT = setTimeout(() => { this.renderDock(); const s = this.$.dock.querySelector(".v6-search"); s?.focus(); s?.setSelectionRange(s.value.length, s.value.length); }, 160); };
      body.append(h("div", { class: "v6-dock-tools" }, search, btn({ icon: I.upload, size: "sm", tip: T("Загрузить файлы"), onclick: () => fileIn.click() })), fileIn);
      const used = new Set(this.seg()?.refs || []);
      const all = this.p.assets.filter((a) => !q || (a.name || "").toLowerCase().includes(q));
      body.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); body.classList.add("is-over"); } });
      body.addEventListener("dragleave", (e) => { if (!body.contains(e.relatedTarget)) body.classList.remove("is-over"); });
      body.addEventListener("drop", (e) => { body.classList.remove("is-over"); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) { e.preventDefault(); e.stopPropagation(); this.uploadFiles(fs); } });
      if (!all.length) {
        body.append(empty(I.upload, this.p.assets.length ? T("Ничего не найдено") : T("Перетащите файлы сюда"), this.p.assets.length ? null : btn({ label: T("Выбрать файлы…"), kind: "tinted", size: "sm", onclick: () => fileIn.click() })));
        return;
      }
      const groups = [["img", T("Картинки"), all.filter((a) => a.category !== "audio" && a.category !== "video")], ["vid", T("Видео"), all.filter((a) => a.category === "video")], ["aud", T("Звук"), all.filter((a) => a.category === "audio")]];
      for (const [kind, title, list] of groups) {
        if (!list.length) continue;
        const grid = h("div", { class: "v6-dgrid is-" + kind });
        for (const a of list) {
          const thumb = kind === "img" ? h("img", { src: this.assetUrl(a), alt: "", loading: "lazy", draggable: "false" })
            : kind === "vid" && a.poster ? h("img", { src: this.posterUrl(a), alt: "", loading: "lazy", draggable: "false" }) : null;
          const d = kind !== "img" ? this.assetDuration?.(a.id) || a.duration : 0;
          grid.append(this.dockCard({ thumb, name: a.name, kind, used: used.has(a.id), dur: d ? C.fmtTime(d) : "",
            sub: kind === "img" ? ({ character: T("Персонаж"), location: T("Локация"), other: T("Другое") })[a.category] || "" : "",
            drag: (dt) => { dt.setData("application/x-h3s-asset", a.id); if (kind === "aud") dt.setData("application/x-h3s-audio", a.id); else if (kind === "vid") dt.setData("application/x-h3s-video", a.id); else dt.setData("application/x-h3s-dock", a.id); },
            onPreview: () => this.qpOpen({ kind, name: a.name, src: kind === "img" ? this.assetUrl(a) : kind === "aud" ? (a.virtual ? "" : this.assetUrl(a)) : this.assetUrl(a), poster: kind === "vid" && a.poster ? this.posterUrl(a) : "" }),
            onMenu: (e) => this.assetMenu(e, a),
            onEnter: kind === "img" || kind === "vid" ? () => { if (!this.seg()) return this.toast(T("Сначала добавьте отрезок"), true); this.toggleRef(this.sel, a.id); } : null }));
        }
        const fold = this.dockFold(), shut = fold.includes(kind);
        const hd = h("button", { type: "button", class: "v6-dock-sec" + (shut ? " is-shut" : ""), "aria-expanded": String(!shut) },
          h("i", { class: "v6-ic v6-dock-chev", html: I.chev }), h("span", null, title), h("small", null, String(list.length)));
        setTip(hd, shut ? T("Показать") : T("Свернуть"));
        hd.onclick = () => { const f = this.dockFold().filter((x) => x !== kind); if (!shut) f.push(kind); try { localStorage.setItem("h3ls.v6.dockFold", JSON.stringify(f)); } catch {} this.renderDock(); };
        grid.hidden = shut;
        body.append(hd, grid);
      }
    },
    dockFold() { try { const v = JSON.parse(localStorage.getItem("h3ls.v6.dockFold") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } },
    dockGallery(body) {
      const g = this._gal;
      if (!g || g.key !== (this.galScope || "project") + ":" + this.p.id) {
        body.append(h("div", { class: "v6-dock-load" }, h("i", { class: "v6-spin" }), T("Загрузка…")));
        this.galLoad?.().then(() => { if (this.dockTab === "gallery") this.renderDock(); }).catch(() => {});
        return;
      }
      const items = (g.items || []).filter((e) => e.video).slice(0, 300);
      if (!items.length) { body.append(empty(I.gallery, T("Здесь появятся созданные видео"), btn({ label: T("Открыть галерею"), size: "sm", kind: "tinted", onclick: () => this.setPage("library", "gallery") }))); return; }
      body.append(h("div", { class: "v6-dock-tools" }, h("span", { class: "v6-muted" }, T("{0} видео этого проекта", items.length)), h("i", { class: "v6-grow" }),
        btn({ icon: I.refresh, size: "sm", tip: T("Обновить"), onclick: () => this.galLoad(true).then(() => this.renderDock()) })));
      const grid = h("div", { class: "v6-dgrid is-vid" });
      for (const e of items) {
        const thumb = e.poster ? h("img", { src: this.host.url(e.poster), alt: "", loading: "lazy", draggable: "false" }) : null;
        const name = (KIND()[e.kind] || T("Видео")) + (e.seg_index != null ? " · " + T("отр. {0}", e.seg_index + 1) : "");
        grid.append(this.dockCard({ thumb, name, kind: "vid", dur: e.frames ? C.fmtTime(e.frames / C.FPS) : "", sub: e.seed != null ? T("сид {0}", e.seed) : "",
          drag: (dt) => { dt.setData("application/x-h3s-gal", e.id + e.pid); },
          onPreview: () => this.qpOpen({ kind: "vid", name, src: this.host.url(e.video), poster: e.poster ? this.host.url(e.poster) : "" }),
          onMenu: (ev) => this.galMenu?.(ev, e) }));
      }
      body.append(grid);
    },

    // ---------------------------------------------------------------- quick preview (over the player)
    qpOpen({ kind, name, src, poster }) {
      this.qpClose(true);
      const $ = this.$;
      const media = kind === "img" ? h("img", { src, alt: name })
        : kind === "vid" ? h("video", { src, poster: poster || null, controls: true, autoplay: true, playsinline: true, loop: false })
        : h("div", { class: "v6-qp-aud" }, h("i", { class: "v6-ic", html: I.wave }), src ? h("audio", { src, controls: true, autoplay: true }) : h("p", { class: "v6-muted" }, T("Звук берётся со входа ноды")));
      const close = btn({ icon: I.close, size: "sm", tip: T("Закрыть просмотр"), key: "Esc", onclick: () => this.qpClose() });
      const el = this._qp = h("div", { class: "v6-qp", role: "dialog", "aria-label": T("Просмотр: {0}", name) },
        h("header", { class: "v6-qp-h" }, h("b", null, name), h("span", { class: "v6-muted" }, T("Просмотр")), h("i", { class: "v6-grow" }), close),
        h("div", { class: "v6-qp-m" }, media));
      if (this.playing) this.stopPlayback?.();
      $.center.append(el);
      requestAnimationFrame(() => el.classList.add("on"));
      const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.qpClose(); } };
      window.addEventListener("keydown", key, true);
      el._off = () => window.removeEventListener("keydown", key, true);
    },
    qpClose(now = false) {
      const el = this._qp; if (!el) return; this._qp = null; el._off?.();
      for (const m of el.querySelectorAll("video, audio")) { try { m.pause(); } catch {} }
      if (now) { el.remove(); return; }
      el.classList.remove("on"); setTimeout(() => el.remove(), 180);
    },

    toggleDock(v) {
      const L = this.layoutRaw(); L.dc = v === undefined ? !this.root.classList.contains("v6-dock-off") : !v;
      this.layoutSave(L); this.applyLayout(); this.renderDock(); this.renderTimeline(); this.layoutStage(); this.syncDockBtn?.();
    },
  });
}
