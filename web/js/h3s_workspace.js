// Optional, non-destructive workspace layout: Classic remains the default.
import { T } from "./h3s_i18n.js";

export const WORKSPACE_KEY = "h3ls.workspaceMode";
export function workspaceMode() {
  try { return localStorage.getItem(WORKSPACE_KEY) === "modern" ? "modern" : "classic"; }
  catch { return "classic"; }
}

export function installWorkspace(Editor, { C, h, ICON }) {
  const btn = (label, fn, title = label, cls = "") =>
    h("button", { class: "h3l-btn sm " + cls, title, onclick: fn }, label);
  Object.assign(Editor.prototype, {
    isModern() { return (this._workspaceMode || workspaceMode()) === "modern"; },
    setWorkspaceMode(mode) {
      const wanted = mode === "modern" ? "modern" : "classic";
      // The installed ComfyUI extension can switch between Studio v6 and the new
      // H3Editor workspace. A local CSS toggle alone would leave the v6 view unchanged.
      if (this.root && typeof this.host?.switchWorkspace === "function") {
        return this.host.switchWorkspace(wanted);
      }
      this._workspaceMode = wanted;
      try { localStorage.setItem(WORKSPACE_KEY, wanted); } catch {}
      if (!this.root) return;
      this.root.classList.toggle("h3l-workspace-modern", this.isModern());
      this.renderHeader();
      this.renderTimeline();
      this.renderModernQuick();
      this.renderModernStatus();
      this.layoutStage();
    },
    buildModernQuick() {
      const q = this.$.modernQuick = h("div", { class: "h3l-modern-quick", "aria-label": T("Быстрые действия с отрезком") });
      return q;
    },
    renderModernRibbon() {
      if (!this.isModern()) return;
      const $ = this.$, est = C.estimate(this.p);
      $.modernRibbon = h("div", { class: "h3l-modern-ribbon" });
      $.modernState = h("div", { class: "h3l-modern-state", role: "status", "aria-live": "off" });
      $.modernProgress = h("i", { class: "h3l-modern-fill" });
      const bar = h("div", { class: "h3l-modern-progress", title: T("Общий прогресс генерации") }, $.modernProgress);
      $.modernRibbon.append(
        h("span", { class: "h3l-modern-metric" }, T("Отрезки"), " ", h("b", null, String(est.segments))),
        h("span", { class: "h3l-modern-metric" }, T("Длительность"), " ", h("b", null, C.fmtTime(est.seconds))),
        h("span", { class: "h3l-modern-metric" }, T("Видео"), " ", h("b", null, `${est.width}×${est.height}`)),
        $.modernState, bar,
        btn(T("Режим генерации"), () => { this._setTab = "gen"; this._preSetTool = this.tool; this.tool = "settings"; this.openLeftPanel(); this.renderTools(); this.renderLeft(); }, T("Открыть выбор метода генерации с кнопкой «Применить»")),
        btn(T("Следующий неготовый"), () => this.modernNextUnfinished(), T("Перейти к первому отрезку без актуального результата")),
        btn(T("Вписать таймлайн"), () => this.fitZoom(), T("Показать весь таймлайн")));
      $.head.append($.modernRibbon);
      this.renderModernStatus();
    },
    renderModernStatus() {
      if (!this.isModern() || !this.$.modernState) return;
      const n = this.genCount(), r = this.run || {};
      let ready = 0;
      for (let i = 0; i < n; i++) if (this.p.segments[i]?.result?.video && !this.isStale(i)) ready++;
      if (!r.active) {
        this.$.modernState.textContent = this._modernError ? "⚠ " + this._modernError : T("Готово {0}/{1} · выбрано {2}", ready, n, this.sel >= 0 ? this.sel + 1 : "—");
        this.$.modernState.title = this._modernError || "";
        this.$.modernProgress.style.width = (n ? 100 * ready / n : 0).toFixed(1) + "%";
        return;
      }
      const frac = r.total ? Math.max(0, Math.min(1, (r.done || 0) / r.total)) : (n ? ready / n : 0);
      const phase = r.queued ? T("В очереди") : ({ draft: T("Черновик"), refine: T("Доработка"), upscale: T("Апскейл"), decode: T("Декодирование"), colour: T("Цветокоррекция"), assemble: T("Сборка") }[r.phase] || T("Генерация"));
      this.$.modernState.textContent = `${phase} · ${T("отрезок")} ${r.seg >= 0 ? r.seg + 1 : "…"}/${r.segs || n} · ${T("шаг")} ${r.step || 0}/${r.steps || "…"}` + (r.eta != null ? ` · ETA ${C.fmtDur(r.eta)}` : "");
      this.$.modernProgress.style.width = (frac * 100).toFixed(1) + "%";
    },
    modernFocusSelected() {
      if (this.sel < 0 || !this.$.tscroll) return;
      const e = this.$.clips?.[this.sel];
      if (e) this.$.tscroll.scrollLeft = Math.max(0, e.offsetLeft - this.$.tscroll.clientWidth / 2 + e.offsetWidth / 2);
    },
    modernNextUnfinished() {
      const n = this.genCount();
      if (!n) return this.toast(T("Нет отрезков"), true);
      let ix = -1;
      for (let j = 1; j <= n; j++) {
        const i = (Math.max(-1, this.sel) + j) % n;
        if (!this.p.segments[i]?.result?.video || this.isStale(i)) { ix = i; break; }
      }
      if (ix < 0) return this.toast(T("Все отрезки готовы"));
      this.browseRunPreview();
      this.sel = ix; this.pvMode = "segment";
      const it = this.items()[ix];
      this.playhead = it.start + (ix ? it.overlap : 0);
      this.renderInspector(); this.renderTimeline(); this.renderLeft(); this.renderPreview();
      this.modernFocusSelected();
    },
    async modernCompareSelected() {
      if (this.sel < 0) return;
      try {
        this.galScope = "project";
        const g = await this.galLoad();
        const vids = (g.items || []).filter((e) => e.pid === this.p.id && e.seg_index === this.sel && e.video)
          .sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
        if (vids.length >= 2) return this.galView(vids.slice(0, 2));
        this.tool = "gallery"; this.galScope = "project"; this.openLeftPanel(); this.renderTools(); this.renderLeft();
        this.toast(T("Для сравнения нужны два готовых дубля выбранного отрезка"));
      } catch (e) { this.toast(T("Не удалось открыть сравнение: ") + (e.message || e), true); }
    },
    renderModernQuick() {
      const q = this.$.modernQuick;
      if (!q || !this.isModern()) return;
      q.replaceChildren();
      const i = this.sel, s = i >= 0 ? this.seg(i) : null;
      if (!s) { q.append(h("span", { class: "h3l-note" }, T("Выберите отрезок на таймлайне"))); return; }
      const ready = !!s.result?.video && !this.isStale(i);
      const st = this.segGenState(i);
      q.append(h("button", { class: "h3l-btn sm", type: "button", disabled: i === 0,
          title: T("Предыдущий отрезок"), onclick: () => this.jumpSeg(-1) }, "←"),
        h("b", null, T("Отрезок {0} / {1}", i + 1, this.p.segments.length)),
        h("button", { class: "h3l-btn sm", type: "button", disabled: i >= this.p.segments.length - 1,
          title: T("Следующий отрезок"), onclick: () => this.jumpSeg(1) }, "→"),
        h("span", { class: "h3l-modern-quality " + (ready ? "ready" : "") }, ready ? T("Готов ✓") : s.result?.video ? T("Изменён") : T("Не готов")),
        btn(T("Сгенерировать до этого"), () => this.genSegment(i), st.why || T("Недостающие предыдущие отрезки будут созданы автоматически"), "primary"),
        btn(T("Новый дубль"), () => this.newTake(i), st.why || T("С другим сидом")),
        btn(T("Финал ↑"), () => this.finalFromDraft([i]), T("Сделать финал из черновика")),
        btn(T("Сравнить A/B"), () => this.modernCompareSelected(), T("Сравнить два готовых дубля")),
        ...(s.source?.swap && ready ? [btn(T("До / после"), () => this.galCompareSwap(i), T("Сравнить исходное видео и результат замены с синхронным воспроизведением")),
          btn(T("Рефайн лица…"), () => this.openSwapFaceRefine(i), T("Уточнить лицо у готового Swap-отрезка отдельным коротким проходом. Исходный дубль сохраняется."))] : []),
        btn(T("К отрезку"), () => this.modernFocusSelected(), T("Показать выбранный отрезок на таймлайне")));
      for (const b of q.querySelectorAll("button")) if ((this.run.active && b.textContent !== T("К отрезку") && b.textContent !== T("Сравнить A/B") && !["←", "→"].includes(b.textContent)) ||
        (!st.ok && [T("Сгенерировать до этого"), T("Новый дубль")].includes(b.textContent)) ||
        (b.textContent === T("Финал ↑") && s.result?.kind !== "draft")) { b.disabled = true; if (st.why) b.title = st.why; }
    },
  });
}
