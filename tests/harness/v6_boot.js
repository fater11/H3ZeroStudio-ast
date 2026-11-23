/** Lab v6 harness: the new Studio front end on a realistic mocked project (no ComfyUI). */
import { Studio } from "../../web/js/v6/studio.js";
import { applyUiScale } from "../../web/js/h3s_ui_scale.js";

const qs = new URLSearchParams(location.search);
const W = Number(qs.get("w") || innerWidth), H = Number(qs.get("h") || innerHeight), scale = Number(qs.get("scale") || 100);
const empty = qs.get("empty") === "1";
const M = (f) => ({ filename: f, subfolder: "", type: "input" });
const res = (n, frames) => ({ key: "k" + n, video: M(`seg${n}.mp4`), poster: M(`take${n}.png`), frames, cached: n === 2 });
const project = empty ? { id: "p0", name: "Новый проект", segments: [], assets: [] } : {
  id: "p1", name: "Ночной город",
  settings: { settings_scope: "project", final_mode: "refine", quality: "draft", steps: 12, cfg: 1, aspect: "16:9", megapixels: 0.5, seed: 421337 },
  segments: [
    { id: "s1", name: "Коридор", frames: 124, color: 0, link: "extend", refs: ["a_anna", "a_corr"],
      prompt: "<Picture 1> walks slowly down the dim corridor of <Picture 2>, warm practical lights flicker, camera follows from behind at shoulder height, footsteps echo.",
      result: res(1, 124), takes: [{ id: "t1", key: "k1", seed: 421337, result: res(1, 124) }], active_take: "t1" },
    { id: "s2", name: "Выход на улицу", frames: 124, color: 2, link: "extend", refs: ["a_anna", "a_city"],
      prompt: "She pushes the door open and steps out into the neon-lit street of <Picture 2>; rain, reflections, distant traffic hum.",
      result: res(2, 124), takes: [{ id: "t2a", key: "k2x", seed: 1, result: res(2, 124) }, { id: "t2", key: "k2", seed: 421338, result: res(2, 124) }], active_take: "t2" },
    { id: "s3", name: "", frames: 158, color: 4, link: "extend", refs: ["a_mark"],
      prompt: "<Picture 1> waits by the car, looks up as she approaches. Close-up, shallow depth of field." },
    { id: "s4", name: "Финал", frames: 90, color: 6, link: "cut", refs: ["a_car"], prompt: "" },
  ],
  assets: [
    { id: "a_anna", name: "Анна", file: "anna.png", category: "character" },
    { id: "a_mark", name: "Марк", file: "mark.png", category: "character" },
    { id: "a_corr", name: "Коридор", file: "corridor.png", category: "location" },
    { id: "a_city", name: "Ночная улица", file: "city.png", category: "location" },
    { id: "a_car", name: "Машина", file: "car.png", category: "other" },
  ],
  audio: { clips: [], video_volume: 1 }, markers: [],
  assistant: { active: "c1", chats: [{ id: "c1", title: "Сцена в коридоре", msgs: [
    { role: "user", text: "Сделай промпт для первого отрезка: героиня идёт по коридору, без склеек." },
    { role: "assistant", text: "Вот вариант для **отрезка 1**:\n\n> <Picture 1> walks slowly down the dim corridor of <Picture 2>, warm practical lights flicker, camera follows from behind.\n\nДобавить звук шагов?" },
  ] }], presets: [], style_defs: [], cfg: { api_model: "qwen3-14b", api_base: "http://127.0.0.1:1234/v1" } },
};
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }), text: async () => JSON.stringify({ ok: true, data }), arrayBuffer: async () => new ArrayBuffer(0) });
const routes = {
  "/h3lab/options": () => ok({ samplers: ["euler", "dpmpp_2m"], schedulers: ["simple", "karras"], accel: { kitchen: true }, upscalers: {}, models: {} }),
  "/h3lab/models/downloads": () => ok({ groups: [], models: [], counts: { installed: 5, total: 7, required_total: 5, required_missing: 0 } }),
  "/h3lab/models/downloads/jobs": () => ok({ jobs: {} }),
  "/h3lab/models": () => ok({ files: { checkpoint: ["h3_dev_fp8.safetensors"], unet: [], lora: [], text_encoder: [], vae: [] }, presets: [], cache: {}, missing: {} }),
  "/h3lab/inflight": () => ok({ inflight: null }),
  "/h3lab/gallery": () => ok(qs.get("gal") === "0" ? [] : [
    { id: "g1", pid: "p1", key: "k1", kind: "take", seg_index: 0, seed: 421337, frames: 124, wh: [960, 544], t: Date.now() / 1000 - 600, video: { filename: "seg1.mp4", subfolder: "", type: "output" }, poster: { filename: "take1.png", subfolder: "", type: "output" } },
    { id: "g2", pid: "p1", key: "k2", kind: "take", seg_index: 1, seed: 421338, frames: 124, wh: [960, 544], t: Date.now() / 1000 - 500, video: { filename: "seg2.mp4", subfolder: "", type: "output" }, poster: { filename: "take2.png", subfolder: "", type: "output" } },
    { id: "g3", pid: "p1", key: "k3", kind: "draft", seg_index: 2, seed: 77, frames: 158, wh: [480, 272], t: Date.now() / 1000 - 400, video: { filename: "seg1.mp4", subfolder: "", type: "output" }, poster: { filename: "take3.png", subfolder: "", type: "output" } },
    { id: "g4", pid: "p1", key: "k4", kind: "final", frames: 451, wh: [960, 544], t: Date.now() / 1000 - 300, video: { filename: "seg2.mp4", subfolder: "", type: "output" }, poster: { filename: "take4.png", subfolder: "", type: "output" } },
  ]),
  "/h3lab/projects": () => ok([]),
  "/h3lab/chars": () => ok([]),
  "/h3lab/runs": () => ok({ current: { status: "done", start: Date.now() / 1000 - 900, end: Date.now() / 1000 - 557, dur: 343, what: "gen" }, history: [{ status: "done", start: Date.now() / 1000 - 900, end: Date.now() / 1000 - 557, dur: 343, what: "gen" }, { status: "interrupted", start: Date.now() / 1000 - 4000, end: Date.now() / 1000 - 3900, dur: 100, what: "gen" }], now: Date.now() / 1000 }),
  "/h3lab/monitor": () => ok({ lines: [], after: 0, metrics: { cpu: { percent: 8 }, ram: { percent: 28 }, gpu: { percent: 1, vram_percent: 19, temperature: 51, name: "RTX 4090" } }, seq: 1 }),
  "/h3lab/themes": () => ok({ themes: [] }),
  "/h3lab/llm/connect": () => ok({ connected: true, models: ["qwen3-14b"], base: "http://127.0.0.1:1234/v1" }),
  "/h3lab/settings": () => ok({ settings: {} }),
  "/h3lab/ui": () => ok({ welcome_dismissed: qs.get("welcome") !== "1" }),
};
const _fetch = fetch.bind(window);
window.fetch = async (url, init = {}) => { const p = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0]; if (routes[p]) return routes[p](init); if (p.startsWith("/h3lab/")) return ok({}); return _fetch(url, init); };
const host = {
  load: () => JSON.stringify(project), save: () => {}, queue: async () => ({}), interrupt: async () => {},
  upload: async () => ({ name: "x.png", subfolder: "", type: "input" }),
  url: (r) => r?.filename ? "/tests/harness/media/" + r.filename : "about:blank",
  options: async () => (await (await fetch("/h3lab/options")).json()).data,
  getRaw: async (p) => (await (await fetch(p)).json()), clearCache: async () => {}, onClose: () => {}, onChange: () => {},
  get: async (p) => (await (await fetch(p)).json()).data, call: async (p) => (await (await fetch(p, { method: "POST" })).json()).data,
  status: async () => null, nodeId: () => "1",
};
document.documentElement.style.cssText = "height:100%;margin:0;";
document.body.style.cssText = `margin:0;height:100vh;width:100vw;overflow:hidden;background:#000;`;
try { localStorage.setItem("h3ls.uiScale", String(scale)); if (qs.get("lang")) localStorage.setItem("h3ls.lang", qs.get("lang")); } catch {}
const ed = new Studio(host);
ed.open();
applyUiScale(scale, false, ed.root);
window.__V6__ = { ed, errors: window.__errs || [] };
await new Promise((r) => setTimeout(r, 300));
window.__V6__.ready = true;
