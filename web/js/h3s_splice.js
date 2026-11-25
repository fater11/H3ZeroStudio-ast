// Ref Splice — build a new clip out of moves cut from one reference video.
// Left: the source video + how to cut it. Middle: the script. Right: the shot plan and the prompts,
// then the spliced reference video and the AI TV queue. The server does all the work (/h3lab/splice/*).
import { T } from "./h3s_i18n.js";

const CSS_ID = "h3l-splice-css";

export function installSplice(Editor, { C, h, ICON }) {
  const ensureStyle = () => {
    if (document.getElementById(CSS_ID)) return;
    const s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent = `
.h3l-sp{position:absolute;inset:48px 0 0 0;display:flex;flex-direction:column;background:var(--h3l-bg,#131417);color:#e8e8ea;z-index:40}
.h3l-sp-hd{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid #26282e}
.h3l-sp-hd b{font-size:15px}
.h3l-sp-hd .sp{flex:1}
.h3l-sp-body{display:flex;gap:14px;padding:14px;overflow:auto;align-items:flex-start}
.h3l-sp-col{background:#191b20;border:1px solid #26282e;border-radius:10px;padding:12px;min-width:270px}
.h3l-sp-col.wide{flex:1;min-width:380px}
.h3l-sp-col.pre{flex:1;min-width:330px}
.h3l-sp label{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12px;color:#aab3bf;padding:3px 0}
.h3l-sp input,.h3l-sp select,.h3l-sp textarea{background:#23252b;color:#e8e8ea;border:1px solid #34373f;border-radius:6px;padding:4px 6px;max-width:200px}
.h3l-sp textarea{width:100%;max-width:none;min-height:190px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.45}
.h3l-sp select[multiple]{min-height:64px;max-width:none;width:100%}
.h3l-sp button{background:#23252b;color:#e8e8ea;border:1px solid #34373f;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px;margin:3px 3px 0 0}
.h3l-sp button.pri{background:#3b5bdb;border-color:#3b5bdb}
.h3l-sp table{width:100%;border-collapse:collapse;font-size:12px}
.h3l-sp td,.h3l-sp th{padding:3px 5px;border-bottom:1px solid #23252b;text-align:left}
.h3l-sp tr.on{background:#2b2f3a;cursor:pointer}
.h3l-sp tbody tr{cursor:pointer}
.h3l-sp .ok{color:#63d471}.h3l-sp .wait{color:#d4b463}.h3l-sp .err{color:#e2725b}
.h3l-sp .rep{font-size:12px;color:#aab3bf;margin-top:8px;white-space:pre-wrap;max-height:120px;overflow:auto}
.h3l-sp pre{background:#23252b;border:1px solid #34373f;border-radius:6px;padding:8px;font-size:11px;line-height:1.4;white-space:pre-wrap;max-height:280px;overflow:auto;margin:6px 0 0}
.h3l-sp video{width:100%;max-width:520px;border-radius:8px;background:#000;margin-top:8px}
.h3l-sp .hint{font-size:11px;color:#8b95a2;line-height:1.5;margin-top:8px;white-space:pre-wrap}`;
    document.head.appendChild(s);
  };

  const field = (label, node) => h("label", null, h("span", null, label), node);
  const input = (value, oninput, type = "text") => h("input", { type, value: value ?? "", oninput: (e) => oninput(e.target.value) });
  const num = (value, oninput) => input(value, oninput, "number");
  const area = (value, oninput) => h("textarea", { value: value ?? "", oninput: (e) => oninput(e.target.value) });

  Object.assign(Editor.prototype, {
    openSplice() {
      if (!this.root) return;
      ensureStyle();
      this.$.setWin?.remove(); this.$.setWin = null;
      this.helpHide?.(); this.galClose?.();
      this.tvClose?.();
      this.$.splice?.remove();
      const page = h("div", { class: "h3l-sp" });
      this.$.splice = page;
      this.root.append(page);
      const vids = ((this.p && this.p.assets) || []).filter((a) => a.category === "video");
      this.spState = {
        asset: vids.length ? vids[0].id : "", path: "", name: "splice", side: 736, minClip: 1.5, maxClips: 8,
        charIds: [], brand: "", brands: [], script: "", plan: null, shot: 0, report: "", ref: "", tokens: 0,
        budget: 0, prompt: "",
      };
      this.spRender();
      this.spLoad();
      return page;
    },

    spClose() { this.$.splice?.remove(); this.$.splice = null; },

    async spLoad() {
      try {
        const d = await this.host.get("/h3lab/tv/state");
        this.spState.brands = d.brands || [];
        this.spState.brand = this.spState.brand || (this.spState.brands[0] || {}).id || "";
      } catch (e) { this.spState.report = String(e.message || e); }
      this.spRender();
    },

    // the source video: a project asset (resolved server-side) or a path typed by hand
    spSource() {
      const st = this.spState;
      if (st.path) return { video: st.path };
      const a = ((this.p && this.p.assets) || []).find((x) => x.id === st.asset);
      return a ? { asset: { file: a.file, subfolder: a.subfolder, type: a.type || "input", name: a.name } } : {};
    },

    // pictures picked as characters travel as asset descriptors: the server resolves the real path
    spBody(extra = {}) {
      const st = this.spState;
      const chars = (((this.p && this.p.assets) || []).filter((a) => st.charIds.includes(a.id))
        .map((a) => ({ file: a.file, subfolder: a.subfolder, type: a.type || "input", name: a.name })));
      return { ...this.spSource(), ...extra, name: st.name, side: st.side, char_assets: chars };
    },

    spRender() {
      const page = this.$.splice;
      if (!page) return;
      const st = this.spState;
      page.innerHTML = "";
      const head = h("div", { class: "h3l-sp-hd" }, h("b", null, T("Сборка из движений")), h("span", { class: "sp" }),
        h("span", { class: st.report ? "rep" : "" }, st.report || ""),
        h("button", { onclick: () => this.spClose() }, T("Закрыть")));
      const body = h("div", { class: "h3l-sp-body" });

      // ---- source + cutting
      const vids = ((this.p && this.p.assets) || []).filter((a) => a.category === "video");
      const srcSelect = h("select", { onchange: (e) => { st.asset = e.target.value; st.path = ""; this.spRender(); } },
        ...(vids.length ? vids.map((a) => h("option", { value: a.id, selected: st.asset === a.id }, a.name || a.file))
          : [h("option", { value: "" }, T("В проекте нет видео"))]));
      const pics = ((this.p && this.p.assets) || []).filter((a) => a.category !== "video" && a.category !== "audio");
      const srcCol = h("div", { class: "h3l-sp-col" },
        h("b", null, T("Источник")),
        field(T("Видео проекта"), srcSelect),
        field(T("Свой путь"), input(st.path, (v) => { st.path = v; })),
        field(T("Имя сборки"), input(st.name, (v) => { st.name = v; })),
        field(T("Короткая сторона референса"), num(st.side, (v) => { st.side = Number(v) || 736; })),
        field(T("Мин. длина движения, с"), num(st.minClip, (v) => { st.minClip = Number(v) || 1.5; })),
        field(T("Максимум движений"), num(st.maxClips, (v) => { st.maxClips = Number(v) || 8; })),
        field(T("Персонажи"), h("select", { multiple: true, onchange: (e) => { st.charIds = [...e.target.selectedOptions].map((o) => o.value); } },
          ...pics.map((a) => h("option", { value: a.id, selected: st.charIds.includes(a.id) }, a.name || a.file)))),
        h("div", null,
          h("button", { class: "pri", onclick: () => this.spDraft() }, T("Черновик")),
          h("button", { onclick: () => this.spPlan() }, T("План шотов")),
          h("button", { onclick: () => this.spRenderRef() }, T("Склеить референс"))),
        h("div", { class: "hint" }, T("Синтаксис: «движение 4.0-6.0» — кадры из исходника как есть; «переход 1.5: слова» — шот, который модель играет сама; «переход 1» — короткое растворение")));

      // ---- script
      const scriptCol = h("div", { class: "h3l-sp-col wide" },
        h("b", null, T("Сценарий")),
        area(st.script, (v) => { st.script = v; }),
        h("div", null,
          h("button", { onclick: () => this.spPlan() }, T("Перечитать")),
          h("button", { onclick: () => this.spRenderRef() }, T("Склеить и спланировать")),
          h("button", { onclick: () => this.spToOrder(false) }, T("В очередь AI TV")),
          h("button", { class: "pri", onclick: () => this.spToOrder(true) }, T("В очередь и запустить"))),
        field(T("Бренд для очереди"), h("select", { onchange: (e) => { st.brand = e.target.value; } },
          ...(st.brands.length ? st.brands.map((b) => h("option", { value: b.id, selected: st.brand === b.id }, b.name || b.id))
            : [h("option", { value: "" }, T("Нет брендов — создайте в AI TV"))]))),
        h("div", { class: "hint" }, T("Путь к каждому шоту идёт от бренда: модель, энкодер, VAE, шаги. Очередь — обычные задания пака.")));

      // ---- shots
      const plan = st.plan;
      const rows = [];
      (plan ? plan.segments : []).forEach((seg, i) => {
        const over = st.budget && seg.tokens > st.budget;
        rows.push(h("tr", { class: i === st.shot ? "on" : "", onclick: () => { st.shot = i; this.spRender(); } },
          h("td", null, String(i + 1)), h("td", null, seg.kind === "video" ? T("движение") : T("переход")),
          h("td", null, `${seg.frames}`), h("td", null, `${seg.overlap || 0}`),
          h("td", { class: over ? "err" : "" }, `${Math.round(seg.tokens / 1000)}k`),
          h("td", null, seg.frames >= 124 && seg.frames <= 362 ? "" : T("вне диапазона"))));
      });
      const sel = plan ? plan.segments[st.shot] : null;
      const shotCol = h("div", { class: "h3l-sp-col pre" },
        h("b", null, T("Шоты")),
        plan ? h("table", null, h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, T("Тип")),
          h("th", null, T("Кадры")), h("th", null, T("Перекрытие")), h("th", null, T("Токены")), h("th", null, ""))),
          h("tbody", null, ...rows)) : h("div", { class: "rep" }, T("Плана пока нет")),
        plan ? h("div", { class: "rep" }, T("Шотов: {0} · кадров: {1} · бюджет: {2}k токенов",
          plan.shots, plan.frames, Math.round((plan.budget || 0) / 1000))) : h("span", null, ""),
        sel ? h("div", null,
          h("div", { class: "rep" }, `${T("Промпт шота {0}", st.shot + 1)}${sel.src_start ? ` · ${T("с {0} с склейки", (sel.src_start / 24).toFixed(2))}` : ""}`),
          h("pre", null, sel.prompt),
          h("button", { onclick: () => this.spCopy(sel.prompt) }, T("Копировать промпт"))) : h("span", null, ""),
        st.ref ? h("div", null, h("div", { class: "rep" }, T("Склеенный референс")),
          h("video", { src: this.host.url(st.ref), controls: true, preload: "metadata" })) : h("span", null, ""));

      body.append(srcCol, scriptCol, shotCol);
      page.append(head, body);
    },

    spCopy(text) {
      try {
        navigator.clipboard?.writeText(String(text || ""));
        this.toast(T("Промпт скопирован"));
      } catch (e) { this.toast(String(e.message || e), true); }
    },

    async spDraft() {
      const st = this.spState;
      try {
        this.spBusy(T("Читаю видео…"));
        const d = await this.host.call("/h3lab/splice/draft", this.spBody({ min_clip: st.minClip, max_clips: st.maxClips }));
        st.script = d.script || ""; st.report = T("Черновик готов — правьте времена и допишите слова в переходах");
      } catch (e) { st.report = String(e.message || e); }
      this.spRender();
    },

    async spPlan() {
      const st = this.spState;
      try {
        this.spBusy(T("Считаю план…"));
        const d = await this.host.call("/h3lab/splice/plan", this.spBody({ script: st.script }));
        st.plan = d.plan; st.budget = d.plan.budget; st.shot = Math.min(st.shot, (d.plan.segments || []).length - 1);
        st.script = st.script || "";
        st.report = T("Шотов: {0}", (d.plan.segments || []).length);
      } catch (e) { st.report = String(e.message || e); }
      this.spRender();
    },

    async spRenderRef() {
      const st = this.spState;
      if (!st.script) { st.report = T("Сначала сделайте черновик или напишите сценарий"); this.spRender(); return; }
      try {
        this.spBusy(T("Склеиваю референс…"));
        const d = await this.host.call("/h3lab/splice/render", this.spBody({ script: st.script }));
        st.ref = (d.reference || {}).path || ""; st.plan = d.plan; st.budget = d.plan.budget;
        st.report = T("Готово: {0} кадров, {1} с", (d.reference || {}).frames, (d.reference || {}).duration);
      } catch (e) { st.report = String(e.message || e); }
      this.spRender();
    },

    async spToOrder(run) {
      const st = this.spState;
      if (!st.brand) { st.report = T("Выберите бренд AI TV"); this.spRender(); return; }
      try {
        this.spBusy(T("Создаю заказ…"));
        const d = await this.host.call("/h3lab/splice/to_order", this.spBody({ script: st.script, brand: st.brand }));
        st.plan = d.plan;
        let text = T("Заказ {0} создан", d.order.id);
        if (run) {
          const r = await this.host.call("/h3lab/tv/order/run", { id: d.order.id });
          text += " · " + T("в очереди: {0}", (r.queued || []).length);
          if ((r.errors || []).length) text += " · " + T("ошибок: {0}", r.errors.length);
        }
        st.report = text;
      } catch (e) { st.report = String(e.message || e); }
      this.spRender();
    },

    spBusy(text) { this.spState.report = text; if (this.$.splice) this.spRender(); },
  });
}
