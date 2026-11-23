import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { installWorkspace, workspaceMode, WORKSPACE_KEY } from "../web/js/h3s_workspace.js";
import { H3Editor } from "../web/js/h3s_editor.js";

const storage = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
} });
class Editor {}
installWorkspace(Editor, { C: { estimate: () => ({ segments: 3, seconds: 12, width: 768, height: 1344 }), fmtTime: String, fmtDur: String }, h: () => ({}), ICON: {} });
const e = new Editor();
assert.equal(workspaceMode(), "classic", "Classic should be the safe default");
e.setWorkspaceMode("modern");
assert.equal(storage.get(WORKSPACE_KEY), "modern");
assert.equal(e.isModern(), true);
e.setWorkspaceMode("classic");
assert.equal(storage.get(WORKSPACE_KEY), "classic");
assert.equal(e.isModern(), false);
storage.set(WORKSPACE_KEY, "invalid");
assert.equal(workspaceMode(), "classic", "unknown preferences must fall back to Classic");

const classes = new Set();
const calls = [];
e.root = { classList: { toggle: (k, on) => on ? classes.add(k) : classes.delete(k) } };
for (const m of ["renderHeader", "renderTimeline", "renderModernQuick", "renderModernStatus", "layoutStage"]) e[m] = () => calls.push(m);
e.setWorkspaceMode("modern");
assert(classes.has("h3l-workspace-modern"));
assert.equal(calls.length, 5);
e.setWorkspaceMode("classic");
assert(!classes.has("h3l-workspace-modern"));

const routed = Object.create(Editor.prototype);
const routedCalls = [];
routed.root = {};
routed.host = { switchWorkspace: (mode) => { routedCalls.push(mode); return true; } };
assert.equal(routed.setWorkspaceMode("modern"), true, "Installed extension routes through the real editor factory");
assert.deepEqual(routedCalls, ["modern"]);
assert.equal(storage.get(WORKSPACE_KEY), "classic", "Only the host commits the switch after successful editor replacement");

e.p = { id: "p", segments: [
  { result: { video: { filename: "a.mp4" } } },
  { result: null },
  { result: { video: { filename: "stale.mp4" } } },
] };
e.run = { active: false };
e.$ = { tscroll: { scrollLeft: 0, clientWidth: 500 }, clips: [
  { offsetLeft: 0, offsetWidth: 100 },
  { offsetLeft: 200, offsetWidth: 100 },
  { offsetLeft: 700, offsetWidth: 100 },
] };
e.genCount = () => 3;
e.isStale = (i) => i === 2;
e.items = () => [ { start: 0, overlap: 0 }, { start: 100, overlap: 10 }, { start: 200, overlap: 10 } ];
e.sel = 0;
e.pvMode = "full";
e.renderInspector = () => {};
e.renderTimeline = () => {};
e.renderLeft = () => {};
e.renderPreview = () => {};
e.browseRunPreview = () => {};
e.modernNextUnfinished();
assert.equal(e.sel, 1, "go to next unfinished clip");
assert.equal(e.playhead, 110, "jump should honor overlap");
assert.equal(e.pvMode, "segment");

