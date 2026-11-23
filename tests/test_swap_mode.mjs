import assert from "node:assert/strict";
import * as C from "../web/js/h3s_core.js";
import { installSwap, makeSwapPrompt, planSwapChunks, DEFAULT_PHOTO_APPEARANCE, installedSwapLora } from "../web/js/v6/swap.js";

for (const length of [22, 124, 226, 273, 400, 720, 897, 3600]) {
  for (const overlap of [0, 39]) {
    const chunks = planSwapChunks(length, 226, overlap);
    assert(chunks.length > 0);
    assert.equal(chunks.reduce((n, x) => n + x.sourceFrames, 0), length);
    let covered = 0;
    for (const c of chunks) {
      assert(c.at >= 0 && c.at <= covered, "guide ranges must not have gaps");
      assert(c.frames >= 22 && c.frames <= 226);
      assert.equal((c.frames - 5) % 17, 0);
      assert(c.at + c.frames <= length, "no Swap segment may hold the last source frame");
      assert(c.frames >= c.sourceFrames);
      covered = Math.max(covered, c.at + c.frames);
    }
    assert.equal(covered, length, "all input frames must be covered");
  }
}
// Probe awkward durations (including 1-16 frame remainders) across all UI clip sizes.
for (let length = 22; length <= 1200; length += 7) {
  for (const cap of [124, 226, 345]) {
    for (const overlap of [0, 22, 39]) {
      let chunks;
      try { chunks = planSwapChunks(length, cap, overlap); }
      catch (e) { throw Error(`split failed length=${length} cap=${cap} overlap=${overlap}: ${e.message}`); }
      let covered = 0;
      for (const [index, part] of chunks.entries()) {
        assert(part.at >= 0 && part.at <= covered, "no source-frame gap");
        const padding = part.at + part.frames - length;
        assert(padding <= 0 || (index === chunks.length - 1 && padding <= 16),
          `visible EOF hold: length=${length} cap=${cap} overlap=${overlap} clip=${JSON.stringify(part)}`);
        covered = Math.max(covered, Math.min(length, part.at + part.frames));
      }
      assert.equal(covered, length, "complete guide coverage");
    }
  }
}
const prompt = makeSwapPrompt("Female, brown hair, black jacket", "the woman on the left");
assert.match(prompt, /^body_swap:/);
assert.match(prompt, /<Picture 1>/);
assert.match(prompt, /the woman on the left/);
assert(!prompt.includes("{details}"));
assert.match(makeSwapPrompt("", ""), /Preserve the complete visible appearance/);
assert.match(makeSwapPrompt(DEFAULT_PHOTO_APPEARANCE, ""), /Do not invent, beautify/);
assert.equal(installedSwapLora(["minimax\\minimax_h3_character_swap_v1.1_ref2va_fro.safetensors"],
  "minimax/minimax_h3_character_swap_v1.1_ref2va_fro.safetensors"), "minimax\\minimax_h3_character_swap_v1.1_ref2va_fro.safetensors");

class TestEditor {}
const uiButtons = [];
installSwap(TestEditor, { C, h: () => null, I: {},
  btn: (args) => { uiButtons.push(args.label); return null; } });
const editor = new TestEditor();
editor.p = C.normalizeProject({
  id: "p_old", name: "Existing montage",
  assets: [
    { id: "video1", file: "guide.mp4", subfolder: "in", category: "video", name: "Guide", frames: 480, width: 1280, height: 720, has_audio: true },
    { id: "img1", file: "person.png", subfolder: "in", category: "other", name: "Character" },
    { id: "face1", file: "closeup.png", subfolder: "in", category: "character", name: "Close-up" },
  ],
  segments: [{ id: "s_old", frames: 124, prompt: "Old scene" }],
});
const old = editor.p;
const sw = editor.swapState();
const customSwapLora = "community\\swap\\custom_character_swap.safetensors";
Object.assign(sw, { video: "video1", image: "img1", details: "Female, brown hair, black jacket", subject: "the woman on the left", keepAudio: true, lora: customSwapLora, loraStrength: 1.25 });
editor.run = { active: false };
let refreshed = false;
editor.mpLoad = async (refresh) => { refreshed = refresh; return { files: { lora: [customSwapLora] }, ok: true }; };
const saved = [];
editor.projAutosave = async function () { saved.push({ id: this.p.id, prior: this._projSaved }); };
editor.loadProject = (p) => { editor.p = p; editor._projSaved = JSON.stringify(p); };
editor.setPage = () => {};
editor.renderAll = () => {};
editor.toast = (msg, err) => { if (err) throw Error(msg); };
await editor.swapBuild();
assert.equal(old.segments[0].prompt, "Old scene", "original project remains untouched");
assert.notEqual(editor.p.id, old.id);
assert.equal(saved.length, 2, "source project and independent swap project both autosaved");
assert.equal(saved[0].id, old.id);
assert.equal(saved[1].id, editor.p.id);
assert.equal(saved[1].prior, null, "first save must not skip the newly created project");
assert.equal(editor.p.settings.prompt, "", "old story prompt must not leak into character replacement");
assert.equal(editor.p.segments.length, 3);
assert.equal(editor.p.settings.final_mode, "full");
assert.equal(editor.p.settings.steps, 8);
assert.equal(editor.p.end, 480, "export should trim any guide padding to original duration");
assert.equal(editor.p.end_mode, "fixed");
assert(editor.p.segments.every((seg) => seg.source.swap && seg.source.keep_audio));
assert(editor.p.segments.every((seg) => seg.source.swap_lora === customSwapLora), "chosen nested LoRA path must survive normalization");
assert(editor.p.segments.every((seg) => seg.source.swap_lora_strength === 1.25), "chosen LoRA strength must survive project normalization");
assert.equal(refreshed, true, "installed LoRA list is refreshed before project creation");
assert.equal(editor.p.segments[0].link, "cut");
assert(editor.p.segments.slice(1).every((seg) => seg.link === "extend"));
assert(editor.p.segments.every((seg) => seg.source.in + seg.frames <= 480));
assert(editor.p.segments.every((seg, i) =>
  Math.abs(seg.source.in - C.plan(editor.p)[i].start) <= 16),
  "guide in-points should align with the stitched timeline");
