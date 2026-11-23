import assert from "node:assert/strict";
import { swapCompareEntries } from "../web/js/h3s_gallery.js";

const guide = { id: "guide", category: "video", file: "source.mp4",
  subfolder: "in", type: "input", width: 1080, height: 1920, frames: 273 };
const result = { filename: "render.mp4", subfolder: "out", type: "output" };
const p = { id: "swap-project", assets: [guide], segments: [
  { id: "s1", frames: 124, source: { swap: true, asset: "guide", in: 120 },
    result: { frames: 124, video: result } },
  { id: "s2", frames: 39, source: { swap: true, asset: "guide", in: 260 },
    result: { frames: 39, video: result } },
] };
const pair = swapCompareEntries(p, 0);
assert.equal(pair.length, 2);
assert.equal(pair[0].video.filename, "source.mp4");
assert.equal(pair[1].video.filename, "render.mp4");
assert.equal(pair[0].clipStartSec, 5);
assert.equal(pair[1].clipStartSec, 0);
assert.equal(pair[0].clipDurationSec, 124 / 24);
assert.equal(pair[1].clipDurationSec, 124 / 24);
assert.equal(pair[0].label, "Исходник");

const tail = swapCompareEntries(p, 1);
assert.equal(tail[0].frames, 13, "must not include source frames beyond end of file");
assert.equal(tail[0].clipDurationSec, 13 / 24);
assert.equal(tail[1].clipDurationSec, 13 / 24);

assert.equal(swapCompareEntries({ ...p, segments: [{ source: { swap: false }, result: { video: result } }] }, 0), null);
assert.equal(swapCompareEntries({ ...p, segments: [{ source: { swap: true, asset: "guide" } }] }, 0), null);
console.log("Swap source/result aligned clip compare: PASS");
