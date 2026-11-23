import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as C from "../web/js/h3s_core.js";
import { installSwapAccess } from "../web/js/h3s_swap_access.js";

let injectedStyle = null;
const vars = new Map();
globalThis.document = {
  documentElement: {
    dataset: {},
    style: { setProperty: (k, v) => vars.set(k, v) },
  },
  getElementById: (id) => id === "h3l-v6-style" ? injectedStyle : null,
  createElement: (tag) => ({ tag }),
  head: { appendChild: (el) => { injectedStyle = el; } },
};
const h = (tag, attrs, ...children) => ({
  tag, attrs, children,
  remove() { this.removed = true; },
});
class TestEditor {}
installSwapAccess(TestEditor, { C, h, ICON: { upload: "<svg/>", spark: "<svg/>" } });
const e = new TestEditor();
const currentProject = { id: "existing", segments: [{ id: "one", prompt: "Keep this" }] };
e.p = currentProject;
e.$ = {};
const hosts = [];
e.root = { append: (host) => hosts.push(host) };
e.tool = "assets";
let railRefresh = 0, contentRefresh = 0;
e.renderTools = () => { railRefresh++; };
e.renderLeft = () => {};
e.renderSwap = () => { contentRefresh++; };

e.openSwapWorkspace();
assert.equal(e.tool, "swap");
assert.equal(e.page, "swap");
assert.equal(hosts.length, 1);
assert(e.$.pSwap && e.$.swapHost, "Swap panel must be mounted");
assert.equal(contentRefresh, 1);
assert.equal(e.p, currentProject, "opening Swap must not replace the montage");
assert("v6" in document.documentElement.dataset, "Swap styles must be active");
assert(injectedStyle?.textContent?.includes(".v6-swap"), "real Swap stylesheet is installed");
e.openSwapWorkspace();
assert.equal(hosts.length, 1, "repeat click must reuse one panel");
assert.equal(railRefresh, 2);

const oldHost = e.$.swapHost;
e.setPage("edit");
assert(oldHost.removed, "return to montage unmounts the Swap screen");
assert.equal(e.tool, "assets");
assert.equal(e.$.pSwap, null);
assert(!("v6" in document.documentElement.dataset));
assert.equal(e.p, currentProject);
e.setPage("swap");
assert.equal(e.tool, "swap");
e.closeSwapWorkspace();
assert.equal(e.tool, "assets");
const faceMount = { remove() { this.removed = true; } };
e.$.faceMount = faceMount;
e._faceV6WasEnabled = false;
document.documentElement.dataset.v6 = "";
e.closeFaceMount();
assert(faceMount.removed, "face refinement removes only its temporary modal host");
assert(!("v6" in document.documentElement.dataset));

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../web/js/h3s_editor.js"), "utf8");
assert.match(src, /tool\("swap", ICON\.swap, T\("Замена"\)\)/, "permanent rail action in modern workspace");
assert.match(src, /if \(id === "swap"\) return this\.openSwapWorkspace\(\)/);
assert.match(src, /this\.\$\?\.faceMount/, "modern Escape key is scoped to the face-refine modal");
const quick = readFileSync(join(dir, "../web/js/h3s_workspace.js"), "utf8");
assert.match(quick, /openSwapFaceRefine\(i\)/, "ready Swap clips expose face refinement");
const face = readFileSync(join(dir, "../web/js/v6/face.js"), "utf8");
assert.match(face, /this\.\$\.faceMount \|\| this\.root/, "classic face-refine modal uses a modern scoped host when present");
console.log("Modern Swap rail and return to montage: PASS");
