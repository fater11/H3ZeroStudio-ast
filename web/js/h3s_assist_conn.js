// The assistant connection remembered outside the project: address, key, model and the request limits.
// The project itself keeps its own assistant config (that is how a project stays reproducible), but a new or
// another project would start with empty fields — these few values are filled back from the browser store.
const KEY = "h3ls.ast.conn";

/** Fields worth carrying over. Style/prompt presets stay in the project: they are part of its recipe. */
export const CONN_KEYS = ["backend", "comfy_encoder", "api_base", "api_key", "api_model",
                          "stream_timeout", "max_tokens", "temperature", "top_p", "thinking", "engine_defaults"];

const store = (ls) => {
  if (ls) return ls;
  try { return globalThis.localStorage || null; } catch { return null; }
};

const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** What is remembered right now ({} when nothing was saved). */
export function stored(ls) {
  try {
    const raw = store(ls)?.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}

/** Remember the connection fields of `cfg` (only non-empty ones; empty values never erase the saved ones). */
export function remember(cfg, ls) {
  const s = store(ls);
  const saved = stored(s);
  let changed = false;
  for (const k of CONN_KEYS) {
    const v = (cfg || {})[k];
    if (isBlank(v)) continue;
    if (saved[k] !== v) { saved[k] = v; changed = true; }
  }
  if (changed) {
    try { s?.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode: the values just stay in the project */ }
  }
  return saved;
}

/** Fill the empty connection fields of `cfg` from the store. Returns {cfg, changed}. */
export function recall(cfg, ls) {
  const saved = stored(ls);
  const out = { ...(cfg || {}) };
  let changed = false;
  for (const k of CONN_KEYS) {
    if (saved[k] === undefined || !isBlank(out[k])) continue;
    out[k] = saved[k];
    changed = true;
  }
  return { cfg: out, changed };
}

/** Forget the remembered connection (the project keeps whatever it already has). */
export function forget(ls) {
  try { store(ls)?.removeItem(KEY); } catch { /* nothing to forget */ }
  return true;
}

/** Short human summary for the UI: "http://… · openrouter/… · ключ есть". */
export function describe(cfg) {
  const c = cfg || {};
  const bits = [c.api_base, c.api_model].filter((x) => !isBlank(x)).map(String);
  bits.push(isBlank(c.api_key) ? "" : "key");
  return bits.filter(Boolean).join(" · ");
}
