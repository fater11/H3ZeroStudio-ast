// Series — one idea plus a running time becomes a chain of connected segments with written prompts.
// The split (frames, overlap, token budget) is computed on the server (/h3lab/series/*); the prompts come
// from the assistant model when it is configured, and from the template writer when it is not.
import { T } from "./h3s_i18n.js";

const CSS_ID = "h3l-series-css";

export function installSeries(Editor, { C, h, ICON }) {
  const ensureStyle = () => {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent = `
.h3l-sr{position:absolute;inset:48px 0 0 0;display:flex;flex-direction:column;background:var(--h3l-bg,#131417);color:#e8e8ea;z-index:40}
.h3l-sr-hd{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid #26282e}
.h3l-sr-hd b{font-size:15px}
.h3l-sr-hd .sp{flex:1}
.h3l-sr-body{display:flex;gap:14px;padding:14px;overflow:auto;align-items:flex-start}
.h3l-sr-col{background:#191b20;border:1px solid #26282e;border-radius:10px;padding:12px;min-width:300px}
.h3l-sr-col.wide{flex:1;min-width:380px}
.h3l-sr label{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12px;color:#aab3bf;padding:3px 0}
.h3l-sr input,.h3l-sr select,.h3l-sr textarea{background:#23252b;color:#e8e8ea;border:1px solid #34373f;border-radius:6px;padding:4px 6px;max-width:170px}
.h3l-sr textarea{width:100%;max-width:none;min-height:90px;font-size:12px;line-height:1.45}
.h3l-sr button{background:#23252b;color:#e8e8ea;border:1px solid #34373f;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px;margin:3px 3px 0 0}
.h3l-sr button.pri{background:#3b5bdb;border-color:#3b5bdb}
.h3l-sr table{width:100%;border-collapse:collapse;font-size:12px}
.h3l-sr td,.h3l-sr th{padding:3px 5px;border-bottom:1px solid #23252b;text-align:left}
.h3l-sr tbody tr{cursor:pointer}
.h3l-sr tr.on{background:#2b2f3a}
.h3l-sr .err{color:#e2725b}.h3l-sr .ok{color:#63d471}
.h3l-sr .rep{font-size:12px;color:#aab3bf;margin-top:8px;white-space:pre-wrap;max-height:110px;overflow:auto}
.h3l-sr pre{background:#23252b;border:1px solid #34373f;border-radius:6px;padding:8px;font-size:11px;line-height:1.4;white-space:pre-wrap;max-height:460px;overflow:auto;margin:6px 0 0}`;
    document.head.appendChild(s);
  };

  const field = (label, node) => h("label", null, h("span", null, label), node);
  const input = (value, oninput, type = "text") => h("input", { type, value: value ?? "", oninput: (e) => oninput(e.target.value) });
  const num = (value, oninput) => input(value, oninput, "number");
  const area = (value, oninput) => h("textarea", { value: value ?? "", oninput: (e) => oninput(e.target.value) });

  Object.assign(Editor.prototype, {
    openSeries() {
      if (!this.root) return;
      ensureStyle();
      this.$.setWin?.remove(); this.$.setWin = null;
      this.helpHide?.(); this.galClose?.(); this.tvClose?.(); this.spClose?.();
      this.$.series?.remove();
      const page = h("div", { class: "h3l-sr" });
      this.$.series = page;
      this.root.append(page);
      const [w, hh] = C.resolution(this.p.settings);
      this.srState = { idea: "", seconds: 30, width: w, height: hh, beats: 0, overlap: 1, refs: 0,
                       style: "", sound: "", extra: "", useLlm: true, plan: null, written: null, shot: 0,
                       report: "", project: null };
      this.srRender();
      return page;
    },

    srClose() { this.$.series?.remove(); this.$.series = null; },

    srRender() {
      const page = this.$.series;
      if (!page) return;
      const st = this.srState;
      page.innerHTML = "";
      const head = h("div", { class: "h3l-sr-hd" }, h("b", null, T("Серия из одной идеи")), h("span", { class: "sp" }),
        h("button", { onclick: () => this.srClose() }, T("Закрыть")));
      const body = h("div", { class: "h3l-sr-body" });

      const plan = st.plan;
      const ideaCol = h("div", { class: "h3l-sr-col" },
        h("b", null, T("Идея")),
        area(st.idea, (v) => { st.idea = v; }),
        field(T("Длительность, с"), num(st.seconds, (v) => { st.seconds = Number(v) || 30; })),
        field(T("Ширина"), num(st.width, (v) => { st.width = Number(v) || 1344; })),
        field(T("Высота"), num(st.height, (v) => { st.height = Number(v) || 768; })),
        field(T("Отрезков (0 — авто)"), num(st.beats, (v) => { st.beats = Number(v) || 0; })),
        field(T("Перекрытие, блоков"), num(st.overlap, (v) => { st.overlap = Number(v) || 0; })),
        field(T("Референсов"), num(st.refs, (v) => { st.refs = Number(v) || 0; })),
        field(T("Стиль"), input(st.style, (v) => { st.style = v; })),
        field(T("Звук сцены"), input(st.sound, (v) => { st.sound = v; })),
        field(T("Дополнительно"), input(st.extra, (v) => { st.extra = v; })),
        field(T("Писать промты моделью"), h("input", { type: "checkbox", checked: st.useLlm, onchange: (e) => { st.useLlm = e.target.checked; } })),
        h("div", null,
          h("button", { class: "pri", onclick: () => this.srPlan() }, T("План отрезков")),
          h("button", { onclick: () => this.srWrite() }, T("Написать промты"))),
        h("div", { class: "rep" }, plan ? T("Отрезков: {0} · всего {1} с · бюджет {2}k токенов", plan.beats.length, plan.seconds.toFixed(1), Math.round(plan.budget / 1000)) : T("Плана пока нет")),
        h("div", { class: "rep" }, st.report || ""));

      const rows = [];
      (plan ? plan.beats : []).forEach((b, i) => {
        rows.push(h("tr", { class: i === st.shot ? "on" : "", onclick: () => { st.shot = i; this.srRender(); } },
          h("td", null, String(i + 1)), h("td", null, b.role || ""),
          h("td", null, b.seconds.toFixed(1)), h("td", null, `${b.frames}`),
          h("td", null, `${b.overlap_blocks || 0}`),
          h("td", null, `${Math.round(b.tokens / 1000)}k`),
          h("td", { class: b.tokens > plan.budget ? "err" : "ok" }, b.link === "extend" ? T("продолжение") : T("стык"))));
      });
      const seg = st.written ? st.written.segments[st.shot] : null;
      const promptCol = h("div", { class: "h3l-sr-col wide" },
        h("b", null, T("Отрезки и промты")),
        plan ? h("table", null, h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, T("Роль")),
          h("th", null, T("Секунды")), h("th", null, T("Кадры")), h("th", null, T("Перекрытие")),
          h("th", null, T("Токены")), h("th", null, T("Связь")))), h("tbody", null, ...rows))
          : h("div", { class: "rep" }, T("Нажмите «План отрезков»")),
        h("div", null,
          h("button", { onclick: () => this.srProject(false) }, T("Создать проект")),
          h("button", { class: "pri", onclick: () => this.srProject(true) }, T("Создать и сохранить"))),
        plan && st.written ? h("div", null,
          h("div", { class: "rep" }, `${st.written.title || ""} ${st.written.logline ? "· " + st.written.logline : ""}`
            + ` · ${T("писатель: {0}", st.written.error ? T("шаблон (модель не ответила)") : (st.used === "llm" ? T("модель") : T("шаблон")))}`),
          h("pre", null, (seg || {}).prompt || ""),
          h("button", { onclick: () => this.srCopy((seg || {}).prompt) }, T("Копировать промпт")))
          : h("span", null, ""));

      body.append(ideaCol, promptCol);
      page.append(head, body);
    },

    srCopy(text) {
      try { navigator.clipboard?.writeText(String(text || "")); this.toast(T("Промпт скопирован")); }
      catch (e) { this.toast(String(e.message || e), true); }
    },

    srPayload() {
      const st = this.srState;
      return { idea: st.idea, seconds: st.seconds, width: st.width, height: st.height,
               beats: st.beats || undefined, overlap_blocks: st.overlap, ref_images: st.refs };
    },

    async srPlan() {
      const st = this.srState;
      try {
        st.report = T("Считаю план…"); this.srRender();
        st.plan = await this.host.call("/h3lab/series/plan", this.srPayload());
        st.written = null; st.shot = Math.min(st.shot, st.plan.beats.length - 1);
        st.report = st.plan.over_budget.length ? T("Есть отрезки сверх бюджета: {0}", st.plan.over_budget.join(", ")) : "";
      } catch (e) { st.report = String(e.message || e); }
      this.srRender();
    },

    async srWrite() {
      const st = this.srState, cfg = (this.p.assistant || {}).cfg || {};
      if (!st.plan) await this.srPlan();
      if (!st.plan) return;
      try {
        st.report = T("Пишу промты…"); this.srRender();
        const d = await this.host.call("/h3lab/series/write", { plan: st.plan, idea: st.idea, style: st.style,
          sound: st.sound, extra: st.extra, use_llm: st.useLlm, allow_fallback: true,
          api_base: cfg.api_base, api_key: cfg.api_key, api_model: cfg.api_model,
          temperature: cfg.temperature, max_tokens: cfg.max_tokens });
        st.written = d.written; st.used = d.used;
        st.report = d.used === "llm" ? T("Промты написаны моделью") : T("Промты собраны шаблоном")
          + (d.error ? ` · ${d.error}` : "");
        st.project = null;
      } catch (e) { st.report = String(e.message || e); }
      this.srRender();
    },

    async srProject(save) {
      const st = this.srState;
      if (!st.plan) { st.report = T("Сначала посчитайте план"); this.srRender(); return; }
      try {
        st.report = T("Собираю проект…"); this.srRender();
        const d = await this.host.call("/h3lab/series/project", { plan: st.plan, written: st.written || {},
          settings: this.p.settings, name: (st.idea || "").slice(0, 60) || undefined, save: !!save });
        st.project = d.project;
        st.report = save ? T("Проект сохранён: {0}", d.saved.id) : T("Проект создан (не сохранён)");
      } catch (e) { st.report = String(e.message || e); }
      this.srRender();
    },
  });
}
