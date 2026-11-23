import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { driftDisplay } from "../web/js/v6/drift.js";

const sample = {
  baseline_segment: 0,
  signature: { luma: 0.45, contrast: 0.11, detail: 0.03, rgb: [0.4, 0.5, 0.5] },
  relative: { luma_delta: -0.037, contrast_ratio: 0.914, detail_ratio: 1.112 },
};
const current = driftDisplay(sample, 2);
assert.equal(current.baselineIndex, 0);
assert.equal(current.isBaseline, false);
assert.deepEqual(current.stats, [
  { key: "luma", value: "-3.7 п.п." },
  { key: "contrast", value: "×0.91" },
  { key: "detail", value: "×1.11" },
]);
const baseline = driftDisplay({ ...sample, relative: null }, 0);
assert.equal(baseline.isBaseline, true);
assert.deepEqual(baseline.stats, []);
assert.equal(driftDisplay(null, 2), null);
assert.equal(driftDisplay({ ...sample, baseline_segment: 5 }, 2), null);
assert.equal(driftDisplay({ ...sample, relative: { luma_delta: NaN, contrast_ratio: Infinity, detail_ratio: -1 } }, 1).stats.length, 0);

const inspector = readFileSync(new URL("../web/js/v6/insp.js", import.meta.url), "utf8");
assert.match(inspector, /driftDisplay\(s\.result\?\.drift, i\)/);
assert.match(inspector, /T\("Изменение изображения"\)/);
assert.match(inspector, /T\("Это описание изображения, а не оценка качества/);
console.log("Read-only visual drift inspector: PASS");
