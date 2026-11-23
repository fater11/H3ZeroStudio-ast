import { T, langSetting, setLangSetting } from "./h3s_i18n.js";
import { labFx } from "./lab/fx.js";   // H3ZeroStudio Lab
import { allThemes, themeSetting, applyTheme, loadPluginThemes, themeWarnings, DEFAULT_THEME } from "./h3s_theme.js";
import { uiBlurEnabled, applyUiBlur, DEFAULT_UI_BLUR } from "./h3s_ui_blur.js";
import { DEFAULT_UI_SCALE } from "./h3s_ui_scale.js";
// Generation-only snapshots: checkpoints, LoRA stacks, characters and project content are never overwritten.
const GENERATION_PRESET_FIELDS = ("piflow_steps piflow_lora2 piflow_lora4 aspect res_mode ratio image_ratio megapixels width height " +
  "steps cfg denoise sampler scheduler sigmas shift_video shift_audio final_mode " +
  "draft_scale draft_steps draft_cfg draft_sampler draft_scheduler draft_sigmas " +
  "refine_steps refine_cfg refine_sampler refine_scheduler refine_sigmas refine_seed refine_sigma " +
  "refine_schedule_mode refine_denoise refine_identity_images upscale_method upscale_model " +
  "lowhigh_low_steps lowhigh_scale lowhigh_denoise high_sigma_schedule accel memsave vram_headroom_gb").split(" ");
