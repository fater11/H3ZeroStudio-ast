// AI TV Studio — the production screen (brands, scripted orders, batch scenes, overlays, playlists).
// It orchestrates ordinary H3ZeroStudio projects: every scene is a normal project the pack already
// knows how to render, cache, upscale and rate.
import { T } from "./h3s_i18n.js";

const CSS_ID = "h3l-tv-css";

export function installTvStudio(Editor, { C, h, ICON }) {
  const ensureStyle = () => {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent = `
.h3l-tv{position:absolute;inset:48px 0 0 0;display:flex;flex-direction:column;background:var(--h3l-bg,#131417);color:#e8e8ea;z-index:40}
.h3l-tv-hd{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid #26282e}
.h3l-tv-hd b{font-size:15px}
.h3l-tv-hd .sp{flex:1}
.h3l-tv-body{display:flex;gap:14px;padding:14px;overflow:auto}
.h3l-tv-col{background:#191b20;border:1px solid #26282e;border-radius:10px;padding:12px;min-width:280px}
.h3l-tv-col.wide{flex:1;min-width:420px}
.h3l-tv label{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12px;color:#aab3bf;padding:3px 0}
.h3l-tv input,.h3l-tv select{background:#23252b;color:#e8e8ea;border:1px solid #34373f;border-radius:6px;padding:4px 6px;max-width:190px}
.h3l-tv button{background:#23252b;color:#e8e8ea;border:1px solid #34373f;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px}
.h3l-tv button.pri{background:#3b5bdb;border-color:#3b5bdb}
.h3l-tv .list{max-height:220px;overflow:auto;margin-bottom:8px}
.h3l-tv .item{padding:5px 7px;border-radius:6px;cursor:pointer;font-size:12px}
.h3l-tv .item.on{background:#2b2f3a}
.h3l-tv table{width:100%;border-collapse:collapse;font-size:12px}
.h3l-tv td,.h3l-tv th{padding:3px 5px;border-bottom:1px solid #23252b;text-align:left}
.h3l-tv .ok{color:#63d471}.h3l-tv .wait{color:#d4b463}.h3l-tv .err{color:#e2725b}
.h3l-tv .rep{font-size:12px;color:#aab3bf;margin-top:8px;white-space:pre-wrap}`;
    document.head.appendChild(s);
  };

  const field = (label, node) => h("label", null, h("span", null, label), node);
  const input = (value, oninput, type = "text") => h("input", { type, value: value ?? "", oninput: (e) => oninput(e.target.value) });
  const num = (value, oninput) => input(value, oninput, "number");

  Object.assign(Editor.prototype, {
    openTvStudio() {
      if (!this.root) return;
      ensureStyle();
      this.$.setWin?.remove(); this.$.setWin = null;
      this.helpHide?.(); this.galClose?.();
      if (this.$.tv) { this.$.tv.remove(); }
      const page = h("div", { class: "h3l-tv" });
      this.$.tv = page;
      this.root.append(page);
      this.tvState = { brands: [], orders: [], current: null, draft: null, order: null, status: null, report: "" };
      this.tvRender();
      this.tvLoad();
      return page;
    },

    tvClose() { this.$.tv?.remove(); this.$.tv = null; },

    async tvLoad() {
      try {
        const d = await this.host.get("/h3lab/tv/state");
        this.tvState.brands = d.brands || [];
        this.tvState.orders = d.orders || [];
        this.tvState.trained = d.trained || [];
        if (!this.tvState.draft) this.tvState.draft = { ...(this.tvState.brands[0] || {}) };
      } catch (e) { this.tvState.report = String(e.message || e); }
      this.tvRender();
    },

    tvRender() {
      const page = this.$.tv;
      if (!page) return;
      const st = this.tvState;
      page.innerHTML = "";
      const head = h("div", { class: "h3l-tv-hd" }, h("b", null, T("AI TV Studio")), h("span", { class: "sp" }),
        h("button", { onclick: () => this.tvClose() }, T("Закрыть")));
      const body = h("div", { class: "h3l-tv-body" });

      // ---- brands
      const brandList = h("div", { class: "list" }, ...(st.brands.length ? st.brands : [{ name: T("Без имени"), id: "" }])
        .map((b) => h("div", { class: "item" + (st.draft && b.id === st.draft.id ? " on" : ""), onclick: () => { st.draft = { ...b }; this.tvRender(); } }, b.name || b.id)));
      const d = st.draft || {};
      const set = (k) => (v) => { d[k] = v; };
      const brandCol = h("div", { class: "h3l-tv-col" },
        h("b", null, T("Бренды")), brandList,
        h("button", { onclick: () => { st.draft = { name: "", accent: "#3b5bdb", logo_pos: "br" }; this.tvRender(); } }, T("Новый бренд")),
        h("div", null,
          field(T("Название бренда"), input(d.name, set("name"))),
          field(T("Акцент"), input(d.accent, set("accent"))),
          field(T("Логотип (файл)"), input(d.logo, set("logo"))),
          field(T("Положение логотипа"), h("select", { onchange: (e) => set("logo_pos")(e.target.value) },
            ...["tl", "tr", "bl", "br"].map((p) => h("option", { value: p, selected: d.logo_pos === p }, p)))),
          field(T("Отступ логотипа"), num(d.logo_margin ?? 32, set("logo_margin"))),
          field(T("Прозрачность логотипа"), num(d.logo_opacity ?? 0.9, set("logo_opacity"))),
          field(T("Текст CTA"), input(d.cta_text, set("cta_text"))),
          field(T("Стиль-префикс промпта"), input(d.style_prefix, set("style_prefix"))),
          field(T("Длина рекламной вставки, с"), num(d.cta_seconds ?? 6, set("cta_seconds"))),
          field(T("Экспорт без звука"), h("input", { type: "checkbox", checked: !!((d.render || {}).no_audio), onchange: (e) => { d.render = { ...(d.render || {}), no_audio: e.target.checked }; } }))),
          field(T("Модель"), input((d.render || {}).model, (v) => { d.render = { ...(d.render || {}), model: v }; })),
          field(T("Энкодер"), input((d.render || {}).clip, (v) => { d.render = { ...(d.render || {}), clip: v }; })),
          field(T("VAE"), input((d.render || {}).vae, (v) => { d.render = { ...(d.render || {}), vae: v }; })),
          field(T("Шаги"), num((d.render || {}).steps ?? 8, (v) => { d.render = { ...(d.render || {}), steps: v }; })),
          field(T("pi-H3 шаги"), num((d.render || {}).piflow_steps ?? 0, (v) => { d.render = { ...(d.render || {}), piflow_steps: v }; })),
          field(T("Размер"), h("span", null,
            num((d.render || {}).width ?? 1344, (v) => { d.render = { ...(d.render || {}), width: v }; }), " × ",
            num((d.render || {}).height ?? 768, (v) => { d.render = { ...(d.render || {}), height: v }; }))),
        h("button", { class: "pri", onclick: () => this.tvSaveBrand() }, T("Сохранить бренд")),
        h("button", { onclick: () => this.tvDeleteBrand() }, T("Удалить бренд")));

      // ---- orders
      const ord = st.orderDraft || (st.orderDraft = { name: "", brand: (st.brands[0] || {}).id, minutes: 3, pace: "medium" });
      const orderList = h("div", { class: "list" }, ...st.orders.map((o) => h("div", { class: "item" + (st.current === o.id ? " on" : ""), onclick: () => this.tvOpenOrder(o.id) },
        `${o.name || o.id} · ${o.minutes}${T(" мин")} · ${(o.scenes || []).length} ${T("сцен")}`)));
      const orderCol = h("div", { class: "h3l-tv-col" },
        h("b", null, T("Заказы")), orderList,
        field(T("Имя заказа"), input(ord.name, (v) => { ord.name = v; })),
        field(T("Бренд"), h("select", { onchange: (e) => { ord.brand = e.target.value; } },
          ...st.brands.map((b) => h("option", { value: b.id, selected: ord.brand === b.id }, b.name)))),
        field(T("Минут"), h("select", { onchange: (e) => { ord.minutes = Number(e.target.value); } },
          ...[3, 5, 10].map((m) => h("option", { value: m, selected: Number(ord.minutes) === m }, String(m))))),
        field(T("Темп"), h("select", { onchange: (e) => { ord.pace = e.target.value; } },
          ...["calm", "medium", "fast"].map((p) => h("option", { value: p, selected: ord.pace === p }, p)))),
        h("button", { class: "pri", onclick: () => this.tvCreateOrder() }, T("Создать заказ")),
        h("div", { class: "rep" }, st.report || ""));

      // ---- scenes of the opened order
      const o = st.order, s = st.status;
      const rows = [];
      if (o) {
        (o.scenes || []).forEach((sc, i) => {
          const row = (s && s.scenes[i]) || {};
          rows.push(h("tr", null, h("td", null, String(i + 1)), h("td", null, sc.kind),
            h("td", null, `${sc.seconds}${T(" с")}`), h("td", null, `${sc.frames} ${T("кадр.")}`),
            h("td", { class: row.ready ? "ok" : (sc.error ? "err" : "wait") },
              row.ready ? T("Готово") : (sc.error ? T("Ошибка") : T("В очереди")))));
        });
      }
      const scenesCol = h("div", { class: "h3l-tv-col wide" },
        h("b", null, T("Сцены")),
        o ? h("table", null, h("tr", null, h("th", null, "#"), h("th", null, T("Тип")), h("th", null, T("Длительность")),
          h("th", null, T("Кадры")), h("th", null, T("Статус"))), ...rows) : h("div", { class: "rep" }, T("Заказ не открыт")),
        h("div", null,
          h("button", { class: "pri", onclick: () => this.tvRunOrder() }, T("Запустить очередь")),
          h("button", { onclick: () => this.tvOpenOrder(o && o.id) }, T("Обновить статус")),
          h("button", { onclick: () => this.tvDupes() }, T("Проверить повторы")),
          h("button", { onclick: () => this.tvOverlay() }, T("Наложить логотип и текст")),
          h("button", { onclick: () => this.tvLoop() }, T("Сделать цикл")),
          h("button", { onclick: () => this.tvPlaylist() }, T("Собрать плейлист"))),
        h("div", { class: "rep" }, st.dupes || ""));

      body.append(brandCol, orderCol, scenesCol);
      page.append(head, body);
    },

    async tvSaveBrand() {
      try {
        const b = await this.host.call("/h3lab/tv/brand/save", { brand: this.tvState.draft });
        this.tvState.draft = b; this.tvState.report = ""; await this.tvLoad();
      } catch (e) { this.tvState.report = String(e.message || e); this.tvRender(); }
    },

    async tvDeleteBrand() {
      const id = (this.tvState.draft || {}).id;
      if (!id) return;
      try { await this.host.call("/h3lab/tv/brand/delete", { id }); this.tvState.draft = null; await this.tvLoad(); }
      catch (e) { this.tvState.report = String(e.message || e); this.tvRender(); }
    },

    async tvCreateOrder() {
      const o = this.tvState.orderDraft || {};
      try {
        const made = await this.host.call("/h3lab/tv/order/create", { name: o.name || "order", brand: o.brand, minutes: o.minutes, pace: o.pace });
        this.tvState.orders.push(made); this.tvState.current = made.id; await this.tvOpenOrder(made.id);
      } catch (e) { this.tvState.report = String(e.message || e); this.tvRender(); }
    },

    async tvOpenOrder(id) {
      if (!id) return;
      try {
        const d = await this.host.get("/h3lab/tv/order", { id });
        this.tvState.order = d.order; this.tvState.status = d.status; this.tvState.current = id;
      } catch (e) { this.tvState.report = String(e.message || e); }
      this.tvRender();
    },

    async tvRunOrder() {
      const id = (this.tvState.order || {}).id;
      if (!id) return;
      try { const r = await this.host.call("/h3lab/tv/order/run", { id }); this.tvState.report = `${T("В очереди:")} ${(r.queued || []).length}`; }
      catch (e) { this.tvState.report = String(e.message || e); }
      await this.tvOpenOrder(id);
    },

    async tvDupes() {
      const id = (this.tvState.order || {}).id;
      if (!id) return;
      try {
        const r = await this.host.call("/h3lab/tv/order/dupes", { id });
        this.tvState.dupes = r.groups.length
          ? T("Похожие сцены:") + " " + r.groups.map((g) => g.files.map((f) => f.split(/[\\/]/).pop()).join(" ≈ ")).join("; ")
          : T("Повторов не найдено") + ` (${r.checked})`;
      } catch (e) { this.tvState.dupes = String(e.message || e); }
      this.tvRender();
    },

    async tvOverlay() {
      const st = this.tvState, o = st.order;
      const files = ((st.status || {}).scenes || []).map((x) => x.file).filter(Boolean);
      if (!o || !files.length) { st.dupes = T("Нет готовых сцен"); this.tvRender(); return; }
      const brand = st.brands.find((b) => b.id === o.brand) || {};
      try {
        const r = await this.host.call("/h3lab/tv/overlay", { video: files[0], brand, logo: brand.logo || "", out: o.id + "-overlay" });
        st.dupes = T("Готово:") + " " + r.file;
      } catch (e) { st.dupes = String(e.message || e); }
      this.tvRender();
    },

    async tvLoop() {
      const st = this.tvState;
      const files = ((st.status || {}).scenes || []).map((x) => x.file).filter(Boolean);
      if (!files.length) { st.dupes = T("Нет готовых сцен"); this.tvRender(); return; }
      try { const r = await this.host.call("/h3lab/tv/loop", { video: files[0], out: (st.order || {}).id + "-loop" }); st.dupes = T("Готово:") + " " + r.file; }
      catch (e) { st.dupes = String(e.message || e); }
      this.tvRender();
    },

    async tvPlaylist() {
      const st = this.tvState;
      if (!st.order) return;
      try { const r = await this.host.call("/h3lab/tv/playlist", { id: st.order.id, out: st.order.id + "-playlist" }); st.dupes = `${T("Готово:")} ${r.file} (${r.clips})`; }
      catch (e) { st.dupes = String(e.message || e); }
      this.tvRender();
    },
  });
}
