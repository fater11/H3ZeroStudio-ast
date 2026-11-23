import assert from "node:assert/strict";
import * as C from "../web/js/h3s_core.js";
import { H3Editor } from "../web/js/h3s_editor.js";

const make = (method = "overlap", link = "extend", styles = ["16mm_gritty", "35mm_film"]) => {
  const e = Object.create(H3Editor.prototype);
  e.p = C.normalizeProject({
    id: "improve_context_test",
    settings: { continuation_method: method, continuity_ref: true,
      continuity_phrase: "Continue the actual previous video using <Picture {n}> without a cut." },
    assistant: { cfg: { styles } },
    assets: [{ id: "a1", name: "Actress", category: "character", file: "a.png", type: "input" }],
    segments: [
      { id: "s1", frames: 141, prompt: "A calm smile.", refs: ["a1"] },
      { id: "s2", frames: 141, link, prompt: "She turns to the camera.", refs: ["a1"] },
    ],
  });
  e.items = () => C.plan(e.p);
  return e;
};

const source = "detailed_description:\n[Shot 1] She turns toward the camera.\n\noverall_soundscape:\nWind.\n\nnon_diegetic_music:\nN/A";
const reference = { token: "<Picture 1>", name: "Actress", kind: "picture" };
const editor = make();
const req = editor.peImprovementRequest(source, { kind: "seg", seg: 1 }, [reference]);
assert.equal(req.mode, "ref2va");
assert.equal(req.hasStyles, true);
assert.equal(req.hasAutomaticPhrase, true);
assert.match(req.system, /=== ACTIVE STYLES ===/);
assert.match(req.system, /16mm Gritty Film/);
assert.match(req.system, /35mm/);
assert.match(req.system, /gate weave/);
assert.match(req.user, /ACTUAL VIDEO CONTINUATION CONTEXT/);
assert.match(req.user, /Continue the actual previous video using <Picture 2> without a cut/);
assert.match(req.user, /The engine supplies <Picture 2>/);
assert.match(req.user, /ORIGINAL PROMPT/);
assert(!req.user.includes("<Picture {n}>"), "Template variable must resolve to the real picture number");
assert.match(C.composePrompt(editor.p, 1), /Continue the actual previous video using <Picture 2> without a cut/);

const protectedEditor = make("protected");
const protectedReq = protectedEditor.peImprovementRequest(source, { kind: "seg", seg: 1 }, [reference]);
assert.match(protectedReq.user, /CONTINUES the previous video/);
assert.equal(protectedReq.hasAutomaticPhrase, false);
assert.match(protectedReq.user, /does not supply a separate previous-frame <Picture N>/);
assert(!protectedReq.user.includes("engine supplies <Picture 2>"), "Protected must not invent a Picture");

const newScene = make("overlap", "cut");
const newSceneReq = newScene.peImprovementRequest(source, { kind: "seg", seg: 1 }, [reference]);
assert.equal(newSceneReq.continuation, "", "New scenes must not inherit previous video");
const firstReq = editor.peImprovementRequest(source, { kind: "seg", seg: 0 }, [reference]);
assert.equal(firstReq.continuation, "", "First clip cannot inherit a previous clip");
const globalReq = editor.peImprovementRequest(source, { kind: "global" }, []);
assert.equal(globalReq.continuation, "", "Global prompts are not tied to a particular continuation");
const noStyle = make("overlap", "extend", []);
const noStyleReq = noStyle.peImprovementRequest(source, { kind: "seg", seg: 1 }, [reference]);
assert.equal(noStyleReq.hasStyles, false);
assert(!noStyleReq.system.includes("ACTIVE STYLES"));

const normal = editor.astSystem();
assert.match(normal, /=== ACTIVE STYLES ===/);
assert.equal((normal.match(/=== ACTIVE STYLES ===/g) || []).length, 1, "Existing assistant styles should not be duplicated");
console.log("Prompt improvement: selected styles, continuity phrase, Protected/new-scene/global safeguards: PASS");