assert(editor.p.segments.every((seg) => seg.refs.includes("img1")));
assert.equal(C.genMode(editor.p, editor.p.segments[0]), "swap");
const normal = C.normalizeProject({
  id: "p2", assets: old.assets, segments: [{ id: "s1", frames: 124, source: { asset: "video1", in: 0, denoise: 0.4 } }],
});
assert.equal(C.genMode(normal, normal.segments[0]), "v2v", "existing vid2vid must remain unchanged");
const defaultStrength = C.normalizeProject({ id: "default_strength", assets: old.assets,
  segments: [{ id: "s1", frames: 124, source: { asset: "video1", in: 0, denoise: 1, swap: true } }] });
assert.equal(defaultStrength.segments[0].source.swap_lora_strength, 1, "older swap projects retain original strength");
const sigA = C.baseSigs(editor.p)[0];
const changedStrength = structuredClone(editor.p);
changedStrength.segments[0].source.swap_lora_strength = 1.1;
assert.notEqual(C.baseSigs(changedStrength)[0], sigA, "changing LoRA strength invalidates the affected take");
const swapProject = editor.p;
sw.lora = "not-installed/unknown.safetensors";
await assert.rejects(editor.swapBuild(), /LoRA/, "missing LoRA should be rejected before project save");
assert.equal(editor.p, swapProject, "failed LoRA validation must not replace the current project");
assert.equal(saved.length, 2, "no additional project may be saved after failed validation");
editor.p = old;
sw.lora = customSwapLora;
sw.useFaceRef = true; sw.faceImage = "face1";
await editor.swapBuild();
assert.equal(saved.length, 4, "extra face ref creates one independent project");
assert(editor.p.segments.every((seg) => seg.refs.join(",") === "img1,face1"));
assert.match(editor.p.segments[0].prompt, /shown in <Picture 2>/, "body image label follows actual category order");
assert.match(editor.p.segments[0].prompt, /<Picture 1> is a close-up of the SAME person/, "face label follows actual category order");
assert.match(makeSwapPrompt("", "", { bodyPicture: "<Picture 2>", facePicture: "<Picture 1>" }), /face from <Picture 1>/);

console.log("Character Swap UI project + 17k+5 chunks: PASS");

editor.p = old;
sw.useFaceRef = false; sw.preserveBg = true;
sw.maskVideo = "video1"; sw.maskPoint = [0.31, 0.62]; sw.maskBox = [0.18, 0.21, 0.42, 0.56];
sw.maskPreview = { image: "validated", coverage: 0.15 };
let shotCalls = 0;
const personCalls = [], samCalls = [];
editor.renderSwap = () => {};
editor.page = "test";
editor.host = { call: async (endpoint, body) => {
  if (endpoint === "/h3lab/swap/shots") {
    shotCalls++;
    return { cuts: [60, 265], frames: 480 };
  }
  if (endpoint === "/h3lab/swap/mask-preview") {
    samCalls.push(body);
    return { frame: body.frame, image: "green-overlay", coverage: .28 };
  }
  assert.equal(endpoint, "/h3lab/swap/people");
  personCalls.push(body.frame);
  return { frame: body.frame, image: "shot", width: 512, height: 512, people: [
    { box: [.1, .1, .3, .5], score: .94 }
  ] };
} };
await editor.swapScanShots();
assert.deepEqual(sw.shotCuts, [60, 265]);
assert.equal(shotCalls, 1);
assert.deepEqual(personCalls, [60, 265], "detector must run automatically on each new shot");
assert.equal(sw.shotChecked, 2);
assert.equal(sw.shotFrame.frame, 60, "first detected shot appears without an extra click");
assert.deepEqual(sw.shotAnchors[60].box, [.1, .1, .3, .5]);
assert.equal(sw.shotAuto[265], true, "one confident person should be selected automatically");
editor.swapShotPanel();
assert(uiButtons.includes("Проверить выделение"),
  "each selected camera shot must expose its own SAM verification button");
