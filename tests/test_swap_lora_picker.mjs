import assert from "node:assert/strict";
import * as C from "../web/js/h3s_core.js";
import { installSwap } from "../web/js/v6/swap.js";
import { installVideo } from "../web/js/h3s_video.js";

class El {
  constructor(tag, attrs = {}, kids = []) {
    this.tag = tag;
    this.attrs = attrs || {};
    this.className = this.attrs.class || "";
    this.style = { ...(this.attrs.style || {}) };
    this.value = this.attrs.value || "";
    this.children = kids.flat(Infinity).filter((x) => x != null && x !== false);
    this.onclick = this.attrs.onclick;
    this.onchange = this.attrs.onchange;
    this.textContent = "";
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  replaceChildren(...kids) { this.children = kids.flat(Infinity).filter((x) => x != null && x !== false); }
  append(...kids) { this.children.push(...kids.flat(Infinity).filter((x) => x != null && x !== false)); }
  focus() { this.onfocus?.(); }
}
const h = (tag, attrs, ...kids) => new El(tag, attrs, kids);
const find = (el, match) => {
  if (el instanceof El && match(el)) return el;
  for (const k of el.children || []) {
    if (k instanceof El) { const hit = find(k, match); if (hit) return hit; }
  }
  return null;
};
class Editor {}
installSwap(Editor, { C, h, I: { upload: "", spark: "" },
  btn: ({ label, onclick }) => h("button", { onclick }, label) });
installVideo(Editor, { C, h, ICON: {} });
const e = new Editor();
const files = ["minimax\\h3_character_swap_v1.5.safetensors",
  "minimax\\minimax_h3_character_swap_v1.1_ref2va_fro.safetensors", "other\\cinematic.safetensors"];
e._swapLoraRequested = true;
e._mp = { ok: true, files: { lora: files } };
e.$ = { pSwap: h("main") };
e.p = { assets: [] };
e.root = {};
e.page = "swap";
e.renderSwap();
assert(!find(e.$.pSwap, (x) => x.tag === "select" && x.attrs["aria-label"] === "Установленные LoRA"),
  "native white OS dropdown should not be used for LoRA");
const choice = find(e.$.pSwap, (x) => x.className === "v6-sw-lora-choice");
const list = find(e.$.pSwap, (x) => x.className === "v6-sw-lora-list");
const search = find(e.$.pSwap, (x) => x.tag === "input" && x.attrs.type === "search");
assert(choice && list && search, "custom dark picker has selection, search and result list");
assert.equal(list.style.display, "none");
choice.onclick();
assert.equal(list.style.display, "block");
search.oninput({ target: { value: "v1.5" } });
assert.equal(list.children.length, 1, "filter searches folder and filename");
assert.equal(list.children[0].className, "v6-sw-lora-item");
list.children[0].onclick();
assert.equal(e.swapState().lora, files[0], "selected relative path persists into Swap state");
assert.equal(find(e.$.pSwap, (x) => x.className === "v6-sw-lora-choice").attrs.title, files[0]);
const strength = find(e.$.pSwap, (x) => x.className === "v6-sw-strength");
assert(strength, "Swap has an adjustable LoRA strength slider");
assert.equal(strength.attrs.value, "1");
strength.attrs.oninput({ target: { value: "1.2" } });
assert.equal(e.swapState().loraStrength, 1.2, "strength slider updates new project settings");
e.p = C.normalizeProject({ id: "swap_existing", assets: [
  { id: "v", category: "video", file: "guide.mp4", frames: 141 },
  { id: "p", category: "character", file: "photo.png" }],
  segments: [{ id: "s1", frames: 141, refs: ["p"], source: { asset: "v", in: 0,
    denoise: 1, swap: true, swap_lora: files[0], swap_lora_strength: 1,
    swap_mask: { model: "sam3.1", at: 0, point: [.5, .5] } } }] });
e.sel = 0;
e.run = { active: false };
e.seg = (i = e.sel) => e.p.segments[i];
e.items = () => [{ start: 0, end: 141, overlap: 0 }]; // real editor supplies the current timeline spans
e.segGenState = () => ({ ok: true });
e.mutate = (fn) => { fn(e.p); e.p = C.normalizeProject(e.p); };
let regenerated = -1;
e.genSegment = (i) => { regenerated = i; };
const panel = e.swapLoraBlock(0);
const projectChoice = find(panel, (x) => x.className === "h3l-sw-lora-choice");
assert(projectChoice, "existing swap clip exposes its LoRA in the inspector");
projectChoice.onclick();
const projectList = find(panel, (x) => x.className === "h3l-sw-lora-list");
assert.equal(projectList.style.display, "block");
const projectSearch = find(panel, (x) => x.className.includes("h3l-sw-lora-search"));
projectSearch.value = "ref2va";
projectSearch.oninput();
assert.equal(projectList.children.length, 1, "inspector has bounded searchable LoRA list");
projectList.children[0].onclick();
assert.equal(e.p.segments[0].source.swap_lora, files[1], "LoRA can be changed without rebuilding the project");
const strengthInProject = find(panel, (x) => x.className.includes("h3l-sw-lora-strength"));
strengthInProject.value = "1.15";
strengthInProject.oninput();
assert.equal(e.p.segments[0].source.swap_lora_strength, 1.15, "existing project strength changes");
const guardLabel = find(panel, (x) => x.className.includes("h3l-sw-mask-guard"));
assert(guardLabel, "The mask identity guard must be editable inside the existing Swap project");
const guardInput = find(guardLabel, (x) => x.tag === "input" && x.attrs.type === "checkbox");
guardInput.onchange({ target: { checked: true } });
assert.equal(e.p.segments[0].source.swap_mask.guard, true, "Enable the guard for this clip");
guardInput.onchange({ target: { checked: false } });
assert.equal("guard" in e.p.segments[0].source.swap_mask, false, "Disabling restores the old cache behavior");
find(panel, (x) => x.tag === "button" && x.children.includes("Перегенерировать отрезок")).onclick();
assert.equal(regenerated, 0, "inspector regeneration targets selected segment");
console.log("Swap LoRA picker: wizard and project selection, strength, regeneration PASS");
