// Experimental Character Swap workspace. Builds an isolated project using native H3 guide latents.
import { T } from "../h3s_i18n.js";

const DEFAULT_LORA = "minimax/minimax_h3_character_swap_v1.1_ref2va_fro.safetensors";
const SWAP_LORA_KEY = "h3labstudio.swap.lora";
const savedSwapLora = () => { try { return localStorage.getItem(SWAP_LORA_KEY) || DEFAULT_LORA; } catch { return DEFAULT_LORA; } };
const rememberSwapLora = (value) => { try { if (value) localStorage.setItem(SWAP_LORA_KEY, value); } catch {} };
const MIN_FRAMES = 22;
export const DEFAULT_PHOTO_APPEARANCE =
  "Preserve the complete visible appearance of the person in <Picture 1> exactly: facial structure, " +
  "eye shape, nose, lips, skin tone, hairstyle, body shape and proportions, clothing, footwear " +
  "and accessories. Do not invent, beautify, redesign or alter any visible details.";
const clone = (x) => JSON.parse(JSON.stringify(x));
const desc = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 1600);
const loraKey = (s) => String(s || "").replace(/\\/g, "/").toLowerCase();
export const installedSwapLora = (files, wanted) => (files || []).find((n) => n === wanted)
  || (files || []).find((n) => loraKey(n) === loraKey(wanted)) || "";

export function cleanSwapAppearance(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*```(?:text|english)?\s*/i, "").replace(/\s*```\s*$/, "")
    .replace(/^\s*(?:appearance|description)\s*:\s*/i, "")
    .trim().slice(0, 1600);
}

export function makeSwapPrompt(details, subject, refs = {}) {
  const who = desc(subject) || "the main subject of the guide video";
  const body = refs.bodyPicture || "<Picture 1>";
  const face = refs.facePicture || "";
  const looks = desc(details);
  const photoOnly = !looks || looks === desc(DEFAULT_PHOTO_APPEARANCE);
  const identity = photoOnly
    ? "<Subject 1> is the person shown in " + body + ". " + DEFAULT_PHOTO_APPEARANCE.replaceAll("<Picture 1>", body)
    : "<Subject 1> is the " + looks + " shown in " + body + ", whose identity, face, head, hair, skin, " +
      "body shape, proportions and clothing define the character in the target video.";
  const closeup = face
    ? " " + face + " is a close-up of the SAME person: prioritize its precise facial structure, " +
      "eyes, nose, lips, jawline, skin details and hairline for facial identity. " +
      "Use " + body + " for body, clothing and the complete appearance. Both photographs depict one character."
    : "";
  return "body_swap: subject_definitions:\n" + identity + closeup + "\n" +
    "summary:\n[video generation + reference] Replace " + who + " with <Subject 1>. " +
    "The guide video defines the background, scene, lighting, camera framing, pose, timing, gestures, " +
    "head rotation, gaze, lip movement, speech and facial expressions; change only the selected character.\n" +
    "detailed_description:\n[Shot 1] <Subject 1> takes the exact place of " + who +
    ", following the original movements and performance frame by frame. Preserve the full identity " +
    "and clothing from " + body + (face ? ", with the exact face from " + face : "") +
    ". Preserve the guide video's surroundings, colors and camera. " +
    "Avoid identity drift, clothing changes, texture crawling and flicker.";
}

export function planSwapChunks(total, maxFrames, requestedOverlap = 0) {
  // H3 supports 17k+5 frames. Redistribute the short tail across the chain
  // instead of placing a 56-frame clip at EOF and holding its last 14 frames.
  total = Math.max(0, Math.trunc(Number(total) || 0));
  if (total < MIN_FRAMES) return [];
  const cap = Math.max(MIN_FRAMES, Math.min(345, Math.floor((maxFrames - 5) / 17) * 17 + 5));
  const overlap = Math.max(0, Math.min(Math.trunc(requestedOverlap) || 0, cap - MIN_FRAMES));
  const count = Math.max(1, Math.ceil((total - overlap) / (cap - overlap)));
  const average = (total + (count - 1) * overlap) / count;
  const snap = (n, up = false) => {
    const k = up ? Math.ceil((n - 5) / 17) : Math.round((n - 5) / 17);
    return Math.max(MIN_FRAMES, Math.min(cap, 17 * k + 5));
  };
  const out = [];
  let natural = 0, covered = 0;
  for (let i = 0; i < count; i++) {
    const left = count - i - 1;
    let frames = left ? snap(average) : snap(total - natural, true);
    if (left && natural + frames + left * (cap - overlap) < total)
      frames = snap(Math.max(average, total - natural - left * (cap - overlap)), true);
    const at = Math.max(0, Math.min(natural, total - frames));
    const end = at + frames;
    // Up to 16 lattice-padding frames may exist after EOF in the final clip;
    // the fixed project end marker excludes them from the exported movie.
    const visibleEnd = Math.min(total, end);
    out.push({ at, frames, sourceFrames: Math.max(0, visibleEnd - covered) });
    covered = Math.max(covered, visibleEnd);
    natural = end - overlap;
  }
  if (covered < total) throw Error("Swap: невозможно покрыть исходное видео выбранными отрезками");
  return out;
}