const here = dirname(fileURLToPath(import.meta.url));
const src = (path) => readFileSync(join(here, "..", path), "utf8");
const settings = src("web/js/h3s_settings.js"), editor = src("web/js/h3s_editor.js"), css = src("web/js/h3s_style.js"), menus = src("web/js/h3s_menus.js");
const studioEntry = src("web/js/h3labstudio.js"), v6Prefs = src("web/js/v6/prefs.js");
assert.match(v6Prefs, /workspaceMode\(\)/, "Actual Studio v6 Appearance has a workspace switcher");
assert.match(v6Prefs, /this\.setWorkspaceMode\(mode\)/, "Studio v6 switch triggers the shared operation");
assert.match(studioEntry, /switchWorkspace: \(mode\) => switchWorkspace\(node, mode\)/, "Host editor replacement is wired");
assert.match(studioEntry, /workspaceMode\(\) === "modern" \? H3Editor : Studio/, "New preference is honored when a node opens");
assert.match(settings, /\["appearance", T\("Внешний вид"\), \[\]\]/, "Appearance settings tab");
assert.match(settings, /setWorkspaceMode\(id\)/, "Live mode switch");
assert.match(editor, /this\.buildModernQuick\(\)/, "Modern clip actions below preview");
assert.match(editor, /this\.renderModernRibbon\(\)/, "Modern progress ribbon");
assert.match(css, /\.h3l-root\.h3l-workspace-modern/, "New-only layout rules");
assert.match(menus, /exportHistory/, "Export history");
assert.match(menus, /updateDestination/, "Destination preview");
const workspaceSource = src("web/js/h3s_workspace.js"), classicInspector = src("web/js/v6/insp.js");
assert.match(workspaceSource, /Предыдущий отрезок.*jumpSeg\(-1\)/, "Modern previous segment button");
assert.match(workspaceSource, /Следующий отрезок.*jumpSeg\(1\)/, "Modern next segment button");
assert.match(classicInspector, /Предыдущий отрезок.*jumpSeg\(-1\)/, "Classic inspector previous segment");
assert.match(classicInspector, /Следующий отрезок.*jumpSeg\(1\)/, "Classic inspector next segment");

// A running sampler must not steal the selection or cover an already finished take.
const running = Object.create(H3Editor.prototype);
running.root = {}; running.$ = { live: { isConnected: true } };
running.p = { segments: [
  { result: { video: { filename: "ready.mp4" } } },
  { result: null },
  { result: { video: { filename: "stale.mp4" } } },
] };
running.run = { active: true, seg: 1, queued: false };
running.sel = 1; running.pvMode = "full"; running.followRun = true;
running.playhead = 130;
running.isStale = (i) => i === 2;
running.items = () => [{ start: 0, overlap: 0 }, { start: 100, overlap: 10 }, { start: 200, overlap: 10 }];
running.seg = (i = running.sel) => running.p.segments[i];
const seen = [];
running.hideLive = () => { seen.push("hide"); running.$.live.isConnected = false; };
running.renderInspector = () => seen.push("inspector");
running.renderTimeline = () => seen.push("timeline");
running.renderPreview = () => seen.push("preview");
running.stopPlayback = () => seen.push("stop");
running.onLiveFrames = (d) => seen.push("live:" + d.seg);
running.applySegResult = (i) => seen.push("result:" + i);
running.updateRunUI = () => seen.push("progress");
running.host = { onChange: () => {} };
running.browseRunPreview(true);
assert.equal(running.followRun, false);
assert.equal(running.sel, 0, "Browse mode selects the most recent valid finished clip");
assert.equal(running.playhead, 0);
assert(seen.includes("hide"), "Classic live overlay is removed");
running.applyProgress({ event: "seg_preview", seg: 2, result: { video: { filename: "fresh.mp4" } } });
assert.equal(running.sel, 0, "Later segment completion cannot steal the selected ready clip");
assert.equal(running.followRun, false);
running.onLiveFrames = H3Editor.prototype.onLiveFrames;
running.onLiveFrames({ seg: 2, step: 1, steps: 4 });
assert.equal(running.lastLive.seg, 2, "Live frame is retained for an explicit return");
assert.equal(running.$.live.isConnected, false, "Live frame does not recreate the overlay in browse mode");
running.lastLive = { seg: 1, step: 2, steps: 4 };
running.onLiveFrames = (d) => seen.push("live:" + d.seg);
running.followRunPreview();
assert.equal(running.followRun, true);
assert.equal(running.sel, 1, "Returning to generation focuses the running clip");
assert(seen.includes("live:1"), "Live preview resumes explicitly");
assert.match(src("web/js/v6/studio.js"), /Смотреть готовые/);
assert.match(src("web/js/h3s_editor.js"), /Смотреть готовые/);
console.log("Workspace modes: classic/modern, live preview browsing, navigation and export UX: PASS");
