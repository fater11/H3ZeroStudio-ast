import assert from "node:assert/strict";
import * as C from "../web/js/h3s_core.js";
import { installVideo } from "../web/js/h3s_video.js";

class FakeEditor {
  constructor(project) { this.p = C.normalizeProject(project); this.run = { active: false }; this.root = null; this.messages = []; }
  seg(i) { return this.p.segments[i]; }
  items() { return C.plan(this.p); }
  mutate(fn) { fn(this.p); this.p = C.normalizeProject(this.p); }
  toast(message) { this.messages.push(message); }
}
installVideo(FakeEditor, { C, h: () => ({}), ICON: {} });
globalThis.confirm = () => true;

const base = () => ({
  id: "test-swap-autosplit",
  settings: { overlap_blocks: 2 },
  assets: [{ id: "source", category: "video", file: "source.mp4", frames: 273, duration: 273 / 24 }],
  segments: [
    { id: "first", frames: 141, link: "cut", prompt: "keep face",
      source: { asset: "source", in: 0, swap: true, swap_lora: "test.safetensors", swap_mask: { model: "sam3.1", at: 0, point: [.5, .5] } } },
    { id: "second", frames: 175, link: "extend", prompt: "keep face",
      source: { asset: "source", in: 226, swap: true, swap_lora: "test.safetensors", swap_mask: { model: "sam3.1", at: 0, point: [.5, .5] } } }
  ]
});

const editor = new FakeEditor(base());
assert.deepEqual(C.swapSourceOverruns(editor.p).map((issue) => issue.missing), [128],
  "second Swap clip must warn about 128 held frames");
const originalFirst = JSON.stringify(editor.seg(0));
editor.autoSplitSwap(1);
assert.equal(C.swapSourceOverruns(editor.p).length, 0);
assert.equal(editor.p.segments.length, 2);
assert.equal(JSON.stringify(editor.seg(0)), originalFirst, "the first ready segment must not change");
assert.equal(editor.seg(1).id, "second", "keep existing segment ID and editing settings");
assert.equal(editor.seg(1).frames, 175);
assert.equal(editor.seg(1).source.in, 98, "cover the complete 273-frame guide without repeating EOF");
assert.equal(editor.seg(1).source.in + editor.seg(1).frames, 273);
assert.equal(C.plan(editor.p)[1].overlap, 39);
assert.equal(editor.seg(1).source.swap_mask.model, "sam3.1");

const aligned = new FakeEditor(base());
assert.deepEqual(aligned.swapSyncPlan(1), { available: 273, visible: 175, at: 98, current: 226, synced: false });
assert.equal(aligned.syncSwapSource(1), true, "Sync applies the expected source correction");
assert.equal(aligned.seg(1).source.in, 98);
assert.equal(JSON.stringify(aligned.seg(0)), originalFirst);
assert.equal(aligned.swapSyncPlan(1).synced, true, "UI can now report that alignment is already correct");
assert.equal(aligned.syncSwapSource(1), false, "Repeat click is an explicit no-op, never changes the first ready clip");
assert(aligned.messages.at(-1).includes("уже синхронизирован"), "Repeat click explains why nothing changed");

const fromFirst = new FakeEditor(base());
assert.deepEqual(fromFirst.swapSyncChain(0).pending.map((x) => x.i), [1],
  "Clicking sync on an already-aligned first clip must detect the broken next clip");
assert.equal(fromFirst.syncSwapSource(0), true, "Sync from the first clip repairs the whole chain");
assert.equal(fromFirst.seg(1).source.in, 98);
const withReady = new FakeEditor(base());
withReady.seg(1).result = { video: { filename: "old-take.mp4" } };
globalThis.confirm = () => false;
assert.equal(withReady.syncSwapSource(0), false, "Do not invalidate a ready result without confirmation");
assert.equal(withReady.seg(1).source.in, 226);
globalThis.confirm = () => true;
assert.equal(withReady.syncSwapSource(0), true);
assert.equal(withReady.seg(1).result.video.filename, "old-take.mp4", "Keep ready take files even when source is corrected");

const impossible = base();
impossible.assets[0].frames = 100;
const short = new FakeEditor(impossible);
assert.equal(short.swapSyncPlan(1).at, null, "Clip longer than guide has no valid start");
assert.equal(short.syncSwapSource(1), false, "Do not move a clip to an impossible source span");

// A fixed end marker hides the sampler's unused tail: do not replay 38 earlier frames.
const marked = base();
marked.end = 273;
marked.segments[0].frames = 158;
marked.segments[1].frames = 192;
const visibleEnd = new FakeEditor(marked);
assert.equal(C.plan(visibleEnd.p)[1].start, 119);
assert.deepEqual(visibleEnd.swapSyncPlan(1), { available: 273, visible: 154, at: 119, current: 226, synced: false });
assert.equal(visibleEnd.syncSwapSource(0), true);
assert.equal(visibleEnd.seg(1).source.in, 119, "Sync matches actual timeline time instead of padding beyond the end marker");
assert.equal(C.swapSourceOverruns(visibleEnd.p).length, 0, "Visible source frames finish exactly at source EOF");

const longer = base();
longer.assets[0].frames = 720;
longer.assets[0].duration = 30;
longer.segments = [longer.segments[0]];
const auto = new FakeEditor(longer);
auto.autoSplitSwap(0);
assert(auto.p.segments.length >= 4, "longer guide should create several Swap clips");
for (const s of auto.p.segments) {
  assert(s.source.in >= 0);
  assert(s.source.in + s.frames <= 720, "never hold the last input frame");
  assert.equal(s.source.swap_mask.model, "sam3.1");
}
assert.equal(auto.p.segments.at(-1).source.in + auto.p.segments.at(-1).frames, 720);
console.log("Swap sync and auto-split: PASS");
