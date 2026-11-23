// H3ZeroStudio Lab v6 — Settings window (macOS System Settings): sidebar with icons + search, grouped inset form.
// «Основные», «Внешний вид», «Клавиши», «Справка», «О программе» are native; the generation sections reuse the
// engine's settings blocks (same keys, same save path), restyled into groups.
import { monogram } from "./logo.js";
import { T, langSetting, setLangSetting } from "../h3s_i18n.js";
import { HELP } from "../h3s_help.js";
import { UI_SCALES, uiScaleSetting } from "../h3s_ui_scale.js";
import { I, btn, seg, sw, group, row, modal, setTip, kbd, empty } from "./kit.js";
import { SCHEMES, schemeSetting, applyScheme, motionReduced, setMotionReduced } from "./css.js";
import { workspaceMode } from "../h3s_workspace.js";

const SECTIONS = () => [
  ["general", I.gear, T("Основные")],
  ["appearance", I.palette, T("Внешний вид")],
  "sep",
  ["generation", I.sliders, T("Генерация")],
  ["upscale", I.up, T("Апскейл")],
  ["ext", I.sound, T("Продление и звук")],
  ["preview", I.eye, T("Превью и кэш")],
  "sep",
  ["models", I.cube, T("Модели и LoRA")],
  ["downloads", I.download, T("Загрузка моделей")],
  ["assistant", I.assist, T("Ассистент")],
  "sep",
  ["keys", I.key, T("Клавиши")],
  ["help", I.help, T("Справка")],
  ["about", I.info, T("О программе")],
];
const OLD_TAB = { generation: "gen", upscale: "up", ext: "ext", preview: "prev", downloads: "dl" };