// SAM verification must use the selected camera shot, not frame zero.
await editor.swapVerifyShotMask();
assert.equal(samCalls.length, 1);
assert.equal(samCalls[0].frame, 60);
assert.deepEqual(samCalls[0].point, sw.shotAnchors[60].point);
assert.deepEqual(samCalls[0].box, [.1, .1, .3, .5]);
assert.equal(sw.shotMaskPreview.image, "green-overlay");
assert.equal(sw.shotMaskVerified[60], .28);
// Refining by point removes the YOLO box that otherwise overrides manual clicks.
editor.swapShotPointMode();
assert.equal(sw.shotAnchors[60].box, undefined);
assert.equal(sw.shotMaskPreview, null);
assert.equal(sw.shotMaskVerified[60], undefined);
editor.swapSelectShotPerson(.21, .31);
assert.equal(sw.shotAnchors[60].box, undefined);
await editor.swapVerifyShotMask();
assert.equal(samCalls[1].frame, 60);
assert.equal(samCalls[1].box, null, "point mode must bypass bounding boxes");
editor.swapShotPointMode();
assert.deepEqual(sw.shotAnchors[60].box, [.1, .1, .3, .5]);
await editor.swapLoadShot(265);
assert.equal(sw.shotMaskPreview, null, "a different shot cannot show the previous SAM overlay");
// No automatic choice in crowds, or when a lone candidate has poor confidence.
delete sw.shotAnchors[265];
delete sw.shotAuto[265];
editor.swapUseDetectedShot(265, { people: [{ box: [.1, .1, .3, .5], score: .2 }] });
assert.equal(sw.shotAnchors[265], undefined);
editor.swapUseDetectedShot(265, { people: [
  { box: [.1, .1, .3, .5], score: .9 },
  { box: [.6, .1, .2, .5], score: .8 }
] });
assert.equal(sw.shotCounts[265], 2);
assert.equal(sw.shotAnchors[265], undefined, "crowded shot needs explicit user selection");
await assert.rejects(editor.swapBuild(), /несколько людей/, "crowd must not silently swap a bystander");
// The user can override auto-selection with a precise point or a different person.
sw.shotAnchors[60] = { point: [.2, .4], box: [.1, .1, .3, .5] };
sw.shotAnchors[265] = { point: [.7, .6] };
delete sw.shotAuto[60];
delete sw.shotAuto[265];
await editor.swapBuild();
assert.equal(shotCalls, 1, "building project reuses existing shot scan");
assert(editor.p.segments.every((seg) => seg.source.swap_mask?.model === "sam3.1"));
assert(editor.p.segments.every((seg) => seg.source.swap_mask.shots.length === 2),
  "same new-shot identity anchors are persisted on every chunk");
assert.deepEqual(editor.p.segments[2].source.swap_mask.shots[0],
  { frame: 60, point: [.2, .4], box: [.1, .1, .3, .5] });
const alteredAnchor = structuredClone(editor.p);
alteredAnchor.segments[0].source.swap_mask.shots[0].point = [.3, .4];
assert.notEqual(C.baseSigs(alteredAnchor)[0], C.baseSigs(editor.p)[0],
  "changing a shot person selection must invalidate the mask and generated take");
assert(editor.p.segments.every((seg) => seg.source.swap_mask.at === 0));
assert(editor.p.segments.every((seg) => seg.source.swap_mask.point.join(",") === "0.31,0.62"));
const maskedSignature = C.baseSigs(editor.p)[0];
const withoutMask = structuredClone(editor.p);
delete withoutMask.segments[0].source.swap_mask;
assert.notEqual(C.baseSigs(withoutMask)[0], maskedSignature,
  "SAM masked and ordinary Swap takes must never share their cache key");
assert(editor.p.segments.every((seg) => !("guard" in seg.source.swap_mask)),
  "Opt-in jump protection must remain disabled for existing Swap projects");

editor.p = old; sw.maskGuard = true;
await editor.swapBuild();
assert(editor.p.segments.every((seg) => seg.source.swap_mask.guard === true),
  "All new Swap clips inherit the optional identity guard");
assert.notEqual(C.baseSigs(editor.p)[0], maskedSignature,
  "Changing mask identity guard must invalidate the affected take");

editor.p = old;
sw.maskBox = null; // YOLO may not detect a person, manual click must still be persisted.
await editor.swapBuild();
assert(editor.p.segments.every((seg) => seg.source.swap_mask?.point.join(",") === "0.31,0.62"));
assert(editor.p.segments.every((seg) => !("box" in seg.source.swap_mask)),
  "point-only SAM selection must survive JS project normalization");
