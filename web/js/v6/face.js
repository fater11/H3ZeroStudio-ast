// H3ZeroStudio Lab v6k — «Рефайн лица…» (clip menu): a small window that finds the faces of a finished clip (OpenCV
// YuNet on the server, thumbnails), lets the user pick the face to follow and the few parameters, then runs a short
// low-denoise pass over the tracked face crop with the clip's own prompt and character references. The result is a
// new take marked «ЛИЦО»; the original take stays in the list. Track / crop / paste: port of ComfyUI-H3-FaceRefine (MIT).
import { T } from "../h3s_i18n.js";
import { I, setTip, seg, btn, slider, modal, checkbox } from "./kit.js";

const LS = "h3l_face_refine";
// defaults: ComfyUI-H3-FaceRefine (crop ×2.5, feather 6 source px, colour match 1.0, face-size denoise scaling)
const DEF = { steps: 3, denoise: 0.1, feather: 6, crop: 2.5, colour: 1, auto: true };

export function installFace(Studio, { C, h }) {
  const P = Studio.prototype;
  const prevStage = P.stageMenuEntries;
  Object.assign(P, {
    /** Can clip i get a face pass now? {ok, why} */
    faceState(i) {
      const s = this.seg(i);
      if (!s) return { ok: false, why: "" };
      if (this.run?.active) return { ok: false, why: T("Сейчас идёт генерация — дождитесь окончания") };
      if (C.isFootage(s)) return { ok: false, why: T("Рефайн лица — только для сгенерированных клипов") };
      if (!s.result?.video || this.isStale(i)) return { ok: false, why: T("Сначала сгенерируйте клип (результат должен быть актуальным)") };
      if (s.upscale) return { ok: false, why: T("У клипа включён «Апскейл отрезка»: рефайн лица делается на клипе без апскейла — уберите апскейл") };
      if (s.freeze) return { ok: false, why: T("Клип зафиксирован — сначала разморозьте") };
      return { ok: true, why: "" };
    },
    stageMenuEntries(i) {
      const st = this.faceState(i);
      return [...(prevStage ? prevStage.call(this, i) : []),
        { label: T("Рефайн лица…"), title: st.ok ? T("Уточнить лицо: несколько шагов по кадру вокруг лица, с референсами персонажа. Результат — новый дубль") : st.why, fn: () => this.faceRefine(i), dis: !st.ok }];
    },
    /** «ЛИЦО» mark on clips whose active, up-to-date take is face-refined. */
    faceMarks() {
      const sigs = this.sigs?.() || [];
      (this.$.clips || []).forEach((el, i) => {
        el?.querySelector(".kfb.is-face")?.remove();
        const s = this.p.segments[i], r = s?.result; if (!el || !r?.fr) return;
        if (r.sig && sigs[i] && r.sig !== sigs[i]) return;
        const t = el.querySelector(".t"); if (!t) return;
        const b = h("span", { class: "kfb is-face", "data-mode": "face" }, T("ЛИЦО"));
        setTip(b, T("Рефайн лица: {0} шаг., денойз {1} · исходный дубль — в списке дублей", r.fr.steps, r.fr.denoise));
        const after = t.querySelector(".kfb.is-ctl") || t.querySelector(".nm");
        after ? after.after(b) : t.append(b);
      });
    },
    faceRefine(i) {
      const st = this.faceState(i), s = this.seg(i);
      if (!st.ok) { this.toast(st.why, true); return; }
      let sv = {}; try { sv = JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { /* ignore */ }
      const v = { ...DEF, ...(s.fr ? { steps: s.fr.steps, denoise: s.fr.denoise, feather: s.fr.feather, crop: s.fr.crop, colour: s.fr.colour, auto: s.fr.auto !== false } : sv) };
      const ref = s.result.video, vkey = JSON.stringify(ref);
      this._faceDet = this._faceDet || {};
      let pick = null;
      const facesBox = h("div", { class: "v6-face-list", role: "radiogroup", "aria-label": T("Чьё лицо уточнять") });
      const go = btn({ label: T("Запуск"), kind: "primary", disabled: true, onclick: () => launch() });
      const fmt2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
      const row = (label, ctl, val, tip) => { const r = h("div", { class: "v6-ctl-row" }, h("div", { class: "v6-ctl-l" }, h("span", null, label), val || null), ctl); if (tip) setTip(r.firstChild.firstChild, tip); return r; };
      const valEl = (t) => h("span", { class: "v6-ctl-v" }, t);
      const dV = valEl(fmt2(v.denoise)), fV = valEl(T("{0} px", v.feather)), cV = valEl("×" + Number(v.crop).toFixed(1)), kV = valEl(Math.round(v.colour * 100) + "%");
      const params = h("div", { class: "v6-face-params" },
        row(T("Шаги"), seg([2, 3, 4].map((n) => ({ value: n, label: String(n) })), v.steps, (x) => { v.steps = Number(x); }, { size: "sm", full: true, label: T("Шаги") }), null, T("2–4 шага по кадру лица: больше — немного сильнее")),
        row(T("Денойз"), slider({ min: 0.05, max: 0.2, step: 0.01, value: v.denoise, onInput: (x) => { v.denoise = x; dV.textContent = fmt2(x); } }), dV, T("Сколько можно менять: 0.05 — едва заметно, 0.2 — заметнее. По умолчанию 0.10")),
        h("div", { class: "v6-ctl-row is-chk" }, checkbox(v.auto, (x) => { v.auto = x; }, { label: T("Сильнее для мелких лиц"), tip: T("Денойз задан для крупного лица; мелкому (30 px и меньше) — до ×2.9, не больше 0.4. Как в H3-FaceRefine") })),
        row(T("Растушёвка"), slider({ min: 2, max: 48, step: 1, value: v.feather, onInput: (x) => { v.feather = x; fV.textContent = T("{0} px", x); } }), fV, T("Мягкость края вставки (в пикселях кадра)")),
        row(T("Кадр вокруг лица"), slider({ min: 1.6, max: 4, step: 0.1, value: v.crop, onInput: (x) => { v.crop = x; cV.textContent = "×" + x.toFixed(1); } }), cV, T("Сколько контекста видит модель: размер кадра в размерах лица")),
        row(T("Подгонка цвета"), slider({ min: 0, max: 1, step: 0.05, value: v.colour, onInput: (x) => { v.colour = x; kV.textContent = Math.round(x * 100) + "%"; } }), kV, T("Подтянуть цвет и яркость лица к исходному клипу")));
      const nrefs = (C.kfMode(this.p, s) !== "t2v" ? C.kfAssets(this.p, s).filter(Boolean) : C.orderedRefs(this.p, s)).length + (s.cards?.length || 0);
      const note = h("div", { class: "v6-note" }, T("Промпт, референсы персонажа и сэмплер — как у отрезка. Кадр лица 768×768. Результат — новый дубль с меткой «ЛИЦО», исходный остаётся в списке дублей."));
      const warn = nrefs ? null : h("div", { class: "v6-note is-warn" }, T("У отрезка нет референсов персонажа — лицо уточнится только по промпту."));
      const box = h("div", { class: "v6-face" },
        h("div", { class: "v6-face-h" }, h("i", { class: "v6-ic", html: I.people }), h("b", null, T("Рефайн лица — отрезок {0}", i + 1))),
        h("div", { class: "v6-face-sub" }, T("Чьё лицо уточнять")), facesBox, params, note, warn,
        h("div", { class: "v6-face-foot" }, h("i", { class: "v6-grow" }), btn({ label: T("Отмена"), onclick: () => m.close() }), go));
      const m = modal(this.$.faceMount || this.root, box, { cls: "v6-facewin", label: T("Рефайн лица"),
        onClose: () => { this.$.faceModal = null; this.closeFaceMount?.(); } });
      this.$.faceModal = m;
      const choose = (f, el) => { pick = f; facesBox.querySelectorAll(".v6-face-it").forEach((x) => { x.classList.toggle("on", x === el); x.setAttribute("aria-checked", String(x === el)); }); go.disabled = false; };
      const show = (d) => {
        facesBox.textContent = "";
        const faces = d?.faces || [];
        if (!faces.length) { facesBox.append(h("div", { class: "v6-face-empty" }, T("Лица не найдены — уточнять нечего. Попробуйте другой дубль."))); return; }
        faces.forEach((f, k) => {
          const el = h("button", { type: "button", class: "v6-face-it", role: "radio", "aria-checked": "false" },
            h("img", { src: this.host.url(f.thumb), alt: "", draggable: "false" }),
            h("span", null, T("в {0} из {1} кадров", f.seen, f.samples)));
          setTip(el, T("Лицо {0} · кадр {1}", k + 1, f.frame + 1));
          el.addEventListener("click", () => choose(f, el));
          facesBox.append(el);
          const was = s.fr?.face && Math.abs(s.fr.face.box[0] - f.box[0]) < 0.06 && Math.abs(s.fr.face.box[1] - f.box[1]) < 0.06;
          if (was || (k === 0 && !pick)) choose(f, el);
        });
      };
      const fail = (e) => { facesBox.textContent = ""; facesBox.append(h("div", { class: "v6-note is-warn" }, T("Не удалось найти лица: {0}", e?.message || e))); };
      if (this._faceDet[vkey]) show(this._faceDet[vkey]);
      else {
        facesBox.append(h("div", { class: "v6-face-wait" }, h("i", { class: "v6-spin" }), T("Ищу лица…")));
        Promise.resolve(this.host.call?.("/h3lab/face/detect", { ref })).then((d) => { if (!d) throw new Error(T("нет ответа сервера")); this._faceDet[vkey] = d; if (box.isConnected) show(d); }).catch((e) => { if (box.isConnected) fail(e); });
      }
      const launch = () => {
        if (!pick) return;
        const pr = { steps: v.steps, denoise: Math.round(v.denoise * 1000) / 1000, feather: Math.round(v.feather), crop: Math.round(v.crop * 100) / 100, colour: Math.round(v.colour * 100) / 100, auto: !!v.auto };
        try { localStorage.setItem(LS, JSON.stringify(pr)); } catch (e) { /* ignore */ }
        const face = C.normalizeFr({ face: { frame: pick.frame, box: pick.box }, ...pr });
        if (!face) return;
        m.close(); this.$.faceModal = null; this.sel = i;
        this.generate({ upto: i, only: i, face });
        this.toast(T("Отрезок {0}: рефайн лица · {1} шаг., денойз {2}", i + 1, face.steps, face.denoise.toFixed(2)));
      };
    },
  });
}
