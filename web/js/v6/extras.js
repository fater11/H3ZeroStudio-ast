// H3ZeroStudio Lab v6 — welcome sheet and the command palette (Ctrl+K).
import { T } from "../h3s_i18n.js";
import { I, btn, modal, kbd, setTip } from "./kit.js";
import { monogram, particleWordmark } from "./logo.js";

export function installExtras(Studio, { C, h }) {
  Object.assign(Studio.prototype, {
    showWelcome(scan) {
      this.closeWelcome();
      const c = scan?.counts || {}, miss = c.required_missing ?? null;
      this._welcomeScan = scan;
      const never = h("input", { type: "checkbox", class: "v6-chk-in" });
      const close = async () => { if (never.checked) { try { await this.host.call("/h3lab/ui", { welcome_dismissed: true }); } catch (_) {} } this.closeWelcome(); };
      const ok = miss === 0, unknown = miss == null;
      const status = h("div", { class: "v6-wstatus " + (ok ? "is-ok" : unknown ? "is-unk" : "is-warn") },
        h("i", { class: "v6-ic", html: ok ? I.check : I.warn }),
        h("div", null, h("b", null, ok ? T("Модели на месте") : unknown ? T("Статус моделей неизвестен") : T("Не хватает моделей: {0} из {1}", miss, c.required_total || "?")),
          h("span", null, ok ? T("Можно сразу начинать") : T("Без обязательных моделей генерация не запустится"))),
        !ok ? btn({ label: T("Загрузить"), size: "sm", kind: "tinted", onclick: () => { this.closeWelcome(); this.openModelDownloads(); } }) : null);
      const link = (href, icon, label, tip) => { const a = h("a", { class: "v6-wlink", href, target: "_blank", rel: "noopener noreferrer" }, h("i", { class: "v6-ic", html: icon }), h("span", null, label)); setTip(a, tip); return a; };
      const box = h("div", { class: "v6-welcome" },
        h("div", { class: "v6-whero" }, h("div", { class: "v6-wmark", "aria-hidden": "true" }, monogram(44)),
          particleWordmark({ width: 340, height: 56, acc: getComputedStyle(this.root).getPropertyValue("--v6-acc").trim() || undefined })),
        h("h1", { "aria-label": T("Добро пожаловать в H3ZeroStudio") }, T("Добро пожаловать")),
        h("p", { class: "v6-wsub" }, T("Собирайте длинные ролики MiniMax H3 из отрезков: промпты, референсы, продолжения, черновик и финал.")),
        h("div", { class: "v6-wfeat" },
          [[I.edit, T("Монтаж"), T("Отрезки на таймлайне, инспектор и плеер")], [I.library, T("Медиатека"), T("Референсы, персонажи, галерея и проекты")], [I.assist, T("Ассистент"), T("Пишет и улучшает промпты")]]
            .map(([ic, t, s]) => h("div", { class: "v6-wf" }, h("i", { class: "v6-ic", html: ic }), h("b", null, t), h("span", null, s)))),
        status,
        h("div", { class: "v6-wlinks" }, link("https://github.com/zeroleloushe/H3ZeroStudio", I.github, "GitHub", T("Репозиторий (новая вкладка)"))),
        h("div", { class: "v6-wfoot" }, h("label", { class: "v6-chk" }, never, h("i", { class: "v6-chk-b", html: I.check }), h("span", null, T("Больше не показывать"))), h("i", { class: "v6-grow" }),
          btn({ label: T("Начать"), kind: ok || unknown ? "primary" : "", onclick: () => close() })));
      const m = modal(this.root, box, { cls: "v6-wwin", label: T("Добро пожаловать"), onClose: () => { if (this.$.welcomeModal === m) this.$.welcomeModal = null; } });
      this.$.welcomeModal = m;
    },
    closeWelcome() { const m = this.$.welcomeModal; if (m) { this.$.welcomeModal = null; m.close?.(); } },

    // ---------------------------------------------------------------- command palette
    paletteCommands() {
      const sel = this.sel >= 0 && this.seg();
      return [
        { g: T("Студия"), icon: I.spark, label: T("Сгенерировать"), key: "Ctrl+Enter", fn: () => this.generate(), dis: this.run.active || !this.p.segments.length },
        sel ? { g: T("Студия"), icon: I.spark, label: T("Создать только отрезок {0}", this.sel + 1), fn: () => this.genSegment(this.sel), dis: this.run.active } : null,
        this.run.active ? { g: T("Студия"), icon: I.stop, label: T("Остановить генерацию"), fn: () => this.stop() } : null,
        { g: T("Студия"), icon: I.share, label: T("Сохранить видео…"), fn: () => this.saveDialog() },
        { g: T("Студия"), icon: I.up, label: T("Апскейл всего ролика"), fn: () => this.upscaleAll(), dis: this.run.active },
        { g: T("Студия"), icon: I.memory, label: T("Освободить видеопамять"), fn: () => this.freeMemory() },
        { g: T("Студия"), icon: I.spark, label: T("Обучение"), fn: () => this.startTour?.() },
        { g: T("Монтаж"), icon: I.plus, label: T("Добавить отрезок"), key: "E", fn: () => this.extend() },
        { g: T("Монтаж"), icon: I.cut, label: T("Разрезать по плейхеду"), key: "S", fn: () => this.split(), dis: !sel },
        { g: T("Монтаж"), icon: I.dup, label: T("Дублировать отрезок"), key: "D", fn: () => this.duplicate(), dis: !sel },
        { g: T("Монтаж"), icon: I.trash, label: T("Удалить отрезок"), key: "Del", fn: () => this.deleteSeg(this.sel), dis: !sel },
        { g: T("Монтаж"), icon: I.marker, label: T("Маркер на плейхеде"), key: "M", fn: () => this.addMarker() },
        { g: T("Монтаж"), icon: I.fit, label: T("Вписать весь ролик"), fn: () => this.fitZoom() },
        { g: T("Монтаж"), icon: I.undo, label: T("Отменить"), key: "Ctrl+Z", fn: () => this.undo(), dis: !this.undoStack.length },
        { g: T("Монтаж"), icon: I.redo, label: T("Повторить"), key: "Ctrl+Shift+Z", fn: () => this.redo(), dis: !this.redoStack.length },
        { g: T("Перейти"), icon: I.edit, label: T("Монтаж"), key: "Ctrl+1", fn: () => this.setPage("edit") },
        { g: T("Перейти"), icon: I.image, label: T("Медиа проекта"), key: "Ctrl+2", fn: () => this.setPage("library", "assets") },
        { g: T("Перейти"), icon: I.people, label: T("Персонажи"), fn: () => this.setPage("library", "chars") },
        { g: T("Перейти"), icon: I.gallery, label: T("Галерея"), fn: () => this.setPage("library", "gallery") },
        { g: T("Перейти"), icon: I.folder, label: T("Проекты"), fn: () => this.setPage("library", "projects") },
        { g: T("Перейти"), icon: I.assist, label: T("Ассистент"), key: "Ctrl+3", fn: () => this.setPage("assist") },
        { g: T("Настройки"), icon: I.gear, label: T("Основные"), key: "Ctrl+,", fn: () => this.openPrefs("general") },
        { g: T("Настройки"), icon: I.palette, label: T("Внешний вид"), fn: () => this.openPrefs("appearance") },
        { g: T("Настройки"), icon: I.sliders, label: T("Генерация"), fn: () => this.openPrefs("generation") },
        { g: T("Настройки"), icon: I.up, label: T("Апскейл"), fn: () => this.openPrefs("upscale") },
        { g: T("Настройки"), icon: I.sound, label: T("Продление и звук"), fn: () => this.openPrefs("ext") },
        { g: T("Настройки"), icon: I.eye, label: T("Превью и кэш"), fn: () => this.openPrefs("preview") },
        { g: T("Настройки"), icon: I.cube, label: T("Модели и LoRA"), fn: () => this.openPrefs("models") },
        { g: T("Настройки"), icon: I.download, label: T("Загрузка моделей"), fn: () => this.openPrefs("downloads") },
        { g: T("Настройки"), icon: I.key, label: T("Клавиши"), fn: () => this.openPrefs("keys") },
        { g: T("Настройки"), icon: I.help, label: T("Справка"), fn: () => this.openPrefs("help") },
        { g: T("Настройки"), icon: I.info, label: T("О программе"), fn: () => this.openPrefs("about") },
        { g: T("Настройки"), icon: I.info, label: T("Приветствие"), fn: () => this.reopenWelcome() },
      ].filter(Boolean);
    },
    openPalette() {
      if (this._palette) return;
      const cmds = this.paletteCommands();
      const q = h("input", { class: "v6-pal-q", type: "text", placeholder: T("Команда или раздел…"), spellcheck: "false", autocomplete: "off", "aria-label": T("Поиск команды") });
      const list = h("div", { class: "v6-pal-l", role: "listbox" });
      let items = [], idx = 0;
      const pick = (i) => { idx = Math.max(0, Math.min(items.length - 1, i)); items.forEach((b, j) => b.classList.toggle("is-kb", j === idx)); items[idx]?.scrollIntoView({ block: "nearest" }); };
      const run = (c) => { if (!c || c.dis) return; this.paletteClose(); setTimeout(() => c.fn(), 0); };
      const fill = () => {
        const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        list.innerHTML = ""; items = []; let g = null;
        for (const c of cmds) {
          const text = (c.label + " " + c.g).toLowerCase();
          if (words.length && !words.every((w) => text.includes(w))) continue;
          if (c.g !== g) { g = c.g; list.append(h("div", { class: "v6-pal-g" }, g)); }
          const b = h("button", { type: "button", class: "v6-pal-it", role: "option", disabled: c.dis || null }, h("i", { class: "v6-ic", html: c.icon }), h("span", null, c.label), c.key ? kbd(c.key) : null);
          b.onclick = () => run(c); b.onpointermove = () => pick(items.indexOf(b));
          b._c = c; list.append(b); if (!c.dis) items.push(b);
        }
        if (!items.length) list.append(h("p", { class: "v6-pal-none" }, T("Ничего не найдено")));
        pick(0);
      };
      q.addEventListener("input", fill);
      const key = (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); pick(idx + 1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); pick(idx - 1); }
        else if (e.key === "Enter") { e.preventDefault(); run(items[idx]?._c); }
      };
      const m = modal(this.root, h("div", { class: "v6-pal" }, h("div", { class: "v6-pal-h" }, h("i", { class: "v6-ic", html: I.search }), q, kbd("Esc")), list), { cls: "v6-palwin", label: T("Все команды"), onClose: () => { this._palette = null; this.focusSink(); } });
      m.key = key; this._palette = m;
      fill();
      requestAnimationFrame(() => q.focus());
    },
    paletteClose() { const m = this._palette; if (m) { this._palette = null; m.close(); } },
  });
}
