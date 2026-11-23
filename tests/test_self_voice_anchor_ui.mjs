import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../web/js/h3s_core.js";

function project(enabled, final_mode = "luna") {
  return C.normalizeProject({ settings: { self_anchor_voice: enabled, final_mode, res_mode: "custom", width: 96, height: 64, steps: 8 },
    segments: [{ id: "a", frames: 124, prompt: "First voice" }, { id: "b", frames: 124, link: "extend", prompt: "Next line" }] });
}
const off = project(false);
const on = project(true);
assert.equal(C.DEFAULT_SETTINGS.self_anchor_voice, false);
assert.equal(project("yes").settings.self_anchor_voice, false);
assert.equal(on.settings.self_anchor_voice, true);
assert.equal(C.GLOBAL_KEYS.includes("self_anchor_voice"), true);
const a = C.baseSigs(off, "full");
const b = C.baseSigs(on, "full");
assert.equal(a[0], b[0]);
assert.notEqual(a[1], b[1]);
assert.deepEqual(C.baseSigs(off, "draft"), C.baseSigs(on, "draft"));
const settings = readFileSync(new URL("../web/js/h3s_settings.js", import.meta.url), "utf8");
assert.match(settings, /T\("Эксперимент · закрепить ОДИН голос"\)/);
assert.match(settings, /set\("self_anchor_voice", v\)/);
console.log("Experimental self-voice opt-in, cache and defaults: PASS");
