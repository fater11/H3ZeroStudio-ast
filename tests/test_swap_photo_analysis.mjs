import assert from "node:assert/strict";
import { installSwap, cleanSwapAppearance, DEFAULT_PHOTO_APPEARANCE } from "../web/js/v6/swap.js";

assert.equal(cleanSwapAppearance("Description: distinctive green eyes and dark hair."), "distinctive green eyes and dark hair.");
const fence = String.fromCharCode(96).repeat(3);
assert.equal(cleanSwapAppearance("<think>private chain</think>\n" + fence + "english\nBlue shirt, square jaw.\n" + fence), "Blue shirt, square jaw.");

class Editor {
  constructor() {
    this.p = {
      assets: [
        { id: "body", category: "character", file: "body.jpg", subfolder: "cast", type: "input" },
        { id: "face", category: "character", file: "face.png", subfolder: "", type: "input" },
      ],
      assistant: { cfg: { backend: "api", api_base: "http://127.0.0.1:1234/v1", api_model: "vision-example", api_key: "" } },
    };
    this.run = { active: false };
    this.page = "swap";
    this.notices = [];
  }
  toast(message, error) { this.notices.push({ message, error }); }
  renderSwap() { this.rendered = (this.rendered || 0) + 1; }
}
installSwap(Editor, { C: { CATEGORY_ORDER: ["character"] }, h: () => ({}), I: {}, btn: () => ({}) });
Editor.prototype.renderSwap = function () { this.rendered = (this.rendered || 0) + 1; };

const messages = [];
const sse = (parts) => {
  const chunks = parts.map((value) => new TextEncoder().encode(
    "data: " + JSON.stringify({ kind: "token", text: value }) + "\n\n"));
  let at = 0;
  return { ok: true, body: { getReader: () => ({
    read: async () => at < chunks.length ? { done: false, value: chunks[at++] } : { done: true },
  }) } };
};
globalThis.fetch = async (url, options) => {
  if (url === "/queue") return { ok: true, json: async () => ({ queue_running: [], queue_pending: [] }) };
  assert.equal(url, "/h3lab/llm/chat");
  const body = JSON.parse(options.body);
  messages.push(body);
  return sse(["Description: green eyes, ", "dark hair, blue shirt."]);
};

const editor = new Editor();
const sw = editor.swapState();
sw.image = "body";
sw.useFaceRef = true;
sw.faceImage = "face";
await editor.swapAnalyzePhoto();
assert.equal(sw.details, "green eyes, dark hair, blue shirt.");
assert.equal(sw.analyzingPhoto, false);
assert.equal(messages.length, 1);
assert.equal(messages[0].attachments.length, 2);
assert.equal(messages[0].attachments[0].asset.file, "body.jpg");
assert.equal(messages[0].attachments[1].asset.file, "face.png");
assert.equal(messages[0].max_tokens, 400);
assert.equal(messages[0].thinking, false);
assert(editor.rendered >= 2);

const occupied = new Editor();
occupied.swapState().image = "body";
let calledVision = false;
globalThis.fetch = async (url) => {
  if (url === "/queue") return { ok: true, json: async () => ({ queue_running: [["id"]], queue_pending: [] }) };
  calledVision = true;
  return sse(["test"]);
};
await occupied.swapAnalyzePhoto();
assert.equal(calledVision, false, "Do not unload models while ComfyUI is rendering");
assert.equal(occupied.swapState().details, DEFAULT_PHOTO_APPEARANCE);

const changed = new Editor();
changed.swapState().image = "body";
globalThis.fetch = async (url) => {
  if (url === "/queue") return { ok: true, json: async () => ({ queue_running: [], queue_pending: [] }) };
  changed.swapState().details = "My manual description";
  return sse(["AI must not overwrite me"]);
};
await changed.swapAnalyzePhoto();
assert.equal(changed.swapState().details, "My manual description", "Never overwrite a text edited during async analysis");

const local = new Editor();
local.p.assistant.cfg.backend = "comfy";
local.swapState().image = "body";
globalThis.fetch = async () => { throw Error("Not expected"); };
await local.swapAnalyzePhoto();
assert(local.notices.at(-1).message.includes("API-модель"));
console.log("Swap photo analysis: vision attachment, queue guard and edit preservation: PASS");