export function installPrefs(Studio, { C, h }) {
  Object.assign(Studio.prototype, {
    prefsSectionOf(title) {
      const t = String(title || "");
      if (/апскейл|upscale/i.test(t)) return "upscale";
      if (/продлен|звук|sound|extend/i.test(t)) return "ext";
      if (/превью|кэш|preview|cache/i.test(t)) return "preview";
      if (/загрузк|download/i.test(t)) return "downloads";
      if (/hires|независим|basic.?scheduler|рефайн|refine/i.test(t)) return "generation";
      if (/генерац|этап|ускорен|компонент|generat|stage/i.test(t)) return "generation";
      return "general";
    },
    openPrefs(section = null) {
      section = section || this._prefsLast || "general";
      if (this._prefs) { this.prefsGo(section); return; }
      this._prefsTool = this.tool;
      const side = h("nav", { class: "v6-pside" });
      const title = h("h1", { class: "v6-ptitle" });
      const body = h("div", { class: "v6-pbody" });
      const win = h("div", { class: "v6-prefs-in" }, side, h("div", { class: "v6-pmain" }, h("header", { class: "v6-phead" }, title, h("i", { class: "v6-grow" }),
        btn({ icon: I.close, tip: T("Закрыть"), key: "Esc", onclick: () => this.prefsClose() })), body));
      const m = modal(this.root, win, { cls: "v6-prefs", label: T("Настройки"), onClose: () => this.prefsClose(true) });
      this._prefs = { m, side, title, body, sec: section, q: "" };
      this.prefsSide();
      this.prefsGo(section);
    },
    prefsClose(fromModal = false) {
      const P = this._prefs; if (!P) return;
      this._prefs = null;
      if (!fromModal) P.m.close();
      if (this.tool === "settings" || this.tool === "models") this.tool = this._prefsTool && this._prefsTool !== "settings" && this._prefsTool !== "models" ? this._prefsTool : (this.page === "assist" ? "assist" : this.libSec);
      this.$.setWin = null;
      this.renderLeft(); this.focusSink();
    },
    prefsSide() {
      const P = this._prefs; if (!P) return;
      const search = h("input", { class: "v6-in v6-search", type: "search", placeholder: T("Поиск"), value: P.q, spellcheck: "false", "aria-label": T("Поиск настроек") });
      search.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { const first = P.side.querySelector(".v6-side-it:not([hidden])"); first?.click(); } });
      search.oninput = () => { P.q = search.value.trim().toLowerCase(); for (const b of P.side.querySelectorAll(".v6-side-it")) b.hidden = !!P.q && !b.dataset.k.includes(P.q); };
      P.side.innerHTML = "";
      P.side.append(search);
      for (const s of SECTIONS()) {
        if (s === "sep") { P.side.append(h("i", { class: "v6-pside-sep" })); continue; }
        const [id, icon, label] = s;
        const b = h("button", { type: "button", class: "v6-side-it" + (P.sec === id ? " on" : ""), "data-id": id, "data-k": label.toLowerCase() }, h("i", { class: "v6-ic v6-pico", html: icon }), h("span", null, label));
        b.onclick = () => this.prefsGo(id);
        P.side.append(b);
      }
    },
    prefsGo(id) {
      const P = this._prefs; if (!P) return;
      if (id === "hires") id = "generation";   // migration from removed duplicate sidebar tab
      const changed = P.sec !== id; P.sec = id; this._prefsLast = id;
      for (const b of P.side.querySelectorAll(".v6-side-it")) { b.classList.toggle("on", b.dataset.id === id); b.setAttribute("aria-current", b.dataset.id === id ? "page" : "false"); }
      this.tool = id === "models" ? "models" : "settings";
      if (OLD_TAB[id]) this._setTab = OLD_TAB[id];
      if (changed) P.body.scrollTop = 0;
      this.prefsRender(changed);
      if (id === "downloads") { this.refreshModelDownloads?.(); this.pollModelDownloads?.(); }
    },
    prefsRefresh() { if (this._prefs) this.prefsRender(false); },
    prefsRender(anim = false) {
      const P = this._prefs; if (!P) return;
      const id = P.sec, sec = SECTIONS().find((s) => s !== "sep" && s[0] === id);
      P.title.textContent = sec ? sec[2] : "";
      const top = P.body.scrollTop, snap = this.uiSnap(P.body);
      const box = h("div", { class: "v6-pform" + (anim ? " v6-enter" : "") });
      try {
        if (id === "general") this.prefsGeneral(box);
        else if (id === "appearance") this.prefsAppearance(box);
        else if (id === "keys") this.prefsKeys(box);
        else if (id === "help") this.prefsHelp(box);
        else if (id === "about") this.prefsAbout(box);
        else if (id === "assistant") this.prefsAssistant(box);
        else if (id === "models") { const L = h("div", { class: "v6-legacy h3l-panel" }); this.renderModels(L); box.append(L); }
        else box.append(...this.prefsLegacy(OLD_TAB[id]));
      } catch (e) { console.error("[H3 Lab v6] settings", id, e); box.append(h("p", { class: "v6-err" }, String(e?.message || e))); }
      P.body.replaceChildren(box);
      { // a group titled like the window itself only repeats the title
        const wt = this.root.querySelector(".v6-ptitle")?.textContent.trim();
        for (const g of box.querySelectorAll(":scope > .v6-grp > .v6-grp-t, .h3l-mdl-head h4")) if (wt && g.textContent.trim() === wt) g.remove();
        if (id === "downloads") box.querySelector(":scope > .v6-scope-note")?.remove();   // downloads are not a settings scope
        // runs of full-width engine buttons → one row of normal buttons
        for (const b of [...box.querySelectorAll(".v6-legacy-b > .h3l-btn, .v6-legacy-loose > .h3l-btn")]) {
          const prev = b.previousElementSibling;
          if (prev?.classList.contains("v6-btnrow")) prev.append(b);
          else { const r = h("div", { class: "v6-btnrow" }); b.before(r); r.append(b); }
        }
      }
      // v6g: engine selects cut long file names with an ellipsis — the tooltip shows the full chosen name (+ the field's hint)
      for (const sl of box.querySelectorAll("select.h3l-sel")) {
        const desc = sl.title || sl.dataset.tip || ""; sl.removeAttribute("title");
        sl.addEventListener("pointerover", () => {
          const cur = sl.options[sl.selectedIndex]?.text || "";
          const cut = sl.scrollWidth > sl.clientWidth + 1 || cur.length * 6.5 > sl.clientWidth - 40;
          setTip(sl, cut && cur && cur !== desc ? cur + (desc ? "\n" + desc : "") : desc);
        });
      }
      if (!anim) { P.body.scrollTop = top; this.uiRestore(P.body, snap); }
    },
    /** One engine settings tab, without its old window: [details…] restyled as groups. */
    prefsLegacy(tab) {
      const L = h("div"), keepTool = this.tool, keepPre = this._preSetTool;
      this._setTab = tab; this.tool = "settings"; this._preSetTool = "keys";
      try { this.renderSettings(L); } finally { this.tool = keepTool; this._preSetTool = keepPre; }
      const win = this.$.setWin; this.$.setWin = null;
      if (!win) return [];
      win.remove();
      const body = win.querySelector(".h3l-setbody");
      const kids = [...(body?.children || [])].filter((el) => !el.matches(".h3l-settitle, .h3l-setscope"));
      const out = [this.prefsScopeNote()];
      let loose = null;
      for (const k of kids) {
        if (k.tagName === "DETAILS") {
          loose = null;
          const t = k.querySelector(":scope > summary")?.textContent?.trim() || "", inner = k.querySelector(":scope > .in");
          out.push(h("section", { class: "v6-grp v6-legacy" }, t ? h("h3", { class: "v6-grp-t" }, t) : null, h("div", { class: "v6-grp-b v6-legacy-b" }, ...(inner ? [...inner.childNodes] : [...k.childNodes].filter((n) => n.tagName !== "SUMMARY")))));
        } else {   // loose notes/rows between groups gather into one plain block
          if (!loose) { loose = h("div", { class: "v6-legacy v6-legacy-loose" }); out.push(loose); }
          loose.append(k);
        }
      }
      return out;
    },
    prefsScopeNote() {
      const glob = this.globScope();
      return h("p", { class: "v6-scope-note" }, h("i", { class: "v6-ic", html: glob ? I.globe : I.folder }),
        h("span", null, glob ? T("Эти настройки общие для всех проектов") : T("Эти настройки — только для этого проекта")),
        btn({ label: T("Изменить"), size: "sm", kind: "ghost", onclick: () => this.prefsGo("general") }));
    },

    // ---------------------------------------------------------------- native sections
    prefsGeneral(box) {
      const glob = this.globScope();
      const scope = seg([{ value: "global", label: T("Для всех проектов") }, { value: "project", label: T("Только этот проект") }], glob ? "global" : "project",
        (v) => this.setScope(v), { full: true, label: T("Область настроек") });
      box.append(group(T("Где хранятся настройки"), [
        row({ label: T("Настройки генерации"), sub: glob ? T("Изменения применяются ко всем проектам, которые следуют общим настройкам") : T("Проект хранит свои настройки и не влияет на другие"), stack: true, control: scope }),
        !glob ? row({ label: T("Сделать общими"), sub: T("Записать настройки этого проекта как общие"), control: btn({ label: T("Сделать общими"), size: "sm", onclick: () => this.projToGlobal() }) }) : null,
      ]));
      const LANGS = [["auto", T("Как в ComfyUI")], ["ru", "Русский"], ["en", "English"], ["th", "ไทย"], ["zh", "中文"]];
      const langSel = this.themedSelect({ value: langSetting(), sm: true, options: LANGS.map(([value, label]) => ({ value, label })),
        onChange: (v) => { if (setLangSetting(v)) this.toast(T("Язык сменится после перезагрузки страницы"), false, { label: T("Перезагрузить"), fn: () => location.reload() }); } });
      box.append(group(T("Язык и начало работы"), [
        row({ label: T("Язык интерфейса"), control: langSel }),
        row({ label: T("Приветствие"), sub: T("Ссылки проекта и проверка моделей"), control: btn({ label: T("Показать"), size: "sm", onclick: () => { this.prefsClose(); this.reopenWelcome(); } }) }),
      ]));
      box.append(group(T("Сброс"), [
        row({ label: T("Вернуть настройки по умолчанию"), sub: glob ? T("Общие настройки и интерфейс. Ключи API и проекты сохраняются") : T("Настройки этого проекта станут как общие"),
          control: btn({ label: T("Сбросить…"), size: "sm", kind: "danger", onclick: () => this.askResetSettings() }) }),
      ]));
    },
    prefsAppearance(box) {
      const workspace = seg([
        { value: "classic", label: T("Классический"), disabled: !!this.run?.active, tip: T("Текущий интерфейс Studio v6") },
        { value: "modern", label: T("Новый"), disabled: !!this.run?.active, tip: T("Новый рабочий стол с прогрессом и быстрыми действиями") },
      ], workspaceMode(), (mode) => this.setWorkspaceMode(mode), { full: true, label: T("Рабочий стол") });
      box.append(group(T("Рабочий стол"), [
        row({ label: T("Расположение панелей"), sub: T("Классический — Studio v6; Новый — панель прогресса, быстрые действия с отрезком, компактный таймлайн и улучшенное сохранение."), stack: true, control: workspace }),
        this.run?.active ? h("p", { class: "v6-muted" }, T("Переключение рабочего стола доступно после завершения генерации.")) : null,
      ]));
      const cur = schemeSetting();
      // named colour schemes: a small preview of the surfaces + the accent (selected-state bar and the CTA dot)
      const pick = h("div", { class: "v6-schemes", role: "radiogroup", "aria-label": T("Цветовая схема") }, SCHEMES.map(([id, name, acc, ink, win, bg, s1, s2]) => {
        const on = cur === id;
        const b = h("button", { type: "button", class: "v6-scheme" + (on ? " on" : ""), role: "radio", "aria-checked": String(on), dataset: { scheme: id }, tabindex: on ? "0" : "-1" },
          h("span", { class: "v6-scheme-pv", style: { "--w": win, "--b": bg, "--s1": s1, "--s2": s2, "--a": acc } },
            h("i", { class: "pv-bar" }), h("i", { class: "pv-side" }), h("i", { class: "pv-sel" }), h("i", { class: "pv-cta" })),
          h("span", { class: "v6-scheme-n" }, T(name)));
        setTip(b, T(name) + " · " + acc);
        b.onclick = () => { applyScheme(id, true); for (const x of pick.children) { const o = x === b; x.classList.toggle("on", o); x.setAttribute("aria-checked", String(o)); x.tabIndex = o ? 0 : -1; } };
        b.addEventListener("keydown", (e) => {
          const l = [...pick.children], i = l.indexOf(b), d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (d) { e.preventDefault(); e.stopPropagation(); const n = l[(i + d + l.length) % l.length]; n.focus(); n.click(); }
        });
        return b;
      }));
      const scale = seg(UI_SCALES.map((p) => ({ value: String(p), label: p + "%" })), String(uiScaleSetting()), (v) => this.setUiScale(Number(v)), { size: "sm", label: T("Масштаб интерфейса") });
      box.append(group(T("Оформление"), [
        row({ label: T("Цветовая схема"), sub: T("Акцент — кнопка «Сгенерировать», выбранные вкладки и кнопки; фон чуть меняет оттенок"), stack: true, control: pick }),
        row({ label: T("Масштаб интерфейса"), control: scale }),
      ]));
      box.append(group(T("Движение"), [
        row({ label: T("Уменьшить движение"), sub: T("Без анимаций переходов — только мгновенная смена"), control: sw(motionReduced(), (v) => setMotionReduced(v), { label: T("Уменьшить движение") }) }),
      ], T("Анимации интерфейса короткие и идут только на видеокарте; системная настройка «уменьшить движение» учитывается всегда.")));
    },
    prefsKeys(box) {
      const K = [
        [T("Воспроизведение"), [[T("Пробел"), T("Воспроизвести / пауза")], ["← / →", T("Кадр назад / вперёд (Shift — секунда)")], ["Home / End", T("В начало / в конец")], ["[ / ]", T("Предыдущий / следующий отрезок")], ["F", T("Плеер во весь экран")]]],
        [T("Монтаж"), [["E", T("Добавить отрезок в конец")], ["S", T("Разрезать по плейхеду")], ["D", T("Дублировать отрезок")], ["Del", T("Удалить отрезок")], ["M", T("Маркер на плейхеде")], ["R", T("Участок: выделить и пересоздать часть")], ["+ / −", T("Масштаб таймлайна (и Ctrl+колесо)")]]],
        [T("Студия"), [["Ctrl+Enter", T("Сгенерировать")], ["Ctrl+K", T("Все команды")], ["Ctrl+1 / 2 / 3", T("Монтаж / Медиатека / Ассистент")], ["Ctrl+,", T("Настройки")], ["Ctrl+Z", T("Отменить")], ["Ctrl+Shift+Z", T("Повторить")], ["Ctrl+V", T("Вставить картинку в медиа")], ["Esc", T("Закрыть окно / свернуть студию")]]],
      ];
      for (const [t, list] of K) box.append(group(t, list.map(([k, d]) => row({ label: d, control: h("span", { class: "v6-keys" }, k.split(" / ").map((x, j) => [j ? h("span", { class: "v6-muted" }, "/") : null, kbd(x)])) }))));
    },
    prefsHelp(box) {
      const q = h("input", { class: "v6-in v6-search v6-help-q", type: "search", placeholder: T("Поиск по справке"), spellcheck: "false", value: this._helpQ || "" });
      q.addEventListener("keydown", (e) => e.stopPropagation());
      const list = h("div", { class: "v6-help" });
      const fill = () => {
        const words = (q.value || "").toLowerCase().split(/\s+/).filter(Boolean);
        list.innerHTML = ""; let n = 0;
        for (const [id, title, html] of HELP()) {
          const tmp = h("div", { html }); const text = (title + " " + tmp.textContent).toLowerCase();
          if (words.length && !words.every((w) => text.includes(w))) continue; n++;
          list.append(h("details", { class: "v6-dis v6-help-s", open: words.length ? true : null, "data-id": id }, h("summary", null, h("i", { class: "v6-ic v6-dis-c", html: I.chevR }), h("span", null, String(title).replace(/^[^\p{L}\p{N}]+\s*/u, ""))), h("div", { class: "v6-help-b", html })));
        }
        if (!n) list.append(empty(I.search, T("Ничего не найдено")));
      };
      q.oninput = () => { this._helpQ = q.value; fill(); };
      fill();
      box.append(q, list);
    },
    prefsAbout(box) {
      const link = (href, icon, label) => h("a", { class: "v6-b is-tinted is-sm", href, target: "_blank", rel: "noopener noreferrer" }, h("i", { class: "v6-ic", html: icon }), h("span", { class: "v6-bl" }, label));
      box.append(h("div", { class: "v6-about" }, h("div", { class: "v6-about-mark" }, monogram(40)), h("div", null, h("h2", { class: "v6-wordm" }, h("b", null, "H3"), "ZeroStudio"), h("p", null, T("Таймлайн-студия для MiniMax H3 в ComfyUI")), h("small", { class: "v6-muted" }, T("Экспериментальный интерфейс Lab")))));
      box.append(group(T("Сообщество"), [
        row({ icon: I.github, label: "GitHub", sub: T("Исходный код, обновления, вопросы"), control: link("https://github.com/zeroleloushe/H3ZeroStudio", I.share, T("Открыть")) }),
        row({ icon: I.telegram, label: T("Группа в Telegram"), sub: T("Новости и помощь"), control: link("https://t.me/+Jh-mDY5nwOIyMTFi", I.share, T("Открыть")) }),
        row({ icon: I.youtube, label: "YouTube", sub: T("Видео-уроки"), control: link("https://www.youtube.com/@zeroleloushe", I.share, T("Открыть")) }),
        row({ icon: I.heart, label: "Boosty", sub: T("Поддержать разработку"), control: link("https://boosty.to/zeroleloushe", I.share, T("Открыть")) }),
      ]));
      const est = C.estimate(this.p);
      box.append(group(T("Как это работает"), [
        h("div", { class: "v6-prose" },
          h("p", null, T("Каждый отрезок — отдельная генерация H3 длиной 17k+5 кадров при 24 кадрах в секунду.")),
          h("p", null, T("«Продолжение» начинает отрезок с хвоста предыдущего: общие кадры и последний кадр передаются модели, поэтому стык получается незаметным.")),
          h("p", null, T("«Новая сцена» — монтажная склейка: отрезок создаётся с нуля.")),
          h("p", null, T("Готовые отрезки кэшируются: повторный запуск пропускает неизменённые, а изменение отрезка пересоздаёт его и всё, что его продолжает.")),
          h("p", null, T("Обучающий диапазон H3 — {0}–{1} с на отрезок. Сейчас в проекте {2}.", (C.TRAINED_MIN_FRAMES / 24).toFixed(1), (C.TRAINED_MAX_FRAMES / 24).toFixed(1), T("{0} с", est.seconds.toFixed(1))))),
      ]));
    },
    prefsAssistant(box) {
      box.append(group(T("Ассистент"), [
        row({ label: T("Подключение к модели"), sub: T("Адрес OpenAI-совместимого сервера, модель, ключ"), control: btn({ label: T("Открыть"), size: "sm", onclick: () => { this.prefsClose(); this.setPage("assist"); this.astOpenSettings?.("connection"); } }) }),
        row({ label: T("Пресеты и стили"), sub: T("Системные подсказки, стили промптов"), control: btn({ label: T("Открыть"), size: "sm", onclick: () => { this.prefsClose(); this.setPage("assist"); this.astOpenSettings?.("presets"); } }) }),
      ], T("Ассистент пишет и улучшает промпты отрезков; его настройки открываются на странице «Ассистент».")));
    },
  });
}
