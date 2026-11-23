import * as C from "../web/js/h3s_core.js";
import { installTakes } from "../web/js/h3s_takes.js";
import assert from "node:assert/strict";

const project = (opts = {}, ov = {}) => C.normalizeProject({
  id: "seed_hunter_test",
  settings: { final_mode: "refine", quality: "final", seed: 100, ...opts },
  segments: [{ id: "s1", frames: 39, prompt: "Face and inscription", overrides: ov }],
});
const a = project(), b = project({ refine_seed: 222 }), c = project({ refine_seed: 222 }, { refine_seed: 333 });
assert.equal(C.passParams(a, 0, "refine").seed, 100);
assert.equal(C.passParams(b, 0, "refine").seed, 222);
assert.equal(C.passParams(c, 0, "refine").seed, 333);
assert.deepEqual(C.segmentSigs(a, "draft"), C.segmentSigs(b, "draft"));
assert.notDeepEqual(C.segmentSigs(a, "refine"), C.segmentSigs(b, "refine"));
assert.deepEqual(C.segmentSigs(b, "draft"), C.segmentSigs(c, "draft"));
assert.notDeepEqual(C.segmentSigs(b, "refine"), C.segmentSigs(c, "refine"));

class Editor {
  constructor() { this.p = project(); this.run = { active: false }; this.calls = []; this.root = null; }
  segGenState() { return { ok: true }; }
  seg(i) { return this.p.segments[i]; }
  mutate(action) { action(this.p); this.p = C.normalizeProject(this.p); }
  generate(o) { this.calls.push({ seed: this.p.segments[0].overrides.seed, ...o }); this.run.active = true; }
  toast() {}
}
installTakes(Editor, { C, h: () => null, ICON: {} });
// The real editor supplies timeline dependencies; this unit harness targets only the queue.
Editor.prototype.segGenState = () => ({ ok: true });
const ed = new Editor();
ed.seedHunterStart(0);
assert.equal(ed.calls.length, 1);
assert.deepEqual(ed.calls[0], { seed: 100, only: 0, kind: "draft" });
assert.equal(ed._seedHunter.next, 1);
ed.run.active = false; ed._seedHunter.completed++; ed.seedHunterNext();
assert.equal(ed.calls.length, 2);
assert.equal(ed.calls[1].seed, 1100);
ed.run.active = false; ed._seedHunter.completed++; ed.seedHunterNext();
assert.equal(ed.calls.length, 3);
assert.equal(ed.calls[2].seed, 2100);
ed.run.active = false; ed._seedHunter.completed++; ed.seedHunterNext();
assert.equal(ed._seedHunter, null);
assert.equal(ed.calls.length, 3);
const ed2 = new Editor();
ed2.seedHunterStart(0); ed2.seedHunterCancel(); ed2.run.active = false; ed2.seedHunterNext();
assert.equal(ed2.calls.length, 1);
console.log("Seed Hunter and independent refine seeds: PASS");
