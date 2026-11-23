// H3ZeroStudio Lab v6k — «Обучение»: a guided tour over the studio. A dimmed backdrop with a spotlight on the part
// being explained and a small card (Назад / Далее / Пропустить, step counter). Keys: → / Enter — next, ← — back,
// Esc — close (keys arrive through Studio.onKey, which runs first in the capture phase). A step whose element is hidden right now (no generation running, panel collapsed, no ControlNet row…)
// falls back to a nearby element or a centred card that says where to find it. Colours come from the theme variables.
import { T } from "../h3s_i18n.js";
import { I, setTip, btn } from "./kit.js";
import { uiLocalPoint, uiLocalBounds } from "../h3s_ui_scale.js";

const PAD = 6, GAP = 12, CARD_W = 340;

export function installTour(Studio, { C, h }) {
  const P = Studio.prototype;
  Object.assign(P, {
    tourSteps() {
      const q = (s) => this.root?.querySelector(s) || null;
      const clip = () => q(".v6-tl .h3l-clip.sel") || q(".v6-tl .h3l-clip");
      const selFirst = () => { if (this.p.segments.length && (this.sel == null || this.sel < 0 || !this.p.segments[this.sel])) { this.sel = 0; this.pvMode = "segment"; this.renderAll(); } };
      return [
        { title: T("Добро пожаловать в Lab"), text: T("Короткий обзор студии: где что находится и с чего начать. Стрелки или Enter — дальше, Esc — выйти. Обучение можно открыть снова кнопкой «?» в шапке.") },
        { el: () => q(".v6-pages-sw"), title: T("Разделы"), text: T("«Монтаж» — сборка ролика, «Медиатека» — референсы, персонажи, галерея и проекты, «Ассистент» — помощник с промптами. Ctrl+1 / 2 / 3.") },
        { el: () => q(".v6-dock"), alt: () => q(".v6-dock-btn"), title: T("Медиа и галерея"), text: T("Картинки, видео и звук проекта. Перетащите файл на отрезок — он станет референсом, на дорожку — клипом. Панель скрывается кнопкой или Ctrl+B."), hidden: T("Панель сейчас скрыта — откройте её этой кнопкой или Ctrl+B.") },
        { el: () => q(".v6-tl"), title: T("Таймлайн"), text: T("Отрезки ролика по порядку, под ними звук. Колесо с Ctrl — масштаб, S — разрезать, E — добавить отрезок.") },
        { el: clip, prep: selFirst, title: T("Отрезок"), text: T("Каждый клип генерируется отдельно: свой промпт, референсы и длина. Клик — выбрать, правый клик — меню: дубли, черновик и чистовик, улучшение звука, рефайн лица."), hidden: T("Отрезков пока нет — нажмите «+ Отрезок» над таймлайном.") },
        { el: () => q(".v6-insp"), prep: selFirst, title: T("Инспектор"), text: T("Всё о выбранном отрезке: промпт, длительность, связь с предыдущим, референсы, дубли и параметры.") },
        { el: () => q(".v6-insp .v6-kf-ctl"), alt: () => q(".v6-insp"), prep: selFirst, title: T("REF или FLF"), text: T("REF — генерация по референсам (персонажи, места, видео, звук). FLF — по первому и/или последнему кадру; первый кадр начинает новую сцену, для продолжения задайте только последний."), hidden: T("Переключатель появляется у сгенерированного (не футажного) отрезка в блоке «Референсы».") },
        { el: () => this.$.tbGen, title: T("Генерация"), text: T("Ставит ролик в очередь ComfyUI (Ctrl+Enter). Готовые неизменённые отрезки берутся из кэша, пересчитывается только изменённое.") },
        { el: () => { const g = q(".v6-gp"); return g && !g.closest("[hidden]") && !g.classList.contains("is-out") ? g : null; }, alt: () => q(".v6-viewer"), title: T("Предпросмотр генерации"), text: T("Во время генерации здесь видно, как рождается кадр: шаги, прогресс и оставшееся время."), hidden: T("Мини-окно предпросмотра появляется, когда идёт генерация. Сейчас показан плеер, где оно будет.") },
        { el: () => this.$.tbGear, title: T("Настройки"), text: T("Модель и LoRA, шаги и сэмплер, разрешение, тема, язык, загрузка моделей. Ctrl+,") },
        { el: () => q('.v6-pages-sw [data-v="assist"]'), alt: () => q(".v6-pages-sw"), title: T("Ассистент"), text: T("Помогает написать и улучшить промпты, разбить сценарий на отрезки и подобрать референсы.") },
        { el: () => q(".v6-ctl-head"), alt: () => q(".v6-vhead"), title: T("Дорожка ControlNet"), text: T("Видео на этой дорожке управляет позой, глубиной или контурами отрезков над ним. Режим и сила — в заголовке дорожки."), hidden: T("Дорожки пока нет: правый клик по заголовку видеодорожки → «Добавить дорожку ControlNet».") },
        { el: clip, prep: selFirst, title: T("Рефайн лица"), text: T("Правый клик по готовому клипу → «Рефайн лица…»: выберите лицо, и студия уточнит его несколькими шагами с референсами персонажа. Результат — новый дубль с меткой «ЛИЦО»."), hidden: T("Сначала создайте и сгенерируйте отрезок.") },
        { title: T("Готово"), text: T("Начните с отрезка: промпт, референсы — и «Сгенерировать». Удачной работы!") },
      ];
    },
    /** Start the tour (header «?», palette). */
    startTour(at = 0) {
      this.endTour(true);
      if (this.page !== "edit") this.setPage?.("edit");
      const steps = this.tourSteps();
      const spot = h("div", { class: "v6-tour-spot", "aria-hidden": "true" });
      const dim = h("div", { class: "v6-tour-dim", "aria-hidden": "true" });
      const cnt = h("span", { class: "v6-tour-n" }), ttl = h("b", { class: "v6-tour-t", id: "v6-tour-t" }), txt = h("p", { class: "v6-tour-x" }), note = h("p", { class: "v6-tour-h" });
      const back = btn({ label: T("Назад"), size: "sm", onclick: () => go(k - 1) });
      const next = btn({ label: T("Далее"), size: "sm", kind: "primary", onclick: () => go(k + 1) });
      const skip = btn({ label: T("Пропустить"), size: "sm", kind: "ghost", cls: "v6-tour-skip", onclick: () => this.endTour() });
      setTip(skip, T("Закрыть обучение"), "Esc");
      const card = h("div", { class: "v6-tour-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "v6-tour-t", tabindex: "-1" },
        h("div", { class: "v6-tour-top" }, h("i", { class: "v6-ic", html: I.help }), cnt, h("i", { class: "v6-grow" }), skip),
        ttl, txt, note,
        h("div", { class: "v6-tour-dots", "aria-hidden": "true" }, steps.map(() => h("i"))),
        h("div", { class: "v6-tour-foot" }, back, h("i", { class: "v6-grow" }), next));
      const ov = h("div", { class: "v6-tour", "data-step": "0" }, dim, spot, card);
      ov.addEventListener("pointerdown", (e) => { if (!card.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
      ov.addEventListener("contextmenu", (e) => e.preventDefault());
      this.root.append(ov);
      let k = 0, tgt = null;
      const visible = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; if (el.closest("[hidden]")) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
      const place = () => {
        const b = uiLocalBounds(this.root), W = b.w, H = b.h;
        if (!tgt) {   // centred card, full dim
          ov.classList.add("is-center"); spot.style.cssText = "";
          card.style.left = Math.round((W - card.offsetWidth) / 2) + "px"; card.style.top = Math.round((H - card.offsetHeight) / 2) + "px";
          return;
        }
        ov.classList.remove("is-center");
        const r = tgt.getBoundingClientRect(), p0 = uiLocalPoint(r.left, r.top, this.root), p1 = uiLocalPoint(r.right, r.bottom, this.root);
        const x = Math.max(4, p0.x - PAD), y = Math.max(4, p0.y - PAD), w = Math.min(W - 4, p1.x + PAD) - x, hh = Math.min(H - 4, p1.y + PAD) - y;
        Object.assign(spot.style, { left: x + "px", top: y + "px", width: Math.max(8, w) + "px", height: Math.max(8, hh) + "px" });
        const cw = card.offsetWidth, ch = card.offsetHeight;
        // below, above, right, left of the spotlight — the first that fits; else inside it at the bottom
        const opts = [[x + w / 2 - cw / 2, y + hh + GAP, H - (y + hh + GAP) >= ch + 8], [x + w / 2 - cw / 2, y - GAP - ch, y - GAP - ch >= 8],
          [x + w + GAP, y + hh / 2 - ch / 2, W - (x + w + GAP) >= cw + 8], [x - GAP - cw, y + hh / 2 - ch / 2, x - GAP - cw >= 8]];
        const o = opts.find((v) => v[2]) || [x + w / 2 - cw / 2, Math.min(H - ch - 12, y + hh - ch - 12)];
        card.style.left = Math.round(Math.max(8, Math.min(W - cw - 8, o[0]))) + "px";
        card.style.top = Math.round(Math.max(8, Math.min(H - ch - 8, o[1]))) + "px";
      };
      const go = (n) => {
        if (n >= steps.length) { this.endTour(); try { localStorage.setItem("h3l_tour_done", "1"); } catch (e) { /* ignore */ } return; }
        k = Math.max(0, n);
        const st = steps[k];
        try { st.prep?.(); } catch (e) { /* the tour never breaks the studio */ }
        let el = null, hidden = false;
        try { el = st.el ? st.el() : null; } catch (e) { el = null; }
        if (st.el && !visible(el)) { hidden = true; let a = null; try { a = st.alt ? st.alt() : null; } catch (e) { a = null; } el = visible(a) ? a : null; }
        tgt = el;
        el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
        ov.dataset.step = String(k);
        cnt.textContent = T("{0} из {1}", k + 1, steps.length);
        ttl.textContent = st.title; txt.textContent = st.text;
        note.textContent = hidden ? (st.hidden || T("Этот элемент сейчас скрыт.")) : ""; note.hidden = !hidden;
        card.querySelectorAll(".v6-tour-dots i").forEach((d, j) => d.classList.toggle("on", j === k));
        back.disabled = k === 0;
        next.querySelector(".v6-bl").textContent = k === steps.length - 1 ? T("Готово") : T("Далее");
        requestAnimationFrame(() => { place(); next.focus({ preventScroll: true }); });
      };
      const key = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.endTour(); return; }
        if (e.key === "ArrowRight" || (e.key === "Enter" && !e.target.closest?.(".v6-tour-skip, .v6-tour-foot .v6-b:not(.is-primary)"))) { e.preventDefault(); e.stopPropagation(); go(k + 1); return; }
        if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); go(k - 1); return; }
        if (e.key === "Tab") {   // focus stays in the card
          const f = [...card.querySelectorAll("button:not([disabled])")]; if (!f.length) return;
          const i = f.indexOf(document.activeElement); e.preventDefault(); e.stopPropagation();
          f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
          return;
        }
        e.stopPropagation();   // studio shortcuts sleep while the tour is open
      };
      const onResize = () => place();
      window.addEventListener("resize", onResize);
      this._tour = { ov, key, onResize, go: (n) => go(n), get k() { return k; } };
      requestAnimationFrame(() => ov.classList.add("on"));
      go(at);
    },
    endTour(quiet = false) {
      const t = this._tour; if (!t) return;
      this._tour = null;
      window.removeEventListener("resize", t.onResize);
      t.ov.classList.remove("on");
      if (quiet) t.ov.remove(); else setTimeout(() => t.ov.remove(), 180);
      this.focusSink?.();
    },
  });
}
