import * as C from "../web/js/h3s_core.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function project(mode) {
  return C.normalizeProject({
    id: "js_hires_advanced",
    settings: {
      res_mode: "custom", width: 96, height: 64,
      final_mode: "refine", quality: "final",
      refine_sigma: 0.3, refine_schedule_mode: mode, refine_denoise: 0.3,
    },
    segments: [{ id: "s1", frames: 39, prompt: "Inscription on a wall" }],
  });
}
const original = project("sigma");
const advanced = project("basic");
assert.equal(C.passParams(original, 0, "refine").schedule_mode, "sigma");
assert.equal(C.passParams(advanced, 0, "refine").schedule_mode, "basic");
assert.equal(C.passParams(advanced, 0, "refine").schedule_denoise, 0.3);
assert.notDeepEqual(C.segmentSigs(original, "refine"), C.segmentSigs(advanced, "refine"));
const identity = C.normalizeProject({ ...advanced, settings: { ...advanced.settings, refine_identity_images: true } });
assert.equal(advanced.settings.refine_identity_images, false);
assert.equal(identity.settings.refine_identity_images, true);
assert.notDeepEqual(C.segmentSigs(identity, "refine"), C.segmentSigs(advanced, "refine"));
const bad = project("unsupported");
assert.equal(bad.settings.refine_schedule_mode, "sigma");
const settingsSource = readFileSync(new URL("../web/js/h3s_settings.js", import.meta.url), "utf8");
assert.doesNotMatch(settingsSource, /\["hires_advanced", T\("Независимые 2 прохода"\)/);
assert.match(settingsSource, /\["gen", T\("Генерация"\), \[genPresets, stages, st1, two \? st2/);
assert.match(settingsSource, /pill\(displayedGenMode === "advanced", T\("Независимые 2 прохода"\)/);
assert.match(settingsSource, /T\("★ Рекомендуемые параметры"\)/);
assert.match(settingsSource, /onclick: \(\) => this\.applyHiResWinner\(1\)/);
assert.match(settingsSource, /this\._setTab = id; this\._setOpen = null; this\.renderLeft\(\)/);
assert.match(settingsSource, /this\.chooseGenerationMode\("advanced"\)/);
assert.match(settingsSource, /this\.refreshGenerationPresetPanel\(\)/);
const prefsSource = readFileSync(new URL("../web/js/v6/prefs.js", import.meta.url), "utf8");
assert.doesNotMatch(prefsSource, /\["hires", I\.neighbors, T\("Независимые 2 прохода"\)\]/);
assert.match(prefsSource, /if \(id === "hires"\) id = "generation"/);
console.log("Unified generation panel, independent HiRes controls and removed duplicate tabs: PASS");
