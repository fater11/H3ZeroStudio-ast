import assert from "node:assert/strict";
import { installSettings } from "../web/js/h3s_settings.js";

class Editor {}
installSettings(Editor, { C: { GLOBAL_KEYS: [] }, h: () => ({}), ICON: {} });
const e = new Editor();
const messages = [];
const saved = [];
e.toast = (message, error = false) => messages.push({ message, error });
e.p = {
  id: "test-project",
  segments: [],
  settings: {
    settings_scope: "global", model_preset: "keep-model", loras: ["keep-lora"],
    aspect: "9:16", megapixels: 0.5, final_mode: "full",
    steps: 8, cfg: 1, sampler: "euler", scheduler: "beta57",
    draft_steps: 8, draft_sampler: "euler", refine_steps: 3,
    accel: { attention: "kitchen", veda: false },
  },
};
e.mutate = (fn) => fn(e.p);
e.host = {
  get: async () => ({ presets: saved }),
  call: async (_url, { action, id, name, settings }) => {
    const i = saved.findIndex((p) => p.id === id);
    if (action === "save") {
      const item = { id: id || "preset-a", name, settings };
      if (i >= 0) saved[i] = item; else saved.push(item);
      return { presets: [...saved], id: item.id };
    }
    if (action === "rename" && i >= 0) saved[i].name = name;
    if (action === "delete" && i >= 0) saved.splice(i, 1);
    return { presets: [...saved], id };
  },
};
const snap = e.generationPresetSnapshot();
assert.equal(snap.steps, 8);
assert.deepEqual(snap.accel, { attention: "kitchen", veda: false });
assert(!("model_preset" in snap), "A generation preset must not modify the user's model");
assert(!("loras" in snap), "LoRA configuration is independent");
await e.loadGenerationPresets();
await e.changeGenerationPreset("save", "", "Euler 8");
assert.equal(saved.length, 1);
assert.equal(saved[0].name, "Euler 8");
e.p.settings.steps = 24;
e.p.settings.model_preset = "different-model";
e.applySavedGenerationPreset("preset-a");
assert.equal(e.p.settings.steps, 8);
assert.equal(e.p.settings.model_preset, "different-model");
assert.equal(e.p.settings.settings_scope, "project", "Preset applies only to current project");
await e.changeGenerationPreset("rename", "preset-a", "Euler 8 v2");
assert.equal(saved[0].name, "Euler 8 v2");
await e.changeGenerationPreset("delete", "preset-a");
assert.equal(saved.length, 0);
e.chooseGenerationMode("advanced");
assert.equal(e.pendingGenerationMode(), "advanced");
assert.equal(e.p.settings.final_mode, "full", "Choosing a mode must not change settings before Apply");
e.applyGenerationMode();
assert.equal(e.p.settings.final_mode, "refine");
assert.equal(e.p.settings.refine_schedule_mode, "basic");
assert.equal(e.pendingGenerationMode(), null);
assert.equal(e.p.settings.settings_scope, "project");
for (const [mode, expected, t] of [["pi2", 2, 0.930], ["pi4", 4, 0.960]]) {
  e.chooseGenerationMode(mode);
  assert.equal(e.pendingGenerationMode(), mode);
  e.applyGenerationMode();
  assert.equal(e.p.settings.final_mode, "full");
  assert.equal(e.p.settings.piflow_steps, expected);
  assert.equal(e.p.settings.steps, expected);
  assert.equal(e.p.settings.cfg, 1);
  assert.equal(e.p.settings.sampler, "euler");
  assert.equal(e.p.settings.scheduler, "simple");
  assert.equal(e.p.settings.model_preset, "different-model", "pi-H3 must never change the model silently");
  assert.equal(t, expected === 2 ? 0.930 : 0.960);
}
const pipreset = e.generationPresetSnapshot();
assert.equal(pipreset.piflow_steps, 4);
e.chooseGenerationMode("full");
e.applyGenerationMode();
assert.equal(e.p.settings.piflow_steps, 0, "Normal one-stage rendering disables the DWD adapter");
assert(messages.every((m) => !m.error), "All preset actions should succeed");
console.log("Generation presets, pi-H3 mode confirmation and scope: PASS");
