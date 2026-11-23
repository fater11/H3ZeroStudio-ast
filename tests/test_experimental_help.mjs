import assert from "node:assert/strict";
import { HELP_RU } from "../web/js/h3s_help_ru.js";
import { HELP_EN } from "../web/js/h3s_help_en.js";

const ids = (sections) => sections.map(([id]) => id);
assert.deepEqual(ids(HELP_RU), ids(HELP_EN), "Russian and English help need identical chapters");
assert.equal(new Set(ids(HELP_RU)).size, HELP_RU.length, "chapter ids must be unique");

for (const sections of [HELP_RU, HELP_EN]) {
  const chapter = Object.fromEntries(sections.map(([id, , body]) => [id, body]));
  for (const id of ["stages", "seed_hunter", "self_voice", "visual_drift", "vice_theme"]) {
    assert.ok(chapter[id], id + " missing");
    assert.match(chapter[id], /🧪/, id + " must be marked experimental");
  }
  assert.match(chapter.stages, /Low Res.*High Res/s);
  assert.match(chapter.stages, /4 Low \+ 4 High/);
  assert.match(chapter.stages, /8\+3/);
  assert.match(chapter.seed_hunter, /S\+1000/);
  assert.match(chapter.seed_hunter, /S\+2000/);
  assert.match(chapter.self_voice, /&lt;Audio 1&gt;/);
  assert.match(chapter.self_voice, /15/);
  assert.match(chapter.self_voice, /REF2VA/);
  assert.match(chapter.visual_drift, /<b>/);
  assert.match(chapter.vice_theme, /GTA VI/);
}
console.log("Experimental help: 36 aligned RU/EN chapters, semantics and labels: PASS");