export function installSwap(Editor, { C, h, I, btn }) {
  Object.assign(Editor.prototype, {
    swapState() {
      if (!this._sw) this._sw = { video: "", image: "", details: DEFAULT_PHOTO_APPEARANCE, subject: "the main subject of the guide video",
        chunk: "10", keepAudio: true, continueClips: true, lora: savedSwapLora(), loraStrength: 1.0, loraSearch: "", faceImage: "", useFaceRef: false,
        preserveBg: false, maskGuard: false, maskVideo: "", maskFrame: null, maskPoint: null, maskBox: null,
        maskPreview: null, maskLoading: false, maskVerifying: false, maskError: "",
        shotVideo: "", shotCuts: null, shotAnchors: {}, shotManualCuts: [], shotTime: "",
        shotLoading: false, shotError: "", shotFrame: null, shotActive: null,
        shotCounts: {}, shotAuto: {}, shotFailures: {}, shotChecked: 0, shotTotal: 0,
        shotMaskPreview: null, shotMaskVerified: {}, shotVerifying: false,
        shotPointOnly: {}, analyzingPhoto: false };
      return this._sw;
    },

    async swapUpload(kind, file) {
      if (!file) return;
      const before = new Set(this.p.assets.map((a) => a.id));
      if (kind === "video") await this.uploadVideoAssets([file]);
      else await this.uploadFiles([file]);
      const added = this.p.assets.find((a) => !before.has(a.id) &&
        (kind === "video" ? a.category === "video" : a.category !== "video" && a.category !== "audio"));
      if (added) this.swapState()[kind] = added.id;
      if (this.page === "swap") this.renderSwap();
    },

    async swapBuild() {
      const sw = this.swapState();
      const video = this.p.assets.find((a) => a.id === sw.video && a.category === "video");
      const image = this.p.assets.find((a) => a.id === sw.image && a.category !== "video" && a.category !== "audio");
      if (!video || !image) return this.toast(T("Выберите исходное видео и фото нового персонажа"), true);
      const faceImage = sw.useFaceRef ? this.p.assets.find((a) => a.id === sw.faceImage && C.CATEGORY_ORDER.includes(a.category)) : null;
      if (sw.useFaceRef && (!faceImage || faceImage.id === image.id))
        return this.toast(T("Для крупного референса лица выберите другое фото того же человека"), true);
      if (sw.preserveBg && (!sw.maskPoint || !sw.maskPreview || sw.maskVideo !== video.id))
        return this.toast(T("Для сохранения фона выберите человека на первом кадре и проверьте маску SAM 3.1"), true);
      if (sw.preserveBg && (sw.shotLoading || sw.shotVerifying))
        return this.toast(T("Дождитесь завершения поиска людей и проверки SAM на выбранном плане"), true);
      const refs = [image.id, ...(faceImage ? [faceImage.id] : [])];
      const ordered = C.orderedRefs(this.p, { refs });
      const picture = (id) => "<Picture " + (ordered.findIndex((a) => a.id === id) + 1) + ">";
      if (this.run.active) return this.toast(T("Дождитесь окончания текущей генерации"), true);
      const modelFiles = (await this.mpLoad?.(true))?.files?.lora || [];
      const selectedLora = installedSwapLora(modelFiles, sw.lora);
      if (!selectedLora) return this.toast(T("Выберите установленную LoRA для Swap из списка моделей ComfyUI"), true);
      sw.lora = selectedLora;
      const total = Math.max(1, Math.floor(video.frames || video.duration * C.FPS || 0));
      if (total < MIN_FRAMES) return this.toast(T("Исходное видео слишком короткое (минимум 22 кадра)"), true);
      const seconds = Number(sw.chunk) || 10;
      const maxFrames = C.snapFrames(Math.round(seconds * C.FPS), "down");
      const overlapBlocks = Math.max(1, Math.min(3, Number(this.p.settings?.overlap_blocks) || 2));
      const overlap = sw.continueClips ? C.overlapFrames(overlapBlocks) : 0;
      if (sw.preserveBg && sw.shotCuts === null) {
        await this.swapScanShots();
        if (sw.shotCuts === null) return this.toast(T("Не удалось проверить смены планов. Проверьте соединение с ComfyUI."), true);
      }
      if (sw.preserveBg && sw.shotManualCuts.some((frame) => !sw.shotAnchors[frame]))
        return this.toast(T("Для добавленной вручную склейки выберите человека на новом кадре"), true);
      if (sw.preserveBg && sw.shotCuts?.some((frame) =>
        (sw.shotCounts[frame] > 1 || sw.shotFailures[frame]) && !sw.shotAnchors[frame]))
        return this.toast(T("На некоторых планах несколько людей или ошибка распознавания. Откройте отмеченные планы и выберите нужного человека."), true);
      let chunks;
      try { chunks = planSwapChunks(total, maxFrames, overlap); }
      catch (e) { return this.toast(T("Не удалось разделить видео: ") + (e.message || e), true); }
      if (chunks.length > 200) return this.toast(T("Слишком длинное видео: разбейте его на части"), true);
      try {
        await this.projAutosave(true); // never overwrite the current editing project
        const old = this.p, s = clone(old.settings), presets = clone(old.model_presets || {});
        s.settings_scope = "project";
        s.prompt = ""; // a fresh replacement project must not inherit an unrelated story prompt
        s.quality = "final"; s.final_mode = "full"; s.steps = 8; s.cfg = 1;
        s.sampler = "euler"; s.scheduler = "beta57"; s.sigmas = ""; s.denoise = 1;
        if (sw.continueClips) s.overlap_blocks = overlapBlocks;
        if (video.width && video.height) {
          const megapixels = 0.5;
          const scale = Math.sqrt(megapixels * 1048576 / (video.width * video.height));
          s.res_mode = "custom";
          s.width = Math.max(256, Math.round(video.width * scale / 32) * 32);
          s.height = Math.max(256, Math.round(video.height * scale / 32) * 32);
        }
        const segments = chunks.map((chunk, i) => ({
          ...clone(C.DEFAULT_SEGMENT), id: C.newId("s"), color: i % 6,
          name: T("Замена · часть {0}", i + 1), frames: chunk.frames,
          link: sw.continueClips && i ? "extend" : "cut",
          refs, cards: [],
          prompt: makeSwapPrompt(sw.details, sw.subject, { bodyPicture: picture(image.id), facePicture: faceImage ? picture(faceImage.id) : "" }),
          source: { asset: video.id, in: chunk.at, denoise: 1, swap: true,
            keep_audio: !!sw.keepAudio, swap_lora: sw.lora, swap_lora_strength: sw.loraStrength ?? 1.0,
            ...(sw.preserveBg ? { swap_mask: { model: "sam3.1", at: 0,
              point: [...sw.maskPoint], ...(sw.maskBox ? { box: [...sw.maskBox] } : {}),
              ...(sw.maskGuard ? { guard: true } : {}),
              shots: Object.entries(sw.shotAnchors || {}).map(([frame, value]) => ({
                frame: Number(frame), point: [...value.point],
                ...(value.box ? { box: [...value.box] } : {}) })) } } : {}) }
        }));
        const project = C.normalizeProject({
          id: C.newId("p"), name: T("Замена персонажа · {0}", video.name),
          settings: s, model_presets: presets, assets: clone(old.assets), cards: clone(old.cards || {}),
          end_mode: "fixed", end: total, segments
        });
        this.loadProject(project);
        // loadProject assumes the opened project already exists in the project library.
        // Force the very first save for this newly created, independent project ID.
        this._projSaved = null;
        this.setPage("edit");
        this.sel = 0; this.pvMode = "segment";
        this.renderAll();
        await this.projAutosave(true);
        this.toast(T("Создан отдельный проект: {0} отрезков. Проверьте первый и нажмите «Сгенерировать».", segments.length));
      } catch (e) {
        this.toast(T("Не удалось создать проект замены: ") + (e.message || e), true);
      }
    },

    swapUseDetectedShot(frame, data) {
      const sw = this.swapState(), people = Array.isArray(data.people) ? data.people : [];
      sw.shotCounts[frame] = people.length;
      delete sw.shotFailures[frame];
      // The tracker can safely re-seed from a single confident person, but must
      // not silently pick somebody in a crowd. Manual choices always win.
      const person = people.length === 1 ? people[0] : null;
      const box = person?.box;
      if (!sw.shotAnchors[frame] && Array.isArray(box) && box.length === 4
          && person.score >= .4 && box[2] * box[3] >= .015) {
        sw.shotAnchors[frame] = {
          point: [Math.round(Math.min(1, box[0] + box[2] / 2) * 10000) / 10000,
                  Math.round(Math.min(1, box[1] + box[3] / 2) * 10000) / 10000],
          box: [...box]
        };
        sw.shotAuto[frame] = true;
      }
    },

    async swapScanShots() {
      const sw = this.swapState(), v = this.p.assets.find((a) => a.id === sw.video);
      if (!v || sw.shotLoading || sw.shotVerifying) return;
      sw.shotLoading = true; sw.shotError = "";
      if (this.page === "swap") this.renderSwap();
      const ref = { filename: v.file, subfolder: v.subfolder || "", type: v.type || "input" };
      try {
        const data = await this.host.call("/h3lab/swap/shots", { ref });
        if (sw.video !== v.id) return;
        sw.shotVideo = v.id;
        sw.shotCuts = [...new Set([...(data.cuts || []), ...sw.shotManualCuts])]
          .filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
        for (const frame of Object.keys(sw.shotAuto || {})) delete sw.shotAnchors[frame];
        sw.shotAuto = {};
        sw.shotAnchors = Object.fromEntries(Object.entries(sw.shotAnchors || {})
          .filter(([frame]) => sw.shotCuts.includes(Number(frame))));
        sw.shotCounts = {}; sw.shotFailures = {};
        sw.shotMaskVerified = {}; sw.shotMaskPreview = null;
        sw.shotPointOnly = Object.fromEntries(Object.entries(sw.shotPointOnly || {})
          .filter(([frame]) => sw.shotCuts.includes(Number(frame))));
        sw.shotChecked = 0; sw.shotTotal = sw.shotCuts.length;
        sw.shotActive = sw.shotCuts[0] ?? null;
        sw.shotFrame = null;
        const side = Math.max(v.width || 768, v.height || 1344);
        const scale = Math.min(1, 960 / Math.max(1, side));
        const width = Math.max(256, Math.round((v.width || 768) * scale / 32) * 32);
        const height = Math.max(256, Math.round((v.height || 1344) * scale / 32) * 32);
        for (const frame of sw.shotCuts) {
          if (sw.video !== v.id) return;
          try {
            const personData = await this.host.call("/h3lab/swap/people", { ref, frame, width, height });
            if (sw.video !== v.id) return;
            this.swapUseDetectedShot(frame, personData);
            if (sw.shotActive === frame && !sw.shotFrame) sw.shotFrame = personData;
          } catch (e) {
            sw.shotFailures[frame] = e.message || String(e);
          }
          sw.shotChecked++;
          if (this.page === "swap") this.renderSwap();
        }
      } catch (e) {
        if (sw.video === v.id) { sw.shotCuts = null; sw.shotError = e.message || String(e); }
      } finally {
        sw.shotLoading = false;
        if (this.page === "swap") this.renderSwap();
      }
    },

    async swapLoadShot(frame) {
      const sw = this.swapState(), v = this.p.assets.find((a) => a.id === sw.video);
      if (!v || sw.shotLoading || sw.shotVerifying) return;
      sw.shotLoading = true; sw.shotActive = frame; sw.shotFrame = null;
      sw.shotMaskPreview = null; sw.shotError = "";
      this.renderSwap();
      const side = Math.max(v.width || 768, v.height || 1344);
      const scale = Math.min(1, 960 / Math.max(1, side));
      const width = Math.max(256, Math.round((v.width || 768) * scale / 32) * 32);
      const height = Math.max(256, Math.round((v.height || 1344) * scale / 32) * 32);
      try {
        const data = await this.host.call("/h3lab/swap/people", {
          ref: { filename: v.file, subfolder: v.subfolder || "", type: v.type || "input" },
          frame, width, height
        });
        if (sw.video === v.id && sw.shotActive === frame) {
          this.swapUseDetectedShot(frame, data);
          sw.shotFrame = data;
        }
      } catch (e) {
        if (sw.video === v.id) {
          sw.shotError = e.message || String(e);
          sw.shotFailures[frame] = sw.shotError;
        }
      } finally {
        sw.shotLoading = false;
        if (this.page === "swap") this.renderSwap();
      }
    },

    swapSelectShotPerson(x, y) {
      const sw = this.swapState(), frame = sw.shotActive;
      if (frame === null || !sw.shotFrame || sw.shotVerifying) return;
      x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
      const matches = (sw.shotFrame.people || []).filter((p) => {
        const [a, b, w, h] = p.box;
        return x >= a && x <= a + w && y >= b && y <= b + h;
      }).sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3]);
      sw.shotAnchors[frame] = {
        point: [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000],
        ...(!sw.shotPointOnly[frame] && matches[0] ? { box: matches[0].box } : {})
      };
      delete sw.shotAuto[frame];
      delete sw.shotMaskVerified[frame];
      sw.shotMaskPreview = null;
      sw.shotError = "";
      this.renderSwap();
    },

    swapShotPointMode() {
      const sw = this.swapState(), frame = sw.shotActive;
      const anchor = sw.shotAnchors[frame];
      if (!anchor || !sw.shotFrame || sw.shotVerifying) return;
      if (sw.shotPointOnly[frame]) {
        const selected = (sw.shotFrame.people || []).filter(({ box }) =>
          anchor.point[0] >= box[0] && anchor.point[0] <= box[0] + box[2] &&
          anchor.point[1] >= box[1] && anchor.point[1] <= box[1] + box[3])
          .sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3])[0];
        if (!selected) {
          sw.shotError = T("Нет рамки YOLO для выбранной точки. Уточните точку на человеке.");
          return this.renderSwap();
        }
        delete sw.shotPointOnly[frame];
        sw.shotAnchors[frame] = { point: [...anchor.point], box: [...selected.box] };
      } else {
        sw.shotPointOnly[frame] = true;
        sw.shotAnchors[frame] = { point: [...anchor.point] };
      }
      delete sw.shotAuto[frame];
      delete sw.shotMaskVerified[frame];
      sw.shotMaskPreview = null; sw.shotError = "";
      this.renderSwap();
    },

    async swapVerifyShotMask() {
      const sw = this.swapState(), frame = sw.shotActive;
      const v = this.p.assets.find((a) => a.id === sw.video);
      const anchor = sw.shotAnchors[frame];
      if (!v || frame === null || !anchor || !sw.shotFrame ||
          sw.shotVerifying || sw.shotLoading || this.run?.active) return;
      sw.shotVerifying = true; sw.shotMaskPreview = null; sw.shotError = "";
      if (this.page === "swap") this.renderSwap();
      try {
        const result = await this.host.call("/h3lab/swap/mask-preview", {
          ref: { filename: v.file, subfolder: v.subfolder || "", type: v.type || "input" },
          frame, point: [...anchor.point], box: anchor.box || null,
          width: sw.shotFrame.width, height: sw.shotFrame.height
        });
        if (result.frame !== frame)
          throw new Error(T("Перезапустите ComfyUI для проверки SAM на выбранных склейках."));
        if (sw.video === v.id && sw.shotActive === frame && sw.shotAnchors[frame] === anchor) {
          sw.shotMaskPreview = result;
          sw.shotMaskVerified[frame] = result.coverage;
        }
      } catch (e) {
        if (sw.video === v.id && sw.shotActive === frame)
          sw.shotError = e.message || String(e);
      } finally {
        sw.shotVerifying = false;
        if (this.page === "swap") this.renderSwap();
      }
    },

    async swapLoadFrame() {
      const sw = this.swapState(), v = this.p.assets.find((a) => a.id === sw.video && a.category === "video");
      if (!v || sw.maskLoading || this.run?.active) return;
      sw.maskLoading = true; sw.maskError = "";
      if (this.page === "swap") this.renderSwap();
      const maxSide = Math.max(1, v.width || 768, v.height || 1344);
      const scale = Math.min(1, 960 / maxSide);
      const width = Math.max(256, Math.round((v.width || 768) * scale / 32) * 32);
      const height = Math.max(256, Math.round((v.height || 1344) * scale / 32) * 32);
      try {
        const d = await this.host.call("/h3lab/swap/people", {
          ref: { filename: v.file, subfolder: v.subfolder || "", type: v.type || "input" },
          frame: 0, width, height
        });
        if (sw.video === v.id) sw.maskFrame = d;
      } catch (e) {
        if (sw.video === v.id) sw.maskError = e.message || String(e);
      } finally {
        sw.maskLoading = false;
        if (sw.video === v.id && this.page === "swap") this.renderSwap();
      }
    },

    swapSelectPerson(x, y) {
      const sw = this.swapState();
      x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
      const boxMatches = (sw.maskFrame?.people || []).filter((p) => {
        const [a, b, w, h] = p.box;
        return x >= a && x <= a + w && y >= b && y <= b + h;
      }).sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3]);
      sw.maskBox = boxMatches[0]?.box || null;
      sw.maskPoint = [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
      sw.maskPreview = null; sw.maskError = "";
      this.renderSwap();
    },

    async swapVerifyMask() {
      const sw = this.swapState(), v = this.p.assets.find((a) => a.id === sw.video);
      if (!v || !sw.maskPoint || !sw.maskFrame || sw.maskVerifying || this.run?.active) return;
      sw.maskVerifying = true; sw.maskPreview = null; sw.maskError = "";
      this.renderSwap();
      try {
        const d = await this.host.call("/h3lab/swap/mask-preview", {
          ref: { filename: v.file, subfolder: v.subfolder || "", type: v.type || "input" },
          point: sw.maskPoint, box: sw.maskBox,
          width: sw.maskFrame.width, height: sw.maskFrame.height
        });
        if (sw.video === v.id) sw.maskPreview = d;
      } catch (e) {
        if (sw.video === v.id) sw.maskError = e.message || String(e);
      } finally {
        sw.maskVerifying = false;
        if (sw.video === v.id && this.page === "swap") this.renderSwap();
      }
    },

    async swapAnalyzePhoto() {
      const sw = this.swapState();
      const photo = this.p.assets.find((a) => a.id === sw.image && C.CATEGORY_ORDER.includes(a.category));
      if (!photo || sw.analyzingPhoto) return;
      if (this.run?.active) return this.toast(T("Дождитесь окончания генерации для анализа фото"), true);
      const cfg = this.p.assistant?.cfg || {};
      if (cfg.backend === "comfy" || !cfg.api_model) {
        return this.toast(T("Для анализа фото выберите мультимодальную API-модель в настройках Ассистента (не энкодер ComfyUI)"), true);
      }
      // The shared assistant endpoint can unload models; never call it during a queued render.
      try {
        const queue = await fetch("/queue", { cache: "no-store" });
        if (!queue.ok) throw new Error("HTTP " + queue.status);
        const state = await queue.json();
        if (state.queue_running?.length || state.queue_pending?.length)
          return this.toast(T("ComfyUI занят генерацией — анализ фото доступен после окончания очереди"), true);
      } catch (e) {
        return this.toast(T("Не удалось проверить очередь ComfyUI: ") + (e.message || e), true);
      }
      const face = sw.useFaceRef ? this.p.assets.find((a) => a.id === sw.faceImage && C.CATEGORY_ORDER.includes(a.category) && a.id !== photo.id) : null;
      const attachments = [photo, ...(face ? [face] : [])].map((a, i) => ({
        kind: "asset", token: i ? "Face photo" : "Full appearance photo",
        label: i ? "Close-up of the same person's face" : "Main image of the person",
        asset: { file: a.file, subfolder: a.subfolder || "", type: a.type || "input" }
      }));
      const before = sw.details;
      const selectedPhoto = sw.image;
      sw.analyzingPhoto = true;
      if (this.page === "swap") this.renderSwap();
      try {
        const response = await fetch("/h3lab/llm/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            backend: cfg.backend, api_base: cfg.api_base, api_key: cfg.api_key, api_model: cfg.api_model,
            messages: [
              { role: "system", content: "You are an exact visual appearance analyst. Describe only observable physical features from the supplied photographs in one compact English paragraph, 60-120 words. Include visible facial geometry, eyes, nose, lips, jaw, skin tone, hair, build and proportions, clothing, footwear and accessories. The close-up, when provided, depicts the SAME person and provides facial details; the main photo defines clothing and body. Do not guess invisible details, age, ethnicity, personality or identity. If something is not visible, omit it. No instructions to the video model, no introduction, no Markdown." },
              { role: "user", content: "Describe the appearance of the character in these reference photographs for accurate video character replacement." }
            ],
            attachments, max_tokens: 400, temperature: 0.2, top_p: 0.9,
            thinking: false, stream_timeout: cfg.stream_timeout || 180
          })
        });
        if (!response.ok || !response.body) {
          let message = "";
          try { message = (await response.json()).error || ""; } catch {}
          throw new Error(message || "HTTP " + response.status);
        }
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "", answer = "";
        for (;;) {
          const part = await reader.read();
          buffer += decoder.decode(part.value || new Uint8Array(), { stream: !!part.value });
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const lines = buffer.slice(0, end).split("\n");
            buffer = buffer.slice(end + 2);
            const line = lines.find((x) => x.startsWith("data: "));
            if (!line) continue;
            const event = JSON.parse(line.slice(6));
            if (event.kind === "error") throw new Error(event.text || "API error");
            if (event.kind === "token") answer += event.text || "";
          }
          if (part.done) break;
        }
        const result = cleanSwapAppearance(answer);
        if (!result) throw new Error(T("Модель вернула пустое описание"));
        if (sw.image !== selectedPhoto || sw.details !== before)
          return this.toast(T("Фото или текст изменились во время анализа — результат не заменил ваши правки"), true);
        sw.details = result;
        this.toast(T("Описание по фото готово. Проверьте и при необходимости отредактируйте."));
      } catch (e) {
        this.toast(T("Анализ фото: ") + (e.message || e), true);
      } finally {
        sw.analyzingPhoto = false;
        if (this.page === "swap") this.renderSwap();
      }
    },

    swapMaskPanel() {
      const sw = this.swapState();
      const f = sw.maskFrame;
      const img = f ? h("img", { src: sw.maskPreview?.image || f.image,
        alt: T("Первый кадр для выбора человека"), draggable: "false",
        onclick: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          this.swapSelectPerson((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        } }) : null;
      const canvas = f ? h("div", { class: "v6-sw-mask-canvas" }, img,
        ...(sw.maskPreview ? [] : (f.people || []).map((p, i) =>
          h("span", { class: "v6-sw-mask-box", style: {
            left: (p.box[0] * 100) + "%", top: (p.box[1] * 100) + "%",
            width: (p.box[2] * 100) + "%", height: (p.box[3] * 100) + "%"
          } }, String(i + 1)))),
        sw.maskPoint ? h("span", { class: "v6-sw-mask-pin", style: {
          left: (sw.maskPoint[0] * 100) + "%", top: (sw.maskPoint[1] * 100) + "%"
        } }) : null) : null;
      return h("div", { class: "v6-sw-mask-panel span" },
        h("b", null, T("Выбор персонажа · SAM 3.1")),
        h("small", { class: "v6-muted" },
          T("Нажмите на нужного человека внутри рамки. SAM 3.1 выделит всю фигуру по рамке, а не только деталь одежды. Зелёная область будет заменена; остальной кадр останется исходным.")),
        sw.maskLoading ? h("small", { class: "v6-muted" }, T("Подготавливаю первый кадр…")) : null,
        canvas,
        h("div", { class: "v6-sw-mask-actions" },
          btn({ label: sw.maskVerifying ? T("Проверяю SAM 3.1…") : T("Проверить выделение"),
            kind: "tinted", disabled: !sw.maskPoint || sw.maskVerifying || this.run?.active,
            onclick: () => this.swapVerifyMask() }),
          btn({ label: T("Обновить кадр"), disabled: sw.maskLoading || sw.maskVerifying,
            onclick: () => { sw.maskFrame = null; sw.maskPreview = null; this.swapLoadFrame(); } })),
        sw.maskPreview ? h("small", { class: "v6-sw-mask-ok" },
          T("Маска SAM 3.1 проверена · площадь {0}%.", (sw.maskPreview.coverage * 100).toFixed(1))) : null,
        sw.maskError ? h("small", { class: "v6-sw-mask-error" }, sw.maskError) : null);
    },

    swapShotPanel() {
      const sw = this.swapState(), f = sw.shotFrame;
      const anchor = sw.shotActive !== null ? sw.shotAnchors?.[sw.shotActive] : null;
      return h("div", { class: "v6-sw-field span" },
        h("b", null, T("Смена ракурса и монтажных кадров")),
        h("small", { class: "v6-muted" },
          T("После поиска склеек мастер определит людей на каждом новом плане. Один уверенно найденный человек выбирается автоматически; при нескольких людях выберите нужного вручную.")),
        btn({ label: sw.shotLoading
            ? (sw.shotTotal ? T("Определяю людей: {0}/{1}", sw.shotChecked, sw.shotTotal) : T("Ищу смены планов…"))
            : T("Найти смены планов и людей"),
          kind: "tinted", disabled: sw.shotLoading || sw.shotVerifying,
          onclick: () => this.swapScanShots() }),
        sw.shotCuts ? h("small", { class: "v6-sw-mask-ok" },
          T("Найдено планов: {0}. Персонаж выбран на новых планах: {1} из {2}.",
            sw.shotCuts.length + 1,
            Object.keys(sw.shotAnchors || {}).filter((frame) => sw.shotCuts.includes(Number(frame))).length,
            sw.shotCuts.length)) : null,
        sw.shotCuts?.length && !sw.shotLoading
          ? h("small", { class: "v6-muted" },
              T("Галочка означает, что человек выбран. Проверьте все новые планы: автоматическое обнаружение не подтверждает личность. При нескольких людях выбор обязателен."))
          : null,
        sw.shotCuts ? h("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
          h("input", { class: "v6-in", type: "number", min: "0.1", step: "0.1",
            style: { width: "110px" }, placeholder: T("Время, с"),
            value: sw.shotTime, oninput: (e) => { sw.shotTime = e.target.value; } }),
          btn({ label: T("Добавить пропущенную склейку"), kind: "tinted",
            onclick: () => {
              const total = this.p.assets.find((a) => a.id === sw.video)?.frames || 0;
              const at = Math.round(Number(sw.shotTime) * C.FPS);
              if (!Number.isFinite(at) || at < 1 || at >= total) {
                sw.shotError = T("Введите время внутри исходного видео");
                return this.renderSwap();
              }
              if (!sw.shotCuts.includes(at)) sw.shotManualCuts.push(at);
              sw.shotCuts = [...new Set([...sw.shotCuts, at])].sort((a, b) => a - b);
              sw.shotTime = ""; sw.shotError = "";
              void this.swapLoadShot(at);
            } })) : null,
        sw.shotCuts?.length ? h("div", { style: { display: "flex", gap: "5px", flexWrap: "wrap",
          maxHeight: "115px", overflowY: "auto" } },
          ...sw.shotCuts.map((at, i) => btn({
            label: (i + 2) + " · " + (at / C.FPS).toFixed(1) + "с" +
              (sw.shotAnchors?.[at] ? (sw.shotMaskVerified[at] !== undefined ? " ✓ SAM"
                : sw.shotAuto?.[at] ? " ✓ авто" : " ✓ выбран")
                : sw.shotFailures?.[at] ? " ⚠ ошибка"
                : sw.shotCounts?.[at] > 1 ? " ⚠ несколько"
                : sw.shotCounts?.[at] === 0 ? " ⚠ не найден"
                : " …"),
            kind: sw.shotActive === at ? "tinted" : undefined,
            disabled: sw.shotLoading || sw.shotVerifying,
            onclick: () => this.swapLoadShot(at)
          }))) : null,
        f ? h("div", { class: "v6-sw-mask-canvas", style: { maxWidth: "360px" } },
          h("img", { src: sw.shotMaskPreview?.image || f.image, draggable: "false",
            alt: T("Выберите того же исходного персонажа в новом плане"),
            onclick: (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              this.swapSelectShotPerson((e.clientX - r.left) / r.width,
                                        (e.clientY - r.top) / r.height);
            } }),
          ...(sw.shotMaskPreview ? [] : (f.people || []).map((person) => h("span", {
            class: "v6-sw-mask-box",
            style: { left: (person.box[0] * 100) + "%",
              top: (person.box[1] * 100) + "%",
              width: (person.box[2] * 100) + "%",
              height: (person.box[3] * 100) + "%" } }))),
          anchor ? h("span", { class: "v6-sw-mask-pin",
            style: { left: (anchor.point[0] * 100) + "%",
              top: (anchor.point[1] * 100) + "%" } }) : null) : null,
        f ? h("small", { class: "v6-muted" },
          anchor ? (sw.shotAuto?.[sw.shotActive]
            ? T("Один человек найден автоматически. Проверьте рамку и при необходимости нажмите на другого.")
            : T("Персонаж на этом плане выбран вручную."))
            : (f.people || []).length > 1
              ? T("На плане несколько людей. Нажмите на того, кого нужно заменить.")
              : T("Человек не распознан уверенно. Укажите его вручную на изображении.")) : null,
        f && anchor ? h("div", { class: "v6-sw-mask-actions" },
          btn({ label: sw.shotVerifying ? T("Проверяю SAM 3.1…") : T("Проверить выделение"),
            kind: "tinted", disabled: sw.shotVerifying || sw.shotLoading || !!this.run?.active,
            onclick: () => this.swapVerifyShotMask() }),
          btn({ label: sw.shotPointOnly?.[sw.shotActive]
              ? T("Выделять по рамке YOLO") : T("Уточнить по точке"),
            kind: "tinted", disabled: sw.shotVerifying,
            onclick: () => this.swapShotPointMode() }),
          sw.shotMaskPreview ? btn({ label: T("Показать исходный кадр"), kind: "tinted",
            onclick: () => { sw.shotMaskPreview = null; this.renderSwap(); } }) : null
        ) : null,
        sw.shotMaskPreview ? h("small", { class: "v6-sw-mask-ok" },
          T("SAM 3.1 проверена на этом плане · площадь {0}%. Зелёная область будет заменена.",
            (sw.shotMaskPreview.coverage * 100).toFixed(1))) : null,
        f && anchor ? h("small", { class: "v6-muted" },
          sw.shotPointOnly?.[sw.shotActive]
            ? T("Режим точки: SAM выбирает область по нажатию. Нажмите на человека и повторите проверку.")
            : T("Режим рамки: SAM использует рамку человека от YOLO. Если маска неверна, попробуйте режим точки.")) : null,
        anchor ? btn({ label: T("Снять выбор"), kind: "tinted",
          disabled: sw.shotVerifying,
          onclick: () => {
            delete sw.shotAnchors[sw.shotActive];
            delete sw.shotAuto[sw.shotActive];
            delete sw.shotMaskVerified[sw.shotActive];
            delete sw.shotPointOnly[sw.shotActive];
            sw.shotMaskPreview = null;
            this.renderSwap();
          } }) : null,
        sw.shotError ? h("small", { class: "v6-sw-mask-error" }, sw.shotError) : null);
    },

    renderSwap() {
      const root = this.$.pSwap;
      if (!root) return;
      root.replaceChildren();
      const sw = this.swapState();
      if (!this._swapLoraRequested && typeof this.mpLoad === "function") {
        this._swapLoraRequested = true;
        void this.mpLoad().then(() => {
          if (this.root && this.page === "swap") this.renderSwap();
        }).catch((e) => console.warn("[H3ZeroStudio] Swap LoRA list:", e));
      }
      const loraFiles = this._mp?.files?.lora || [];
      const actualLora = installedSwapLora(loraFiles, sw.lora);
      if (actualLora) sw.lora = actualLora; // Windows lists backslashes; older defaults used forward slashes.
      const loraPicker = () => {
        const parts = (name) => String(name || "").split(/[\\/]/);
        const filename = (name) => parts(name).at(-1) || "";
        const folder = (name) => parts(name).slice(0, -1).join(" / ") || "models/loras";
        const chosen = installedSwapLora(loraFiles, sw.lora);
        const choice = h("button", { type: "button", class: "v6-sw-lora-choice",
          "aria-expanded": "false", title: chosen || sw.lora || T("Выберите Swap LoRA") },
          h("span", { class: "v6-sw-lora-choice-text" },
            h("b", null, chosen ? filename(chosen) : T("Выберите установленную LoRA…")),
            h("small", null, chosen ? folder(chosen) : T("Нажмите для просмотра списка"))),
          h("span", { class: "v6-sw-lora-chevron", "aria-hidden": "true" }, "⌄"));
        const search = h("input", { class: "v6-in", type: "search",
          "aria-label": T("Поиск LoRA"), placeholder: T("Поиск LoRA по имени или подпапке"),
          value: sw.loraSearch || "" });
        const count = h("small", { class: "v6-muted" });
        const list = h("div", { class: "v6-sw-lora-list", role: "listbox",
          "aria-label": T("Установленные LoRA"), style: { display: "none" } });
        const show = (open) => {
          list.style.display = open ? "block" : "none";
          choice.setAttribute("aria-expanded", String(open));
        };
        const select = (name) => {
          sw.lora = name;
          rememberSwapLora(name);
          this.renderSwap();
        };
        const update = () => {
          const q = (sw.loraSearch || "").trim().toLowerCase();
          const found = loraFiles.filter((name) => name.toLowerCase().includes(q));
          count.textContent = T("Найдено: {0} из {1}", found.length, loraFiles.length);
          list.replaceChildren(...(found.length ? found.map((name) =>
            h("button", { type: "button", role: "option", title: name,
              "aria-selected": String(name === sw.lora),
              class: "v6-sw-lora-item" + (name === sw.lora ? " on" : ""),
              onclick: () => select(name) },
              h("b", null, filename(name)), h("small", null, folder(name))))
            : [h("div", { class: "v6-sw-lora-empty" },
              this._mp?.ok ? T("LoRA не найдены. Измените запрос.") : T("Список LoRA пока недоступен."))]));
        };
        choice.onclick = () => { const open = list.style.display === "none"; show(open); if (open) search.focus(); };
        search.onfocus = () => show(true);
        search.oninput = (e) => { sw.loraSearch = e.target.value; update(); show(true); };
        search.onkeydown = (e) => {
          if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); show(false); choice.focus(); }
          if (e.key === "Enter") {
            const found = loraFiles.filter((name) => name.toLowerCase().includes((sw.loraSearch || "").trim().toLowerCase()));
            if (found.length === 1) { e.preventDefault(); select(found[0]); }
          }
        };
        update();
        const status = this._mp?.ok
          ? (chosen ? T("{0} LoRA доступно · выбранный путь сохраняется в проекте", loraFiles.length)
            : T("⚠ Выбранная LoRA отсутствует в папках моделей ComfyUI"))
          : (this._mp?.err ? T("Не удалось загрузить список LoRA: {0}", this._mp.err) : T("Загрузка списка LoRA…"));
        return h("div", { class: "v6-sw-field span" },
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
            h("b", null, T("LoRA для замены персонажа")),
            btn({ label: T("⟳ Обновить список"), kind: "tinted", onclick: async () => {
              await this.mpLoad(true);
              if (this.page === "swap") this.renderSwap();
            } })),
          choice, search, count, list,
          h("small", { class: "v6-muted" }, status),
          h("small", { class: "v6-muted" },
            T("Файлы из всех папок LoRA, известных ComfyUI, включая дополнительные пути.")));
      };
      const videos = this.p.assets.filter((a) => a.category === "video");
      const images = this.p.assets.filter((a) => C.CATEGORY_ORDER.includes(a.category));
      if (!videos.some((a) => a.id === sw.video)) sw.video = videos[0]?.id || "";
      if (!images.some((a) => a.id === sw.image)) sw.image = images[0]?.id || "";
      if (sw.maskVideo !== sw.video) {
        sw.maskVideo = sw.video; sw.maskFrame = null; sw.maskPoint = null;
        sw.maskBox = null; sw.maskPreview = null; sw.maskError = "";
        sw.shotVideo = sw.video; sw.shotCuts = null; sw.shotAnchors = {};
        sw.shotManualCuts = []; sw.shotTime = "";
        sw.shotFrame = null; sw.shotActive = null; sw.shotError = "";
        sw.shotCounts = {}; sw.shotAuto = {}; sw.shotFailures = {};
        sw.shotChecked = 0; sw.shotTotal = 0;
        sw.shotMaskPreview = null; sw.shotMaskVerified = {};
        sw.shotPointOnly = {}; sw.shotVerifying = false;
      }

      const input = (kind, label, accept) => {
        const f = h("input", { type: "file", accept, hidden: true });
        f.onchange = async () => { const file = f.files?.[0]; f.value = ""; await this.swapUpload(kind, file); };
        return h("div", { class: "v6-sw-file" }, btn({ icon: I.upload, label, kind: "tinted", onclick: () => f.click() }), f);
      };
      const picker = (label, entries, current, change) =>
        h("label", { class: "v6-sw-field" }, h("span", {}, label),
          h("select", { class: "v6-in", value: current, onchange: (e) => { change(e.target.value); this.renderSwap(); } },
            h("option", { value: "" }, T("Не выбрано")),
            entries.map((a) => h("option", { value: a.id }, a.name || a.file))));
      const v = videos.find((a) => a.id === sw.video);
      const pic = images.find((a) => a.id === sw.image);
      const faceImages = images.filter((a) => a.id !== sw.image);
      const facePic = faceImages.find((a) => a.id === sw.faceImage);
      const preview = (a, isVideo) => a ? (isVideo
        ? h("video", { class: "v6-sw-preview", controls: true, preload: "metadata", src: this.assetUrl(a) })
        : h("img", { class: "v6-sw-preview", src: this.assetUrl(a), alt: a.name || "" }))
        : h("div", { class: "v6-sw-empty" }, isVideo ? T("Выберите видео") : T("Выберите фотографию"));
      const settings = h("section", { class: "v6-sw-card" },
        h("h2", {}, T("Замена персонажа"), h("span", { class: "v6-sw-exp" }, T("Эксперимент"))),
        h("p", { class: "v6-muted" }, T("Модель использует движение и камеру исходного видео, а внешность — с фотографии. Экспериментальная SAM 3.1-маска позволяет сохранять исходный фон.")),
        h("div", { class: "v6-sw-choices" },
          h("div", { class: "v6-sw-source" }, h("b", {}, T("1. Исходное видео")),
            picker(T("Выберите видео из медиатеки"), videos, sw.video, (x) => { sw.video = x; }),
            input("video", T("Загрузить видео"), "video/*,.mp4,.mov,.webm,.mkv"), preview(v, true),
            v ? h("small", { class: "v6-muted" }, String(Math.round(v.frames || 0)) + T(" кадров · ") + String((v.duration || 0).toFixed(1)) + T(" с")) : null),
          h("div", { class: "v6-sw-source" }, h("b", {}, T("2. Новый персонаж")),
            picker(T("Фотография персонажа"), images, sw.image, (x) => { sw.image = x; }),
            input("image", T("Загрузить фото"), "image/*,.png,.jpg,.jpeg,.webp"), preview(pic, false),
            h("small", { class: "v6-muted" }, T("Лучше использовать чёткое фото в полный рост.")))),
        h("div", { class: "v6-sw-grid" },
          h("label", { class: "v6-sw-field" }, h("span", {}, T("Кого заменять (если людей несколько)")),
            h("input", { class: "v6-in", value: sw.subject, placeholder: "the woman on the left",
              oninput: (e) => { sw.subject = e.target.value; } })),
          h("label", { class: "v6-sw-field" }, h("span", {}, T("Длина отрезка")),
            h("select", { class: "v6-in", value: sw.chunk, onchange: (e) => { sw.chunk = e.target.value; } },
              [6, 10, 15].map((x) => h("option", { value: String(x) }, String(x) + T(" секунд"))))),
          h("label", { class: "v6-sw-check" }, h("input", { type: "checkbox", checked: !!sw.keepAudio,
            onchange: (e) => { sw.keepAudio = e.target.checked; } }), T("Сохранить исходную звуковую дорожку (через аудиолатент H3)")),
          h("label", { class: "v6-sw-check" }, h("input", { type: "checkbox", checked: !!sw.continueClips,
            onchange: (e) => { sw.continueClips = e.target.checked; } }),
            T("Авторазделение с плавным продолжением (перекрытие между отрезками)")),
          h("label", { class: "v6-sw-check" }, h("input", { type: "checkbox", checked: !!sw.preserveBg,
            onchange: (e) => { sw.preserveBg = e.target.checked; this.renderSwap(); } }),
            T("Эксперимент: сохранять оригинальный фон и других людей (SAM 3.1)")),
          sw.preserveBg ? this.swapMaskPanel() : null,
          sw.preserveBg ? this.swapShotPanel() : null,
          sw.preserveBg ? h("div", { class: "v6-sw-field span" },
            h("label", { class: "v6-sw-check" },
              h("input", { type: "checkbox", checked: !!sw.maskGuard,
                onchange: (e) => { sw.maskGuard = e.target.checked; } }),
              T("Эксперимент: защита от перескока маски на другого человека")),
            h("small", { class: "v6-muted" },
              T("Если маска резко перепрыгнет на другую часть кадра, сохранится оригинальный кадр. Быстрое движение и перекрытия могут вызвать пропуски; по умолчанию выключено."))) : null,
          h("label", { class: "v6-sw-check" }, h("input", { type: "checkbox", checked: !!sw.useFaceRef,
            onchange: (e) => { sw.useFaceRef = e.target.checked; this.renderSwap(); } }),
            T("Эксперимент: отдельное крупное фото лица (дополнительный референс)")),
          sw.useFaceRef ? h("div", { class: "v6-sw-field span" },
            picker(T("Крупный план лица того же персонажа"), faceImages, sw.faceImage, (x) => { sw.faceImage = x; }),
            input("faceImage", T("Загрузить фото лица"), "image/*,.png,.jpg,.jpeg,.webp"),
            facePic ? preview(facePic, false) : h("small", { class: "v6-muted" }, T("Выберите отдельное фото лица")),
            h("small", { class: "v6-muted" },
              T("Эксперимент: лицо берётся с крупного плана, фигура и одежда — с основного фото. Оба фото должны быть одного человека; улучшение не гарантируется."))) : null,
          loraPicker(),
          (() => {
            const initial = Math.max(0.5, Math.min(1.5, Number(sw.loraStrength) || 1));
            const strengthValue = h("b", { class: "v6-sw-strength-value" }, initial.toFixed(2) + "×");
            return h("div", { class: "v6-sw-field span" },
              h("label", { for: "h3l-swap-lora-strength", class: "v6-sw-strength-label" },
                T("Сила Swap LoRA"), strengthValue),
              h("input", { id: "h3l-swap-lora-strength", type: "range", class: "v6-sw-strength",
                min: "0.5", max: "1.5", step: "0.05", value: String(initial),
                oninput: (e) => { sw.loraStrength = Number(e.target.value); strengthValue.textContent = sw.loraStrength.toFixed(2) + "×"; } }),
              h("small", { class: "v6-muted" }, T("1.00× — прежний результат. Меняйте понемногу и сравнивайте дубли; повышение силы может ухудшить движение или лицо.")));
          })(),
          h("div", { class: "v6-sw-field span" },
            h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" } },
              h("span", null, T("Описание внешности нового персонажа")),
              h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                btn({ label: T("Полностью с фото"), kind: "tinted",
                  onclick: () => { sw.details = DEFAULT_PHOTO_APPEARANCE; this.renderSwap(); } }),
                btn({ label: sw.analyzingPhoto ? T("Анализирую фото…") : T("Проанализировать персонажа"),
                  kind: "tinted", disabled: sw.analyzingPhoto || !sw.image || !!this.run?.active,
                  onclick: () => this.swapAnalyzePhoto() }))),
            h("textarea", { class: "v6-in", rows: 3, placeholder: T("Пол, лицо, причёска, фигура, одежда, обувь — желательно на английском"),
              oninput: (e) => { sw.details = e.target.value; } }, sw.details),
            h("small", { class: "v6-muted" }, T("По умолчанию переносится вся видимая внешность с фото. Текст можно уточнить вручную.")),
            h("small", { class: "v6-muted" },
              T("Эксперимент: анализ через выбранную в Ассистенте мультимодальную API-модель. Фото отправляется на настроенный API только после нажатия кнопки; во время генерации анализ недоступен.")))),
        h("div", { class: "v6-sw-actions" },
          h("p", { class: "v6-muted" }, T("Сначала создаётся отдельный проект. Исходный проект сохранится. Протестируйте первый отрезок перед полной генерацией.")),
          btn({ icon: I.spark, label: T("Создать проект замены"), kind: "primary",
            disabled: sw.shotLoading || sw.shotVerifying,
            onclick: () => this.swapBuild() })));
      root.append(h("div", { class: "v6-sw-wrap" }, settings));
      if (sw.preserveBg && sw.video && !sw.maskFrame && !sw.maskLoading && !sw.maskError && !this.run?.active)
        void this.swapLoadFrame();
    }
  });
}
