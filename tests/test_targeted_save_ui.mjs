import assert from "node:assert/strict";
import * as C from "../web/js/h3s_core.js";
import { H3Editor } from "../web/js/h3s_editor.js";

const p = C.normalizeProject({
  id: "targeted_ui",
  settings: { seed: 123, cache: true },
  segments: [
    { id: "s1", frames: 39, prompt: "One" },
    { id: "s2", frames: 39, prompt: "Two", link: "extend" },
    { id: "s3", frames: 39, prompt: "Three", link: "extend" },
  ],
});
const editor = Object.create(H3Editor.prototype);
editor.p = p;
editor.run = { active: false };
editor.seg = (i) => editor.p.segments[i];
editor.items = () => C.plan(editor.p);
editor.genCount = () => editor.p.segments.length;
editor.isStale = () => true;
editor.toast = () => {};
const requests = [];
editor.generate = (opts) => { requests.push(opts); return Promise.resolve(); };
editor.regenerate = H3Editor.prototype.regenerate;
editor.mutate = (fn) => fn(editor.p);

assert.equal(editor.segGenState(2).ok, true,
  "Missing continuation predecessors must not disable Generate for clip 3");
editor.genSegment(2);
assert.deepEqual(requests.shift(), { upto: 2, only: 2 });
assert.equal(editor.segGenState(1).ok, true);

// Progress "done" and onExecuted carry the same completed movie. The selected
// folder export must run once regardless of which arrives first.
let exported = 0;
const full = { video: { filename: "assembled.mp4", type: "output" } };
editor._pendingVideoSave = {
  stage: "assemble", upto: -1,
  finish: (result) => { assert.deepEqual(result, full); exported++; },
  fail: (error) => { throw error; },
};
editor.continuePendingVideoSave({ operation: "assemble", full });
editor.continuePendingVideoSave({ operation: "assemble", full });
await Promise.resolve();
assert.equal(exported, 1, "Duplicate completion must export only once");

let assemblies = 0;
editor._pendingVideoSave = {
  stage: "colour", upto: 1,
  finish: (result) => { assert.deepEqual(result, full); exported++; },
  fail: (error) => { throw error; },
};
editor.generate = (opts) => {
  assert.deepEqual(opts, { operation: "assemble", upto: 1 });
  assemblies++;
  return Promise.resolve();
};
editor.continuePendingVideoSave({ operation: "colour" });
editor.continuePendingVideoSave({ operation: "colour" });
await Promise.resolve();
assert.equal(assemblies, 1, "Lab colour must queue exactly one assembly");
editor.continuePendingVideoSave({ operation: "assemble", full });
await Promise.resolve();
assert.equal(exported, 2, "Colour + assembly must still trigger selected-folder export");

console.log("Targeted clip chain and Save Video completion fallback: PASS");

const settings = Object.create(H3Editor.prototype);
settings.p = C.normalizeProject({
  id: "confirm_mode", settings: { final_mode: "full", refine_schedule_mode: "basic", refine_identity_images: true },
  segments: [{ id: "s1", frames: 39, prompt: "A" }],
});
settings._setTab = "gen";
settings.root = null;
settings.toast = () => {};
settings.setOnce = (key, value) => { settings.p.settings[key] = value; };
settings.mutate = (fn) => { fn(settings.p); settings.p = C.normalizeProject(settings.p); };
settings.chooseGenerationMode("luna");
assert.equal(settings.p.settings.final_mode, "full",
  "Clicking a generation-mode pill must not modify the project");
assert.equal(settings.pendingGenerationMode(), "luna");
settings.cancelGenerationMode();
assert.equal(settings.pendingGenerationMode(), null);
assert.equal(settings.p.settings.final_mode, "full");
settings.chooseGenerationMode("luna");
settings.applyGenerationMode();
assert.equal(settings.p.settings.final_mode, "luna");
settings.chooseGenerationMode("two");
assert.equal(settings.p.settings.final_mode, "luna",
  "Stock selection must remain unapplied until confirmed");
settings.applyGenerationMode();
assert.equal(settings.p.settings.final_mode, "refine");
assert.equal(settings.p.settings.refine_schedule_mode, "basic", "Two-pass mode preserves the selected schedule");
assert.equal(settings.p.settings.refine_identity_images, false);
assert.equal(settings.p.settings.settings_scope, "project");
console.log("Generation mode requires explicit Apply: PASS");

let removedModal = false;
const saveEditor = Object.create(H3Editor.prototype);
const requestedExport = { stage: "assemble", stream: true };
saveEditor._pendingVideoSave = requestedExport;
saveEditor.$ = { saveModal: { remove: () => { removedModal = true; } } };
saveEditor.focusSink = () => {};
saveEditor.closeSaveDialog();
assert.equal(removedModal, true);
assert.equal(saveEditor.$.saveModal, null);
assert.equal(saveEditor._pendingVideoSave, requestedExport,
  "Closing Save Video must not cancel an already requested export");
console.log("Closing Save Video preserves pending export: PASS");
