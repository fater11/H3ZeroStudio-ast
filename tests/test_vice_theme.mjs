import assert from "node:assert/strict";
import { SCHEMES, schemeSetting, applyScheme, V6_CSS } from "../web/js/v6/css.js";

const saved = new Map();
const variables = new Map();
globalThis.localStorage = {
  getItem: (k) => saved.get(k) ?? null,
  setItem: (k, v) => saved.set(k, String(v)),
  removeItem: (k) => saved.delete(k),
};
globalThis.document = { documentElement: {
  style: { setProperty: (k, v) => variables.set(k, v) },
  dataset: {},
} };

const vice = SCHEMES.find(([id]) => id === "vice");
assert(vice, "GTA VI scheme missing");
assert.equal(vice.length, 10);
assert.equal(schemeSetting(), "graphite", "new theme must not override current default");
applyScheme("vice", true);
assert.equal(schemeSetting(), "vice");
assert.equal(document.documentElement.dataset.v6Scheme, "vice");
assert.equal(variables.get("--v6-acc"), "#FF70B8");
assert.equal(variables.get("--v6-acc-ink"), "#27102C");
assert.equal(variables.get("--v6-win"), "#100b1d");
assert.match(V6_CSS, /html\[data-v6-scheme="vice"\]/);
assert.match(V6_CSS, /v6-scheme\[data-scheme="vice"\]/);
assert.match(V6_CSS, /linear-gradient\(115deg,#ffb16d/);
applyScheme("graphite", true);
assert.equal(schemeSetting(), "graphite", "other schemes still selectable");
console.log("GTA VI / Vice theme palette, persistence and CSS: PASS");
