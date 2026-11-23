// H3ZeroStudio Lab v6 — component kit. Plain DOM, no dependencies. Every control in the v6 shell is built here,
// so there is exactly one button, one segmented control, one switch, one slider, one popover and one tooltip.
import { h } from "../h3s_editor.js";
import { uiLocalPoint, uiLocalSize, uiLocalBounds } from "../h3s_ui_scale.js";
export { h };

const sv = (p, fill = false) => `<svg viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="${fill ? "none" : "currentColor"}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
/** One icon family (SF Symbols-like, 1.6 stroke on a 24 grid). */
export const I = {
  edit: sv('<rect x="3" y="5" width="18" height="10" rx="2"/><path d="M3 19h18M8 15v4M16 15v4"/>'),
  library: sv('<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>'),
  assist: sv('<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z"/><path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>'),
  spark: sv('<path d="M12 2.8l2.1 5.6 5.6 2.1-5.6 2.1L12 18.2l-2.1-5.6-5.6-2.1 5.6-2.1z"/><path d="M19 15.6l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/>', true),
  undo: sv('<path d="M9 14L4.5 9.5 9 5"/><path d="M4.5 9.5H15a4.5 4.5 0 010 9h-3"/>'),
  redo: sv('<path d="M15 14l4.5-4.5L15 5"/><path d="M19.5 9.5H9a4.5 4.5 0 000 9h3"/>'),
  gear: sv('<path d="M9.72 5.38L9.84 2.65L14.16 2.65L14.28 5.38A7.0 7.0 0 0 1 16.59 6.72L19.02 5.45L21.18 9.19L18.87 10.66A7.0 7.0 0 0 1 18.87 13.34L21.18 14.81L19.02 18.55L16.59 17.28A7.0 7.0 0 0 1 14.28 18.62L14.16 21.35L9.84 21.35L9.72 18.62A7.0 7.0 0 0 1 7.41 17.28L4.98 18.55L2.82 14.81L5.13 13.34A7.0 7.0 0 0 1 5.13 10.66L2.82 9.19L4.98 5.45L7.41 6.72A7.0 7.0 0 0 1 9.72 5.38Z" stroke-linejoin="round"/><circle cx="12" cy="12" r="3"/>'),
  more: sv('<circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
  share: sv('<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12v6.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V12"/>'),
  chev: sv('<path d="M7 10l5 5 5-5"/>'), chevR: sv('<path d="M10 7l5 5-5 5"/>'), chevL: sv('<path d="M14 7l-5 5 5 5"/>'),
  close: sv('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  refresh: sv('<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>'),
  translate: sv('<path d="M4 6h9M8.5 4v2c0 4-2 7-4.5 8.5M6.5 10c1.2 2 3 3.5 5 4.2"/><path d="M12 20l4-9 4 9M13.5 17h5"/>'),
  neighbors: sv('<rect x="9" y="6" width="6" height="12" rx="1.5"/><path d="M5 8v8M19 8v8"/>'),
  lock: sv('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  list: sv('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.4"/>'),
  pencil: sv('<path d="M14.5 5.5l4 4L8 20H4v-4z"/><path d="M12.5 7.5l4 4"/>'),
  region: sv('<path d="M7 4H5.5A1.5 1.5 0 004 5.5v13A1.5 1.5 0 005.5 20H7M17 4h1.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H17"/><path d="M9 12h6M12 9v6"/>'),
  magnet: sv('<path d="M6 4v7a6 6 0 0012 0V4"/><path d="M6 8h3M15 8h3"/><path d="M9 4v7a3 3 0 006 0V4"/>'),
  play: sv('<path d="M8 5.2v13.6a.8.8 0 001.2.7l10.6-6.8a.8.8 0 000-1.4L9.2 4.5A.8.8 0 008 5.2z"/>', true),
  pause: sv('<rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/>', true),
  prev: sv('<path d="M18 6.2v11.6a.7.7 0 01-1.1.6L9 12.6a.7.7 0 010-1.2l7.9-5.8a.7.7 0 011.1.6z" fill="currentColor" stroke="none"/><path d="M6.5 6v12"/>'),
  next: sv('<path d="M6 6.2v11.6a.7.7 0 001.1.6l7.9-5.8a.7.7 0 000-1.2L7.1 5.6A.7.7 0 006 6.2z" fill="currentColor" stroke="none"/><path d="M17.5 6v12"/>'),
  vol: sv('<path d="M4 9.5h3l4.5-4v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>'),
  mute: sv('<path d="M4 9.5h3l4.5-4v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  fs: sv('<path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15"/>'),
  expand: sv('<path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/>'),
  collapse: sv('<path d="M20 4l-6 6M14 5v5h5M4 20l6-6M10 19v-5H5"/>'),
  view: sv('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8.5 11h5M11 8.5v5"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'), minus: sv('<path d="M5 12h14"/>'),
  cut: sv('<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M20 4.5L8.4 15.6M14.5 14.4L20 19.5M8.4 8.4L11.5 11.5"/>'),
  dup: sv('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0014 4.5H6A1.5 1.5 0 004.5 6v8A1.5 1.5 0 006 15.5h2.5"/>'),
  trash: sv('<path d="M4.5 6.5h15M9.5 6.5V5a1 1 0 011-1h3a1 1 0 011 1v1.5M6.5 6.5l.8 12.1A1.5 1.5 0 008.8 20h6.4a1.5 1.5 0 001.5-1.4l.8-12.1M10 10.5v6M14 10.5v6"/>'),
  marker: sv('<path d="M12 3.5l6 6-6 11-6-11z"/>'),
  fit: sv('<path d="M3.5 12h17M7.5 8l-4 4 4 4M16.5 8l4 4-4 4"/>'),
  upload: sv('<path d="M12 15.5V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4.5 15v3.5A1.5 1.5 0 006 20h12a1.5 1.5 0 001.5-1.5V15"/>'),
  search: sv('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>'),
  image: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 15.5l-5-5-9 9"/>'),
  person: sv('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.9-3.8 3.7-6 7.2-6s6.3 2.2 7.2 6"/>'),
  people: sv('<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.7-3.2 2.8-5 5.5-5s4.8 1.8 5.5 5"/><path d="M15.5 5.5a3 3 0 010 6M17.5 14.2c1.6.7 2.6 2.4 3 4.8"/>'),
  gallery: sv('<rect x="3.5" y="6.5" width="14" height="13" rx="2.2"/><path d="M7 3.8h10.8a2.7 2.7 0 012.7 2.7V16"/><path d="M17.5 16l-4-4-7 7"/>'),
  folder: sv('<path d="M3.5 7A1.5 1.5 0 015 5.5h4.2l2 2H19A1.5 1.5 0 0120.5 9v8.5A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5z"/>'),
  film: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>'),
  wave: sv('<path d="M4 12h1.5M7.5 8v8M11 5v14M14.5 9v6M18 7v10M20.5 12H20"/>'),
  link: sv('<path d="M10 13.5a4 4 0 006 .4l2.6-2.6a4 4 0 00-5.7-5.7l-1.4 1.4"/><path d="M14 10.5a4 4 0 00-6-.4l-2.6 2.6a4 4 0 005.7 5.7l1.4-1.4"/>'),
  cutlink: sv('<path d="M12 4v4M12 16v4M4 12h3M17 12h3"/><rect x="8" y="8" width="8" height="8" rx="2"/>'),
  dice: sv('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  warn: sv('<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
  info: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 8v.01"/>'),
  stop: sv('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>', true),
  broom: sv('<path d="M19.5 4.5l-7 7"/><path d="M14.5 13.5l-4-4-5.5 5.5 4 4z"/><path d="M6 17l-2 3.5 3.5-2"/>'),
  key: sv('<rect x="2.5" y="6.5" width="19" height="11" rx="2.2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>'),
  help: sv('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.6-2.4 2-2.4 3.7M12 17v.01"/>'),
  cube: sv('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 21v-9M20 7.5l-8 4.5-8-4.5"/>'),
  download: sv('<path d="M12 4v11.5M7.5 11L12 15.5 16.5 11"/><path d="M4.5 15v3.5A1.5 1.5 0 006 20h12a1.5 1.5 0 001.5-1.5V15"/>'),
  sliders: sv('<path d="M5 6h9M18 6h1M5 12h3M12 12h7M5 18h11M20 18h-1"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  up: sv('<path d="M12 19V5M6.5 10.5L12 5l5.5 5.5"/>'),
  sound: sv('<path d="M5 9.5v5M9 7v10M13 4.5v15M17 8v8M21 10.5v3"/>'),
  eye: sv('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  palette: sv('<path d="M12 3.5a8.5 8.5 0 000 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.5-1.1-2.6 0-.9.7-1.6 1.6-1.6h2.2a4 4 0 004-4c0-3.9-3.8-7.1-8.5-7.1z"/><circle cx="7.8" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="7.8" r="1.1" fill="currentColor" stroke="none"/>'),
  globe: sv('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z"/>'),
  chip: sv('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>'),
  gauge: sv('<path d="M4.5 18.25a8.5 8.5 0 1115 0"/><path d="M12 14.25l3.5-4"/>'),
  heart: sv('<path d="M12 19.5s-7.5-4.6-7.5-10A4.3 4.3 0 0112 6.7a4.3 4.3 0 017.5 2.8c0 5.4-7.5 10-7.5 10z"/>'),
  github: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
  command: sv('<path d="M9 6.5a2.5 2.5 0 10-2.5 2.5H9zm0 0V17.5M15 6.5a2.5 2.5 0 112.5 2.5H15zm0 0v11M9 17.5a2.5 2.5 0 11-2.5-2.5H9zm0 0h6M15 17.5a2.5 2.5 0 102.5-2.5H15zM9 9h6M9 15h6"/>'),
  sidebar: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>'),
  sidebarR: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/>'),
  inspector: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/>'),
  memory: sv('<rect x="3.5" y="7" width="17" height="10" rx="1.5"/><path d="M7 7V5M11 7V5M15 7V5M19 7V5M7 17v2M11 17v2M15 17v2M19 17v2"/>'),
};

const cx = (...c) => c.filter(Boolean).join(" ");

/** Button. kind: plain (default) | tinted | primary | danger | ghost. icon-only buttons need a tip (shown as tooltip). */
export function btn({ label = "", icon = "", kind = "", size = "", tip = "", key = "", cls = "", onclick, disabled = false, pressed = null, attrs = {} } = {}) {
  const b = h("button", { type: "button", class: cx("v6-b", kind && "is-" + kind, size && "is-" + size, !label && icon && "is-icon", cls), disabled: disabled || null, ...attrs });
  if (icon) b.insertAdjacentHTML("beforeend", `<i class="v6-ic">${icon}</i>`);
  if (label) b.append(h("span", { class: "v6-bl" }, label));
  if (tip || key) setTip(b, tip || label, key);
  if (!label && (tip || label)) b.setAttribute("aria-label", tip);
  if (pressed !== null) b.setAttribute("aria-pressed", String(!!pressed));
  if (onclick) b.addEventListener("click", (e) => { if (!b.disabled) onclick(e, b); });
  return b;
}
export function setTip(el, text, key = "") { if (!el) return el; if (text) el.dataset.tip = text; else delete el.dataset.tip; if (key) el.dataset.key = key; else delete el.dataset.key; return el; }

/** Segmented control (the only one). options: [{value,label,icon,tip,disabled}]. The thumb slides (transform only). */
export function seg(options, value, onChange, { size = "", cls = "", full = false, label = "" } = {}) {
  const el = h("div", { class: cx("v6-seg", size && "is-" + size, full && "is-full", cls), role: "radiogroup", "aria-label": label || null });
  const thumb = h("i", { class: "v6-seg-th", "aria-hidden": "true" });
  el.append(thumb);
  const items = options.map((o) => {
    const it = h("button", { type: "button", class: "v6-seg-it", role: "radio", "data-v": String(o.value), disabled: o.disabled || null });
    if (o.icon) it.insertAdjacentHTML("beforeend", `<i class="v6-ic">${o.icon}</i>`);
    if (o.label) it.append(h("span", null, o.label));
    if (o.tip) setTip(it, o.tip, o.key || "");
    if (o.icon && !o.label) it.setAttribute("aria-label", o.tip || "");
    it.addEventListener("click", () => { if (it.disabled) return; if (String(el._v) !== String(o.value)) { set(o.value, true); onChange?.(o.value); } });
    el.append(it); return it;
  });
  const place = (anim) => {
    const on = items.find((it) => it.dataset.v === String(el._v));
    if (!on || !el.isConnected) { thumb.style.opacity = "0"; return; }
    const x = on.offsetLeft, w = on.offsetWidth;
    if (!anim) thumb.style.transition = "none";
    thumb.style.width = w + "px"; thumb.style.transform = `translateX(${x}px)`; thumb.style.opacity = "1";
    if (!anim) { void thumb.offsetWidth; thumb.style.transition = ""; }
  };
  const set = (v, anim = false) => {
    el._v = v;
    for (const it of items) { const on = it.dataset.v === String(v); it.classList.toggle("on", on); it.setAttribute("aria-checked", String(on)); }
    place(anim);
  };
  el.set = set; el.place = place; el._v = value;
  for (const it of items) { const on = it.dataset.v === String(value); it.classList.toggle("on", on); it.setAttribute("aria-checked", String(on)); }
  // first placement once in the DOM (and after font load / resizes)
  try { const ro = new ResizeObserver(() => place(false)); ro.observe(el); } catch { requestAnimationFrame(() => place(false)); }
  return el;
}

/** Switch (the only boolean control). */
export function sw(on, onChange, { tip = "", disabled = false, label = "" } = {}) {
  const b = h("button", { type: "button", class: "v6-sw" + (on ? " on" : ""), role: "switch", "aria-checked": String(!!on), disabled: disabled || null, "aria-label": label || tip || null }, h("i"));
  if (tip) setTip(b, tip);
  b.addEventListener("click", () => { if (b.disabled) return; const v = !b.classList.contains("on"); b.classList.toggle("on", v); b.setAttribute("aria-checked", String(v)); onChange?.(v); });
  return b;
}

/** Checkbox (the only one): a box with a tick and an optional label; Space / Enter toggle it. */
export function checkbox(on, onChange, { label = "", tip = "", key = "", cls = "", aria = "" } = {}) {
  const b = h("button", { type: "button", class: cx("v6-chk", on && "on", cls), role: "checkbox", "aria-checked": String(!!on), "aria-label": aria || label || tip || null },
    h("i", { class: "v6-chk-b", html: I.check }), label ? h("span", { class: "v6-chk-l" }, label) : null);
  if (tip) setTip(b, tip, key);
  b.addEventListener("pointerdown", (e) => e.stopPropagation());
  b.addEventListener("click", (e) => { e.stopPropagation(); const v = !b.classList.contains("on"); b.classList.toggle("on", v); b.setAttribute("aria-checked", String(v)); onChange?.(v); });
  b.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); b.click(); } });
  return b;
}

/** Slider (the only one): native range, fully restyled; keeps --fill in sync. */
export function slider({ min = 0, max = 100, step = 1, value = 0, onInput, onChange, tip = "", cls = "" } = {}) {
  const r = h("input", { type: "range", class: cx("v6-range", cls), min, max, step, value });
  const fill = () => { const k = (Number(r.value) - min) / ((max - min) || 1); r.style.setProperty("--fill", (Math.max(0, Math.min(1, k)) * 100).toFixed(2) + "%"); };
  fill();
  r.addEventListener("input", () => { fill(); onInput?.(Number(r.value)); });
  if (onChange) r.addEventListener("change", () => onChange(Number(r.value)));
  r.addEventListener("keydown", (e) => e.stopPropagation());
  if (tip) setTip(r, tip);
  r.sync = fill;
  return r;
}

/** Text / number field. */
export function field({ value = "", type = "text", placeholder = "", cls = "", step, min, max, onInput, onChange, width, tip = "", suffix = "" } = {}) {
  const inp = h("input", { class: cx("v6-in", cls), type, placeholder, step, min, max, spellcheck: "false", autocomplete: "off" });
  inp.value = value ?? "";
  if (width) inp.style.width = width;
  if (onInput) inp.addEventListener("input", () => onInput(inp.value));
  if (onChange) inp.addEventListener("change", () => onChange(inp.value));
  if (tip) setTip(inp, tip);
  if (!suffix) return inp;
  const w = h("label", { class: "v6-in-wrap" }, inp, h("span", { class: "v6-in-sfx" }, suffix));
  w.input = inp; return w;
}

/** Inspector / settings section: sentence-case title (+ trailing accessory) and content. */
export function section(title, accessory, ...kids) {
  return h("section", { class: "v6-sec" }, title || accessory ? h("header", { class: "v6-sec-h" }, title ? h("h3", null, title) : null, h("i", { class: "v6-grow" }), accessory || null) : null, ...kids);
}
/** Grouped inset list (System Settings). rows: [{label, sub, control, onclick}] or elements. */
export function group(title, rows, foot = "") {
  return h("div", { class: "v6-grp" }, title ? h("h4", { class: "v6-grp-t" }, title) : null,
    h("div", { class: "v6-grp-b" }, rows.filter(Boolean).map((r) => r instanceof Node ? r : row(r))),
    foot ? h("p", { class: "v6-grp-f" }, foot) : null);
}
export function row({ label, sub = "", control = null, icon = "", onclick = null, cls = "", stack = false }) {
  const el = h("div", { class: cx("v6-row", onclick && "is-btn", stack && "is-stack", cls) },
    icon ? h("i", { class: "v6-row-ic", html: icon }) : null,
    h("div", { class: "v6-row-l" }, h("div", { class: "v6-row-t" }, label), sub ? h("div", { class: "v6-row-s" }, sub) : null),
    control ? h("div", { class: "v6-row-c" }, control) : null);
  if (onclick) el.addEventListener("click", onclick);
  return el;
}
export function empty(icon, text, action = null, sub = "") {
  return h("div", { class: "v6-empty" }, icon ? h("i", { class: "v6-empty-ic", html: icon }) : null, h("div", { class: "v6-empty-t" }, text), sub ? h("div", { class: "v6-empty-s" }, sub) : null, action);
}
export function kbd(k) { return h("kbd", { class: "v6-kbd" }, k); }

// ---------------------------------------------------------------- tooltip (one, global, delegated)
let tipEl = null, tipT = 0, tipFor = null;
export function installTips(root) {
  const show = (t) => {
    const text = t.dataset.tip; if (!text) return;
    if (!tipEl || !tipEl.isConnected) { tipEl = h("div", { class: "v6-tip", role: "tooltip" }); root.append(tipEl); }
    tipEl.innerHTML = ""; tipEl.append(h("span", null, text)); if (t.dataset.key) tipEl.append(h("kbd", { class: "v6-kbd" }, t.dataset.key));
    tipEl.style.left = "0px"; tipEl.style.top = "0px"; tipEl.style.maxWidth = ""; tipEl.classList.remove("on");
    // v6j: placed inside the studio bounds with a margin — centred under the target, flipped above when there is no
    // room below, shifted sideways at the edges (inspector right edge, dock left edge), never cut
    const M = 8, r = t.getBoundingClientRect(), b = uiLocalBounds(root);
    if (uiLocalSize(tipEl.getBoundingClientRect().width) > b.w - 2 * M) tipEl.style.maxWidth = Math.max(120, b.w - 2 * M) + "px";
    const tw = uiLocalSize(tipEl.getBoundingClientRect().width), th = uiLocalSize(tipEl.getBoundingClientRect().height);
    const below = uiLocalPoint(r.left + r.width / 2, r.bottom + 6, root), above = uiLocalPoint(r.left + r.width / 2, r.top - 6, root);
    let x = below.x - tw / 2, y = below.y, side = "bottom";
    if (y + th > b.h - M && above.y - th >= M) { y = above.y - th; side = "top"; }
    x = Math.max(M, Math.min(b.w - tw - M, x));
    y = Math.max(M, Math.min(b.h - th - M, y));
    tipEl.dataset.side = side;
    tipEl.style.left = Math.round(x) + "px"; tipEl.style.top = Math.round(y) + "px";
    {   // safety net in screen pixels (scaled UI, rounding): pull it back inside the window
      const q = tipEl.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      const dx = q.left < M ? M - q.left : q.right > vw - M ? vw - M - q.right : 0, dy = q.top < M ? M - q.top : q.bottom > vh - M ? vh - M - q.bottom : 0;
      if (dx || dy) { tipEl.style.left = Math.round(x + uiLocalSize(dx)) + "px"; tipEl.style.top = Math.round(y + uiLocalSize(dy)) + "px"; }
    }
    requestAnimationFrame(() => tipEl?.classList.add("on"));
  };
  const hide = () => { clearTimeout(tipT); tipFor = null; tipEl?.classList.remove("on"); };
  root.addEventListener("pointerover", (e) => {
    // engine elements carry native titles: adopt them lazily so every tooltip in the studio looks the same
    const tt = e.target.closest?.("[title]");
    if (tt && root.contains(tt) && tt.tagName !== "IFRAME" && tt.title) { tt.dataset.tip = tt.title; tt.removeAttribute("title"); }
    else if (tt && tt.title === "") tt.removeAttribute("title");
    const t = e.target.closest?.("[data-tip]");
    if (t === tipFor) return;
    hide(); if (!t || !root.contains(t)) return;
    tipFor = t; const warm = tipEl?.dataset.warm && Date.now() - Number(tipEl.dataset.warm) < 600;
    tipT = setTimeout(() => { if (tipFor === t && t.isConnected) show(t); }, warm ? 60 : 550);
  });
  root.addEventListener("pointerout", (e) => { const t = e.target.closest?.("[data-tip]"); if (t && !t.contains(e.relatedTarget)) { if (tipEl?.classList.contains("on")) tipEl.dataset.warm = String(Date.now()); hide(); } });
  root.addEventListener("pointerdown", hide, true);
  root.addEventListener("wheel", hide, { passive: true });
  return hide;
}

// ---------------------------------------------------------------- popover (anchored, one open at a time)
let openPop = null;
export function closePopover() { if (openPop) { const p = openPop; openPop = null; p._close(); } }
export function popover(root, anchor, content, { align = "start", side = "bottom", cls = "", width = 0, onClose = null, gap = 6 } = {}) {
  closePopover();
  const el = h("div", { class: cx("v6-pop", cls), role: "dialog" }, content);
  if (width) el.style.width = width + "px";
  root.append(el);
  let ar = null;   // the anchor may be re-rendered while the popover is open: keep its last box
  const place = () => {
    if (anchor.isConnected) ar = anchor.getBoundingClientRect();
    if (!ar) return;
    const r = ar, b = uiLocalBounds(root);
    const bl = uiLocalPoint(r.left, r.bottom + gap, root), tr = uiLocalPoint(r.right, r.top - gap, root), aw = uiLocalSize(r.width);
    const below = b.h - bl.y - 8, above = tr.y - 8;
    el.style.maxHeight = "";
    let ph = el.offsetHeight; const pw = el.offsetWidth;
    const up = side === "top" ? !(ph > above && below > above) : ph > below && above > below;
    const room = Math.max(120, up ? above : below);
    if (ph > room) { el.style.maxHeight = room + "px"; ph = room; }
    let x = align === "end" ? tr.x - pw : align === "center" ? bl.x + aw / 2 - pw / 2 : bl.x;
    const y = up ? Math.max(8, tr.y - ph) : bl.y;
    x = Math.max(8, Math.min(b.w - pw - 8, x));
    el.style.left = Math.round(x) + "px"; el.style.top = Math.round(y) + "px";
    el.style.transformOrigin = (up ? "bottom " : "top ") + (align === "end" ? "right" : align === "center" ? "center" : "left");
  };
  let lastH = -1;
  const ro = new ResizeObserver(() => { const hh = el.scrollHeight; if (Math.abs(hh - lastH) > 1) { lastH = hh; place(); } });
  ro.observe(el.firstElementChild || el);
  place();
  requestAnimationFrame(() => el.classList.add("on"));
  anchor.classList.add("is-open");
  const off = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target) && !e.target.closest?.(".h3l-menu")) closePopover(); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closePopover(); } };
  setTimeout(() => document.addEventListener("pointerdown", off, true), 0);
  window.addEventListener("keydown", key, true);
  el._close = () => { ro.disconnect(); document.removeEventListener("pointerdown", off, true); window.removeEventListener("keydown", key, true); anchor.classList.remove("is-open");
    el.classList.remove("on"); el.classList.add("off"); setTimeout(() => el.remove(), 140); onClose?.(); };
  el.place = place;
  openPop = el;
  return el;
}

/** Menu rows for popovers (same look as context menus). items: [{label, icon, key, fn, danger, dis, on, sep, head}] */
export function menuList(items, done = closePopover) {
  return h("div", { class: "v6-menu" }, items.filter(Boolean).map((it) => {
    if (it === "sep" || it.sep) return h("div", { class: "v6-menu-sep" });
    if (it.head) return h("div", { class: "v6-menu-h" }, it.head);
    // disabled rows stay hoverable (aria-disabled) so their tooltip can say why
    const b = h("button", { type: "button", class: cx("v6-menu-it", it.danger && !it.dis && "is-danger", it.on && "is-on", it.dis && "is-dis"), "aria-disabled": it.dis ? "true" : null },
      h("i", { class: "v6-ic", html: it.on ? I.check : it.icon || "" }), h("span", { class: "v6-menu-l" }, it.label), it.key ? h("span", { class: "v6-menu-k" }, it.key) : null);
    if (it.tip) setTip(b, it.tip);
    b.addEventListener("click", () => { if (it.dis) return; done(); it.fn?.(); });
    return b;
  }));
}

/** Modal sheet / window. Returns { el, close }. */
export function modal(root, content, { cls = "", onClose = null, dismissable = true, label = "" } = {}) {
  const win = h("div", { class: cx("v6-win", cls), role: "dialog", "aria-modal": "true", "aria-label": label || null }, content);
  const scrim = h("div", { class: "v6-scrim" }, win);
  root.append(scrim);
  requestAnimationFrame(() => scrim.classList.add("on"));
  let closed = false;
  const close = () => { if (closed) return; closed = true; scrim.classList.remove("on"); scrim.classList.add("off"); window.removeEventListener("keydown", key, true); setTimeout(() => scrim.remove(), 180); onClose?.(); };
  const key = (e) => { if (e.key === "Escape" && dismissable && !e.target.closest?.(".v6-pop, .h3l-lp")) { if (document.querySelector(".v6-pop.on, .h3l-menu, .h3l-lp")) return; e.preventDefault(); e.stopPropagation(); close(); } };
  window.addEventListener("keydown", key, true);
  if (dismissable) scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) close(); });
  return { el: win, scrim, close };
}

// ---------------------------------------------------------------- engine buttons: leading glyphs → icons
const GLYPH = { "↻": "refresh", "⟳": "refresh", "+": "plus", "＋": "plus", "⇪": "upload", "⇧": "upload", "⤓": "download", "⇩": "download", "⧉": "dup", "✎": "pencil", "✕": "close", "×": "close", "▶": "play", "⚙": "gear", "あ": "translate", "⟷": "neighbors", "↔": "neighbors", "⊠": "lock", "✦": "spark", "★": "heart", "▤": "library", "☰": "list" };
const GLYPH_RE = /^\s*([↻⟳+＋⇪⇧⤓⇩⧉✎✕×▶⚙あ⟷↔⊠✦★▤☰])\uFE0F?\s*/;
/** Buttons rendered by the engine start their label with a text glyph; give them the v6 icon instead. */
export function glyphIcons(root) {
  for (const b of root.querySelectorAll("button.h3l-btn, button.v6-b, .h3l-pill")) {
    if (b.dataset.v6g) continue; b.dataset.v6g = "1";
    if (b.querySelector("svg")) continue;
    const tn = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()) || b.querySelector("span, b");
    const src = tn?.nodeType === 3 ? tn : tn?.firstChild?.nodeType === 3 ? tn.firstChild : null;
    const m = src && GLYPH_RE.exec(src.textContent); if (!m) continue;
    src.textContent = src.textContent.slice(m[0].length);
    const ic = h("i", { class: "v6-ic v6-gic", html: I[GLYPH[m[1]]] });
    (src.parentNode === b ? b : src.parentNode).insertBefore(ic, src);
    if (!b.textContent.trim()) b.classList.add("icon");
  }
}

// ---------------------------------------------------------------- engine field labels → sentence case
const ACR = { cfg: "CFG", vae: "VAE", fps: "FPS", jpeg: "JPEG", lora: "LoRA", sigmas: "SIGMAS", api: "API", url: "URL", vram: "VRAM", gpu: "GPU", cpu: "CPU" };
/** Engine labels are lower-case ("шаги", "cfg"): capitalise the first word, keep identifiers (max_res, torch.compile) as is. */
export function capLabels(root) {
  for (const l of root.querySelectorAll(".h3l-lbl, .h3l-field > label, .v6-legacy-b .h3l-lab")) {
    const n = [...l.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim()); if (!n) continue;
    const t = n.textContent, m = /^(\s*)([^\s(:·,]+)(.*)$/s.exec(t); if (!m) continue;
    const w = m[2]; if (/[_.\/]/.test(w)) continue;
    const acr = ACR[w.toLowerCase()];
    const nw = acr || (w[0].toLocaleUpperCase() + w.slice(1));
    if (nw !== w) n.textContent = m[1] + nw + m[3];
  }
}