// «Настройки»: the rarely changed, set-once settings in their own rail tab — generation stages (1 / 2) with the
// parameters of each stage, upscale, extension and audio seams, cache, live preview, logging and the status of
// the models. They are global (stored by the server in output/h3labstudio/_settings.json and shared by all
// projects); a project can keep its own instead (settings_scope = "project", the default of older projects so
// that opening them never changes their clips). Per-clip ✎ Черновик / ✦ Чистовик run one stage for one clip.
export function installSettings(Editor, { C, h, ICON }) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  Object.assign(Editor.prototype, {
    /** Build one settings chunk; on failure return an inline error card so the rest of the panel still paints. */
    _safeSection(label, fn) {
      try { return fn(); }
      catch (e) {
        console.error("[H3ZeroStudio] settings section", label, e);
        const msg = (e && (e.message || e.stack)) || String(e);
        return h("div", { class: "h3l-note err", style: { whiteSpace: "pre-wrap", margin: "8px 0" } },
          T("Секция «{0}» не отрисовалась: {1}", label, msg));
      }
    },
    /** Shared leftovers of older versions: preview (count, size, examples), then confirm. */
    async cleanUnused() {
      try {
        this.toast(T("Ищу неиспользуемые файлы…"));
        const r = await this.host.get("/h3lab/unused");
        if (!r.files) { this.toast(T("Неиспользуемых общих файлов нет")); return; }
        const mb = (r.bytes / 1048576).toFixed(1);
        if (!confirm(T("Удалить {0} общих файлов ({1} МБ) из input/h3labstudio и _thumbs?\nНи один сохранённый проект на них не ссылается.", r.files, mb)
          + T("\nПроекты, которые есть только внутри workflow (не в списке «Проекты»), не учитываются — откройте их сначала.\n\n") + r.sample.join("\n") + (r.files > r.sample.length ? "\n…" : ""))) return;
        const d = await this.host.call("/h3lab/unused/clean", {});
        this.toast(T("Удалено файлов: {0} ({1} МБ)", d.files, (d.bytes / 1048576).toFixed(1)));
      } catch (e) { this.toast(T("Не удалось: ") + (e.message || e), true); }
    },
    // ---------------------------------------------------------------- global settings
    async globLoad(force = false) {
      if (this._glob && !force) return this._glob;
      try { this._glob = (await this.host.get("/h3lab/settings"))?.settings || {}; } catch (e) { this._glob = this._glob || {}; }
      return this._glob;
    },
    globScope() { return this.p.settings.settings_scope === "global"; },
    globVals(st = this.p.settings) { const o = {}; for (const k of C.GLOBAL_KEYS) o[k] = st[k]; return o; },
    /** Silent settings change (no undo step): following the global settings is not an edit of the project. */
    setSettingsQuiet(vals) {
      this.p = C.normalizeProject({ ...this.p, settings: { ...this.p.settings, ...vals } });
      this.flushSave();
      if (this.root) this.renderAll();
    },
    /** On open / project switch: a «global» project takes the global values. The very first time (no global
     *  settings yet) the open project's settings become the global ones. */
    async globSync() {
      // the global draft mode is gone (stages replace it): a project saved in it opens as «2 этапа»
      if (this.p.settings.quality === "draft") this.setSettingsQuiet({ quality: "final", final_mode: "refine" });
      const pid = this.p.id, g = await this.globLoad();
      if (!this.root || this.p.id !== pid) return;
      if (!Object.keys(g).length) {
        if (this._globSeeded) return;
        this._globSeeded = true;
        await this.globPut(this.globVals(), true);
        if (!this.globScope()) this.setSettingsQuiet({ settings_scope: "global" });
        return;
      }
      if (!this.globScope()) return;
      const diff = {};
      for (const k of C.GLOBAL_KEYS) if (k in g && !same(g[k], this.p.settings[k])) diff[k] = g[k];
      if (!Object.keys(diff).length) return;
      const before = this.p.segments.map((_, i) => this.isStale(i));
      this.setSettingsQuiet(diff);
      const nowStale = this.p.segments.filter((s, i) => s.result && !before[i] && this.isStale(i)).length;
      if (nowStale) this.toast(T("Применены глобальные настройки ({0} парам.) — {1} клип(ов) устарели. «Только этот проект» в «Настройках» — оставить проекту свои", Object.keys(diff).length, nowStale), true,
        { label: T("Настройки"), fn: () => this.openSettings() });
    },
    async globPut(vals, replace = false) {
      this._glob = { ...(replace ? {} : this._glob || {}), ...vals };
      clearTimeout(this._globT);
      const send = async () => { try { const r = await this.host.call("/h3lab/settings", { settings: this._glob, replace: true }); if (r?.settings) this._glob = r.settings; } catch (e) { this.toast(T("Не удалось сохранить глобальные настройки: ") + (e.message || e), true); } };
      if (replace) return send();
      this._globT = setTimeout(send, 400);
    },
    /** A set-once setting changed in «Настройки»: the project, and the global settings if it follows them. */
    setOnce(k, v, opt) {
      this.mutate((p) => { p.settings[k] = v; }, opt);
      if (this.globScope() && C.GLOBAL_KEYS.includes(k)) this.globPut({ [k]: this.p.settings[k] });
    },
    /** Names and settings snapshots are stored by ComfyUI, not localStorage. */
    generationPresetSnapshot() {
      const st = this.p.settings, out = {};
      for (const k of GENERATION_PRESET_FIELDS) if (k in st) out[k] = JSON.parse(JSON.stringify(st[k]));
      return out;
    },
    refreshGenerationPresetPanel() {
      if (this._prefs) this.prefsRefresh();
      else if (this.root) this.renderLeft();
    },
    async loadGenerationPresets() {
      if (Array.isArray(this._generationPresets) || this._generationPresetsLoading) return;
      this._generationPresetsLoading = true;
      try {
        const r = await this.host.get("/h3lab/generation-presets");
        this._generationPresets = Array.isArray(r.presets) ? r.presets : [];
      } catch (e) {
        this._generationPresets = [];
        this.toast(T("Не удалось загрузить пресеты генерации: ") + (e.message || e), true);
      } finally {
        this._generationPresetsLoading = false;
        this.refreshGenerationPresetPanel();
      }
    },
    async changeGenerationPreset(action, id, name = "") {
      try {
        const r = await this.host.call("/h3lab/generation-presets", {
          action, id: id || "", name, ...(action === "save" ? { settings: this.generationPresetSnapshot() } : {}),
        });
        if (!Array.isArray(r.presets)) throw Error(T("Неверный ответ сервера"));
        this._generationPresets = r.presets;
        this._selectedGenerationPreset = action === "delete" ? "" : (r.id || id);
        this.toast(action === "delete" ? T("Пресет удалён") : action === "rename" ? T("Пресет переименован") : T("Параметры сохранены как пресет «{0}»", name));
        this.refreshGenerationPresetPanel();
      } catch (e) { this.toast(T("Не удалось сохранить пресет: ") + (e.message || e), true); }
    },
    applySavedGenerationPreset(id) {
      const item = (this._generationPresets || []).find((p) => p.id === id);
      if (!item || !item.settings) return;
      if (this.p.segments.some((s) => s.result) &&
        !confirm(T("Применить пресет «{0}»? Готовые отрезки останутся на диске, но при изменении параметров могут потребовать перегенерации.", item.name))) return;
      const vals = {};
      for (const k of GENERATION_PRESET_FIELDS) if (k in item.settings) vals[k] = JSON.parse(JSON.stringify(item.settings[k]));
      this._pendingGenerationMode = null;
      this.mutate((p) => { p.settings.settings_scope = "project"; Object.assign(p.settings, vals); });
      this.toast(T("Применён пресет «{0}» · только для этого проекта", item.name));
      this.refreshGenerationPresetPanel();
    },
    /** Mode pills are a preview. The project is changed only by the Apply button. */
    pendingGenerationMode() {
      const choice = this._pendingGenerationMode;
      return choice?.project === this.p.id ? choice.mode : null;
    },
    chooseGenerationMode(mode) {
      if (!["full", "two", "luna", "pi2", "pi4"].includes(mode)) return;
      this._pendingGenerationMode = { project: this.p.id, mode };
      this.refreshGenerationPresetPanel();
    },
    cancelGenerationMode() {
      this._pendingGenerationMode = null;
      this.refreshGenerationPresetPanel();
    },
    applyGenerationMode() {
      const mode = this.pendingGenerationMode();
      if (!mode) return;
      this._pendingGenerationMode = null;
      this._setTab = "gen";
      if (mode === "pi2" || mode === "pi4") {
        const n = mode === "pi2" ? 2 : 4;
        this.mutate((p) => { p.settings.settings_scope = "project"; Object.assign(p.settings, {
          final_mode: "full", quality: "final", piflow_steps: n, steps: n,
          cfg: 1, denoise: 1, sampler: "euler", scheduler: "simple", sigmas: "",
        }); });
      } else if (mode === "two") {
        this.mutate((p) => { p.settings.settings_scope = "project"; Object.assign(p.settings, {
          final_mode: "refine", quality: "final", piflow_steps: 0,
          // the second pass keeps the user's own schedule choice (absolute σ or BasicScheduler)
          refine_schedule_mode: p.settings.refine_schedule_mode === "basic" ? "basic" : "sigma",
          refine_identity_images: false, refine_seed: -1,
          upscale_method: "learned", upscale_model: "",
        }); });
      } else {
        // Normal one-stage / LowHigh stays compatible with shared global settings.
        this.setOnce("piflow_steps", 0);
        this.setOnce("final_mode", mode);
      }
      this.toast(T("Режим генерации применён: {0}", mode === "full" ? T("1 этап") :
        mode === "two" ? T("2 этапа") : mode === "pi2" ? T("pi-H3 · 2 шага") : mode === "pi4" ? T("pi-H3 · 4 шага") : "Low Res → High Res"));
      this.refreshGenerationPresetPanel();
    },
    /** pi-H3: the step switch inside the merged DWD mode (pi-Flow schedule, Euler, CFG 1). */
    setPiSteps(n) {
      const steps = n === 4 ? 4 : 2;
      this.mutate((p) => { Object.assign(p.settings, {
        final_mode: "full", quality: "final", piflow_steps: steps, steps,
        cfg: 1, denoise: 1, sampler: "euler", scheduler: "simple", sigmas: "",
      }); });
      this.toast(T("pi-H3: {0} шага(ов)", steps));
      this.refreshGenerationPresetPanel();
    },
    /** Prefer the proven 3D backend for recipes. 2D stays manually selectable until GPU validation. */
    preferredHiRes3D() {
      const caps = this.upCaps();
      return caps?.backends?.lbh
        ? (caps.learned_models || []).find((n) => /minimax_h3_latent_upscaler_3d_conv_v1_.*\.(safetensors|pth)$/i.test(n))
        : null;
    },
    /** Optional 8-step Low Res → High Res profile (shared trajectory, not independent HiRes Refiner). */
    applyLowHighRecipe() {
      this._pendingGenerationMode = null;
      const preferred3d = this.preferredHiRes3D();
      this.mutate((p) => {
        p.settings.settings_scope = "project";
        Object.assign(p.settings, {
          final_mode: "luna", quality: "final", steps: 8, denoise: 1,
          lowhigh_low_steps: 4, lowhigh_scale: 0.65,
          lowhigh_denoise: 0.65, high_sigma_schedule: "default",
          upscale_method: "learned",
        });
        if (preferred3d) p.settings.upscale_model = preferred3d;
      });
      this.toast(T("Low/High 4+4: масштаб 65%, denoise High 0,65. Только этот проект; внешний KSAMPLER может переопределить основные параметры."));
    },
    /** Activate the cached independent Draft -> Latent HiRes Refine path without altering stage dials. */
    activateHiRes() {
      this._pendingGenerationMode = null;
      this.mutate((p) => { p.settings.settings_scope = "project"; p.settings.quality = "final"; p.settings.final_mode = "refine"; });
      this.toast(T("HiRes включён только для текущего проекта. Настройки каждого прохода — в этой вкладке."));
    },
    /** Practical independent HiRes 8+3 recipe. Never changes other projects or the H3 checkpoint. */
    applyHiResRecipe() {
      this._pendingGenerationMode = null;
      const preferred3d = this.preferredHiRes3D();
      const vals = {
        final_mode: "refine", quality: "final", upscale_method: "learned",
        draft_scale: 0.55, draft_steps: 8,
        refine_steps: 3, refine_sigma: 0.30, refine_schedule_mode: "sigma",
        draft_sampler: "er_sde", draft_scheduler: "sgm_uniform",
        refine_sampler: "er_sde", refine_scheduler: "simple",
      };
      if (preferred3d) vals.upscale_model = preferred3d;
      this.mutate((p) => { p.settings.settings_scope = "project"; Object.assign(p.settings, vals); });
      const [lw, lh] = C.workResolution(this.p.settings, "draft");
      const [fw, fh] = C.resolution(this.p.settings);
      this.toast(T("HiRes 8+3: {0}×{1} → {2}×{3}, σ 0,30. Только этот проект. Внешний KSAMPLER имеет приоритет по шагам/сэмплеру.", lw, lh, fw, fh));
    },
    /** Experimental literal BasicScheduler/SamplerCustomAdvanced-style HiRes recipe from the source graph. */
    applyHiResAdvancedRecipe() {
      this._pendingGenerationMode = null;
      const preferred3d = this.preferredHiRes3D();
      const vals = {
        final_mode: "refine", quality: "final", denoise: 1.0, upscale_method: "learned",
        draft_scale: 0.55, draft_steps: 8, refine_steps: 3,
        refine_schedule_mode: "basic", refine_denoise: 0.30,
        draft_sampler: "er_sde", draft_scheduler: "sgm_uniform",
        refine_sampler: "er_sde", refine_scheduler: "simple",
      };
      if (preferred3d) vals.upscale_model = preferred3d;
      this.mutate((p) => { p.settings.settings_scope = "project"; Object.assign(p.settings, vals); });
      this._setTab = "gen";
      this.toast(T("Эксперимент Advanced 8+3 включён: BasicScheduler simple / denoise 0,30; результаты отдельно от старого HiRes."));
    },
    /** Tested 8+3 HiRes recommendations from the 10-way, fixed-seed Ref2VA comparison. */
    applyHiResWinner(rank = 1) {
      this._pendingGenerationMode = null;
      const second = Number(rank) === 2;
      const preferred3d = this.preferredHiRes3D();
      const vals = {
        final_mode: "refine", quality: "final", cache: true,
        steps: 8, cfg: 1, denoise: 1, shift_video: 12, shift_audio: 3,
        draft_scale: 0.55, draft_steps: 8, draft_cfg: 0,
        draft_sampler: "euler", draft_scheduler: "beta57", draft_sigmas: "",
        refine_steps: 3, refine_cfg: 0, refine_schedule_mode: "basic",
        refine_denoise: 0.30, refine_sigma: 0.30,
        refine_sampler: second ? "er_sde" : "euler",
        refine_scheduler: second ? "simple" : "beta57",
        refine_sigmas: "", sigmas: "", upscale_method: "learned",
      };
      if (preferred3d) vals.upscale_model = preferred3d;
      this.mutate((p) => {
        p.settings.settings_scope = "project";
        Object.assign(p.settings, vals);
      });
      this._setTab = "gen";
      this.toast(T("HiRes · результат №{0}: Euler/beta57 → {1}, 8+3 шага, BasicScheduler denoise 0,30. Только этот проект. Фото второго прохода сохраняет ваше текущее состояние.", second ? 2 : 1, second ? "ER-SDE/simple" : "Euler/beta57"));
    },
    /** Sampler Lab: change only the selected arm; preserve the other arm for mixed A/B tests. */
    applySamplerLab(stage, label, sampler, scheduler) {
      this.mutate((p) => {
        p.settings.settings_scope = "project";
        p.settings[stage + "_sampler"] = sampler;
        p.settings[stage + "_scheduler"] = scheduler;
      });
      this.toast(T("Проход {0}: {1} / {2}. Другой проход, сид, шаги и масштаб не изменены.", stage === "draft" ? "1" : "2", sampler, scheduler));
    },
    async setScope(scope) {
      if (scope === "project") { this.mutate((p) => { p.settings.settings_scope = "project"; }); this.toast(T("Проект хранит свои настройки: их изменения не затрагивают другие проекты")); return; }
      const g = await this.globLoad(true);
      if (!Object.keys(g).length) { await this.globPut(this.globVals(), true); this.mutate((p) => { p.settings.settings_scope = "global"; }); this.toast(T("Настройки этого проекта стали глобальными")); return; }
      const diff = C.GLOBAL_KEYS.filter((k) => k in g && !same(g[k], this.p.settings[k]));
      this.mutate((p) => { p.settings.settings_scope = "global"; for (const k of diff) p.settings[k] = g[k]; });
      this.toast(diff.length ? T("Проект следует глобальным настройкам: изменено {0} парам. (часть клипов может устареть; Ctrl+Z — вернуть)", diff.length) : T("Проект следует глобальным настройкам"));
    },
    async projToGlobal() {
      if (!confirm(T("Сделать настройки этого проекта глобальными? Проекты с «Для всех проектов» получат их при открытии."))) return;
      await this.globPut(this.globVals(), true);
      this.toast(T("Глобальные настройки = настройки этого проекта"));
      this.renderLeft();
    },
    /** «Вернуть настройки по умолчанию»: the values of a fresh project (C.DEFAULT_SETTINGS through normalizeProject). */
    defaultGlobVals() { return JSON.parse(JSON.stringify(this.globVals(C.normalizeProject({}).settings))); },
    /** Confirm in the H3 dialog (as «Удалить проект»); what is reset follows «Для всех проектов» / «Только этот проект». */
    askResetSettings() {
      this.closeSaveDialog?.();
      const glob = this.globScope();
      const themeName = allThemes().find((t) => t.id === DEFAULT_THEME)?.name || DEFAULT_THEME;
      const go = h("button", { class: "h3l-btn danger", type: "button", title: T("Вернуть настройки по умолчанию") }, T("Сбросить"));
      const close = () => this.closeSaveDialog();
      go.onclick = async () => {
        go.disabled = true;
        try { await this.resetSettings(glob); close(); }
        catch (e) { this.toast(T("Не удалось сбросить настройки: ") + (e.message || e), true); go.disabled = false; }
      };
      const box = h("div", { class: "h3l-save h3l-glass h3l-setreset-dlg" },
        h("div", { class: "hd" }, h("b", null, T("↺ Вернуть настройки по умолчанию?")), h("i", { class: "grow" }),
          h("button", { class: "h3l-btn sm icon", type: "button", title: T("Закрыть"), onclick: close }, "✕")),
        h("div", { class: "h3l-note" }, glob
          ? T("Сбрасываются глобальные настройки («Для всех проектов»): все вкладки ниже вернутся к значениям по умолчанию — в этом проекте и во всех проектах с «Для всех проектов». Язык интерфейса станет «Авто», тема — «{0}», размытие панелей включится, масштаб — {1}%.", themeName, DEFAULT_UI_SCALE)
          : T("Сбрасываются настройки только этого проекта: все вкладки ниже снова станут как в глобальных настройках. Глобальные настройки, другие проекты, язык, тема и масштаб не меняются.")),
        h("div", { class: "h3l-note" }, T("Сохраняются: API-ключи и адреса LLM, папки моделей, проекты (отрезки, промпты, ассеты), модели и кэш.")),
        h("div", { class: "h3l-row" }, h("i", { class: "grow" }), h("button", { class: "h3l-btn", type: "button", onclick: close }, T("Отмена")), go));
      const modal = this.$.saveModal = h("div", { class: "h3l-modal" }, box);
      modal.addEventListener("pointerdown", (x) => { if (x.target === modal) close(); });
      box.addEventListener("keydown", (x) => { x.stopPropagation(); if (x.key === "Escape") close(); });
      this.root.append(modal);
      go.focus();
    },
    /** glob: the global settings and the interface (language, theme, blur, scale) → defaults, this project follows;
     *  else only this project's own settings → the global ones (defaults where none are saved). Undo: Ctrl+Z (project). */
    async resetSettings(glob = this.globScope()) {
      const def = this.defaultGlobVals();
      if (glob) {
        const relang = setLangSetting("auto");
        applyTheme(DEFAULT_THEME, true); this.drawDyn?.();
        applyUiBlur(DEFAULT_UI_BLUR, true);
        this.setUiScale?.(DEFAULT_UI_SCALE);   // header + welcome picker follow
        this.mutate((p) => { Object.assign(p.settings, def); });
        await this.globPut(this.globVals(), true);
        if (relang) this.toast(T("Настройки сброшены по умолчанию. Язык сменится после перезагрузки страницы"), false, { label: T("Перезагрузить"), fn: () => location.reload() });
        else this.toast(T("Настройки для всех проектов сброшены по умолчанию"));
        return;
      }
      const g = await this.globLoad(true), vals = {};
      for (const k of C.GLOBAL_KEYS) vals[k] = k in g ? JSON.parse(JSON.stringify(g[k])) : def[k];
      this.mutate((p) => { Object.assign(p.settings, vals); });
      this.toast(T("Настройки этого проекта сброшены к глобальным (Ctrl+Z — вернуть)"));
    },
    openSettings(section) {
      this.tool = "settings"; if (section) this._setOpen = section;
      this.renderTools(); this.renderLeft();
    },

    accelCaps() { return this.opts?.accel || {}; },
    accelSection(g, set, det) {
      const caps = this.accelCaps(), a = C.normalizeAccel(g.accel);
      const put = (patch) => set("accel", C.normalizeAccel({ ...a, ...patch }));
      const ATT = [
        ["kitchen", T("Kitchen attention (Comfy Kitchen)"), !!caps.kitchen, T("Встроено в ComfyUI (comfy_kitchen INT8). По умолчанию, если ядро есть на этой GPU. Тот же бэкенд, что нода «Model Attention Backend» / флаг --use-ck-attention.")],
        ["sage", "SageAttention", !!caps.sage, T("Пакет sageattention. Недоступно — установите sageattention и перезапустите ComfyUI.")],
        ["flash", "FlashAttention", !!caps.flash, T("Пакет flash-attn. Недоступно — установите flash-attn и перезапустите ComfyUI.")],
        ["pytorch", "PyTorch SDPA", true, T("Стандартный scaled_dot_product_attention PyTorch.")],
      ];
      const attPills = h("div", { class: "h3l-pills wrap" }, ...ATT.map(([id, label, ok, tip]) =>
        h("div", { class: "h3l-pill" + (a.attention === id ? " on" : "") + (ok ? "" : " dis"),
          title: ok ? tip : tip + " " + T("(не установлено)"),
          role: "button", "aria-disabled": ok ? "false" : "true", "aria-pressed": a.attention === id ? "true" : "false",
          tabindex: ok ? "0" : "-1",
          onclick: () => ok && put({ attention: id }),
          onkeydown: (e) => { if (ok && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); put({ attention: id }); } } },
          label + (ok ? "" : " ✕"))));
      const vedaHint = !caps.veda ? T("Установите custom node Veda Sparse Attention (veda-sparse/Veda-on-ComfyUI) и перезапустите ComfyUI.")
        : !(caps.veda_predictors || []).length ? T("Нет предиктора: положите .safetensors в models/veda/.")
        : T("Предиктор из models/veda/. Вызов veda_comfy.comfy_patch.apply — без проводов.");
      const preds = caps.veda_predictors || [];
      const predSel = this.themedSelect({
        value: a.veda_predictor || "",
        disabled: !caps.veda || !preds.length,
        emptyLabel: T("авто (первый найденный)"),
        options: [
          { value: "", label: T("авто (первый найденный)") },
          ...preds.map((n) => ({ value: n, label: n })),
        ],
        onChange: (v) => put({ veda_predictor: v }),
      });
      const teaHint = caps.teacache
        ? T("Таймстеп-кэш H3 (Icyoung/ComfyUI-MiniMaxH3-TeaCache или совместимый). Может чуть снизить детализацию.")
        : T("Не установлено: поставьте ComfyUI-MiniMaxH3-TeaCache (или совместимый) в custom_nodes.");
      const cmpHint = caps.compile
        ? T("torch.compile через comfy_api (как нода TorchCompileModel). Первый проход медленнее.")
        : T("comfy_api.torch_helpers недоступен в этой сборке ComfyUI.");
      const thr = h("input", { class: "h3l-in sm", type: "number", step: "0.01", min: "0.05", max: "0.5", value: a.teacache_thresh });
      thr.onchange = () => put({ teacache_thresh: Number(thr.value) });
      return det(T("Ускорение (attention / кэш)"),
        h("div", { class: "h3l-note" }, T("Патчи навешиваются на модель H3 при загрузке (без проводов), в том числе на доработку апскейла. Бэкенды внимания взаимоисключающие.")),
        this.field(T("Attention"), attPills),
        this.toggle(T("Разреженное внимание (VSA)"), a.sparse, (v) => put({ sparse: !!v }),
          caps.sparse ? T("Встроенная нода ComfyUI «Model Sparse Attention»: держит 10 % блоков внимания, короткие последовательности идут плотно. Выигрыш растёт с длиной клипа; качество проверяйте на своём материале.")
            : T("Нет встроенной ноды ComfyUI «Model Sparse Attention» (нужен ComfyUI 0.38+)."),
          !caps.sparse),
        a.sparse && caps.sparse ? this.field(T("Доля блоков VSA, %"), (() => {
          const sp = h("input", { class: "h3l-in sm", type: "number", step: "1", min: "2", max: "50", value: a.sparse_keep });
          sp.onchange = () => put({ sparse_keep: Number(sp.value) });
          return sp;
        })()) : null,
        this.toggle(T("Veda Sparse Attention (MiniMax H3)"), a.veda, (v) => put({ veda: !!v }), vedaHint, !caps.veda),
        caps.veda ? this.field(T("Предиктор Veda"), predSel) : null,
        this.toggle(T("TeaCache (кэш шагов H3)"), a.teacache, (v) => put({ teacache: !!v }), teaHint, !caps.teacache),
        a.teacache && caps.teacache ? this.field(T("порог TeaCache"), thr) : null,
        this.toggle(T("torch.compile"), a.compile, (v) => put({ compile: !!v }), cmpHint, !caps.compile));
    },

    /** v6m «Экономия памяти»: chunked feed-forward of the H3 blocks (h3s_memory) — next to «Ускорение». */
    memsaveSection(g, set, det) {
      const a = C.normalizeMemsave(g.memsave);
      const put = (patch) => set("memsave", C.normalizeMemsave({ ...a, ...patch }));
      const MODES = [["off", T("Выкл"), T("Обычный проход: feed-forward целиком.")],
        ["auto", T("Авто"), T("Включается, когда отрезок ведёт ControlNet или последовательность длинная (больше 2× порога).")],
        ["on", T("Вкл"), T("Всегда, когда последовательность длиннее порога.")]];
      const pills = h("div", { class: "h3l-pills wrap h3l-mem-modes" }, ...MODES.map(([id, label, tip]) =>
        h("div", { class: "h3l-pill" + (a.mode === id ? " on" : ""), title: tip, role: "button", tabindex: "0", "data-mode": id, "aria-pressed": a.mode === id ? "true" : "false",
          onclick: () => put({ mode: id }), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); put({ mode: id }); } } }, label)));
      const ch = h("input", { class: "h3l-in sm h3l-mem-chunks", type: "number", step: "1", min: "1", max: "16", value: a.chunks });
      ch.onchange = () => put({ chunks: Number(ch.value) });
      const th = h("input", { class: "h3l-in sm h3l-mem-thr", type: "number", step: "256", min: "256", max: "262144", value: a.threshold });
      th.onchange = () => put({ threshold: Number(th.value) });
      return det(T("Экономия памяти"),
        h("div", { class: "h3l-note" }, T("Feed-forward блоков H3 считается частями по токенам: пик VRAM ниже (особенно с ControlNet), результат тот же. Чуть медленнее на длинных отрезках. Без проводов и без сторонних нод.")),
        this.field(T("Режим"), pills),
        a.mode !== "off" ? this.field(T("Частей"), ch) : null,
        a.mode !== "off" ? this.field(T("Порог (токенов)"), th) : null);
    },

    // ---------------------------------------------------------------- stages per clip
    stagesTwo() { return this.p.settings.final_mode === "refine"; },
    /** ✎ Черновик / ✦ Чистовик for one clip — the stage settings of «Настройки», whatever the project mode. */
    stageClip(i, which) {
      const st = this.segGenState(i); if (!st.ok) { this.toast(st.why, true); return; }
      const two = this.stagesTwo();
      if (which === "final" && two && this.hasDraft(i) && !this.finalDone(i)) return this.finalFromDraft([i]);
      const kind = which === "draft" ? "draft" : two ? "refine" : "full", s = this.seg(i);
      if (s.result && (s.result.kind || C.runKind(this.p.settings)) === kind && !this.isStale(i)) {
        this.toast(T("Отрезок {0}: {1} уже готов. «Ещё дубль» — вариант с новым сидом", i + 1, which === "draft" ? T("черновик") : T("чистовик"))); return;
      }
      this.sel = i;
      this.generate({ upto: i, only: i, kind });
      const [dw, dh] = C.workResolution(this.p.settings, "draft"), [w, hh] = C.resolution(this.p.settings);
      this.toast(which === "draft" ? T("Отрезок {0}: черновик {1}×{2}", i + 1, dw, dh) : two ? T("Отрезок {0}: черновик → чистовик {1}×{2}", i + 1, w, hh) : T("Отрезок {0}: чистовик {1}×{2}", i + 1, w, hh));
    },
    stageTip(which) {
      const g = this.p.settings, two = this.stagesTwo();
      const pp = (k) => { const x = C.passParams(this.p, Math.max(0, this.sel), k); return T("{0} шаг., cfg {1}, {2}/{3}", x.steps, x.cfg, x.sampler, x.scheduler); };
      if (which === "draft") { const [a, b] = C.workResolution(g, "draft"); return T("✎ Черновик только этого клипа: {0}×{1}, {2} («Настройки» → «Этап 1»)", a, b, pp("draft")); }
      const [w, hh] = C.resolution(g);
      return two ? T("✦ Чистовик только этого клипа: черновик (если нет) → апскейл → доработка σ {0} до {1}×{2}, {3} («Настройки» → «Этап 2»)", g.refine_sigma, w, hh, pp("refine"))
        : T("✦ Чистовик только этого клипа: сразу {0}×{1}, {2} («Настройки» → «Генерация: 1 этап»)", w, hh, pp("full"));
    },
    stageButtons(i) {
      const st = this.segGenState(i);
      return h("div", { class: "h3l-row h3l-stagebtns" },
        h("button", { class: "h3l-btn sm", disabled: !st.ok || undefined, title: st.ok ? this.stageTip("draft") : st.why, onclick: () => this.stageClip(i, "draft") }, T("✎ Черновик")),
        h("button", { class: "h3l-btn sm", disabled: !st.ok || undefined, title: st.ok ? this.stageTip("final") : st.why, onclick: () => this.stageClip(i, "final") }, T("✦ Чистовик")));
    },
    /** Улучшить звук: extra sampler steps over the sound of a ready clip only (video frozen by the noise mask). */
    audioRefine(i) {
      const s = this.seg(i);
      if (this.run.active) { this.toast(T("Сейчас идёт генерация — дождитесь окончания"), true); return; }
      if (!s?.result?.video || this.isStale(i)) { this.toast(T("Отрезок {0}: сначала сгенерируйте клип (результат должен быть актуальным)", i + 1), true); return; }
      let sv = {}; try { sv = JSON.parse(localStorage.getItem("h3l_audio_refine") || "{}"); } catch (e) { /* ignore */ }
      const v = { steps: sv.steps ?? 6, denoise: sv.denoise ?? 0.45, video_denoise: sv.video_denoise ?? 0 };
      const inp = (key, min, max, step, tip) => h("input", { type: "number", min, max, step, value: v[key], title: tip, class: "h3l-num", style: "width:90px",
        oninput: (e) => { v[key] = parseFloat(e.target.value); } });
      const row = (label, el, tip) => h("div", { class: "h3l-row", title: tip, style: "justify-content:space-between;gap:12px;margin:6px 0" }, h("span", {}, label), el);
      const close = () => modal.remove();
      const go = () => {
        v.steps = Math.max(1, Math.min(50, Math.trunc(v.steps) || 6)); v.denoise = Math.max(0.05, Math.min(1, v.denoise || 0.45)); v.video_denoise = Math.max(0, Math.min(1, v.video_denoise || 0));
        try { localStorage.setItem("h3l_audio_refine", JSON.stringify(v)); } catch (e) { /* ignore */ }
        close(); this.sel = i;
        this.generate({ upto: i, only: i, audio: { ...v } });
        this.toast(T("Отрезок {0}: улучшение звука · {1} шаг., сила {2}{3}", i + 1, v.steps, v.denoise, v.video_denoise ? T(", видео {0}", v.video_denoise) : T(", видео заморожено")));
      };
      const box = h("div", { class: "h3l-glass", style: "padding:16px 18px;min-width:340px;max-width:440px" },
        h("div", { style: "font-weight:600;margin-bottom:8px" }, T("Улучшить звук — отрезок {0}", i + 1)),
        row(T("Шаги"), inp("steps", 1, 50, 1, T("Число шагов уточнения звука (по умолчанию 6)")), T("Число шагов уточнения звука (по умолчанию 6)")),
        row(T("Сила звука"), inp("denoise", 0.05, 1, 0.05, T("0.3–0.6: сохраняет звук и добавляет детали; 1.0: звук с нуля")), T("0.3–0.6: сохраняет почти весь звук и добавляет детали; 1.0: звук генерируется с нуля")),
        row(T("Сила видео"), inp("video_denoise", 0, 1, 0.05, T("0 — картинка не меняется")), T("0 — видео заморожено (картинка остаётся такой же); больше нуля разрешает частично менять видео")),
        h("div", { class: "hint", style: "margin:8px 0" }, T("Сэмплер, cfg, расписание, промпт и референсы — как у отрезка. Нужен вход audio_vae. Исходный клип не затирается: звук сохраняется отдельной копией.")),
        h("div", { class: "h3l-row", style: "justify-content:flex-end;gap:8px" },
          h("button", { class: "h3l-btn sm", onclick: close }, T("Отмена")), h("button", { class: "h3l-btn primary sm", onclick: go }, T("Улучшить"))));
      const modal = h("div", { class: "h3l-modal" }, box);
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) close(); });
      this.root.append(modal);
    },
    stageMenuEntries(i) {
      const st = this.segGenState(i);
      return [{ label: T("✎ Черновик этого клипа"), title: this.stageTip("draft"), fn: () => this.stageClip(i, "draft"), dis: !st.ok },
        { label: T("✦ Чистовик этого клипа"), title: this.stageTip("final"), fn: () => this.stageClip(i, "final"), dis: !st.ok },
        { label: T("Улучшить звук"), title: T("Дополнительные шаги семплера только по звуку клипа; картинка не меняется"), fn: () => this.audioRefine(i), dis: !st.ok || this.run.active || !this.seg(i)?.result?.video || this.isStale(i) }];
    },


    // ---------------------------------------------------------------- model downloads («Загрузка моделей»)
    openModelDownloads() {
      this._setTab = "dl";
      this.openSettings();
      this.refreshModelDownloads?.();
    },
    async refreshModelDownloads() {
      try {
        this._mdl = await this.host.get("/h3lab/models/downloads");
      } catch (e) {
        this._mdlErr = e.message || String(e);
        this._mdl = null;
      }
      if (this.tool === "settings" && this._setTab === "dl") this.renderLeft();
    },
    async pollModelDownloads() {
      if (this._mdlPoll) return;
      this._mdlPoll = setInterval(async () => {
        if (!(this.tool === "settings" && this._setTab === "dl" && this.root)) {
          clearInterval(this._mdlPoll); this._mdlPoll = null; return;
        }
        try {
          const jobs = await this.host.get("/h3lab/models/downloads/jobs");
          const running = Object.values(jobs?.jobs || {}).some((j) => j && (j.state === "running" || j.state === "queued" || j.state === "cancelling"));
          await this.refreshModelDownloads();
          if (!running && !(this._mdl?.models || []).some((m) => m.job && (m.job.state === "running" || m.job.state === "queued" || m.job.state === "cancelling"))) {
            clearInterval(this._mdlPoll); this._mdlPoll = null;
          }
        } catch (_) { /* ignore poll errors */ }
      }, 800);
    },
    /** v6l: download actions shared by the settings list and the mini-window. */
    async dlStart(id) {
      try { await this.host.call("/h3lab/models/downloads/start", { id }); this.pollModelDownloads(); this.dlMiniKick?.(); await this.refreshModelDownloads(); }
      catch (e) { this.toast(e.message || e, true); }
    },
    async dlPause(id) {
      try { await this.host.call("/h3lab/models/downloads/cancel", { id }); this.pollModelDownloads(); this.dlMiniKick?.(); }
      catch (e) { this.toast(e.message || e, true); }
    },
    async dlCancel(id) {
      try { await this.host.call("/h3lab/models/downloads/cancel", { id, discard: true }); this.toast(T("Загрузка отменена, недокачанный файл удалён")); this.pollModelDownloads(); this.dlMiniKick?.(); await this.refreshModelDownloads(); }
      catch (e) { this.toast(e.message || e, true); }
    },
    /** Show the model file (or its destination folder) in the OS file manager. */
    async dlReveal(id) {
      try {
        const r = await this.host.call("/h3lab/models/downloads/reveal", id ? { id } : {});
        if (r?.path) this.toast(T("Открыто: {0}", r.path));
      } catch (e) { this.toast(e.message || e, true); }
    },
    /** Delete the file with a two-step confirm (the button turns into «Точно?» for 4 s). */
    async dlRemove(id, btn) {
      const row = (this._mdl?.models || []).find((m) => m.id === id);
      if (!row?._armed) {
        if (row) row._armed = true;
        if (btn) { btn.dataset.armed = "1"; btn.textContent = T("Точно?"); }
        clearTimeout(this._mdlUnarm);
        this._mdlUnarm = setTimeout(() => { if (row) row._armed = false; if (this.tool === "settings" && this._setTab === "dl") this.renderLeft(); }, 4000);
        return;
      }
      row._armed = false;
      try {
        const r = await this.host.call("/h3lab/models/downloads/remove", { id });
        const paths = (r?.removed || []).map((p) => String(p).split(/[\\/]/).pop()).join(", ");
        this.toast(T("Удалено с диска: {0}", paths || id));
        this.dlMiniKick?.();
        await this.refreshModelDownloads();
      } catch (e) { this.toast(e.message || e, true); this.renderLeft(); }
    },
    fmtBytes(n) {
      n = Number(n) || 0;
      if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
      if (n >= 1e3) return (n / 1e3).toFixed(0) + " KB";
      return n + " B";
    },
    mdlRow(m) {
      const st = m.status, job = m.job;
      const busy = job && (job.state === "running" || job.state === "queued" || job.state === "cancelling");
      const pct = job && job.total ? Math.min(100, Math.round(100 * (job.downloaded || 0) / job.total)) : (st === "installed" ? 100 : 0);
      const badge = st === "installed" ? T("установлено") : job?.state === "cancelling" ? T("остановка…") : busy ? T("загрузка…") : st === "partial" ? (job?.state === "paused" ? T("пауза") : T("недокачано")) : m.verified === false ? T("URL не проверен") : T("нет");
      const found = m.found_name || (m.path ? String(m.path).split(/[\\/]/).pop() : "");
      const pathHint = m.status === "installed" && found
        ? (m.found_alt ? T("найдено: {0}", found) : (m.folder + "/" + found))
        : (m.folder + "/" + m.filename);
      const meta = h("div", { class: "h3l-mdl-meta" },
        h("b", null, m.label),
        h("small", null, m.size_label || this.fmtBytes(m.size_bytes), " · ", pathHint,
          m.optional ? " · " + T("опционально") : "",
          m.verified ? "" : " · " + T("ссылка не проверена — скачивание отключено")));
      const bar = busy || st === "partial" ? h("div", { class: "h3l-mdl-bar" }, h("i", { style: `width:${pct}%` }),
        h("span", null, busy ? `${pct}% · ${this.fmtBytes(job.downloaded)} / ${this.fmtBytes(job.total || m.size_bytes)}` + (job.speed ? ` · ${this.fmtBytes(job.speed)}/s` : "")
          : T("частичный файл · {0}", this.fmtBytes(m.partial?.bytes || 0)))) : null;
      const err = job?.error ? h("div", { class: "h3l-note err" }, job.error) : null;
      const stopping = job && job.state === "cancelling";
      const cancelB = (busy || st === "partial") ? h("button", { class: "h3l-btn sm h3l-mdl-cancel", disabled: stopping || undefined,
        title: T("Остановить и удалить недокачанный файл"), onclick: () => this.dlCancel(m.id) }, T("Отмена")) : null;
      // file actions: show it in the file manager / free the disk space (two-step confirm, no modal)
      const revealB = h("button", { class: "h3l-btn sm icon h3l-mdl-reveal",
        title: st === "installed" ? T("Показать файл в проводнике") : T("Открыть папку, куда скачается файл"),
        onclick: () => this.dlReveal(m.id) }, "📂");
      const removeB = (st === "installed" || st === "partial") && !busy
        ? h("button", { class: "h3l-btn sm icon h3l-mdl-remove", "data-armed": m._armed ? "1" : undefined,
            title: T("Удалить файл с диска"), onclick: (ev) => this.dlRemove(m.id, ev.currentTarget) },
            m._armed ? T("Точно?") : "🗑") : null;
      const btn = busy
        ? h("button", { class: "h3l-btn sm", disabled: stopping || undefined, title: T("Приостановить: недокачанный файл останется, загрузка продолжится с того же места"),
            onclick: () => this.dlPause(m.id) }, T("Пауза"))
        : st === "installed"
          ? h("span", { class: "h3l-mdl-ok" }, "✓")
          : h("button", { class: "h3l-btn sm primary", disabled: m.verified === false || undefined,
              title: m.verified === false ? T("URL не проверен — скачивание отключено") : st === "partial" ? T("Продолжить загрузку с {0}", this.fmtBytes(m.partial?.bytes || 0)) : T("Скачать в {0}", m.folder),
              onclick: () => this.dlStart(m.id) }, st === "partial" ? T("Продолжить") : T("Скачать"));
      return h("div", { class: "h3l-mdl-row" + (st === "installed" ? " ok" : "") + (m.optional ? " opt" : ""), "data-id": m.id },
        h("div", { class: "h3l-mdl-ico", "aria-hidden": "true" }, st === "installed" ? "✓" : "⬇"),
        h("div", { class: "h3l-mdl-body" }, meta, bar, err),
        h("div", { class: "h3l-mdl-act" }, h("span", { class: "h3l-mdl-badge" }, badge), revealB, removeB, btn, cancelB));
    },
    mdlDownloadsPanel() {
      const data = this._mdl, err = this._mdlErr;
      if (!data && !err) {
        this.refreshModelDownloads();
        return h("div", { class: "h3l-note" }, T("Проверка моделей…"));
      }
      if (err && !data) return h("div", { class: "h3l-note err" }, T("Не удалось получить список: {0}", err));
      const c = data.counts || {}, groups = data.groups || [];
      const head = h("div", { class: "h3l-mdl-head" },
        h("div", null, h("h4", null, T("Загрузка моделей")),
          h("span", { class: "h3l-mdl-count" }, `${c.installed || 0}/${c.total || 0}`)),
        h("div", { class: "h3l-row" },
          h("button", { class: "h3l-btn sm icon", title: T("Открыть папку моделей ComfyUI"), onclick: () => this.dlReveal("") }, "📂"),
          h("button", { class: "h3l-btn sm icon", title: T("Обновить статусы"), onclick: () => this.refreshModelDownloads() }, "↻"),
          h("button", { class: "h3l-btn sm primary", title: T("Скачать все обязательные модели (без опциональных)"),
            onclick: async () => {
              try { await this.host.call("/h3lab/models/downloads/start", { all: true }); this.pollModelDownloads(); await this.refreshModelDownloads(); }
              catch (e) { this.toast(e.message || e, true); }
            } }, T("Скачать все"))));
      const note = h("div", { class: "h3l-note" },
        T("Файлы сохраняются в стандартные папки ComfyUI (folder_paths / extra_model_paths.yaml). Загрузка потоковая с докачкой (.part). Опциональные модели «Скачать все» не трогает."));
      const blocks = groups.map((g) => {
        const rows = (data.models || []).filter((m) => m.group === g.id);
        if (!rows.length) return null;
        return h("div", { class: "h3l-mdl-group" },
          h("div", { class: "h3l-mdl-gtitle" }, T(g.label)),
          ...rows.map((m) => this.mdlRow(m)));
      });
      // start polling if any job active
      if ((data.models || []).some((m) => m.job && (m.job.state === "running" || m.job.state === "queued"))) this.pollModelDownloads();
      return h("div", { class: "h3l-mdl" }, head, note, ...blocks);
    },

    // ---------------------------------------------------------------- first-run welcome
    async maybeShowWelcome() {
      if (this._welcomeChecked || !this.root) return;
      this._welcomeChecked = true;
      let ui = {};
      try { ui = await this.host.get("/h3lab/ui") || {}; } catch (_) { return; }
      if (ui.welcome_dismissed) return;
      let scan = null;
      try { scan = await this.host.get("/h3lab/models/downloads"); } catch (_) {}
      this.showWelcome(scan);
    },
    showWelcome(scan) {
      this.closeWelcome?.();
      const c = scan?.counts || {};
      const miss = c.required_missing ?? null;
      const status = miss == null ? T("Статус моделей пока неизвестен.")
        : miss === 0 ? T("Все обязательные модели на месте.")
        : T("Не хватает обязательных моделей: {0} из {1}.", miss, c.required_total || "?");
      const close = async (dismiss) => {
        if (dismiss) {
          try { await this.host.call("/h3lab/ui", { welcome_dismissed: true }); } catch (_) {}
        }
        this.closeWelcome();
      };
      this._welcomeScan = scan;
      const need = miss !== 0;   // missing or unknown → point to the downloads tab
      const never = h("input", { type: "checkbox" });
      const done = () => close(never.checked);
      const box = h("div", { class: "h3l-welcome h3l-glass" },
        h("div", { class: "hd" }, h("b", null, T("Добро пожаловать в H3ZeroStudio")), h("i", { class: "grow" }),
          h("button", { class: "h3l-btn sm icon", title: T("Закрыть"), "aria-label": T("Закрыть"), html: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>', onclick: () => done() })),
        h("div", { class: "h3l-welcome-body" },
          h("p", null, T("Таймлайн-редактор для MiniMax H3 в ComfyUI: отрезки, референсы, черновик/чистовик, апскейл и Prompt Studio.")),
          h("p", { class: "h3l-note" + (miss === 0 ? " ok" : miss ? " warn" : "") }, status),
          need ? h("p", { class: "h3l-note" }, T("Скачайте веса на вкладке «Загрузка моделей» в Настройках — без них генерация не запустится.")) : null),
        // LAB: project links (open in a new tab)
        h("div", { class: "h3l-welcome-links" },
          h("a", { class: "h3l-btn h3l-linkbtn gh", href: "https://github.com/zeroleloushe/H3ZeroStudio", target: "_blank", rel: "noopener noreferrer", title: T("Открыть репозиторий на GitHub (новая вкладка)"),
            html: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg><span>' + T("GitHub") + '</span>' })),
        h("div", { class: "h3l-row" },
          h("label", { class: "h3l-check" }, never, h("span", { class: "box", "aria-hidden": "true" }), h("span", null, T("Больше не показывать"))),
          h("i", { class: "grow" }),
          need ? h("button", { class: "h3l-btn sm", onclick: () => done() }, T("Позже")) : null,
          need ? h("button", { class: "h3l-btn primary sm", onclick: () => { done(); this.openModelDownloads(); } }, T("Перейти к загрузке"))
            : h("button", { class: "h3l-btn primary sm", onclick: () => done() }, T("Начать"))));
      const modal = this.$.welcomeModal = h("div", { class: "h3l-modal" }, box);
      modal.addEventListener("pointerdown", (e) => { if (e.target === modal) done(); });
      this.root.append(modal);
    },
    closeWelcome() { if (this.$.welcomeModal) { this.$.welcomeModal.remove(); this.$.welcomeModal = null; } },
    reopenWelcome() {
      this._welcomeChecked = true;
      this.host.get("/h3lab/models/downloads").then((s) => this.showWelcome(s)).catch(() => this.showWelcome(null));
    },

    // ---------------------------------------------------------------- the tab
    generationPresetsPanel() {
      if (!Array.isArray(this._generationPresets)) void this.loadGenerationPresets();
      const items = this._generationPresets || [], chosen = this._selectedGenerationPreset || "";
      const select = h("select", { class: "h3l-sel", "aria-label": T("Сохранённые настройки генерации") },
        h("option", { value: "", selected: !items.some((p) => p.id === chosen) },
          items.length ? T("Выберите сохранённый пресет") : T("Нет сохранённых пресетов")),
        ...items.map((p) => h("option", { value: p.id, selected: p.id === chosen }, p.name)));
      select.onchange = () => { this._selectedGenerationPreset = select.value; apply.disabled = !select.value; };
      const name = h("input", { class: "h3l-in", type: "text", maxlength: 80,
        placeholder: T("Название нового пресета"), "aria-label": T("Название нового пресета") });
      const save = h("button", { type: "button", class: "h3l-btn sm primary", disabled: true,
        onclick: () => this.changeGenerationPreset("save", "", name.value.trim()) }, T("＋ Сохранить новый"));
      name.oninput = () => { save.disabled = !name.value.trim(); };
      const apply = h("button", { type: "button", class: "h3l-btn sm", disabled: !items.some((p) => p.id === chosen),
        onclick: () => this.applySavedGenerationPreset(select.value) }, T("Применить пресет"));
      const manage = h("details", { class: "h3l-gen-manage" },
        h("summary", null, T("Управление пресетами")),
        h("div", { class: "h3l-row wrap" },
          h("button", { type: "button", class: "h3l-btn sm", onclick: () => {
            const p = items.find((x) => x.id === select.value); if (!p) return;
            const next = prompt(T("Новое название пресета"), p.name);
            if (next !== null && next.trim()) void this.changeGenerationPreset("rename", p.id, next.trim());
          } }, T("Переименовать")),
          h("button", { type: "button", class: "h3l-btn sm danger", onclick: () => {
            const p = items.find((x) => x.id === select.value); if (!p) return;
            if (confirm(T("Удалить сохранённый пресет «{0}»? Настройки проектов не изменятся.", p.name)))
              void this.changeGenerationPreset("delete", p.id);
          } }, T("Удалить"))));
      return h("section", { class: "h3l-gen-presets" },
        h("div", { class: "h3l-lbl" }, T("Мои пресеты генерации")),
        h("div", { class: "h3l-note" }, T("Сохраняют шаги, сэмплеры, разрешение, два прохода и ускорение. Модели, LoRA, промпты и готовые видео не меняются.")),
        h("div", { class: "h3l-gen-presets-grid" }, this.field(T("Новый пресет"), name), this.field(T("Сохранённые"), select)),
        h("div", { class: "h3l-row wrap" }, save, apply), manage);
    },
    renderSettings(L) {
      const g = this.p.settings, set = (k, v, opt) => this.setOnce(k, v, opt), glob = this.globScope();
      const det = (title, ...kids) => { const d = h("details", { class: "h3l-det" }, h("summary", null, title), h("div", { class: "in" }, ...kids)); if (this._setOpen === title) d.open = true; return d; };
      const num = (k, label, step, min, max, ph) => { const e = h("input", { class: "h3l-in", type: "number", step, min, max, value: g[k] || (ph ? "" : g[k]), placeholder: ph || "" });
        e.onchange = () => set(k, e.value === "" ? (ph ? 0 : C.DEFAULT_SETTINGS[k]) : Math.max(min, Math.min(max, Number(e.value)))); return this.field(label, e); };
      const sel = (k, label, list, empty) => { const opts = empty ? ["", ...list] : list;
        const e = h("select", { class: "h3l-sel" }, (opts.includes(g[k]) ? opts : [g[k], ...opts]).map((x) => h("option", { value: x, selected: x === g[k] }, x === "" ? T("как основной · {0}", empty) : x)));
        e.onchange = () => set(k, e.value); return this.field(label, e); };
      const pill = (on, label, title, fn) => h("div", { class: "h3l-pill" + (on ? " on" : ""), title, onclick: fn }, label);
      const [w, hh] = C.resolution(g), [dw, dh] = C.workResolution(g, "draft"), two = g.final_mode === "refine", luna = g.final_mode === "luna";
      const head = h("div", { class: "h3l-ph" }, h("h3", null, T("Настройки")));
      const scope = h("div", { class: "h3l-setscope" },
        h("div", { class: "h3l-pills" }, pill(glob, T("Для всех проектов"), T("Глобальные настройки: общие для всех проектов, которые им следуют"), () => !glob && this.setScope("global")),
          pill(!glob, T("Только этот проект"), T("Свои настройки проекта: изменения не затрагивают другие проекты"), () => glob && this.setScope("project"))),
        h("div", { class: "h3l-note" }, glob ? T("Изменения здесь сохраняются глобально и применяются ко всем проектам с «Для всех проектов».") : T("Этот проект хранит свои настройки (так открываются проекты прошлых версий, чтобы их клипы не устарели).")),
        !glob ? h("button", { class: "h3l-btn sm", title: T("Записать настройки этого проекта как глобальные"), onclick: () => this.projToGlobal() }, T("Сделать глобальными")) : null);
      // «Вернуть настройки по умолчанию» (between the scope block and the tabs): confirm, then reset per the scope
      const resetBtn = h("button", { class: "h3l-btn sm danger h3l-setreset", type: "button",
        title: glob ? T("Глобальные настройки и интерфейс — к значениям по умолчанию (API-ключи и проекты сохраняются)") : T("Настройки этого проекта — к глобальным (API-ключи и проекты сохраняются)"),
        onclick: () => this.askResetSettings() }, T("↺ Вернуть настройки по умолчанию"));
      // generation stages
      if (!this._mp) this.mpLoad().then(() => { if (this.tool === "settings" && this._setTab === "gen") this.renderLeft(); });
      const smp = this.opts.samplers, sch = this.opts.schedulers;
      const lowhighTotal = Math.max(2, Math.trunc(Number(g.steps) || 2));
      const [lowhighLow] = C.lowhighParams(g, lowhighTotal);
      const lowhighRequested = Math.trunc(Number(g.lowhigh_low_steps) || 0);
      const lowhighAuto = Math.max(1, Math.min(lowhighTotal - 1, Math.floor(lowhighTotal * 2 / 3 + 0.5)));
      const pendingGenMode = this.pendingGenerationMode();
      const activeGenMode = g.piflow_steps === 2 && g.final_mode === "full" ? "pi2" : g.piflow_steps === 4 && g.final_mode === "full" ? "pi4" : g.final_mode === "full" ? "full" : g.final_mode === "luna" ? "luna" : "two";
      const displayedGenMode = pendingGenMode || activeGenMode;
      const uiPi = displayedGenMode === "pi2" || displayedGenMode === "pi4";
      const uiLuna = displayedGenMode === "luna";
      const uiTwo = displayedGenMode === "two";
      const confirmGenMode = () => pendingGenMode ? h("div", { class: "h3l-row wrap" },
        h("span", { class: "h3l-note warn" },
          T("Выбран режим «{0}». Нажмите «Применить», чтобы изменить метод генерации.",
            pendingGenMode === "full" ? T("1 этап") : pendingGenMode === "two" ? T("2 этапа") : pendingGenMode === "pi2" ? T("pi-H3 · 2 шага") : pendingGenMode === "pi4" ? T("pi-H3 · 4 шага") : "Low Res → High Res")),
        h("button", { type: "button", class: "h3l-btn sm", onclick: () => this.cancelGenerationMode() }, T("Отмена")),
        h("button", { type: "button", class: "h3l-btn primary sm", onclick: () => this.applyGenerationMode() }, T("Применить"))) : null;
      const lowhighSplit = h("select", { class: "h3l-sel" },
        h("option", { value: 0, selected: lowhighRequested === 0 }, T("Авто · {0} Low + {1} High", lowhighAuto, lowhighTotal - lowhighAuto)),
        ...Array.from({ length: lowhighTotal - 1 }, (_, i) => {
          const n = i + 1;
          return h("option", { value: n, selected: lowhighRequested === n }, T("{0} Low + {1} High", n, lowhighTotal - n));
        }));
      lowhighSplit.onchange = () => set("lowhigh_low_steps", Number(lowhighSplit.value));
      const stages = det(T("Генерация"),
        h("div", { class: "h3l-pills" },
          pill(displayedGenMode === "full", T("1 этап"), T("«Сгенерировать» сразу делает {0}×{1}", w, hh), () => this.chooseGenerationMode("full")),
          pill(displayedGenMode === "two", T("2 этапа"), T("Черновик {0}×{1} → латентный апскейл и доработка до {2}×{3}; второй проход настраивается ниже", dw, dh, w, hh), () => this.chooseGenerationMode("two")),
          pill(displayedGenMode === "luna", "Low Res → High Res", T("Один запуск с настраиваемым разделением шагов и обученным латентным апскейлером"), () => this.chooseGenerationMode("luna")),
          pill(uiPi, T("π pi-H3 · DWD"), T("Эксперимент · только pruned-модель · адаптер DWD, шаги и файл ниже"), () => { if (!uiPi) this.chooseGenerationMode("pi2"); })),
        confirmGenMode(),
        h("div", { class: "h3l-note" }, uiPi ? T("pi-H3: одноэтапная генерация, {0} шага(ов), Euler, CFG 1 и расписание pi-Flow задаются автоматически.", displayedGenMode === "pi2" ? 2 : 4)
          : uiLuna ? T("Low Res: {0} шаг(ов), High Res: {1} шаг(ов). Масштаб — доля конечной ширины и высоты; High Res denoise управляет начальной σ второго прохода. Внешние SIGMAS не используются.", lowhighLow, lowhighTotal - lowhighLow)
          : uiTwo ? T("2 этапа: каждый отрезок сначала черновиком {0}×{1}, затем сразу чистовик — апскейл и доработка до {2}×{3} (композиция, движение и звук черновика сохраняются).", dw, dh, w, hh)
          : T("1 этап: каждый отрезок сразу в {0}×{1}.", w, hh)),
        !uiPi ? h("div", { class: "h3l-note" }, T("Сначала выберите режим выше, затем нажмите «Применить». «Черновик» клипа использует параметры «Прохода 1» ниже.")) : null,
        displayedGenMode.startsWith("pi") ? h("div", { class: "h3l-note warn" },
          T("Экспериментальный pi-H3 DWD: только pruned-модель MiniMax H3, готовые кадры декодирует DWD вместо видео-VAE (видео-VAE остаётся для референсов, аудио-VAE — для звука), final_step_size_scale 0.60. Нужен пресет с pruned-моделью и отключённые входы MODEL, SAMPLER и SIGMAS ноды H3ZeroStudio.")) : null,
        uiPi ? h("div", { class: "h3l-grid2" },
          this.field(T("Шаги pi-H3"), h("div", { class: "h3l-pills" },
            pill(g.piflow_steps !== 4, "2", T("2 шага · max_raw_t 0.930"), () => this.setPiSteps(2)),
            pill(g.piflow_steps === 4, "4", T("4 шага · max_raw_t 0.960"), () => this.setPiSteps(4)))),
          this.field(T("Адаптер DWD (LoRA)"), h("div", { class: "h3l-note" },
            T("Адаптер привязан к числу шагов: у 2 шагов своя привязка, у 4 — своя. Файл берётся из папок loras.")))) : null,
        uiPi ? h("div", { class: "h3l-grid2" },
          this.field(T("Адаптер DWD (LoRA) · 2 шага"), (() => {
            const loras = (this._mp?.files?.lora || []).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
            const sel = h("select", { class: "h3l-sel", title: T("Файл адаптера для расписания в 2 шага") },
              h("option", { value: "", selected: !g.piflow_lora2 }, T("авто · pi_h3_2step_dwd_adapter_int8_convrot.safetensors")),
              ...loras.map((f) => h("option", { value: f, selected: f === g.piflow_lora2 }, f)),
              g.piflow_lora2 && !loras.includes(g.piflow_lora2) ? h("option", { value: g.piflow_lora2, selected: true }, g.piflow_lora2) : null);
            sel.onchange = () => set("piflow_lora2", sel.value);
            return sel;
          })()),
          this.field(T("Адаптер DWD (LoRA) · 4 шага"), (() => {
            const loras = (this._mp?.files?.lora || []).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
            const sel = h("select", { class: "h3l-sel", title: T("Файл адаптера для расписания в 4 шага") },
              h("option", { value: "", selected: !g.piflow_lora4 }, T("авто · pi_h3_4step_dwd_adapter_int8_convrot.safetensors")),
              ...loras.map((f) => h("option", { value: f, selected: f === g.piflow_lora4 }, f)),
              g.piflow_lora4 && !loras.includes(g.piflow_lora4) ? h("option", { value: g.piflow_lora4, selected: true }, g.piflow_lora4) : null);
            sel.onchange = () => set("piflow_lora4", sel.value);
            return sel;
          })())) : null,
        !uiPi ? h("details", { class: "h3l-gen-manage" }, h("summary", null, T("Быстрые сценарии и эксперименты")),
          h("div", { class: "h3l-row wrap" },
            h("button", { type: "button", class: "h3l-btn sm",
              title: T("SelfLift: 4 шага Low Res + 4 High Res; отдельный от двухпроходного HiRes."),
              onclick: () => this.applyLowHighRecipe() }, T("Low/High 4+4 · 8 шагов")))) : null,
        !uiPi ? h("div", { class: "h3l-lbl" }, T("Основной проход"), h("em", null, uiTwo ? T("по умолчанию для этапов") : uiLuna ? T("общее число шагов для Low + High") : T("единственный этап"))) : null,
        !uiPi ? h("div", { class: "h3l-grid3" }, num("steps", T("шаги"), 1, 1, 200), num("cfg", "cfg", 0.1, 0, 30), num("denoise", "denoise", 0.01, 0, 1)) : null,
        uiLuna ? h("div", { class: "h3l-grid3" },
          this.field(T("Шаги Low / High"), lowhighSplit),
          num("lowhigh_scale", T("Масштаб Low Res"), 0.01, 0.25, 1),
          num("lowhigh_denoise", T("Denoise High Res"), 0.01, 0.10, 1)) : null,
        uiLuna ? this.toggle(T("Эксперимент: Karras ρ=7 для High Res"), g.high_sigma_schedule === "karras7",
          (v) => set("high_sigma_schedule", v ? "karras7" : "default"),
          T("Меняет интервалы тех же шагов High Res. Ускорение и улучшение качества не подтверждены; обычный режим рекомендуется.")) : null,
        !uiPi ? h("div", { class: "h3l-grid2" }, sel("sampler", T("сэмплер"), smp),
          this.field(T("расписание"), this.schedSel(g.scheduler, sch, (v) => set("scheduler", v),
            { value: g.sigmas, onch: (t) => set("sigmas", t, { coalesce: "sigmas", render: "none" }) }))) : null,
        uiPi ? h("details", { class: "h3l-gen-manage" }, h("summary", null, T("Дополнительно · shift видео/аудио")),
          h("div", { class: "h3l-note" }, T("Shift применяется к модели до pi-Flow Scheduler. Менять только для осознанных экспериментов.")),
          h("div", { class: "h3l-grid2" }, num("shift_video", T("shift видео"), 0.1, 0, 100), num("shift_audio", T("shift аудио"), 0.1, 0.01, 100)))
          : h("div", { class: "h3l-grid2" }, num("shift_video", T("shift видео"), 0.1, 0, 100), num("shift_audio", T("shift аудио"), 0.1, 0.01, 100)),
        !uiPi ? h("div", { class: "h3l-note" }, T("Turbo LoRA Ref2VA: 4 шага, cfg 1. Без LoRA — ~20 шагов. shift видео 0 — расписание модели. fps — всегда 24 (H3). LCM даёт лучший звук, но слабее движение и картинку.")) : null);
      const scale = h("select", { class: "h3l-sel" }, C.DRAFT_SCALES.map((k) => { const [a, b] = C.workResolution({ ...g, quality: "draft", draft_scale: k }, "draft"); return h("option", { value: k, selected: Number(g.draft_scale) === k }, T("{0} Мп · {1}×{2} ({3}%)", (a * b / 1e6).toFixed(2), a, b, Math.round(k * 100))); }));
      scale.onchange = () => set("draft_scale", Number(scale.value));
      const st1 = det(T("Черновик = Проход 1"),
        this.field(T("Размер"), scale),
        h("div", { class: "h3l-grid2" }, num("draft_steps", T("шаги"), 1, 0, 200, String(g.steps)), num("draft_cfg", "cfg", 0.1, 0, 30, String(g.cfg))),
        h("div", { class: "h3l-grid2" }, sel("draft_sampler", T("сэмплер"), smp, g.sampler),
          this.field(T("расписание"), this.schedSel(g.draft_scheduler, sch, (v) => set("draft_scheduler", v),
            { value: g.draft_sigmas, onch: (t) => set("draft_sigmas", t, { coalesce: "dsigmas", render: "none" }) },
            T("как основной · {0}", g.scheduler)))),
        h("div", { class: "h3l-note" }, T("Это единые параметры «Черновика» и первого прохода обоих HiRes-режимов. Пустые значения наследуются от основного прохода; изменения здесь сразу отражаются везде.")));
      const sig = h("select", { class: "h3l-sel", title: T("σ старта доработки: 0.25–0.45 сохраняет черновик и добавляет детали") },
        [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7].map((v) => h("option", { value: v, selected: Math.abs(Number(g.refine_sigma) - v) < 1e-6 }, `σ ${v.toFixed(2)}` + (v === 0.4 ? T(" · рекоменд.") : v > 0.45 ? T(" · сильно") : ""))));
      sig.onchange = () => set("refine_sigma", Number(sig.value));
      const modeSel = h("select", { class: "h3l-sel" },
        h("option", { value: "sigma", selected: g.refine_schedule_mode !== "basic" }, T("Абсолютная σ · предыдущий HiRes")),
        h("option", { value: "basic", selected: g.refine_schedule_mode === "basic" }, T("BasicScheduler · как в исходном графе")));
      modeSel.onchange = () => set("refine_schedule_mode", modeSel.value);
      const uc = this.upCaps();
      const upscaleNames = uc?.learned_models || [];
      const currentUpscale = g.upscale_model || "";
      const upscaleOptions = currentUpscale && !upscaleNames.includes(currentUpscale)
        ? [currentUpscale, ...upscaleNames] : upscaleNames;
      const upscaleSel = h("select", { class: "h3l-sel", title: T("Обученная H3-модель для увеличения латента перед вторым проходом. 2D экономичнее, 3D лучше учитывает движение; доступность зависит от установленных нод.") },
        h("option", { value: "", selected: !currentUpscale }, T("Авто · первая совместимая модель")),
        ...upscaleOptions.map((n) => h("option", { value: n, selected: n === currentUpscale },
          (n.includes("2d_conv") ? "2D · " : n.includes("3d_conv") ? "3D · " : "") + n)));
      upscaleSel.onchange = () => set("upscale_model", upscaleSel.value);
      const st2 = det(T("HiRes · Проход 2 — доработка"),
        this.field(T("Алгоритм расписания второго прохода"), modeSel),
        h("div", { class: "h3l-grid2" },
          g.refine_schedule_mode === "basic"
            ? num("refine_denoise", T("Denoise (доля расписания)"), 0.05, 0.1, 1.0)
            : this.field(T("Начальная σ"), sig),
          num("refine_steps", T("шаги"), 1, 0, 200, String(C.passSteps({ ...g, refine_steps: 0 }, Number(g.steps), "refine")))),
        h("div", { class: "h3l-grid2" }, sel("refine_sampler", T("сэмплер"), smp, g.sampler),
          this.field(T("расписание"), this.schedSel(g.refine_scheduler, sch, (v) => set("refine_scheduler", v),
            { value: g.refine_sigmas, onch: (t) => set("refine_sigmas", t, { coalesce: "rsigmas", render: "none" }) },
            T("как основной · {0}", g.scheduler)))),
        h("div", { class: "h3l-grid2" }, num("refine_cfg", "cfg", 0.1, 0, 30, String(g.cfg)), h("div")),
        h("div", { class: "h3l-grid2" },
          num("refine_seed", T("Сид чистовика (-1 = как черновик)"), 1, -1, Number.MAX_SAFE_INTEGER),
          h("div", { class: "h3l-row wrap" },
            h("button", { type: "button", class: "h3l-btn sm", onclick: () => set("refine_seed", Math.floor(Math.random() * 2147483647)) }, T("🎲 Новый сид")),
            h("button", { type: "button", class: "h3l-btn sm", disabled: Number(g.refine_seed) < 0, onclick: () => set("refine_seed", -1) }, T("Как у черновика")))),
        this.field(T("Модель латентного апскейлера"), upscaleSel),
        h("div", { class: "h3l-note" }, T("2D-модель (LBH) чуть сдвигает геометрию: на стыке с исходным видеом лучше 3D — встроенная MiniMaxH3LatentUpscaleWithModel.")),
        this.toggle(T("Эксперимент · фото персонажей во 2-м проходе"), !!g.refine_identity_images,
          (v) => set("refine_identity_images", v),
          T("Если карточка персонажа состоит из нескольких фотографий и голоса, первый снимок будет передан во второй проход как Picture вместо псевдовидео. Голос останется Audio. Оригинальный HiRes не меняется, пока переключатель выключен.")),
        h("div", { class: "h3l-note" }, T("Для усиления сходства с референсом включите фото персонажей во 2-м проходе. Это A/B-эксперимент: в кэш записывается отдельный результат, а дополнительный референс может увеличить подготовку.")),
        this.upStretchNote ? this.upStretchNote() : null,
        h("div", { class: "h3l-note" }, T("Рефайнер запускается независимо после полного первого прохода. Звук сохраняется из первого прохода без изменений. Смена модели апскейлера создаёт новый ключ кэша.")),
        g.refine_schedule_mode === "basic"
          ? h("div", { class: "h3l-note warn" }, T("Важно: Denoise 0,30 — доля расписания, НЕ σ 0,30. Из-за H3 shift фактическая стартовая σ может быть значительно выше; точное значение появится в логе перед генерацией."))
          : null);
      // Stock and independent HiRes now share the controls above; no duplicate forms or sidebar tabs.
      const hiresAdvanced = det(T("2 этапа · параметры и профили"),
        h("div", { class: "h3l-note" }, T("2 этапа: готовый черновик → обученный латентный 3D-апскейл → новая доработка видео. Сэмплер, расписание, шаги и CFG настраиваются отдельно для каждого прохода ниже.")),
        h("div", { class: "h3l-row wrap" },
          h("button", { type: "button", class: "h3l-btn primary sm",
            title: T("Применить проверенный профиль №1: 8+3 шага, Euler/beta57 на обоих проходах, BasicScheduler denoise 0,30. Меняет только настройки текущего проекта; генерацию не запускает."),
            onclick: () => this.applyHiResWinner(1) }, T("★ Рекомендуемые параметры"))),
        h("details", { class: "h3l-gen-manage" },
          h("summary", null, T("Альтернативный профиль")),
          h("button", { type: "button", class: "h3l-btn sm",
            title: T("8 шагов Euler/beta57 → 3 шага ER-SDE/simple; BasicScheduler denoise 0,30; масштаб основы 55%."),
            onclick: () => this.applyHiResWinner(2) }, T("Результат №2 · Другая комбинация"))),
        h("div", { class: "h3l-row wrap" },
          h("button", { type: "button", class: "h3l-btn sm", disabled: g.refine_schedule_mode === "basic" || undefined,
            onclick: () => set("refine_schedule_mode", "basic") }, g.refine_schedule_mode === "basic" ? T("✓ BasicScheduler") : T("BasicScheduler + свой сэмплер")),
          h("button", { type: "button", class: "h3l-btn sm", disabled: g.refine_schedule_mode !== "basic" || undefined,
            onclick: () => set("refine_schedule_mode", "sigma") }, g.refine_schedule_mode === "basic" ? T("Вернуть абсолютную σ") : T("✓ Абсолютная σ"))),
        h("div", { class: "h3l-note" }, T("Шаги, CFG, разрешение и shift находятся выше, в общих параметрах «Генерации».")),
        h("div", { class: "h3l-note" }, T("Оба профиля применяются только к текущему проекту и не запускают генерацию. Настройка «фото персонажей во 2-м проходе» сохраняется при выборе профиля: она пока не участвовала в сравнении №1/№2.")),
        h("div", { class: "h3l-note warn" }, T("Для честного A/B сравнения сохраняйте одинаковые сид, референсы и текст. Внешние KSAMPLER/SIGMAS могут переопределять параметры. BasicScheduler denoise 0,30 — не абсолютная σ 0,30.")));
      // extension & audio
      const ovSel = h("select", { class: "h3l-sel" }, Array.from({ length: C.MAX_OVERLAP_BLOCKS + 1 }, (_, o) => h("option", { value: o, selected: Number(g.overlap_blocks) === o }, this.ovLabel(o))));
      ovSel.onchange = () => set("overlap_blocks", Number(ovSel.value));
      const acSel = h("select", { class: "h3l-sel" }, [0, 1, 1.5, 2, 3, 4].map((v) => h("option", { value: v, selected: Number(g.audio_context_sec || 0) === v }, v ? T("{0} с прошлого звука", v) : T("только перекрытие"))));
      acSel.onchange = () => set("audio_context_sec", Number(acSel.value));
      const phrase = h("textarea", { class: "h3l-ta sm", spellcheck: "false" }); phrase.value = g.continuity_phrase;
      phrase.oninput = () => set("continuity_phrase", phrase.value, { coalesce: "phrase", render: "none" });
      const xf = (() => { if (!g.audio_xfade) return null; const r = h("input", { class: "h3l-range", type: "range", min: 0.1, max: 1, step: 0.05, value: g.audio_xfade_sec }); const v = h("div", { class: "h3l-val" }, T("{0} с", Number(g.audio_xfade_sec).toFixed(2)));
        const sp = () => r.style.setProperty("--p", ((r.value - 0.1) / 0.9 * 100) + "%"); sp();
        r.oninput = () => { sp(); v.textContent = T("{0} с", Number(r.value).toFixed(2)); set("audio_xfade_sec", Number(r.value), { coalesce: "xf", render: "none" }); };
        return h("div", { class: "h3l-row" }, r, v); })();
      const ext = det(T("Продление и звук"),
        h("div", { class: "h3l-note" }, T("Перекрытие при продлении: 22 кадра (1 блок) — измерено как лучшее (39 и 56 дают просадку на стыке); настройка конкретного стыка — в карточке отрезка.")),
        h("details", { class: "h3l-gen-manage" }, h("summary", null, T("Дополнительно · перекрытие по умолчанию")),
          this.field(T("Перекрытие при продлении (по умолчанию)"), ovSel)),
        this.field(T("Звук: контекст прошлого отрезка"), acSel),
        this.toggle(T("Эксперимент · закрепить ОДИН голос"), g.self_anchor_voice === true,
          (v) => set("self_anchor_voice", v),
          T("Только для одного говорящего с чистой сольной репликой в начале сцены. Если голосов два или больше, выключите автоякорь и задайте аудиореференс каждому персонажу отдельно. Для 1 этапа и Low/High: первый голос становится <Audio 1> в последующих продолжениях. Нужна модель REF2VA. Ручные аудиореференсы приоритетнее. FLF и независимый второй проход не поддерживаются.")),
        ...(g.self_anchor_voice === true ? [h("div", { class: "h3l-note warn" },
          T("Автоякорь НЕ разделяет голоса. Если в первом отрезке говорят несколько персонажей, отключите эту функцию и используйте отдельный голосовой референс в карточке каждого персонажа."))] : []),
        this.field(T("Способ продолжения видео"), h("div", { class: "h3l-pills" },
          pill(g.continuation_method === "h3studio", "h3studio", T("Studio · цвет Lab"), () => { set("continuation_method", "h3studio"); set("lock_overlap", true); }),
          pill(g.continuation_method === "protected", "protected", T("PROTECTED · латентный контекст"), () => { set("continuation_method", "protected"); set("lock_overlap", true); }),
          pill(g.continuation_method === "overlap", "overlap", T("Оригинальный"), () => set("continuation_method", "overlap")))),
        h("div", { class: "h3l-note" }, T("Studio выбран по умолчанию: на реальном стыке с человеком шаг люмы ×0.8–1.1 и дрейф тона вдвое меньше, чем у PROTECTED. PROTECTED и Оригинальный оставлены для старых проектов.")),
        this.toggle(T("Фиксировать перекрытие"), g.lock_overlap, (v) => set("lock_overlap", v), T("Кадры перекрытия берутся из готового предыдущего отрезка")),
        this.field(T("Видеорампа перехода (эксперимент)"), (() => {
          const sel = h("select", { class: "h3l-sel", title: T("Конец зафиксированного перекрытия постепенно размораживается: модель может пересобрать переход вместо жёсткой склейки") },
            [0, 4, 8, 12, 16, 20].map((v) => h("option", { value: v, selected: Number(g.video_ramp_frames || 0) === v },
              v ? T("{0} кадр. перекрытия размораживается", v) : T("выкл · жёсткое перекрытие"))));
          sel.onchange = () => set("video_ramp_frames", Number(sel.value));
          return sel;
        })()),
        h("div", { class: "h3l-note" }, T("Рампа ослабляет фиксацию конца перекрытия: стык может стать мягче, но есть риск артефакта на шве — проверяйте на своём материале. 0 = как раньше.")),
        ...(g.continuation_method !== "overlap" ? [] : [this.toggle(T("Последний кадр как <Picture N>"), g.continuity_ref, (v) => set("continuity_ref", v), T("Последний кадр предыдущего отрезка — референс"))]),
        h("div", null, h("div", { class: "h3l-lbl" }, T("Фраза-продолжение"), h("em", null, T("{n} — номер картинки")),
          this.peButton(() => ({ title: T("Фраза-продолжение (последний кадр прошлого отрезка)"), value: this.p.settings.continuity_phrase ?? "", ctx: { kind: "phrase" }, apply: (t) => { phrase.value = t; set("continuity_phrase", t); } }))), phrase),
        this.field(T("Размер референсов"), h("div", { class: "h3l-pills" }, pill(g.ref_size === "match", "match", T("быстрее"), () => set("ref_size", "match")), pill(g.ref_size === "max", "max 2048", T("точнее"), () => set("ref_size", "max")))),
        h("div", { class: "h3l-lbl" }, T("Звук на стыках"), h("em", null, T("под клипами дорожки не применяется"))),
        this.toggle(T("Продолжать звук прошлого отрезка"), g.audio_seam_lock, (v) => set("audio_seam_lock", v), T("Аудио-латент перекрытия фиксируется хвостом предыдущего отрезка")),
        this.toggle(T("Кроссфейд на стыке"), g.audio_xfade, (v) => set("audio_xfade", v), T("Различный звук — плавный переход внутри перекрытия; тот же звук — короткая склейка без провала")),
        xf,
        this.toggle(T("Выравнивать громкость на стыке"), g.audio_match, (v) => set("audio_match", v), T("RMS у стыка, до ±6 дБ, возврат за 2 с")),
        this.toggle(T("Убирать щелчки на склейках"), g.audio_declick !== false, (v) => set("audio_declick", v), T("Жёсткие склейки звука (новая сцена, футаж, края экспорта и обрезки): плавное затухание ~5 мс с каждой стороны вместо щелчка")),
        h("div", { class: "h3l-lbl" }, T("Картинка на стыках"), h("em", null, T("только готовые кадры — кэш и дубли не меняются"))),
        ...(g.continuation_method === "h3studio"
          ? [h("div", { class: "h3l-note" }, T("Studio: цветовая коррекция в Lab с привязкой к первому отрезку, выравнивание RGB по перекрытию и сглаживание перехода. Обычное выравнивание цвета в этом режиме не применяется."))]
          : [this.toggle(T("Выравнивать яркость и цвет"), g.level_lock !== false, (v) => set("level_lock", v),
              T("На стыках-продолжениях яркость, контраст и цвет обеих сторон плавно сводятся к общему среднему (не больше ±20/255), без перегенерации")),
             g.level_lock !== false ? (() => { const r = h("input", { class: "h3l-range", type: "range", min: 2, max: 48, step: 1, value: g.level_lock_frames ?? 12 });
               const v = h("div", { class: "h3l-val" }, T("{0} кадр.", g.level_lock_frames ?? 12));
               r.oninput = () => { v.textContent = T("{0} кадр.", r.value); set("level_lock_frames", Number(r.value), { coalesce: "lvl", render: "none" }); };
               return this.field(T("Окно перехода (каждая сторона)"), h("div", { class: "h3l-row" }, r, v)); })() : null]));
      const cache = det(T("Кэш"),
        h("div", { class: "h3l-lbl" }, T("Раздельные операции")),
        h("div", { class: "h3l-note" }, T("Генерация сохраняет AV-чекпоинты без итогового MP4. Цветокоррекцию и сборку готовых отрезков запускает «Сохранить видео»; генерация модели при сохранении не повторяется.")),
        h("div", { class: "row" },
          h("button", { class: "h3l-btn primary sm", disabled: this.run.active || undefined, onclick: () => this.generate({ operation: "generate" }) }, T("▶ Генерировать / Продлить")),
          h("button", { class: "h3l-btn sm", disabled: this.run.active || g.continuation_method !== "h3studio" || undefined,
            title: T("Только Studio · Lab. Подготавливает и сохраняет цветокоррекцию готовых отрезков, не собирает фильм."),
            onclick: () => this.generate({ operation: "colour" }) }, T("🎨 Цветокоррекция"))),
        this.toggle(T("Кэш готовых отрезков"), g.cache, (v) => set("cache", v), T("Пропускать неизменённые отрезки")),
        this.toggle(T("Старый Latent Checkpoint Resume (совместимость)"), !!g.resume_only, (v) => set("resume_only", v), T("Только для полного запуска: выводит хвост. Быстрый режим выше уже возобновляется с AV-чекпоинта автоматически.")),
        h("div", { class: "h3l-note" }, T("Для сохранения нажмите «Сохранить видео»: Studio автоматически подготовит цвет, затем программа соберёт MP4 из кэша. Старый Resume Only оставлен для совместимости.")),
        h("button", { class: "h3l-btn sm danger", html: ICON.broom + T("<span>Очистить кэш проекта</span>"), title: T("Готовые дубли остаются (восстановятся без генерации)"), onclick: () => this.clearCache() }),
        h("button", { class: "h3l-btn sm danger", title: T("Кэш и все готовые дубли (кроме зафиксированных)"), onclick: () => this.clearCache(true) }, T("…и дубли")),
        h("button", { class: "h3l-btn sm", title: T("Общие файлы старых версий (input/h3labstudio, _thumbs), на которые не ссылается ни один сохранённый проект"), onclick: () => this.cleanUnused() }, T("Очистить неиспользуемое")));
      const taes = ["auto", "none", ...((this.opts.tiny_vaes || []).filter((x) => x !== "auto" && x !== "none"))];
      const taeSel = h("select", { class: "h3l-sel" }, (taes.includes(g.preview_tiny_vae) ? taes : [g.preview_tiny_vae, ...taes]).map((x) => h("option", { value: x, selected: x === g.preview_tiny_vae }, x === "auto" ? T("авто (taeh3, если есть)") : x === "none" ? T("нет — latent2rgb") : x)));
      taeSel.onchange = () => set("preview_tiny_vae", taeSel.value);
      const pv = det(T("Живое превью и лог"),
        this.field("tiny VAE (models/vae_approx)", taeSel),
        h("div", { class: "h3l-grid2" }, num("preview_max_res", T("max_res (0 = полное)"), 8, 0, 4096), num("preview_quality", "jpeg", 1, 30, 100)),
        h("div", { class: "h3l-grid2" }, num("preview_frames", T("кадров"), 1, 1, 240), num("preview_fps", T("fps (0 = реал.)"), 1, 0, 60)),
        this.toggle(T("Скрыть стандартное превью ComfyUI"), g.preview_suppress, (v) => set("preview_suppress", v), T("Только превью редактора")),
        this.toggle(T("Подробный лог в консоли"), g.verbose_log, (v) => set("verbose_log", v), T("[H3ZS] в консоли ComfyUI: запуск, отрезки, шаги, стыки и звук")),
        h("div", { class: "h3l-lbl" }, T("Экспорт MP4"), h("em", null, T("только итоговый файл — кэш и дубли не меняются"))),
        h("div", { class: "h3l-grid2" },
          (() => {
            const gr = h("input", { class: "h3l-in sm", type: "number", step: "0.001", min: "0", max: "0.02", value: Number(g.export_grain || 0) });
            gr.onchange = () => set("export_grain", Math.max(0, Math.min(0.02, Number(gr.value) || 0)));
            return this.field(T("Плёночное зерно (0 = выкл)"), gr);
          })(),
          this.field(T("Пресет кодировщика"), (() => {
            const ps = h("select", { class: "h3l-sel" },
              h("option", { value: "", selected: !g.export_preset }, T("по умолчанию · medium")),
              ...["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"].map((v) =>
                h("option", { value: v, selected: g.export_preset === v }, v)));
            ps.onchange = () => set("export_preset", ps.value);
            return ps;
          })())),
        h("div", { class: "h3l-note" }, T("Зерно маскирует блочность H3 на 24 fps: 0.005 — хороший старт, 0.01 — заметно. Пресеты slow/veryslow дают лучшее сжатие за большее время; на NVENC пресет не влияет.")));
      // models
      const known = this.upKnown(), paths = this.opts.paths || {};
      const taeh3 = (this.opts.tiny_vaes || []).some((x) => /taeh3/i.test(x));
      const row = (ok, name, detail) => h("div", { class: "h3l-modrow" + (ok === null ? "" : ok ? " ok" : " bad") }, h("b", null, ok === null ? "…" : ok ? "✓" : "✕"), h("div", null, h("div", null, name), detail ? h("small", null, detail) : null));
      const presetsDet = h("div", { class: "h3l-note" }, T("Пресеты моделей и стек LoRA — во вкладке "), h("a", { href: "#", onclick: (e) => { e.preventDefault(); this.tool = "models"; this.renderTools(); this.renderLeft(); } }, T("«Модели»")), T(" слева (быстрый доступ)."));
      const models = det(T("Компоненты и VRAM"),
        row(known ? uc.learned : null, T("Обученный латентный апскейлер H3"), known ? (uc.learned ? uc.learned_models.join(", ") : !uc.learned_node ? T("нет ноды (встроенная / Pixaroma / LBH)") : T("нет модели minimax_h3_latent_upscaler_3d_bf16.safetensors")) : T("проверка…")),
        (paths.latent_upscale_models || []).length ? h("div", { class: "h3l-note mono" }, (paths.latent_upscale_models || []).join("\n")) : null,
        row(this.opts.tiny_vaes ? taeh3 : null, T("taeh3 — живое превью"), taeh3 ? (this.opts.tiny_vaes || []).filter((x) => /taeh3/i.test(x)).join(", ") : T("нет — превью latent2rgb")),
        (paths.vae_approx || []).length ? h("div", { class: "h3l-note mono" }, (paths.vae_approx || []).join("\n")) : null,
        h("div", { class: "h3l-note" }, T("Папки — стандартные ComfyUI (и extra_model_paths.yaml). После установки модели перезапустите ComfyUI.")),
        num("vram_headroom_gb", T("Запас VRAM во время генерации, ГБ"), 0.25, 0, 8),
        h("div", { class: "h3l-note" }, T("Столько видеопамяти ComfyUI оставляет свободной, пока идёт генерация (штатный резерв --reserve-vram, поднимается только на время запуска и никогда не уменьшается). Помогает, когда открыт браузер / запись: иначе Windows выгружает VRAM в RAM и шаги идут в разы медленнее. 1 ГБ — голый рабочий стол, 2–3 ГБ — с браузером. 0 — выключено.")));
      const upS = this._safeSection(T("Апскейл"), () => this.upscaleSection(g, set));
      const accelS = this._safeSection(T("Ускорение"), () => this.accelSection(g, set, det));
      const memS = this._safeSection(T("Экономия памяти"), () => this.memsaveSection(g, set, det));
      const dlPanel = this._safeSection(T("Загрузка моделей"), () => this.mdlDownloadsPanel());
      const genPresets = this._setTab === "gen" ? this.generationPresetsPanel() : null;
      const TABS = [
        ["general", T("Общие"), []], ["dl", T("Загрузка моделей"), [dlPanel]],
        ["gen", T("Генерация"), [genPresets, stages, uiPi ? null : st1, uiTwo ? st2 : null, uiTwo ? hiresAdvanced : null, accelS, memS, models, presetsDet]],
        ["up", T("Апскейл"), [upS]], ["ext", T("Продление и звук"), [ext]],
        ["prev", T("Превью и кэш"), [pv, cache]], ["appearance", T("Внешний вид"), []],
      ];
      const titleOf = (d) => (d.querySelector(":scope > summary")?.firstChild?.textContent || "").trim();
      if (this._setOpen) {
        // Several tabs share section names (e.g. acceleration or memory).
        // Prefer the current tab so editing one section never throws the user elsewhere.
        const t = TABS.find(([id, , ds]) => id === this._setTab && ds.some((d) => titleOf(d) === this._setOpen))
          || TABS.find(([, , ds]) => ds.some((d) => titleOf(d) === this._setOpen));
        if (t) this._setTab = t[0];
      }
      if (this._setTab === "hires" || this._setTab === "hires_advanced") this._setTab = "gen";
      const cur = TABS.find((t) => t[0] === this._setTab) || TABS[0];
      this._setTab = cur[0];
      const tabs = h("div", { class: "h3l-settabs" }, ...TABS.map(([id, label]) => h("div", { class: "h3l-settab" + (id === cur[0] ? " on" : ""), onclick: () => { if (this._setTab === id) return; this._setTab = id; this._setOpen = null; this.renderLeft(); } }, label)));
      cur[2].forEach((d) => { if (d && d.tagName === "DETAILS") d.open = true; });   // sections start open; download panel is a plain div
      // UI language (global, every project): Auto follows ComfyUI's language (Comfy.Locale); a switch reloads the page
      const lsel = h("select", { class: "h3l-sel sm" }, [["auto", T("Авто (как в ComfyUI)")], ["ru", T("Русский")], ["en", "English"], ["th", "ไทย"], ["zh", "中文"]].map(([v, l]) => h("option", { value: v, selected: langSetting() === v }, l)));
      lsel.onchange = () => { if (setLangSetting(lsel.value)) this.toast(T("Язык сменится после перезагрузки страницы"), false, { label: T("Перезагрузить"), fn: () => location.reload() }); };
      const langRow = h("div", { class: "h3l-langrow" }, h("span", { class: "h3l-lbl" }, "" + T("Язык интерфейса")), lsel);
      const welcomeLink = h("button", { class: "h3l-btn sm", style: "margin-left:8px", title: T("Показать приветствие и статус моделей"),
        onclick: () => this.reopenWelcome() }, T("Показать приветствие"));
      langRow.append(welcomeLink);
      const themeRow = this._safeSection(T("Тема интерфейса"), () => {
        const themes = allThemes();
        const themeGrid = h("div", { class: "h3l-themegrid" }, themes.map((theme) => h("button", {
          type: "button", class: "h3l-theme" + (themeSetting() === theme.id ? " on" : "") + (theme.plugin ? " plugin" : ""), title: theme.description || theme.name,
          "aria-label": T("Тема: {0}", theme.name), "aria-pressed": themeSetting() === theme.id ? "true" : "false",
          onclick: () => {
            applyTheme(theme.id, true);
            this.drawDyn?.();
            themeGrid.querySelectorAll(".h3l-theme").forEach((button) => {
              const on = button.getAttribute("aria-label") === T("Тема: {0}", theme.name);
              button.classList.toggle("on", on); button.setAttribute("aria-pressed", String(on));
            });
          } },
          h("span", { class: "swatches", "aria-hidden": "true" }, (theme.swatches || []).map((color) => h("i", { style: `background:${color}` }))), theme.name)));
        const themeWarn = themeWarnings().length ? h("div", { class: "h3l-note warn" }, T("Темы: {0}", themeWarnings().slice(0, 3).join("; "))) : null;
        return h("div", { class: "h3l-themerow" }, h("span", { class: "h3l-lbl" }, T("Тема интерфейса"), h("em", null, T("темы из папки themes — после обновления страницы"))), themeGrid, themeWarn);
      });
      const blurRow = this._safeSection(T("Размытие панелей"), () => this.toggle(
        T("Размытие панелей"),
        uiBlurEnabled(),
        (v) => { applyUiBlur(v, true); this.renderLeft(); },
        T("Стеклянный эффект панелей. Выключение может сделать интерфейс чуть быстрее.")
      ));
      const fxRow = this._safeSection(T("Эффекты Lab"), () => labFx.settingsSection(h, T));
      // Two distinct working spaces. The saved preference is UI-only: no sampling settings change.
      const workspaceRow = h("div", { class: "h3l-workspace-picker" },
        h("div", { class: "h3l-lbl" }, T("Рабочий стол")),
        h("div", { class: "h3l-note" }, T("Классический — знакомый интерфейс. Новый — статус генерации, быстрые действия, навигация и улучшенное сохранение. Переключение не изменяет проект.")),
        h("div", { class: "h3l-workspace-choices" }, [["classic", T("Классический")], ["modern", T("Новый")]].map(([id, label]) =>
          h("button", { type: "button", disabled: !!this.run?.active, class: "h3l-workspace-choice" + (this.isModern() === (id === "modern") ? " on" : ""),
            "aria-pressed": String(this.isModern() === (id === "modern")), onclick: (e) => {
              if (this.setWorkspaceMode(id) === false) return;
              e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => {
                const on = b === e.currentTarget; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
              });
            } }, h("b", null, label), h("small", null, id === "modern" ? T("Новые инструменты и обзор") : T("Привычное расположение"))))));
      TABS.find((t) => t[0] === "appearance")[2].push(workspaceRow, themeRow, fxRow, blurRow);
      // LAB: settings live in their own window (macOS System Settings style): sections left, form right
      const general = [langRow, resetBtn];
      const side = h("nav", { class: "h3l-setside", "aria-label": T("Разделы настроек") }, tabs);
      const paneTitle = h("h2", { class: "h3l-settitle" }, cur[1]);
      const body = h("div", { class: "h3l-scroll h3l-setbody" }, paneTitle, cur[0] === "appearance" ? null : scope, ...(cur[0] === "general" ? general : cur[2]));
      const oldWin = this.$.setWin, keep = oldWin && oldWin.dataset.tab === cur[0] ? oldWin.querySelector(".h3l-setbody")?.scrollTop || 0 : 0;
      oldWin?.remove();
      const closeWin = () => { this._pendingGenerationMode = null; this.$.setWin?.remove(); this.$.setWin = null; this.tool = this._preSetTool && this._preSetTool !== "settings" ? this._preSetTool : "assets"; this.renderTools(); this.renderLeft(); };
      const win = h("div", { class: "h3l-modal h3l-setmodal", "data-tab": cur[0] },
        h("div", { class: "h3l-setwin h3l-glass", role: "dialog", "aria-label": T("Настройки") },
          h("div", { class: "h3l-setwin-hd" }, h("b", null, T("Настройки")), h("i", { class: "grow" }),
            h("button", { class: "h3l-btn sm icon", title: T("Закрыть"), "aria-label": T("Закрыть"), html: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>', onclick: closeWin })),
          h("div", { class: "h3l-setcols" }, side, body)));
      win.addEventListener("pointerdown", (e) => { if (e.target === win) closeWin(); });
      this.$.setWin = win; this.root.append(win);
      if (keep) body.scrollTop = keep;
      // the panel underneath keeps showing the tool that was open before (the window floats over it)
      const prev = this._preSetTool && this._preSetTool !== "settings" ? this._preSetTool : "assets";
      { const t = this.tool; this.tool = prev; try { this.renderLeftTool(L); } catch (e) { L.append(head); } finally { this.tool = t; } }
      this._setOpen = null;
      this.keepDetails(win);
    },
  });
}
