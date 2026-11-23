// H3ZeroStudio Lab v6 — design system. Neutral dark surfaces, one accent, hairlines instead of boxes,
// 8 px grid, nested radii, 13 px body. Motion: 160–220 ms ease-out on transform/opacity only.
const FONT_URL = new URL("./fonts/InterV6.woff2", import.meta.url).href;

// Colour schemes: an accent + a slight shift of the graphite surfaces (all stay near-black; no light theme).
// [id, name, accent, ink on the accent, win, bg, s1, s2, s3, s4]
export const SCHEMES = [
  ["graphite", "Графит", "#0A84FF", "#fff", "#0f0f10", "#161617", "#1c1c1e", "#242426", "#2c2c2e", "#3a3a3c"],
  ["slate", "Сланец", "#BF5AF2", "#fff", "#0e0f12", "#15161a", "#1b1c21", "#232429", "#2b2c32", "#393a41"],
  ["charcoal", "Уголь", "#FF9F0A", "#1d1204", "#110f0d", "#181614", "#1f1c1a", "#272421", "#2f2c29", "#3d3a36"],
  ["conifer", "Хвоя", "#34C3A0", "#04211a", "#0e100f", "#151816", "#1b1e1c", "#232624", "#2b2f2c", "#393d3a"],
  ["rose", "Роза", "#FF4F79", "#fff", "#110e0f", "#181516", "#1f1b1d", "#272224", "#302a2d", "#3e373b"],
  ["vice", "GTA VI · Vice", "#FF70B8", "#27102C", "#100b1d", "#170e26", "#20152f", "#2c1d3f", "#39274e", "#4a3360"],
];
const SK = "h3ls.v6.scheme", AK = "h3ls.v6.accent", MK = "h3ls.v6.reduceMotion";
// the old accent-only dots (v6–v6d) → the closest scheme
const FROM_ACCENT = { blue: "graphite", graphite: "graphite", purple: "slate", orange: "charcoal", yellow: "charcoal", green: "conifer", pink: "rose", red: "rose" };
export const schemeSetting = () => {
  try {
    const v = localStorage.getItem(SK); if (SCHEMES.some((x) => x[0] === v)) return v;
    const old = localStorage.getItem(AK); if (old != null) { const m = FROM_ACCENT[old] || "graphite"; localStorage.setItem(SK, m); localStorage.removeItem(AK); return m; }
  } catch {}
  return "graphite";
};
export function applyScheme(id = schemeSetting(), save = false) {
  const a = SCHEMES.find((x) => x[0] === id) || SCHEMES[0];
  if (save) try { localStorage.setItem(SK, a[0]); } catch {}
  const de = document.documentElement, st = de.style;
  st.setProperty("--v6-acc", a[2]); st.setProperty("--v6-acc-ink", a[3]);
  ["--v6-win", "--v6-bg", "--v6-s1", "--v6-s2", "--v6-s3", "--v6-s4"].forEach((k, i) => st.setProperty(k, a[4 + i]));
  de.dataset.v6Scheme = a[0];
  de.dataset.v6Motion = motionReduced() ? "reduce" : "full";
}
/** kept for callers of v6–v6d */
export const applyAccent = (id, save) => applyScheme(id && SCHEMES.some((x) => x[0] === id) ? id : undefined, save);
export const motionReduced = () => { try { return localStorage.getItem(MK) === "1"; } catch { return false; } };
export function setMotionReduced(v) { try { localStorage.setItem(MK, v ? "1" : "0"); } catch {} document.documentElement.dataset.v6Motion = v ? "reduce" : "full"; }

export const V6_CSS = String.raw`
@font-face { font-family:"Inter V6"; src:url("${FONT_URL}") format("woff2"); font-weight:100 900; font-style:normal; font-display:swap; }
html[data-v6] {
  --v6-win:#0f0f10; --v6-bg:#161617; --v6-s1:#1c1c1e; --v6-s2:#242426; --v6-s3:#2c2c2e; --v6-s4:#3a3a3c;
  --v6-hl:rgba(255,255,255,.08); --v6-hl2:rgba(255,255,255,.12); --v6-fill:rgba(118,118,128,.24); --v6-fill2:rgba(118,118,128,.32);
  --v6-t1:#f5f5f7; --v6-t2:rgba(235,235,245,.68); --v6-t3:rgba(235,235,245,.6); --v6-t4:rgba(235,235,245,.3);
  --v6-ok:#30d158; --v6-warn:#ffd60a; --v6-err:#ff453a; --v6-sel:rgba(255,255,255,.14);
  --v6-r1:6px; --v6-r2:8px; --v6-r3:12px; --v6-r4:16px;
  --v6-e:cubic-bezier(.2,.8,.2,1); --v6-d:180ms;
  --v6-sh2:0 12px 40px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.35), 0 0 0 .5px rgba(255,255,255,.1);
  --v6-font:"Inter V6", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Noto Sans Symbols 2", system-ui, sans-serif;
  --v6-acc-soft:color-mix(in srgb, var(--v6-acc) 22%, transparent);
  --v6-acc-ring:color-mix(in srgb, var(--v6-acc) 55%, transparent);
}
html[data-v6][data-v6-motion="reduce"] { --v6-d:1ms; }
@media (prefers-reduced-motion: reduce) { html[data-v6] { --v6-d:1ms; } }
html[data-v6] .h3l-root.v6, html[data-v6] body > .h3l-menu, html[data-v6] body > .h3l-lp, html[data-v6] body > .h3l-monpop, html[data-v6] body > .h3l-pe-modal, html[data-v6] body > .v6-ghost {
  --bg0:var(--v6-win); --bg1:var(--v6-bg); --bg2:var(--v6-s1); --panel:var(--v6-s1); --panel2:var(--v6-s2);
  --line:var(--v6-hl); --line2:var(--v6-hl2); --txt:var(--v6-t1); --mut:var(--v6-t2); --mut2:var(--v6-t3);
  --a1:var(--v6-acc); --a2:var(--v6-acc); --a3:var(--v6-acc); --ok:var(--v6-ok); --warn:var(--v6-warn); --err:var(--v6-err);
  --field:rgba(255,255,255,.05); --control:var(--v6-fill); --on-accent:var(--v6-acc-ink);
  --glow1:transparent; --glow2:transparent; --glow3:transparent; --grad:var(--v6-acc); --grad2:var(--v6-acc);
  font-family:var(--v6-font); font-size:13px; line-height:1.38; letter-spacing:-.003em; color:var(--v6-t1);
  font-feature-settings:"cv11"; -webkit-font-smoothing:antialiased; }
html[data-v6] .h3l-root.v6 { display:grid; grid-template-rows:52px minmax(0,1fr); gap:0; padding:0; background:var(--v6-win); animation:none; opacity:0; transform:scale(.994); transition:opacity 220ms var(--v6-e), transform 220ms var(--v6-e); }
html[data-v6] .h3l-root.v6.is-in { opacity:1; transform:none; }
.v6 *, .v6 *::before, .v6 *::after { box-sizing:border-box; }
.v6 ::selection { background:var(--v6-acc-soft); }
.v6 ::-webkit-scrollbar { width:10px; height:10px; } .v6 ::-webkit-scrollbar-track, .v6 ::-webkit-scrollbar-corner { background:transparent; }
.v6 ::-webkit-scrollbar-thumb { background:rgba(255,255,255,.14); border-radius:10px; border:3px solid transparent; background-clip:content-box; }
.v6 ::-webkit-scrollbar-thumb:hover { background-color:rgba(255,255,255,.24); }
.v6 .v6-grow { flex:1; }
.v6 .v6-muted { color:var(--v6-t2); }
.v6 .v6-ic { display:inline-grid; place-items:center; width:16px; height:16px; flex:none; font-style:normal; }
.v6 .v6-ic svg { width:100%; height:100%; display:block; }
.v6 :focus-visible { outline:none; box-shadow:0 0 0 3px var(--v6-acc-ring); }
.v6 .v6-err { color:var(--v6-err); padding:12px; }
.v6 h1, .v6 h2, .v6 h3, .v6 h4, .v6 h5, .v6 p { margin:0; }

/* buttons */
.v6 .v6-b { -webkit-appearance:none; appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; height:28px; min-width:28px; padding:0 10px; border:0; border-radius:var(--v6-r1);
  background:transparent; color:var(--v6-t1); font:inherit; font-size:13px; font-weight:500; white-space:nowrap; cursor:default; text-decoration:none; position:relative; flex:none;
  transition:background-color 120ms var(--v6-e), color 120ms var(--v6-e), transform 120ms var(--v6-e), opacity 120ms; }
.v6 .v6-b .v6-ic { color:var(--v6-t2); transition:color 120ms; }
.v6 .v6-b:hover:not(:disabled) { background:rgba(255,255,255,.07); }
.v6 .v6-b:hover:not(:disabled) .v6-ic { color:var(--v6-t1); }
.v6 .v6-b:active:not(:disabled) { background:rgba(255,255,255,.11); transform:scale(.97); }
.v6 .v6-b:disabled { opacity:.38; }
.v6 .v6-b.is-icon { padding:0; width:28px; }
.v6 .v6-b.is-sm { height:24px; min-width:24px; font-size:12px; padding:0 8px; }
.v6 .v6-b.is-sm.is-icon { width:24px; padding:0; }
.v6 .v6-b.is-sm .v6-ic { width:14px; height:14px; }
.v6 .v6-b.is-tinted { background:var(--v6-fill); }
.v6 .v6-b.is-tinted:hover:not(:disabled) { background:var(--v6-fill2); }
.v6 .v6-b.is-ghost { color:var(--v6-acc); }
.v6 .v6-b.is-danger { background:var(--v6-fill); color:#ff6961; }
.v6 .v6-b.is-danger:hover:not(:disabled) { background:color-mix(in srgb, var(--v6-err) 22%, transparent); }
.v6 .v6-b.is-primary { background:var(--v6-acc); color:var(--v6-acc-ink); font-weight:600; box-shadow:inset 0 .5px 0 rgba(255,255,255,.2), 0 1px 2px rgba(0,0,0,.4); }
.v6 .v6-b.is-primary .v6-ic { color:var(--v6-acc-ink); }
.v6 .v6-b.is-primary:hover:not(:disabled) { background:color-mix(in srgb, var(--v6-acc) 88%, #fff); }
.v6 .v6-b.is-primary:hover:not(:disabled) .v6-ic { color:var(--v6-acc-ink); }
.v6 .v6-b.is-primary:active:not(:disabled) { background:color-mix(in srgb, var(--v6-acc) 85%, #000); }
.v6 .v6-b.is-warn .v6-ic { color:var(--v6-warn); }
.v6 .v6-b.is-open, .v6 .v6-b[aria-pressed="true"] { background:var(--v6-sel); }
.v6 .v6-b[aria-pressed="true"] .v6-ic { color:var(--v6-t1); }

/* segmented control */
.v6 .v6-seg { position:relative; display:inline-flex; align-items:stretch; padding:2px; gap:0; border-radius:var(--v6-r2); background:var(--v6-fill); isolation:isolate; max-width:100%; flex:none; }
.v6 .v6-seg.is-full { display:flex; width:100%; flex:auto; }
.v6 .v6-seg.is-full .v6-seg-it { flex:1 1 0; min-width:0; }
.v6 .v6-seg-th { position:absolute; left:0; top:2px; bottom:2px; border-radius:6px; background:#636366; box-shadow:0 1px 1px rgba(0,0,0,.3), 0 0 0 .5px rgba(0,0,0,.25), inset 0 .5px 0 rgba(255,255,255,.14);
  z-index:0; opacity:0; transition:transform 200ms var(--v6-e), width 200ms var(--v6-e), opacity 120ms; }
html[data-v6][data-v6-motion="reduce"] .v6 .v6-seg-th { transition:none; }
.v6 .v6-seg-it { -webkit-appearance:none; appearance:none; position:relative; z-index:1; display:inline-flex; align-items:center; justify-content:center; gap:6px; height:24px; padding:0 12px; border:0; border-radius:6px;
  background:transparent; color:var(--v6-t2); font:inherit; font-size:12.5px; font-weight:500; white-space:nowrap; cursor:default; transition:color 140ms; }
.v6 .v6-seg-it > span { overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-seg-it:hover:not(:disabled):not(.on) { color:var(--v6-t1); }
.v6 .v6-seg-it.on { color:#fff; }
.v6 .v6-seg-it:disabled { color:var(--v6-t4); }
.v6 .v6-seg-it + .v6-seg-it::before { content:""; position:absolute; left:0; top:6px; bottom:6px; width:1px; background:rgba(255,255,255,.1); transition:opacity 140ms; }
.v6 .v6-seg-it.on::before, .v6 .v6-seg-it.on + .v6-seg-it::before { opacity:0; }
.v6 .v6-seg-it .v6-ic { width:15px; height:15px; }
.v6 .v6-seg.is-sm .v6-seg-it { height:22px; padding:0 9px; font-size:12px; }

/* switch, slider, fields */
.v6 .v6-sw { -webkit-appearance:none; appearance:none; position:relative; width:34px; height:20px; border:0; border-radius:10px; padding:0; background:var(--v6-fill2); flex:none; cursor:default; transition:background-color 180ms var(--v6-e); }
.v6 .v6-sw i { position:absolute; left:2px; top:2px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.35); transition:transform 200ms var(--v6-e); }
.v6 .v6-sw.on { background:var(--v6-acc); } .v6 .v6-sw.on i { transform:translateX(14px); }
.v6 .v6-sw:disabled { opacity:.4; }
.v6 input.v6-range, html[data-v6] .v6 input.h3l-range { -webkit-appearance:none; appearance:none; height:20px; width:100%; min-width:60px; margin:0; background:transparent; cursor:default; }
.v6 input.v6-range::-webkit-slider-runnable-track, html[data-v6] .v6 input.h3l-range::-webkit-slider-runnable-track { height:4px; border-radius:2px; background:linear-gradient(90deg, var(--v6-acc) 0 var(--fill, var(--p, 0%)), rgba(255,255,255,.22) var(--fill, var(--p, 0%)) 100%); border:0; }
.v6 input.v6-range::-webkit-slider-thumb, html[data-v6] .v6 input.h3l-range::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:12px; margin-top:-4px; border-radius:6px; background:#fff; border:0;
  box-shadow:0 1px 3px rgba(0,0,0,.45), 0 0 0 .5px rgba(0,0,0,.25); transition:transform 140ms var(--v6-e); }
.v6 input.v6-range:active::-webkit-slider-thumb, html[data-v6] .v6 input.h3l-range:active::-webkit-slider-thumb { transform:scale(1.1); }
.v6 input.v6-range:focus-visible, html[data-v6] .v6 input.h3l-range:focus-visible { box-shadow:none; }
.v6 input.v6-range:focus-visible::-webkit-slider-thumb { box-shadow:0 0 0 3px var(--v6-acc-ring); }
.v6 .v6-in, html[data-v6] .v6 .h3l-in, html[data-v6] .h3l-lp .h3l-in, html[data-v6] .h3l-pe-modal .h3l-in { -webkit-appearance:none; appearance:none; height:28px; width:100%; min-width:0; padding:0 9px; border:0; border-radius:var(--v6-r1); background:rgba(255,255,255,.06);
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.1); color:var(--v6-t1); font:inherit; font-size:13px; transition:box-shadow 140ms, background-color 140ms; }
.v6 .v6-in::placeholder, html[data-v6] .v6 .h3l-in::placeholder, html[data-v6] .v6 .h3l-ta::placeholder { color:var(--v6-t3); }
.v6 .v6-in:hover, html[data-v6] .v6 .h3l-in:hover { background:rgba(255,255,255,.08); }
.v6 .v6-in:focus, html[data-v6] .v6 .h3l-in:focus, html[data-v6] .v6 .h3l-ta:focus { outline:none; background:rgba(255,255,255,.08); box-shadow:0 0 0 3px var(--v6-acc-ring), inset 0 0 0 .5px var(--v6-acc); }
.v6 .v6-in[type=number] { font-variant-numeric:tabular-nums; }
.v6 .v6-in.v6-search { padding-left:28px; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='10.5' cy='10.5' r='6'/%3E%3Cpath d='M15 15l5 5'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-size:14px; background-position:8px 50%; }
.v6 .v6-in-wrap { position:relative; display:inline-flex; align-items:center; }
.v6 .v6-in-wrap .v6-in { padding-right:22px; }
.v6 .v6-in-sfx { position:absolute; right:8px; color:var(--v6-t3); font-size:12px; pointer-events:none; }
.v6 .v6-ta, html[data-v6] .v6 .h3l-ta { width:100%; min-height:96px; resize:none; padding:10px 11px; border:0; border-radius:var(--v6-r2); background:rgba(255,255,255,.05); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.1);
  color:var(--v6-t1); font:inherit; font-size:13px; line-height:1.5; transition:box-shadow 140ms, background-color 140ms; display:block; }
.v6 .v6-ta.sm { min-height:64px; }
.v6 .v6-ta:focus { outline:none; background:rgba(255,255,255,.07); box-shadow:0 0 0 3px var(--v6-acc-ring), inset 0 0 0 .5px var(--v6-acc); }
.v6 .v6-kbd, html[data-v6] .v6 kbd { display:inline-flex; align-items:center; height:18px; padding:0 5px; border:0; border-radius:4px; background:rgba(255,255,255,.1); box-shadow:inset 0 -1px 0 rgba(0,0,0,.3);
  font:500 11px/1 var(--v6-font); color:var(--v6-t2); white-space:nowrap; letter-spacing:0; }
.v6 .v6-lbl { font-size:12px; color:var(--v6-t2); font-weight:500; }
.v6 .v6-cap { font-size:12px; color:var(--v6-t3); font-variant-numeric:tabular-nums; }
.v6 .v6-cap.is-err { color:#ff6961; }
.v6 .v6-val { font-size:13px; font-weight:600; color:var(--v6-t1); font-variant-numeric:tabular-nums; }
.v6 .v6-note { font-size:12px; line-height:1.45; color:var(--v6-t2); }
.v6 .v6-note.is-warn { color:var(--v6-warn); }
.v6 .v6-vsep { width:1px; height:16px; background:var(--v6-hl2); margin:0 4px; flex:none; }
.v6 .v6-chk { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:var(--v6-t1); cursor:default; position:relative; }
.v6 .v6-chk-in { position:absolute; opacity:0; width:16px; height:16px; margin:0; }
.v6 .v6-chk-b { width:16px; height:16px; border-radius:4px; background:rgba(255,255,255,.08); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.25); display:grid; place-items:center; color:transparent; transition:background-color 120ms; }
.v6 .v6-chk-b svg { width:12px; height:12px; stroke-width:2.6; }
.v6 .v6-chk-in:checked + .v6-chk-b { background:var(--v6-acc); color:#fff; box-shadow:none; }
.v6 .v6-chk-in:focus-visible + .v6-chk-b { box-shadow:0 0 0 3px var(--v6-acc-ring); }

/* tooltip, popover, menu, modal, toast */
.v6 .v6-tip { position:absolute; z-index:100020; max-width:320px; display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:6px; background:rgba(44,44,46,.97);
  box-shadow:0 6px 20px rgba(0,0,0,.45), 0 0 0 .5px rgba(255,255,255,.12); color:var(--v6-t1); font-size:12px; line-height:1.35; white-space:pre-line; pointer-events:none;
  opacity:0; transform:translateY(-2px); transition:opacity 120ms var(--v6-e), transform 120ms var(--v6-e); }
.v6 .v6-tip[data-side="top"] { transform:translateY(2px); }
.v6 .v6-tip.on { opacity:1; transform:none; }
.v6 .v6-tip .v6-kbd { background:rgba(255,255,255,.12); }
.v6 .v6-pop { position:absolute; z-index:100010; min-width:180px; max-height:min(560px, 80%); overflow:auto; border-radius:var(--v6-r3); background:rgb(40,40,42);
   box-shadow:var(--v6-sh2);
  opacity:0; transform:scale(.97) translateY(-3px); transition:opacity 140ms var(--v6-e), transform 180ms var(--v6-e); }
.v6 .v6-pop.on { opacity:1; transform:none; } .v6 .v6-pop.off { opacity:0; transform:scale(.98); transition-duration:110ms; pointer-events:none; }
.v6 .v6-pop-pad { padding:12px; display:flex; flex-direction:column; gap:8px; }
.v6 .v6-pop h4 { font-size:12px; font-weight:600; color:var(--v6-t2); margin:4px 0 0; }
.v6 .v6-pop h4:first-child { margin-top:0; }
.v6 .v6-menu { display:flex; flex-direction:column; padding:5px; }
.v6 .v6-pop-pad .v6-menu { padding:0; margin:0 -6px -6px; }
.v6 .v6-menu-it { -webkit-appearance:none; appearance:none; display:flex; align-items:center; gap:8px; height:28px; padding:0 8px; border:0; border-radius:5px; background:transparent; color:var(--v6-t1);
  font:inherit; font-size:13px; text-align:left; cursor:default; flex:none; }
.v6 .v6-menu-it .v6-ic { color:var(--v6-t2); }
.v6 .v6-menu-it:hover:not(:disabled):not(.is-dis), .v6 .v6-menu-it.is-kb, .v6 .v6-menu-it:focus-visible:not(.is-dis) { background:var(--v6-acc); color:var(--v6-acc-ink); outline:none; }
.v6 .v6-menu-it:hover:not(:disabled):not(.is-dis) .v6-ic, .v6 .v6-menu-it:focus-visible:not(.is-dis) .v6-ic { color:var(--v6-acc-ink); }
.v6 .v6-menu-it:disabled, .v6 .v6-menu-it.is-dis { color:var(--v6-t4); } .v6 .v6-menu-it:disabled .v6-ic, .v6 .v6-menu-it.is-dis .v6-ic { color:var(--v6-t4); }
.v6 .v6-menu-it.is-dis:focus-visible { outline:none; background:rgba(255,255,255,.06); }
.v6 .v6-menu-it.is-danger { color:#ff6961; }
.v6 .v6-menu-l { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.v6 .v6-menu-k { color:var(--v6-t3); font-size:12px; } .v6 .v6-menu-it:hover .v6-menu-k { color:inherit; opacity:.8; }
.v6 .v6-menu-sep { height:1px; margin:5px 8px; background:var(--v6-hl); flex:none; }
.v6 .v6-menu-h { font-size:11px; font-weight:600; color:var(--v6-t3); padding:6px 8px 2px; }
/* H3Lab dropdown stacking fix: anchored menus are appended to the editor root, outside the preferences scrim. */
html[data-v6] .h3l-root.v6 > .h3l-menu { z-index:100020; }
.v6 .v6-scrim { position:absolute; inset:0; z-index:100008; display:grid; place-items:center; background:rgba(0,0,0,.42); opacity:0; transition:opacity var(--v6-d) var(--v6-e); }
.v6 .v6-scrim.on { opacity:1; } .v6 .v6-scrim.off { opacity:0; pointer-events:none; }
.v6 .v6-win { position:relative; border-radius:var(--v6-r4); background:var(--v6-s1); box-shadow:0 30px 90px rgba(0,0,0,.6), 0 0 0 .5px rgba(255,255,255,.14), inset 0 .5px 0 rgba(255,255,255,.08);
  transform:scale(.97) translateY(6px); transition:transform 240ms var(--v6-e); overflow:hidden; max-width:calc(100% - 48px); max-height:calc(100% - 48px); }
html[data-v6][data-v6-motion="reduce"] .v6 .v6-win { transition:none; }
.v6 .v6-scrim.on .v6-win { transform:none; } .v6 .v6-scrim.off .v6-win { transform:scale(.985); }
.v6 .v6-toast { position:absolute; left:50%; top:62px; z-index:100030; display:flex; align-items:center; gap:10px; max-width:min(640px, 80%); padding:8px 8px 8px 12px; min-height:36px; border-radius:18px;
  background:color-mix(in srgb, var(--v6-s4) 70%, var(--v6-s3));  box-shadow:var(--v6-sh2); font-size:13px; color:var(--v6-t1);
  opacity:0; transform:translate(-50%, -8px); transition:opacity 180ms var(--v6-e), transform 220ms var(--v6-e); }
.v6 .v6-toast.on { opacity:1; transform:translate(-50%, 0); }
.v6 .v6-toast > .v6-ic { color:var(--v6-ok); } .v6 .v6-toast.is-err > .v6-ic { color:#ff6961; }
.v6 .v6-toast:not(:has(.v6-b)) { padding-right:16px; }
.v6 .v6-toast-t { line-height:1.35; }
/* toolbar */
.v6 .v6-tb { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:12px; height:52px; padding:0 12px; background:var(--v6-s1); box-shadow:inset 0 -1px 0 var(--v6-hl); position:relative; z-index:5; }
.v6 .v6-tb-l, .v6 .v6-tb-r { display:flex; align-items:center; gap:8px; min-width:0; }
.v6 .v6-tb-r { justify-content:flex-end; }
.v6 .v6-tb-grp { display:flex; align-items:center; gap:2px; flex:none; }
.v6 .v6-proj { -webkit-appearance:none; appearance:none; display:flex; align-items:center; gap:10px; height:36px; max-width:100%; min-width:0; padding:0 8px 0 4px; border:0; border-radius:var(--v6-r2); background:transparent; color:var(--v6-t1); font:inherit; cursor:default; transition:background-color 120ms; }
.v6 .v6-proj:hover, .v6 .v6-proj.is-open { background:rgba(255,255,255,.07); }
.v6 .v6-mark { width:28px; height:28px; border-radius:8px; display:grid; place-items:center; flex:none; font-size:12px; font-weight:800; letter-spacing:-.02em; color:#fff;
  background:linear-gradient(160deg,#4a4a4f,#232326); box-shadow:inset 0 .5px 0 rgba(255,255,255,.25), 0 1px 2px rgba(0,0,0,.5); }
.v6 .v6-proj-n { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.v6 .v6-proj-c { color:var(--v6-t3); width:14px; height:14px; transition:transform 180ms var(--v6-e); }
.v6 .v6-proj.is-open .v6-proj-c { transform:rotate(180deg); }
.v6 .v6-pages-sw .v6-seg-it { height:28px; padding:0 14px; font-size:13px; }
.v6 .v6-tb:is([data-size="xs"],[data-size="xxs"]) .v6-pages-sw .v6-seg-it > span { display:none; }
.v6 .v6-tb:is([data-size="xs"],[data-size="xxs"]) .v6-pages-sw .v6-seg-it { padding:0 12px; }
.v6 .v6-act { position:relative; width:280px; height:36px; flex:none; display:flex; align-items:center; gap:8px; padding:0 4px 0 12px; border-radius:var(--v6-r2); background:rgba(0,0,0,.28);
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08); overflow:hidden; cursor:default; transition:background-color 120ms; }
.v6 .v6-act:hover, .v6 .v6-act.is-open { background:rgba(0,0,0,.4); }
.v6 .v6-tb[data-size="s"] .v6-act { width:236px; } .v6 .v6-tb[data-size="xs"] .v6-act, .v6 .v6-tb[data-size="xxs"] .v6-act { width:204px; }
.v6 .v6-tb[data-size="s"] .v6-act-1 .v6-act-opt, .v6 .v6-tb[data-size="xs"] .v6-act-opt, .v6 .v6-tb[data-size="xxs"] .v6-act-opt { display:none; }
.v6 .v6-tb[data-size="xxs"] { grid-template-columns:auto auto minmax(0,1fr); }
.v6 .v6-tb[data-size="xxs"] .v6-tb-hist, .v6 .v6-tb[data-size="xxs"] .v6-mon { display:none; }
.v6 .v6-tb[data-size="xxs"] .v6-proj-n { max-width:120px; }
.v6 .v6-act-tx { display:flex; flex-direction:column; min-width:0; flex:1; line-height:1.25; }
.v6 .v6-act-1 { font-size:12px; font-weight:500; color:var(--v6-t1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
.v6 .v6-act-2 { font-size:11px; color:var(--v6-t3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
.v6 .v6-act-2:empty { display:none; }
.v6 .v6-act-dot { width:7px; height:7px; border-radius:50%; background:var(--v6-t4); flex:none; transition:background-color 200ms; }
.v6 .v6-act[data-state="ok"] .v6-act-dot { background:var(--v6-ok); }
.v6 .v6-act[data-state="warn"] .v6-act-dot { background:var(--v6-warn); }
.v6 .v6-act[data-state="run"] .v6-act-dot { background:var(--v6-acc); }
.v6 .v6-act-bar { position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v6-acc); transform-origin:left; transform:scaleX(0); transition:transform 240ms var(--v6-e); }
.v6 .v6-act .v6-b { width:24px; height:24px; min-width:24px; }
.v6 .v6-act .v6-act-warn .v6-ic { color:var(--v6-warn); }
.v6 .v6-gen { min-width:148px; height:32px; padding:0 14px; font-size:13px; border-radius:8px; }
.v6 .v6-gen.is-busy, .v6 .v6-gen.is-busy:hover { opacity:1 !important; background:var(--v6-s4) !important; color:var(--v6-t2); box-shadow:none; }
.v6 .v6-gen.is-busy .v6-ic { color:var(--v6-t2) !important; }
@keyframes v6-spin { to { transform:rotate(360deg); } }
html[data-v6][data-v6-motion="reduce"] .v6 .v6-gen.is-busy .v6-ic { animation:none; }
.v6 .v6-tb:is([data-size="xs"],[data-size="xxs"]) .v6-gen { min-width:0; } .v6 .v6-tb:is([data-size="xs"],[data-size="xxs"]) .v6-gen .v6-bl { display:none; }
.v6 .v6-tb[data-size="xs"] .v6-tb-hist { display:none; }
.v6 .v6-tb .h3l-sysmon.v6-mon { all:unset; box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; width:28px; min-width:28px; height:28px; padding:0; border:0; border-radius:var(--v6-r1); position:relative; cursor:default; transition:background-color 120ms; flex:none; }
.v6 .v6-tb .h3l-sysmon.v6-mon:hover { background:rgba(255,255,255,.07); }
.v6 .v6-tb .h3l-sysmon.v6-mon > .v6-ic { color:var(--v6-t2); }
.v6 .v6-tb .h3l-sysmon.v6-mon > :not(.v6-ic):not(.v6-mon-dot) { display:none !important; }
.v6 .v6-tb .v6-mon-dot { position:absolute; right:4px; top:4px; width:6px; height:6px; border-radius:50%; background:transparent; }
.v6 .v6-tb .h3l-sysmon.v6-mon.hot .v6-mon-dot, .v6 .v6-tb .h3l-sysmon.v6-mon.warn .v6-mon-dot { background:var(--v6-warn); }
.v6 .v6-tb .h3l-sysmon.v6-mon.crit .v6-mon-dot { background:var(--v6-err); }
.v6 .v6-actpop .h3l-dyn { margin:0; border:0; background:rgba(0,0,0,.25); border-radius:var(--v6-r2); padding:8px; }
.v6 .v6-actnow { font-size:13px; color:var(--v6-t1); font-variant-numeric:tabular-nums; line-height:1.45; }
.v6 .v6-runs { display:flex; flex-direction:column; margin:0 -4px; }
.v6 .v6-run { display:flex; align-items:center; gap:10px; padding:7px 4px; }
.v6 .v6-run + .v6-run { box-shadow:0 -1px 0 var(--v6-hl); }
.v6 .v6-run-d { width:8px; height:8px; border-radius:50%; background:var(--v6-t4); flex:none; }
.v6 .v6-run-d.done { background:var(--v6-ok); } .v6 .v6-run-d.error { background:var(--v6-err); } .v6 .v6-run-d.running { background:var(--v6-acc); } .v6 .v6-run-d.interrupted { background:var(--v6-warn); }
.v6 .v6-run-t { flex:1; min-width:0; display:flex; flex-direction:column; }
.v6 .v6-run-t b { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-run-t small { font-size:11px; color:var(--v6-t3); }
.v6 .v6-run-tm { font-size:12px; color:var(--v6-t2); font-variant-numeric:tabular-nums; }
.v6 .v6-warnlist { display:flex; flex-direction:column; gap:8px; }
.v6 .v6-warnlist p { font-size:13px; line-height:1.45; color:var(--v6-t1); padding-left:16px; position:relative; }
.v6 .v6-warnlist p::before { content:""; position:absolute; left:2px; top:7px; width:6px; height:6px; border-radius:50%; background:var(--v6-warn); }
.v6 .v6-proj-in { height:32px; font-size:14px; font-weight:600; }
.v6 .v6-proj-meta { font-size:12px; color:var(--v6-t3); margin:-2px 0 4px; }

/* pages */
.v6 .v6-pages { position:relative; min-height:0; overflow:hidden; }
.v6 .v6-page { position:absolute; inset:0; display:none; min-height:0; }
.v6[data-page="edit"] .v6-edit, .v6[data-page="library"] .v6-lib, .v6[data-page="assist"] .v6-ast, .v6[data-page="swap"] .v6-swap { display:grid; }
.v6 .v6-enter { animation:v6-enter var(--v6-d) var(--v6-e); }
/* Character Swap: isolated setup screen; the generated project uses the regular timeline. */
.v6 .v6-swap { overflow:auto; justify-items:center; align-content:start; padding:32px 24px 60px; background:var(--v6-bg); }
.v6 .v6-sw-wrap { width:min(1030px,100%); }
.v6 .v6-sw-card { background:var(--v6-s1); border:1px solid var(--v6-hl); border-radius:18px; padding:28px; box-shadow:var(--v6-shadow); }
.v6 .v6-sw-card h2 { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin:0 0 9px; font-size:22px; }
.v6 .v6-sw-exp { font-size:11px; border:1px solid var(--v6-warn); color:var(--v6-warn); border-radius:12px; padding:3px 8px; font-weight:600; }
.v6 .v6-sw-choices { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; margin:22px 0; }
.v6 .v6-sw-source { min-width:0; display:flex; flex-direction:column; gap:10px; background:var(--v6-s2); border:1px solid var(--v6-hl); border-radius:12px; padding:16px; }
.v6 .v6-sw-source > b { font-size:15px; }
.v6 .v6-sw-field { display:flex; flex-direction:column; gap:7px; min-width:0; font-size:12px; color:var(--v6-t2); }
.v6 .v6-sw-field .v6-in { width:100%; }
/* Windows/Chromium can render native <option> with a light popup and inherited white
   text. Give every Swap selector (both media pickers and segment length) a dark
   native color scheme and explicit option colors, independent of the OS theme. */
.v6 .v6-sw-card select.v6-in { color-scheme:dark; color:var(--v6-t1); background-color:var(--v6-s2); }
.v6 .v6-sw-card select.v6-in option,
.v6 .v6-sw-card select.v6-in optgroup { color-scheme:dark; color:#f2f3f6; background-color:#24262c; }
.v6 .v6-sw-field textarea.v6-in { height:98px; line-height:1.45; resize:vertical; padding:10px; }
/* Swap LoRA browser: dark, bounded and in-flow (no native OS popup covering the screen). */
.v6 .v6-sw-lora-choice { display:flex; width:100%; min-height:49px; align-items:center; justify-content:space-between; gap:12px;
  text-align:left; border:1px solid var(--v6-hl2); border-radius:9px; background:var(--v6-s2); padding:8px 12px;
  color:var(--v6-t1); font:inherit; cursor:pointer; }
.v6 .v6-sw-lora-choice:hover, .v6 .v6-sw-lora-choice[aria-expanded="true"] { border-color:var(--v6-acc); background:var(--v6-s3); }
.v6 .v6-sw-lora-choice-text { min-width:0; display:flex; flex-direction:column; gap:3px; }
.v6 .v6-sw-lora-choice-text b { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; color:var(--v6-t1); }
.v6 .v6-sw-lora-choice-text small { font-size:11px; color:var(--v6-t3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.v6 .v6-sw-lora-chevron { flex:none; font-size:18px; color:var(--v6-t2); }
.v6 .v6-sw-lora-list { max-height:250px; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:4px;
  border:1px solid var(--v6-hl2); border-radius:9px; background:var(--v6-s2); scrollbar-width:thin; scrollbar-color:var(--v6-s4) transparent; }
.v6 .v6-sw-lora-item { display:flex; flex-direction:column; gap:3px; width:100%; min-width:0; padding:8px 11px; border:0;
  border-radius:7px; text-align:left; background:transparent; color:var(--v6-t1); cursor:pointer; font:inherit; }
.v6 .v6-sw-lora-item:hover, .v6 .v6-sw-lora-item:focus-visible { background:var(--v6-s3); }
.v6 .v6-sw-lora-item.on { background:var(--v6-acc-soft); box-shadow:inset 3px 0 var(--v6-acc); }
.v6 .v6-sw-lora-item b { font-size:12.5px; font-weight:600; overflow-wrap:anywhere; }
.v6 .v6-sw-lora-item small { font-size:11px; color:var(--v6-t3); overflow-wrap:anywhere; }
.v6 .v6-sw-lora-empty { padding:12px; color:var(--v6-t3); font-size:12px; }
.v6 .v6-sw-strength-label { display:flex; justify-content:space-between; align-items:center; gap:10px; }
.v6 .v6-sw-strength-value { color:var(--v6-t1); font-size:13px; font-variant-numeric:tabular-nums; }
.v6 .v6-sw-strength { width:100%; min-height:24px; accent-color:var(--v6-acc); cursor:pointer; }
.v6 .v6-sw-preview, .v6 .v6-sw-empty { width:100%; height:195px; border-radius:9px; object-fit:contain; background:#111318; color:var(--v6-t3); }
.v6 .v6-sw-empty { display:flex; align-items:center; justify-content:center; }
.v6 .v6-sw-file { display:flex; gap:8px; }
/* Experimental SAM 3.1 person picker: bounded image and clickable, non-intercepting overlays. */
.v6 .v6-sw-mask-panel { grid-column:1/-1; padding:15px; border:1px solid var(--v6-hl2); border-radius:12px; background:var(--v6-s2); display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
.v6 .v6-sw-mask-panel > b { font-size:14px; }
.v6 .v6-sw-mask-canvas { position:relative; width:min(360px,100%); background:#111318; border:1px solid var(--v6-hl2); border-radius:9px; overflow:hidden; }
.v6 .v6-sw-mask-canvas img { display:block; width:100%; height:auto; cursor:crosshair; }
.v6 .v6-sw-mask-box { position:absolute; border:1.5px solid rgba(60,210,255,.8); color:#fff; font-size:11px; text-shadow:0 0 3px #000; pointer-events:none; }
.v6 .v6-sw-mask-pin { position:absolute; width:17px; height:17px; border:2px solid #fff; border-radius:50%; background:rgba(38,230,111,.65); transform:translate(-50%,-50%); box-shadow:0 0 0 2px #127b43,0 1px 7px #000; pointer-events:none; }
.v6 .v6-sw-mask-actions { display:flex; flex-wrap:wrap; align-items:center; gap:9px; }
.v6 .v6-sw-mask-ok { color:#59daa0; font-weight:600; }
.v6 .v6-sw-mask-error { color:var(--v6-warn); }
.v6 .v6-sw-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:18px; align-items:end; }
.v6 .v6-sw-grid .span, .v6 .v6-sw-check { grid-column:1/-1; }
.v6 .v6-sw-check { display:flex; align-items:center; gap:9px; font-size:13px; }
.v6 .v6-sw-check input { accent-color:var(--v6-acc); }
.v6 .v6-sw-actions { display:flex; align-items:center; justify-content:space-between; gap:22px; margin-top:22px; border-top:1px solid var(--v6-hl); padding-top:22px; }
.v6 .v6-sw-actions p { max-width:65%; }
@media(max-width:850px) { .v6 .v6-sw-choices, .v6 .v6-sw-grid { grid-template-columns:1fr; } .v6 .v6-sw-card { padding:16px; } .v6 .v6-sw-actions { flex-direction:column; align-items:flex-start; } .v6 .v6-sw-actions p { max-width:100%; } }
@keyframes v6-enter { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
html[data-v6][data-v6-motion="reduce"] .v6 .v6-enter { animation:none; }

/* edit page */
.v6 .v6-edit { grid-template-columns:0 0 minmax(0,1fr) 1px var(--insp, 340px); grid-template-rows:minmax(0,1fr) 1px var(--tlh, 300px); grid-template-areas:"d sl v sr i" "st st st st st" "t t t t t"; }
.v6.v6-insp-off .v6-insp, .v6.v6-insp-off .v6-split.v:not(.l) { display:none; }
.v6.v6-dock-off .v6-dock, .v6.v6-dock-off .v6-split.l { display:none; }
.v6 .v6-viewer { grid-area:v; position:relative; display:flex; flex-direction:column; min-width:0; min-height:0; background:var(--v6-win); border:0; border-radius:0; box-shadow:none; padding:0; overflow:hidden; }
.v6 .v6-split { position:relative; z-index:3; background:var(--v6-hl); }
.v6 .v6-split.v { grid-area:sr; cursor:col-resize; } .v6 .v6-split.v.l { grid-area:sl; } .v6 .v6-split.hz { grid-area:st; cursor:row-resize; }
.v6 .v6-split::after { content:""; position:absolute; }
.v6 .v6-split.v::after { top:0; bottom:0; left:-4px; right:-4px; } .v6 .v6-split.hz::after { left:0; right:0; top:-4px; bottom:-4px; }
.v6 .v6-split:hover, .v6 .v6-split.on { background:var(--v6-acc); transition:background-color 120ms 150ms; }
.v6.v6-resizing, .v6.v6-resizing * { user-select:none; }
.v6 .v6-insp { grid-area:i; display:flex; flex-direction:column; min-height:0; min-width:0; background:var(--v6-s1); overflow:hidden; border:0; border-radius:0; box-shadow:none; padding:0; }
.v6 .v6-tl { grid-area:t; display:flex; flex-direction:column; min-height:0; height:auto; background:var(--v6-bg); border:0; border-radius:0; box-shadow:none; padding:0; }
.v6 .v6-vtop { display:flex; align-items:center; gap:12px; height:44px; padding:0 12px; flex:none; }
.v6 .v6-swap-compare { flex:none; height:27px; padding:0 10px; font-size:11.5px; color:var(--v6-t1); background:var(--v6-acc-soft); border:1px solid var(--v6-acc); }
.v6 .v6-swap-compare:hover { background:var(--v6-acc-ring); }
.v6 .v6-vinfo { font-size:12px; color:var(--v6-t3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; min-width:0; }
.v6 .v6-stage { flex:1; min-height:0; display:grid; place-items:center; position:relative; background:transparent; border:0; border-radius:0; }
.v6 .v6-stage > .h3l-frame, .v6 .v6-frame { position:relative; border-radius:4px; overflow:hidden; background:#000; box-shadow:0 0 0 .5px rgba(255,255,255,.08), 0 18px 50px rgba(0,0,0,.55); border:0; }
.v6 .h3l-badge-live { display:none !important; }
.v6 .v6-vempty { position:absolute; inset:0; display:grid; place-items:center; background:radial-gradient(120% 90% at 50% 40%, #1d1d20, #0c0c0d); overflow:hidden; }
.v6 .v6-vempty.has-bg::before { content:""; position:absolute; inset:-24px; background:var(--bg) center/cover no-repeat; filter:blur(24px) saturate(.9) brightness(.4); }
.v6 .v6-vempty-in { position:relative; display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; padding:24px; max-width:420px; }
.v6 .v6-vempty-in > .v6-ic { width:28px; height:28px; color:var(--v6-t3); margin-bottom:6px; }
.v6 .v6-vempty-in > .v6-ic svg { stroke-width:1.4; }
.v6 .v6-vempty-in b { font-size:15px; font-weight:600; letter-spacing:-.01em; }
.v6 .v6-vempty-in span { font-size:13px; color:var(--v6-t2); line-height:1.45; }
.v6 .v6-vempty-in .v6-b { margin-top:10px; }
.v6 .v6-hud { flex:none; display:flex; align-items:center; gap:12px; height:48px; padding:0 10px; margin:0 12px 12px; border-radius:var(--v6-r3); background:var(--v6-s1); box-shadow:0 0 0 .5px var(--v6-hl2); }
.v6 .v6-hud-g { display:flex; align-items:center; gap:2px; flex:none; }
.v6 .v6-play { width:32px !important; height:32px; background:rgba(255,255,255,.08); border-radius:16px; }
.v6 .v6-play .v6-ic { width:16px; height:16px; color:var(--v6-t1) !important; }
.v6 .v6-tc { display:flex; align-items:baseline; gap:4px; font-variant-numeric:tabular-nums; flex:none; min-width:112px; }
.v6 .v6-tc b { font-size:13px; font-weight:600; } .v6 .v6-tc span { font-size:12px; color:var(--v6-t3); }
.v6 .v6-scrub { position:relative; flex:1; min-width:80px; height:28px; cursor:default; touch-action:none; container-type:inline-size; }
.v6 .v6-scrub-tr { position:absolute; left:0; right:0; top:12px; height:4px; border-radius:2px; background:rgba(255,255,255,.22); overflow:hidden; transition:transform 150ms var(--v6-e); }
.v6 .v6-scrub:hover .v6-scrub-tr, .v6 .v6-scrub.on .v6-scrub-tr { transform:scaleY(1.5); }
.v6 .v6-scrub-fl { position:absolute; inset:0; background:var(--v6-acc); transform-origin:left; transform:scaleX(var(--k, 0)); }
.v6 .v6-scrub-th { position:absolute; top:8px; left:0; width:20px; height:12px; margin-left:-10px; border-radius:6px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.45), 0 0 0 .5px rgba(0,0,0,.2); transform:translateX(calc(var(--k, 0) * 100cqw)); }
.v6 .v6-scrub { margin:0 10px; }
.v6 .v6-volbox { display:flex; align-items:center; gap:2px; flex:none; }
.v6 input.v6-vol { width:72px; min-width:56px; flex:none; }
.v6 .v6-dynhold { display:none; }

/* inspector */
.v6 .v6-insp-h { flex:none; padding:10px 12px; box-shadow:inset 0 -1px 0 var(--v6-hl); }
.v6 .v6-insp-b { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; padding:0 0 24px; scrollbar-gutter:stable; }
.v6 .v6-shead { display:flex; align-items:center; gap:8px; padding:12px 8px 6px 16px; }
.v6 .v6-sdot { -webkit-appearance:none; appearance:none; width:16px; height:16px; border-radius:50%; border:0; padding:0; flex:none; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.3), 0 0 0 4px rgba(255,255,255,0); transition:box-shadow 140ms; }
.v6 .v6-sdot:hover { box-shadow:inset 0 0 0 .5px rgba(255,255,255,.3), 0 0 0 4px rgba(255,255,255,.12); }
.v6 .v6-sname { flex:1; min-width:0; height:30px; padding:0 6px; margin-left:-2px; border:0; border-radius:var(--v6-r1); background:transparent; color:var(--v6-t1); font:inherit; font-size:15px; font-weight:600; letter-spacing:-.01em; }
.v6 .v6-sname::placeholder { color:var(--v6-t1); opacity:1; }
.v6 .v6-sname:hover { background:rgba(255,255,255,.05); } .v6 .v6-sname:focus { outline:none; background:rgba(255,255,255,.07); box-shadow:0 0 0 3px var(--v6-acc-ring); }
.v6 .v6-cnt { font-size:12px; color:var(--v6-t3); font-variant-numeric:tabular-nums; flex:none; }
.v6 .v6-colors { display:flex; flex-wrap:wrap; gap:8px; width:176px; }
.v6 .v6-cdot { -webkit-appearance:none; appearance:none; width:28px; height:28px; border-radius:50%; border:0; padding:0; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.25); transition:transform 140ms var(--v6-e); }
.v6 .v6-cdot:hover { transform:scale(1.08); } .v6 .v6-cdot.on { box-shadow:0 0 0 2px rgba(40,40,42,1), 0 0 0 4px #fff; }
.v6 .v6-status-w { padding:2px 12px 6px 16px; }
.v6 .v6-status { display:flex; align-items:center; gap:8px; min-height:32px; padding:0 4px 0 10px; border-radius:var(--v6-r2); background:rgba(255,255,255,.04); }
.v6 .v6-status-d { width:7px; height:7px; border-radius:50%; background:var(--v6-t4); flex:none; }
.v6 .v6-status.is-ok .v6-status-d { background:var(--v6-ok); } .v6 .v6-status.is-stale .v6-status-d { background:var(--v6-warn); } .v6 .v6-status.is-run .v6-status-d { background:var(--v6-acc); }
.v6 .v6-status-t { flex:1; font-size:12px; color:var(--v6-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-sec { display:flex; flex-direction:column; gap:8px; padding:16px 12px 16px 16px; position:relative; }
.v6 .v6-insp-b .v6-sec + .v6-sec::before, .v6 .v6-insp-b .v6-sec + .v6-dis::before, .v6 .v6-insp-b .v6-dis + .v6-dis::before, .v6 .v6-insp-b .v6-dis + .v6-sec::before, .v6 .v6-insp-b .v6-ctx + .v6-sec::before {
  content:""; position:absolute; left:16px; right:0; top:0; height:1px; background:var(--v6-hl); }
.v6 .v6-sec-h { display:flex; align-items:center; gap:8px; min-height:24px; }
.v6 .v6-sec-h h3 { font-size:13px; font-weight:600; color:var(--v6-t1); flex:1; min-width:0; }
.v6 .v6-sec-h .v6-cap { flex:none; }
.v6 .v6-sl { display:flex; align-items:center; gap:10px; }
.v6 .v6-sl .v6-val { min-width:52px; text-align:right; }
.v6 .v6-fld { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:28px; }
.v6 .v6-fld > .v6-lbl { flex:none; }
.v6 .v6-fld > .h3l-sel, .v6 .v6-fld > .v6-in, .v6 .v6-fld > .v6-in-wrap { width:auto; flex:1; max-width:64%; }
.v6 .v6-pair { display:flex; gap:8px; align-items:center; }
.v6 .v6-pair > * { flex:1; min-width:0; }
.v6 .v6-pair > .v6-b { flex:none; }
.v6 .v6-seam { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--v6-t2); }
.v6 .v6-seam i { width:7px; height:7px; border-radius:50%; background:var(--v6-ok); flex:none; }
.v6 .v6-seam.is-soft i { background:var(--v6-warn); } .v6 .v6-seam.is-hard i { background:var(--v6-err); }
.v6 .v6-drift-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
.v6 .v6-drift-stat { min-width:0; display:flex; flex-direction:column; gap:3px; border-radius:var(--v6-r1); background:rgba(255,255,255,.045); padding:8px; }
.v6 .v6-drift-name { font-size:11px; color:var(--v6-t2); }
.v6 .v6-drift-stat strong { font-size:13px; font-variant-numeric:tabular-nums; color:var(--v6-t1); font-weight:600; white-space:nowrap; }
.v6 .v6-refs { display:grid; grid-template-columns:repeat(auto-fill, minmax(56px, 1fr)); gap:8px; border-radius:var(--v6-r2); transition:box-shadow 140ms; }
.v6 .v6-refs.is-over { box-shadow:0 0 0 2px var(--v6-acc); }
.v6 .v6-ref { position:relative; aspect-ratio:1; border-radius:var(--v6-r2); overflow:hidden; background:rgba(255,255,255,.06); display:grid; place-items:center; cursor:default; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08); transition:transform 140ms var(--v6-e); }
.v6 .v6-ref:hover { transform:translateY(-1px); }
.v6 .v6-ref img { width:100%; height:100%; object-fit:cover; display:block; }
.v6 .v6-ref > .v6-ic { width:20px; height:20px; color:var(--v6-t2); }
.v6 .v6-ref-tag { position:absolute; left:4px; bottom:4px; min-width:18px; height:18px; padding:0 5px; border-radius:5px; background:rgba(0,0,0,.66);
  font-size:11px; font-weight:600; line-height:18px; text-align:center; color:#fff; font-variant-numeric:tabular-nums; }
.v6 .v6-ref-x { -webkit-appearance:none; appearance:none; position:absolute; right:3px; top:3px; width:20px; height:20px; border-radius:50%; border:0; padding:4px; background:rgba(0,0,0,.66); color:#fff;
  opacity:0; transform:scale(.85); transition:opacity 120ms, transform 140ms var(--v6-e); }
.v6 .v6-ref-x svg { width:12px; height:12px; display:block; stroke-width:2.2; }
.v6 .v6-ref:hover .v6-ref-x, .v6 .v6-ref:focus-within .v6-ref-x { opacity:1; transform:none; }
.v6 .v6-ref.is-auto { background:rgba(255,255,255,.03); box-shadow:inset 0 0 0 1px rgba(255,255,255,.1); }
.v6 .v6-ref.is-auto img { opacity:.7; }
.v6 .v6-ref.is-over { box-shadow:inset 0 0 0 1.5px var(--v6-err); }
.v6 .v6-ref.is-add { -webkit-appearance:none; appearance:none; border:0; background:transparent; box-shadow:inset 0 0 0 1px rgba(255,255,255,.16); color:var(--v6-t2); }
.v6 .v6-ref.is-add:hover { background:rgba(255,255,255,.06); }
.v6 .v6-chips { display:flex; flex-wrap:wrap; gap:6px; }
.v6 .v6-chip { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 8px 0 4px; border-radius:12px; background:var(--v6-fill); font-size:12px; color:var(--v6-t1); max-width:100%; }
.v6 .v6-chip img { width:18px; height:18px; border-radius:50%; object-fit:cover; }
.v6 .v6-chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.v6 .v6-linkrow { -webkit-appearance:none; appearance:none; display:flex; align-items:center; gap:10px; width:100%; padding:10px; border:0; border-radius:var(--v6-r2); background:rgba(255,255,255,.04); color:var(--v6-t1); font:inherit; text-align:left; cursor:default; transition:background-color 120ms; }
.v6 .v6-linkrow:hover { background:rgba(255,255,255,.07); }
.v6 .v6-linkrow > .v6-ic { color:var(--v6-t2); }
.v6 .v6-linkrow-t { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.v6 .v6-linkrow-t b { font-size:13px; font-weight:500; } .v6 .v6-linkrow-t small { font-size:12px; color:var(--v6-t3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-ctx { position:relative; padding:12px 12px 14px 16px; display:flex; flex-direction:column; gap:10px; background:rgba(255,255,255,.025); box-shadow:inset 0 -1px 0 var(--v6-hl); }
.v6 .v6-dis { padding:0 12px 0 16px; position:relative; }
.v6 .v6-dis > summary { list-style:none; display:flex; align-items:center; gap:6px; height:44px; font-size:13px; font-weight:600; color:var(--v6-t1); cursor:default; }
.v6 .v6-dis > summary::-webkit-details-marker { display:none; }
.v6 .v6-dis > summary .v6-cap { margin-left:auto; font-weight:400; }
.v6 .v6-dis-c { width:14px; height:14px; color:var(--v6-t3); transition:transform 180ms var(--v6-e); }
.v6 .v6-dis[open] > summary .v6-dis-c { transform:rotate(90deg); }
.v6 .v6-dis-b { display:flex; flex-direction:column; gap:12px; padding:0 0 16px; }
.v6 .v6-dis[open] > .v6-dis-b { animation:v6-enter var(--v6-d) var(--v6-e); }
.v6 .v6-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center; padding:40px 24px; color:var(--v6-t2); }
.v6 .v6-empty-ic { width:32px; height:32px; color:var(--v6-t3); margin-bottom:6px; }
.v6 .v6-empty-ic svg { stroke-width:1.3; }
.v6 .v6-empty-t { font-size:15px; font-weight:600; color:var(--v6-t1); }
.v6 .v6-empty-s { font-size:13px; max-width:360px; line-height:1.45; }
.v6 .v6-empty .v6-b { margin-top:10px; }
.v6 .v6-pick { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; }
.v6 .v6-pop:has(> .v6-pick) { overflow:hidden; display:flex; flex-direction:column; }
.v6 .v6-pick-h { display:flex; flex-direction:column; gap:8px; padding:12px 12px 8px; }
.v6 .v6-pick-l { flex:1 1 auto; min-height:0; overflow:auto; display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px 8px; padding:4px 12px 12px; align-content:start; }
.v6 .v6-pick-l > .v6-empty, .v6 .v6-pick-l > p { grid-column:1 / -1; }
.v6 .v6-pick-it { -webkit-appearance:none; appearance:none; position:relative; display:flex; flex-direction:column; gap:4px; padding:0; border:0; background:transparent; color:var(--v6-t1); font:inherit; text-align:left; cursor:default; min-width:0; }
.v6 .v6-pick-it > img, .v6 .v6-pick-it > .v6-pick-ph { width:100%; aspect-ratio:1; height:auto; border-radius:var(--v6-r2); object-fit:cover; background:rgba(255,255,255,.06); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08); transition:box-shadow 140ms, transform 140ms var(--v6-e); display:grid; place-items:center; }
.v6 .v6-pick-ph .v6-ic { width:22px; height:22px; color:var(--v6-t2); }
.v6 .v6-pick-it:hover > img, .v6 .v6-pick-it:hover > .v6-pick-ph { transform:translateY(-1px); }
.v6 .v6-pick-it.on > img, .v6 .v6-pick-it.on > .v6-pick-ph { box-shadow:0 0 0 2px var(--v6-acc); }
.v6 .v6-pick-it > span { font-size:12px; color:var(--v6-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-pick-ck { position:absolute; right:5px; top:5px; width:18px; height:18px; padding:3px; border-radius:50%; background:var(--v6-acc); color:#fff; }
.v6 .v6-pick-ck svg { stroke-width:2.8; }
.v6 .v6-pick-f { display:flex; align-items:center; gap:8px; padding:8px 12px; box-shadow:inset 0 1px 0 var(--v6-hl); }
.v6 .v6-start { align-self:flex-start; margin-left:-8px; }
.v6 .v6-sl .v6-val, .v6 .v6-sl .v6-cap { white-space:nowrap; min-width:64px; text-align:right; flex:none; }
.v6 .v6-linkrow-t small { white-space:normal; line-height:1.4; }
.v6 .v6-insp-b { -webkit-mask-image:none; mask-image:none; }
.v6 .v6-insp-b.has-more { -webkit-mask-image:linear-gradient(#000 calc(100% - 40px), transparent); mask-image:linear-gradient(#000 calc(100% - 40px), transparent); }
.v6 .v6-sec-h + * { margin-top:0; }
html[data-v6] .v6 .v6-insp .h3l-takes { display:flex; flex-direction:column; gap:8px; }
html[data-v6] .v6 .v6-insp .h3l-takes > .h3l-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:0; }
html[data-v6] .v6 .v6-insp .h3l-takes > .h3l-row > .h3l-btn { width:100%; justify-content:center; height:28px; }
/* timeline toolbar + engine lanes, restyled */
.v6 .v6-tlbar { flex:none; display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:12px; height:40px; padding:0 8px 0 10px; box-shadow:inset 0 -1px 0 var(--v6-hl); }
.v6 .v6-tlbar-l, .v6 .v6-tlbar-r { display:flex; align-items:center; gap:2px; min-width:0; }
.v6 .v6-tlbar-r { justify-content:flex-end; gap:6px; }
.v6 .v6-tltc { display:flex; align-items:baseline; gap:8px; font-variant-numeric:tabular-nums; }
.v6 .v6-tltc b { font-size:15px; font-weight:600; letter-spacing:.01em; }
.v6 .v6-tltc span { font-size:11px; color:var(--v6-t3); }
.v6 .v6-lbl-in { font-size:12px; color:var(--v6-t2); }
.v6 .v6-endin { width:76px; height:24px; font-size:12px; text-align:right; padding:0 22px 0 6px; }
.v6 input.v6-zoom { width:96px; min-width:72px; flex:none; }
.v6 .v6-tl .h3l-tl-main { grid-template-columns:136px minmax(0,1fr); }
.v6 .v6-tl .h3l-heads { padding-top:0; background:var(--v6-bg); box-shadow:inset -1px 0 0 var(--v6-hl); position:relative; z-index:2; }
.v6 .v6-tl .h3l-thead { color:var(--v6-t2); font-size:12px; font-weight:500; padding:0 10px 0 12px; gap:8px; }
.v6 .v6-tl .h3l-thead svg { width:14px; height:14px; opacity:.85; }
.v6 .v6-tl .h3l-ruler { border-bottom:0; box-shadow:inset 0 -1px 0 var(--v6-hl); background:var(--v6-bg); }
.v6 .v6-tl .h3l-tick { border-left-color:rgba(255,255,255,.18); }
.v6 .v6-tl .h3l-tick span { font-size:11px; color:var(--v6-t3); }
.v6 .v6-tl .h3l-tick.minor { border-left-color:rgba(255,255,255,.08); }
.v6 .v6-tl .h3l-lane-bg { border-radius:var(--v6-r1); background:rgba(255,255,255,.02); border:0; }
.v6 .v6-tl .h3l-clip { border-radius:var(--v6-r1); background:#2a2a2d; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.14); color:var(--v6-t1); transition:box-shadow 140ms, opacity 140ms; }
.v6 .v6-tl .h3l-clip::after, .v6 .v6-tl .h3l-clip.has-strip::after { content:none; }
.v6 .v6-tl .h3l-clip.has-strip { background:#1a1a1c; }
.v6 .v6-tl .h3l-clip.has-strip::before { background:linear-gradient(180deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,0) 64%, rgba(0,0,0,.6) 100%); }
.v6 .v6-tl .h3l-clip .strip { opacity:.5; }
.v6 .v6-tl .h3l-clip.has-strip .strip { opacity:1; }
.v6 .v6-tl .h3l-clip:hover { box-shadow:inset 0 0 0 .5px rgba(255,255,255,.32); }
.v6 .v6-tl .h3l-clip.sel { box-shadow:inset 0 0 0 2px var(--v6-acc); z-index:3; }
.v6 .v6-tl .h3l-clip.sel::after { display:none; }
.v6 .v6-tl .h3l-clip.dragging { transform:none; box-shadow:inset 0 0 0 2px var(--v6-acc), 0 8px 24px rgba(0,0,0,.5); }
.v6 .v6-tl .h3l-clip.dropover { box-shadow:inset 0 0 0 2px var(--v6-acc); }
.v6 .v6-tl .h3l-clip.running { animation:none; box-shadow:inset 0 0 0 1.5px var(--v6-acc); }
.v6 .v6-tl .h3l-clip .pg i { background:color-mix(in srgb, var(--v6-acc) 22%, transparent); border-right:2px solid var(--v6-acc); }
.v6 .v6-tl .h3l-clip > .c { padding:7px 10px 7px 12px; gap:4px; }
.v6 .v6-tl .h3l-clip .t { font-weight:600; font-size:12px; gap:6px; }
.v6 .v6-tl .h3l-clip .t .n { width:auto; height:auto; background:none; font-size:11px; color:var(--v6-t2); font-weight:600; font-variant-numeric:tabular-nums; }
.v6 .v6-tl .h3l-clip .t .d { background:none; font-size:11px; color:var(--v6-t2); font-weight:500; font-variant-numeric:tabular-nums; padding:0; }
.v6 .v6-tl .h3l-clip .p { display:none; }
.v6 .v6-tl .h3l-clip .rf img { width:20px; height:20px; border-radius:4px; border:0; box-shadow:0 0 0 1.5px rgba(0,0,0,.55); margin-right:3px; }
.v6 .v6-tl .h3l-clip .rf .lk { background:rgba(0,0,0,.4); font-weight:500; font-size:11px; color:var(--v6-t2); border-radius:4px; padding:1px 6px; margin-left:6px; }
.v6 .v6-tl .h3l-clip .bd { right:6px; bottom:6px; font-size:11px; font-weight:500; padding:1px 7px 1px 6px; border-radius:5px; background:rgba(0,0,0,.55); color:var(--v6-t1); }
.v6 .v6-tl .h3l-clip .bd::before { content:""; display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:5px; vertical-align:1px; background:var(--v6-t3); }
.v6 .v6-tl .h3l-clip .bd.ok::before { background:var(--v6-ok); } .v6 .v6-tl .h3l-clip .bd.stale::before, .v6 .v6-tl .h3l-clip .bd.draft::before { background:var(--v6-warn); } .v6 .v6-tl .h3l-clip .bd.cache::before { background:var(--v6-acc); }
.v6 .v6-tl .h3l-clip .bd.draft { color:var(--v6-t1); background:rgba(0,0,0,.55); }
.v6 .v6-tl .h3l-clip .acts { opacity:0; transition:opacity 140ms; }
.v6 .v6-tl .h3l-clip:hover .acts { opacity:1; }
.v6 .v6-tl .h3l-clip .bd { transition:opacity 140ms; } .v6 .v6-tl .h3l-clip:hover .bd { opacity:0; }
.v6 .v6-tl .h3l-clip .h3l-cb { width:24px; height:24px; border-radius:5px; background:rgba(0,0,0,.55); border:0; color:#fff; }
.v6 .v6-tl .h3l-clip .h3l-cb:hover { background:rgba(0,0,0,.75); }
.v6 .v6-tl .h3l-clip .h3l-cb svg { width:13px; height:13px; }
.v6 .v6-tl .h3l-clip .hr::after { background:#fff; width:3px; height:20px; margin-top:-10px; right:3px; }
.v6 .v6-tl .h3l-ext { border-radius:var(--v6-r1); border:1px dashed rgba(255,255,255,.18); background:transparent; color:var(--v6-t3); font-weight:500; font-size:12px; }
.v6 .v6-tl .h3l-ext:hover { background:rgba(255,255,255,.05); border-color:rgba(255,255,255,.3); color:var(--v6-t1); box-shadow:none; }
.v6 .v6-tl .h3l-ext svg { width:18px; height:18px; }
.v6 .v6-tl .h3l-ext small { font-size:11px; font-weight:400; }
.v6 .v6-tl .h3l-phead::before { width:1.5px; left:-.75px; background:var(--v6-acc); box-shadow:none; }
.v6 .v6-tl .h3l-phead::after { background:var(--v6-acc); width:12px; height:14px; left:-6px; top:1px; border-radius:2px; }
.v6 .v6-tl .h3l-cutmark { background:rgba(255,255,255,.4); box-shadow:none; width:2px; }
.v6 .v6-tl .h3l-blend { top:auto; bottom:1px; height:5px; border-radius:3px; box-shadow:none; border:0; background:repeating-linear-gradient(-45deg, rgba(255,255,255,.55) 0 3px, rgba(255,255,255,.12) 3px 6px); }
.v6 .v6-tl .h3l-blend span { display:none; }
.v6 .v6-tl .h3l-vend span { padding:2px 7px; border-radius:4px; font-size:11px; font-weight:600; color:#fff; background:#48484a; border:0; box-shadow:0 1px 3px rgba(0,0,0,.4); }
.v6 .v6-tl .h3l-vend.set span { background:#636366; box-shadow:0 1px 3px rgba(0,0,0,.4); }
.v6 .v6-tl .h3l-beyond { background:rgba(0,0,0,.42); border-left:1px solid rgba(255,255,255,.4); }
.v6 .v6-tl .h3l-clip.is-out { filter:saturate(.3) brightness(.6); }
.v6 .v6-tl .h3l-clip .bd.out { background:rgba(0,0,0,.55); color:var(--v6-t2); }
.v6 .v6-tl .h3l-thead.a, .v6 .v6-tl .h3l-thead.a * { color:var(--v6-t2) !important; }
.v6 .v6-tl .h3l-thead .h3l-btn, .v6 .v6-tl .h3l-thead button { height:22px; min-width:22px; padding:0 5px; border-radius:5px; font-size:11px; background:transparent; }
.v6 .v6-tl .h3l-thead .h3l-btn:hover, .v6 .v6-tl .h3l-thead button:hover { background:rgba(255,255,255,.08); }
.v6 .v6-tlbar .v6-legacy-tool svg, .v6 .v6-tlbar .v6-legacy-tool svg * { stroke:currentColor; }
.v6 .v6-tlbar .v6-legacy-tool [fill]:not([fill="none"]) { fill:currentColor; }
.v6 .v6-tl .h3l-seamq { box-shadow:none !important; border:2px solid var(--v6-bg); }
.v6 .v6-tl .h3l-seamq.ok { background:var(--v6-ok); } .v6 .v6-tl .h3l-seamq.soft { background:var(--v6-warn); } .v6 .v6-tl .h3l-seamq.hard { background:var(--v6-err); }
.v6 .v6-tl .h3l-ins { background:var(--v6-acc); box-shadow:none; width:2px; margin-left:-1px; }
.v6 .v6-tl .h3l-audio { border-radius:5px; font-size:12px; font-weight:500; }
.v6 .v6-tl .h3l-audio.none { background:transparent; border:1px dashed rgba(255,255,255,.12); color:var(--v6-t3); }
.v6 .v6-tl .h3l-audio.reference, .v6 .v6-tl .h3l-audio.locked { background:#2a2a2d; color:var(--v6-t1); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.14); }

/* library page */
.v6 .v6-lib { grid-template-columns:232px minmax(0,1fr); }
.v6 .v6-side { display:flex; flex-direction:column; gap:1px; padding:12px 10px; background:var(--v6-s1); box-shadow:inset -1px 0 0 var(--v6-hl); overflow:auto; }
.v6 .v6-side h5 { font-size:11px; font-weight:600; color:var(--v6-t3); padding:14px 10px 6px; }
.v6 .v6-side h5:first-child { padding-top:4px; }
.v6 .v6-side-it { -webkit-appearance:none; appearance:none; display:flex; align-items:center; gap:10px; height:32px; padding:0 10px; border:0; border-radius:var(--v6-r1); background:transparent; color:var(--v6-t1); font:inherit; font-size:13px; text-align:left; cursor:default; transition:background-color 120ms; flex:none; }
.v6 .v6-side-it > .v6-ic { color:var(--v6-acc); width:17px; height:17px; }
.v6 .v6-side-it > span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.v6 .v6-side-it > small { font-size:12px; color:var(--v6-t3); font-variant-numeric:tabular-nums; }
.v6 .v6-side-it:hover { background:rgba(255,255,255,.05); }
.v6 .v6-side-it.on { background:var(--v6-sel); }
.v6 .v6-side-it[hidden] { display:none; }
.v6 .v6-lib-main { display:flex; flex-direction:column; min-width:0; min-height:0; background:var(--v6-bg); }
.v6 .v6-lib-h { display:flex; align-items:center; gap:12px; padding:20px 24px 12px; flex:none; flex-wrap:wrap; }
.v6 .v6-lib-h > div:first-child { flex:1; min-width:200px; }
.v6 .v6-lib-h h2 { font-size:22px; font-weight:700; letter-spacing:-.02em; }
.v6 .v6-lib-h p { font-size:13px; color:var(--v6-t2); margin-top:2px; }
.v6 .v6-lib-h .v6-search { width:220px; flex:none; }
.v6 .v6-lib-tools { display:flex; align-items:center; gap:8px; padding:0 24px 12px; flex:none; }
.v6 .v6-lib-body { flex:1; min-height:0; overflow:auto; padding:4px 24px 24px; position:relative; }
.v6 .v6-lib-body.is-over { box-shadow:inset 0 0 0 2px var(--v6-acc); }
.v6 .v6-mgrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:24px 16px; }
.v6 .v6-mcard { position:relative; display:flex; flex-direction:column; gap:8px; cursor:default; border-radius:var(--v6-r3); outline:none; min-width:0; }
.v6 .v6-mthumb { position:relative; aspect-ratio:4/3; border-radius:var(--v6-r2); overflow:hidden; background:var(--v6-s2); display:grid; place-items:center; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08); transition:transform 180ms var(--v6-e), box-shadow 140ms; }
.v6 .v6-mthumb img, .v6 .v6-mthumb video { width:100%; height:100%; object-fit:cover; display:block; }
.v6 .v6-mthumb-ic { width:34px; height:34px; color:var(--v6-t3); }
.v6 .v6-mthumb-ic svg { stroke-width:1.3; }
.v6 .v6-mcard:hover .v6-mthumb { transform:translateY(-2px); box-shadow:0 10px 24px rgba(0,0,0,.4), inset 0 0 0 .5px rgba(255,255,255,.12); }
.v6 .v6-mcard:focus-visible { box-shadow:none; } .v6 .v6-mcard:focus-visible .v6-mthumb { box-shadow:0 0 0 3px var(--v6-acc-ring); }
.v6 .v6-mcard.is-used .v6-mthumb { box-shadow:inset 0 0 0 .5px rgba(255,255,255,.12); }
.v6 .v6-mcap { display:flex; flex-direction:column; gap:1px; padding:0 2px; min-width:0; }
.v6 .v6-mcap b { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-mcap span { font-size:12px; color:var(--v6-t3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-mbadge { position:absolute; left:8px; top:8px; display:inline-flex; align-items:center; gap:4px; height:20px; padding:0 7px 0 5px; border-radius:10px; background:rgba(0,0,0,.6); color:#fff; font-size:11px; font-weight:600; }
.v6 .v6-mbadge .v6-ic { width:12px; height:12px; color:var(--v6-ok); } .v6 .v6-mbadge svg { stroke-width:2.6; }
.v6 .v6-mdur { position:absolute; right:8px; bottom:8px; height:18px; padding:0 6px; border-radius:5px; background:rgba(0,0,0,.6); font-size:11px; font-variant-numeric:tabular-nums; line-height:18px; }
.v6 .v6-mmore { position:absolute !important; right:6px; top:6px; background:rgba(0,0,0,.6) !important; opacity:0; transition:opacity 120ms; }
.v6 .v6-mplay { position:absolute !important; left:50%; top:50%; width:40px !important; height:40px !important; padding:0 !important; border-radius:50% !important; transform:translate(-50%, -50%); background:rgba(0,0,0,.55) !important; box-shadow:0 0 0 .5px rgba(255,255,255,.18), 0 4px 14px rgba(0,0,0,.35); opacity:.9; transition:opacity 120ms, transform 160ms var(--v6-e), background 120ms; z-index:2; }
.v6 .v6-mplay .v6-ic { width:18px; height:18px; }
.v6 .v6-mcard.is-aud .v6-mthumb-ic { opacity:.35; }
.v6 .v6-mcard:hover .v6-mplay, .v6 .v6-mplay:focus-visible { opacity:1; transform:translate(-50%, -50%) scale(1.08); background:rgba(0,0,0,.72) !important; }
.v6 .v6-mplay.is-playing { opacity:1; background:var(--v6-acc) !important; box-shadow:0 0 0 4px var(--v6-acc-ring, rgba(10,132,255,.3)); }
.v6 .v6-mcard.is-playing .v6-mthumb { box-shadow:inset 0 0 0 1.5px var(--v6-acc); }
.v6 .v6-mcard:hover .v6-mmore, .v6 .v6-mcard:focus-within .v6-mmore { opacity:1; }
.v6 .v6-mmore .v6-ic, .v6 .v6-mplay .v6-ic { color:#fff !important; }

/* assistant page */
.v6 .v6-ast { grid-template-columns:minmax(0,1fr); background:var(--v6-bg); }
.v6 .v6-ast-host { display:flex; justify-content:center; min-height:0; min-width:0; padding:0 24px; overflow:hidden; }
.v6 .v6-ast-host > * { width:100%; max-width:860px; height:100%; min-height:0; }

/* settings window */
.v6 .v6-prefs { width:min(1040px, 90vw, calc(100% - 48px)); height:min(760px, 88vh, calc(100% - 48px)); }
.v6 .v6-prefs-in { display:grid; grid-template-columns:232px minmax(0,1fr); height:100%; }
.v6 .v6-pside { display:flex; flex-direction:column; gap:1px; padding:16px 10px; background:var(--v6-s2); box-shadow:inset -1px 0 0 var(--v6-hl); overflow:auto; }
.v6 .v6-pside > .v6-search, .v6 .v6-pside > .v6-in { margin:0 0 10px; flex:none; }
.v6 .v6-pside-sep { height:1px; margin:6px 10px; background:var(--v6-hl); flex:none; }
.v6 .v6-pside .v6-side-it { height:30px; gap:9px; padding:0 8px; }
.v6 .v6-pside .v6-side-it > .v6-ic { width:22px; height:22px; padding:4px; border-radius:6px; background:var(--pc, #636366); color:#fff; box-shadow:inset 0 .5px 0 rgba(255,255,255,.25); }
.v6 .v6-pmain { display:flex; flex-direction:column; min-width:0; min-height:0; background:var(--v6-s1); }
.v6 .v6-phead { display:flex; align-items:center; gap:12px; height:52px; padding:0 12px 0 28px; flex:none; box-shadow:inset 0 -1px 0 var(--v6-hl); }
.v6 .v6-phead h2 { font-size:15px; font-weight:600; letter-spacing:-.01em; flex:1; min-width:0; }
.v6 .v6-pbody { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
.v6 .v6-pform { max-width:720px; margin:0 auto; padding:24px 32px 32px; display:flex; flex-direction:column; gap:24px; }
.v6 .v6-grp { display:flex; flex-direction:column; gap:6px; }
.v6 .v6-grp-t { font-size:13px; font-weight:600; color:var(--v6-t1); padding:0 4px; }
.v6 .v6-grp-b { border-radius:var(--v6-r3); background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06); }
.v6 .v6-grp-f { font-size:12px; color:var(--v6-t3); padding:2px 4px 0; line-height:1.45; }
.v6 .v6-row { display:flex; align-items:center; gap:12px; min-height:44px; padding:8px 12px; position:relative; }
.v6 .v6-row + .v6-row::before { content:""; position:absolute; left:12px; right:0; top:0; height:1px; background:var(--v6-hl); }
.v6 .v6-row.is-stack { flex-direction:column; align-items:stretch; gap:10px; padding:12px; }
.v6 .v6-row-ic { width:20px; height:20px; color:var(--v6-t2); flex:none; display:grid; place-items:center; } .v6 .v6-row-ic svg { width:18px; height:18px; }
.v6 .v6-row-l { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.v6 .v6-row-t { font-size:13px; color:var(--v6-t1); }
.v6 .v6-row-s { font-size:12px; color:var(--v6-t3); line-height:1.4; }
.v6 .v6-row-c { flex:none; display:flex; align-items:center; gap:8px; max-width:62%; }
.v6 .v6-row.is-stack .v6-row-c { max-width:none; }
.v6 .v6-row-c .h3l-sel { min-width:200px; }
.v6 .v6-pform .v6-row-c .v6-b.is-sm, .v6 .v6-pform .v6-row-c .v6-b { height:28px; padding:0 14px; font-size:13px; }
.v6 .v6-pform .v6-b.is-danger { background:transparent; color:#ff6961; box-shadow:inset 0 0 0 1px rgba(255,105,97,.45); font-weight:500; }
.v6 .v6-pform .v6-b.is-danger:hover:not(:disabled) { background:rgba(255,69,58,.14); }
.v6 .v6-pform .v6-row { min-height:48px; }
.v6 .v6-keys { display:inline-flex; align-items:center; gap:4px; }
.v6 .v6-help { display:flex; flex-direction:column; border-radius:var(--v6-r3); background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06); }
.v6 .v6-help .v6-dis { padding:0 14px; }
.v6 .v6-help .v6-dis + .v6-dis { box-shadow:0 -1px 0 var(--v6-hl); }
.v6 .v6-help-b { font-size:13px; line-height:1.55; color:var(--v6-t2); padding:0 0 16px 20px; }
.v6 .v6-help-b b, .v6 .v6-help-b strong { color:var(--v6-t1); font-weight:600; }
.v6 .v6-help-b p { margin:0 0 8px; } .v6 .v6-help-b ul { margin:0 0 8px; padding-left:18px; }
.v6 .v6-about { display:flex; align-items:center; gap:16px; padding:8px 4px 4px; }
.v6 .v6-about-mark, .v6 .v6-wmark { width:64px; height:64px; border-radius:16px; display:grid; place-items:center; font-size:24px; font-weight:800; letter-spacing:-.04em; color:#fff; flex:none;
  background:linear-gradient(160deg,#4d4d52,#1f1f22); box-shadow:inset 0 .5px 0 rgba(255,255,255,.3), 0 8px 24px rgba(0,0,0,.45); }
.v6 .v6-about h2 { font-size:20px; font-weight:700; letter-spacing:-.02em; } .v6 .v6-about p { font-size:13px; color:var(--v6-t2); margin-top:2px; }
.v6 .v6-prose { padding:12px 14px; display:flex; flex-direction:column; gap:8px; font-size:13px; line-height:1.55; color:var(--v6-t2); }
.v6 .v6-scope-note { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--v6-t2); padding:6px 6px 6px 12px; border-radius:var(--v6-r2); background:rgba(255,255,255,.04); }
.v6 .v6-scope-note .v6-ic { color:var(--v6-t3); }
.v6 .v6-scope-note span { flex:1; }

/* welcome + palette */
.v6 .v6-wwin { width:min(560px, calc(100% - 48px)); }
.v6 .v6-welcome { display:flex; flex-direction:column; align-items:center; text-align:center; padding:36px 36px 20px; gap:12px; }
.v6 .v6-welcome h1 { font-size:22px; font-weight:700; letter-spacing:-.02em; margin-top:6px; }
.v6 .v6-wsub { font-size:13px; line-height:1.5; color:var(--v6-t2); max-width:420px; }
.v6 .v6-wfeat { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; width:100%; margin:8px 0 2px; }
.v6 .v6-wf { display:flex; flex-direction:column; align-items:center; gap:4px; padding:14px 8px 12px; border-radius:var(--v6-r3); background:rgba(255,255,255,.04); }
.v6 .v6-wf .v6-ic { width:22px; height:22px; color:var(--v6-acc); margin-bottom:4px; }
.v6 .v6-wf b { font-size:13px; font-weight:600; } .v6 .v6-wf span { font-size:12px; color:var(--v6-t3); line-height:1.35; }
.v6 .v6-wstatus { display:flex; align-items:center; gap:12px; width:100%; padding:10px 10px 10px 14px; border-radius:var(--v6-r3); background:rgba(255,255,255,.04); text-align:left; }
.v6 .v6-wstatus > .v6-ic { width:20px; height:20px; padding:3px; border-radius:50%; background:var(--v6-ok); color:#000; }
.v6 .v6-wstatus > .v6-ic svg { stroke-width:2.6; }
.v6 .v6-wstatus.is-warn > .v6-ic, .v6 .v6-wstatus.is-unk > .v6-ic { background:transparent; color:var(--v6-warn); padding:0; }
.v6 .v6-wstatus > div { flex:1; display:flex; flex-direction:column; gap:1px; min-width:0; }
.v6 .v6-wstatus b { font-size:13px; font-weight:600; } .v6 .v6-wstatus span { font-size:12px; color:var(--v6-t3); }
.v6 .v6-wlinks { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:2px; }
.v6 .v6-wlink { display:inline-flex; align-items:center; gap:8px; height:30px; padding:0 12px; border-radius:15px; background:var(--v6-fill); color:var(--v6-t1); font-size:13px; font-weight:500; text-decoration:none; transition:background-color 120ms, transform 120ms var(--v6-e); }
.v6 .v6-wlink:hover { background:var(--v6-fill2); } .v6 .v6-wlink:active { transform:scale(.97); }
.v6 .v6-wlink .v6-ic { width:15px; height:15px; color:var(--v6-t1); }
.v6 .v6-wfoot { display:flex; align-items:center; gap:12px; width:100%; margin-top:14px; padding-top:16px; box-shadow:0 -1px 0 var(--v6-hl); }
.v6 .v6-wfoot .v6-b { min-width:110px; height:30px; }
.v6 .v6-scrim:has(.v6-palwin) { background:rgba(0,0,0,.25); place-items:start center; }
.v6 .v6-palwin { width:min(620px, calc(100% - 48px)); margin-top:12vh; background:rgb(38,38,40);  }
.v6 .v6-pal-h { display:flex; align-items:center; gap:10px; height:52px; padding:0 14px 0 16px; box-shadow:inset 0 -1px 0 var(--v6-hl); }
.v6 .v6-pal-h > .v6-ic { width:18px; height:18px; color:var(--v6-t3); }
.v6 .v6-pal-q { flex:1; height:40px; border:0; background:transparent; color:var(--v6-t1); font:inherit; font-size:17px; outline:none; }
.v6 .v6-pal-q:focus-visible { box-shadow:none; }
.v6 .v6-pal-q::placeholder { color:var(--v6-t3); }
.v6 .v6-pal-l { max-height:min(420px, 56vh); overflow:auto; padding:6px; }
.v6 .v6-pal-g { font-size:11px; font-weight:600; color:var(--v6-t3); padding:8px 10px 4px; }
.v6 .v6-pal-it { -webkit-appearance:none; appearance:none; display:flex; align-items:center; gap:10px; width:100%; height:36px; padding:0 10px; border:0; border-radius:var(--v6-r2); background:transparent; color:var(--v6-t1); font:inherit; font-size:13px; text-align:left; cursor:default; }
.v6 .v6-pal-it .v6-ic { color:var(--v6-t2); }
.v6 .v6-pal-it > span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.v6 .v6-pal-it.is-kb { background:var(--v6-acc); color:var(--v6-acc-ink); } .v6 .v6-pal-it.is-kb .v6-ic { color:var(--v6-acc-ink); }
.v6 .v6-pal-it.is-kb .v6-kbd { background:rgba(255,255,255,.2); color:inherit; }
.v6 .v6-pal-it:disabled { color:var(--v6-t4); }
.v6 .v6-pal-none { padding:24px; text-align:center; color:var(--v6-t3); }
.v6 .v6-tlbar .v6-legacy-tool { -webkit-appearance:none; appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; height:28px; min-width:28px; padding:0 8px; border:0; border-radius:var(--v6-r1); background:transparent; box-shadow:none;
  font:inherit; font-size:12.5px; font-weight:500; color:var(--v6-t2); white-space:nowrap; cursor:default; transition:background-color 120ms, color 120ms; }
.v6 .v6-tlbar .v6-legacy-tool:hover { background:rgba(255,255,255,.07); color:var(--v6-t1); }
.v6 .v6-tlbar .v6-legacy-tool.on, .v6 .v6-tlbar .v6-legacy-tool.active { background:var(--v6-sel); color:#fff; }
.v6 .v6-tlbar .v6-legacy-tool svg { width:15px; height:15px; color:inherit; }
.v6 .v6-tlbar .v6-legacy-tool b, .v6 .v6-tlbar .v6-legacy-tool span { color:inherit !important; }
.v6 .v6-tlbar .v6-reghint { font-size:12px; color:var(--v6-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; padding:0 8px; }
.v6 .v6-tl .h3l-ovl { top:0; bottom:0; border-radius:var(--v6-r1); background:linear-gradient(90deg, rgba(0,0,0,.28), rgba(0,0,0,0)); border:0; box-shadow:none; }
.v6 .v6-tl .h3l-ovl::after { content:""; position:absolute; left:0; right:0; bottom:0; height:4px; border-radius:0 0 0 var(--v6-r1); background:repeating-linear-gradient(-45deg, rgba(255,255,255,.6) 0 3px, rgba(255,255,255,.12) 3px 6px); }
.v6 .v6-tl .h3l-ovl > span { display:none; }
.v6 .v6-tl .h3l-ovl:hover { background:linear-gradient(90deg, rgba(255,255,255,.1), rgba(255,255,255,0)); }
.v6 .v6-tl .h3l-arow { font-size:12px; padding:0 6px 0 12px; gap:6px; }
.v6 .v6-tl .h3l-arow .nm { font-weight:500; } .v6 .v6-tl .h3l-arow .nm.music { color:var(--v6-t2); }
.v6 .v6-tl .h3l-spk { border:0; background:transparent; border-radius:5px; width:24px; height:22px; color:var(--v6-t2); }
.v6 .v6-tl .h3l-spk:hover { background:rgba(255,255,255,.08); color:var(--v6-t1); }
.v6 .v6-tl .h3l-seam > span { display:none; }
.v6 .v6-ptitle { font-size:15px; font-weight:600; letter-spacing:-.01em; margin:0; flex:1; min-width:0; }
.v6 .v6-pside .v6-side-it[data-id="general"] { --pc:#8e8e93; } .v6 .v6-pside .v6-side-it[data-id="appearance"] { --pc:#3a3a3c; }
.v6 .v6-pside .v6-side-it[data-id="generation"] { --pc:#bf5af2; } .v6 .v6-pside .v6-side-it[data-id="hires"] { --pc:#8c6aff; } .v6 .v6-pside .v6-side-it[data-id="upscale"] { --pc:#30b0c7; }
.v6 .v6-pside .v6-side-it[data-id="ext"] { --pc:#ff9f0a; } .v6 .v6-pside .v6-side-it[data-id="preview"] { --pc:#34c759; }
.v6 .v6-pside .v6-side-it[data-id="models"] { --pc:#5e5ce6; } .v6 .v6-pside .v6-side-it[data-id="downloads"] { --pc:#0a84ff; }
.v6 .v6-pside .v6-side-it[data-id="assistant"] { --pc:#ff375f; } .v6 .v6-pside .v6-side-it[data-id="keys"] { --pc:#636366; }
.v6 .v6-pside .v6-side-it[data-id="help"] { --pc:#0a84ff; } .v6 .v6-pside .v6-side-it[data-id="about"] { --pc:#8e8e93; }
.v6 .v6-pside .v6-side-it[data-id="appearance"] > .v6-ic { box-shadow:inset 0 0 0 .5px rgba(255,255,255,.3); }
.v6 .v6-tlbar:is([data-size="s"],[data-size="xs"]) .v6-lbl-in { display:none; }
.v6 .v6-tlbar:is([data-size="s"],[data-size="xs"]) .v6-legacy-tool { font-size:0; gap:0; padding:0; width:28px; }
.v6 .v6-tlbar:is([data-size="s"],[data-size="xs"]) .v6-legacy-tool > :not(.v6-ic) { display:none; }
.v6 .v6-tlbar[data-size="xs"] .v6-tlbar-l > .v6-b.is-tinted .v6-bl { display:none; }
.v6 .v6-tlbar[data-size="xs"] input.v6-zoom { display:none; }
.v6 .v6-tlbar[data-size="xs"] .v6-tlbar-l .v6-vsep { display:none; }
.v6 .v6-tl .h3l-audio.none { container-type:inline-size; overflow:hidden; }
.v6 .v6-tl .h3l-audio.none > span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
@container (max-width: 560px) { .v6 .v6-tl .h3l-audio.none > span { visibility:hidden; } }

/* neutral graphite lanes: colour is reserved for selection and status dots */
.v6 .v6-tl .h3l-clip:hover { background:#2f2f33; }
.v6 .v6-tl .h3l-alane, .v6 .v6-tl .h3l-alane.music { background:rgba(255,255,255,.025); border:1px dashed rgba(255,255,255,.1); }
.v6 .v6-tl .h3l-alane > span { color:var(--v6-t3); }
.v6 .v6-tl .h3l-audio.clip, .v6 .v6-tl .h3l-audio.clip.music { background:#2a2a2d; border-color:rgba(255,255,255,.14); color:var(--v6-t1); }
.v6 .v6-tl .h3l-arow .nm.music { color:var(--v6-t2); }
.v6 .v6-tl .h3l-track.a.dropover .h3l-alane { background:color-mix(in srgb, var(--v6-acc) 10%, transparent); border-color:var(--v6-acc); }
.v6 .v6-mdrop { -webkit-appearance:none; appearance:none; border:0; padding:0; background:none; color:var(--v6-t3); font:inherit; cursor:pointer; text-align:center; }
.v6 .v6-mdrop .v6-mthumb { background:transparent; box-shadow:none; border:1.5px dashed rgba(255,255,255,.16); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:12px; font-size:12px; line-height:1.4; }
.v6 .v6-mdrop .v6-ic { width:22px; height:22px; color:var(--v6-t3); }
.v6 .v6-mdrop:hover .v6-mthumb { border-color:var(--v6-acc); color:var(--v6-t1); transform:none; box-shadow:none; }
.v6 .v6-lib-body.is-over .v6-mdrop .v6-mthumb { border-color:var(--v6-acc); background:color-mix(in srgb, var(--v6-acc) 8%, transparent); }
.v6 .v6-mcap b { font-size:13px; } .v6 .v6-mcap span { font-size:12px; }
/* ============================================================ engine panels inside the new frame */
html[data-v6] .h3l-root.v6 .h3l-glass:not(.h3l-monpop):not(.h3l-pop):not(.h3l-tpop):not(.h3l-regpop):not(.pe-confirm):not(.h3l-hover), html[data-v6] .h3l-root.v6 .h3l-panel { background:transparent; border:0; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none; }
html[data-v6] .h3l-root.v6::before, html[data-v6] .h3l-root.v6::after { display:none !important; }
html[data-v6] .v6 .h3l-btn, html[data-v6] .h3l-lp .h3l-btn, html[data-v6] .h3l-pe-modal .h3l-btn { height:28px; padding:0 10px; border:0; border-radius:var(--v6-r1); background:var(--v6-fill); color:var(--v6-t1); font:inherit; font-weight:500; font-size:13px; box-shadow:none; text-shadow:none; transition:background-color 120ms, transform 120ms var(--v6-e); }
html[data-v6] .v6 .h3l-btn::before, html[data-v6] .v6 .h3l-btn::after { display:none; }
html[data-v6] .v6 .h3l-btn:hover:not(:disabled) { background:var(--v6-fill2); border:0; transform:none; box-shadow:none; }
html[data-v6] .v6 .h3l-btn:active:not(:disabled) { transform:scale(.97); }
html[data-v6] .v6 .h3l-btn.sm { height:24px; padding:0 8px; font-size:12px; }
html[data-v6] .v6 .h3l-btn.icon { width:28px; padding:0; } html[data-v6] .v6 .h3l-btn.sm.icon { width:24px; }
html[data-v6] .v6 .h3l-btn.primary, html[data-v6] .h3l-pe-modal .h3l-btn.primary { background:var(--v6-acc); color:var(--v6-acc-ink); font-weight:600; }
html[data-v6] .v6 .h3l-btn.primary:hover:not(:disabled) { background:color-mix(in srgb, var(--v6-acc) 88%, #fff); filter:none; }
html[data-v6] .v6 .h3l-btn.ghost { background:transparent; } html[data-v6] .v6 .h3l-btn.ghost:hover:not(:disabled) { background:rgba(255,255,255,.07); }
html[data-v6] .v6 .h3l-btn.danger { background:var(--v6-fill); color:#ff6961; }
html[data-v6] .v6 .h3l-btn.danger:hover:not(:disabled) { background:color-mix(in srgb, var(--v6-err) 22%, transparent); }
html[data-v6] .v6 .h3l-btn svg { width:15px; height:15px; }
html[data-v6] .v6 .h3l-btn:disabled { opacity:.38; }
html[data-v6] .v6 .h3l-pills { display:inline-flex; flex-wrap:wrap; gap:0; padding:2px; border-radius:var(--v6-r2); background:var(--v6-fill); border:0; box-shadow:none; }
html[data-v6] .v6 .h3l-pill { height:24px; padding:0 10px; display:inline-flex; align-items:center; gap:6px; border-radius:6px; font-size:12.5px; font-weight:500; color:var(--v6-t2); background:transparent; border:0; box-shadow:none; cursor:default; transition:color 120ms, background-color 160ms; text-transform:none; letter-spacing:0; }
html[data-v6] .v6 .h3l-pill:hover:not(.on):not(.dis):not(:disabled) { color:var(--v6-t1); background:transparent; }
html[data-v6] .v6 .h3l-pill.on { background:#636366; color:#fff; box-shadow:0 1px 1px rgba(0,0,0,.3), inset 0 .5px 0 rgba(255,255,255,.14); }
html[data-v6] .v6 .h3l-pill.dis, html[data-v6] .v6 .h3l-pill:disabled { opacity:.4; }
html[data-v6] .v6 .h3l-sel, html[data-v6] .v6 select.h3l-sel { height:28px; border:0; border-radius:var(--v6-r1); background-color:rgba(255,255,255,.06); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.1); color:var(--v6-t1); font:inherit; font-size:13px; }
html[data-v6] .v6 .h3l-sel:hover { background-color:rgba(255,255,255,.08); }
html[data-v6] .v6 .h3l-sel.sm { height:24px; font-size:12px; }
html[data-v6] .v6 .h3l-tog { gap:12px; font-size:13px; color:var(--v6-t1); }
html[data-v6] .v6 .h3l-tog i, html[data-v6] .v6 .h3l-sw i { width:34px; height:20px; border-radius:10px; background:var(--v6-fill2); border:0; box-shadow:none; }
html[data-v6] .v6 .h3l-tog i::after, html[data-v6] .v6 .h3l-sw i::after { width:16px; height:16px; top:2px; left:2px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.35); }
html[data-v6] .v6 .h3l-tog.on i, html[data-v6] .v6 .h3l-sw.on i { background:var(--v6-acc); }
html[data-v6] .v6 .h3l-lbl { font-size:12px; font-weight:500; color:var(--v6-t2); text-transform:none; letter-spacing:0; }
html[data-v6] .v6 .h3l-lbl em { font-style:normal; color:var(--v6-t3); font-size:12px; }
html[data-v6] .v6 .h3l-note { font-size:12px; color:var(--v6-t2); line-height:1.45; }
html[data-v6] .v6 .h3l-note.h3l-ast-launch-st.warn { color:#ff6b5e; font-weight:600; }
html[data-v6] .v6 .h3l-note.h3l-ast-launch-st.ok { color:#34d399; font-weight:600; }
html[data-v6] .v6 .h3l-val { font-variant-numeric:tabular-nums; color:var(--v6-t1); }
html[data-v6] .v6 .h3l-card { background:rgba(255,255,255,.03); border:0; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06); border-radius:var(--v6-r2); }
html[data-v6] .v6 .h3l-card-h h4 { font-size:13px; font-weight:600; text-transform:none; letter-spacing:0; color:var(--v6-t1); }
html[data-v6] .v6 .h3l-det { background:transparent; border:0; border-radius:0; box-shadow:none; }
html[data-v6] .v6 .h3l-det > summary { font-size:13px; font-weight:600; color:var(--v6-t1); text-transform:none; letter-spacing:0; }
html[data-v6] .v6 .h3l-ph { border:0; padding:0; background:none; }
html[data-v6] .v6 .h3l-ph h3 { font-size:15px; font-weight:600; text-transform:none; letter-spacing:-.01em; color:var(--v6-t1); }
html[data-v6] .v6 .h3l-chip { border-radius:12px; background:var(--v6-fill); border:0; font-size:12px; }
html[data-v6] .v6 .h3l-status { border:0; border-radius:var(--v6-r2); background:rgba(255,255,255,.04); color:var(--v6-t2); }
html[data-v6] .v6 .h3l-take, html[data-v6] .v6 .h3l-take-row { border-radius:var(--v6-r2); }
/* settings: engine groups as inset grouped lists */
.v6 .v6-legacy-b { display:flex; flex-direction:column; gap:12px; padding:14px; }
.v6 .v6-legacy-b > .h3l-note:first-child { margin-top:-2px; }
.v6 .v6-legacy-loose { display:flex; flex-direction:column; gap:10px; }
.v6 .v6-pform .h3l-grid2, .v6 .v6-pform .h3l-grid3 { gap:12px; }
.v6 .v6-pform .h3l-row { gap:8px; flex-wrap:wrap; }
.v6 .v6-legacy.h3l-panel { display:flex; flex-direction:column; gap:16px; padding:0; }
.v6 .v6-legacy.h3l-panel > .h3l-ph { display:none; }
.v6 .v6-legacy .h3l-scroll { overflow:visible; max-height:none; padding:0; }
.v6 .v6-pform .h3l-mdl-group { border-radius:var(--v6-r3); background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06); border:0; overflow:hidden; }
.v6 .v6-pform .h3l-mdl-row { border:0; background:transparent; border-radius:0; }
.v6 .v6-pform .h3l-mdl-row + .h3l-mdl-row { box-shadow:0 -1px 0 var(--v6-hl); }
.v6 .v6-pform .h3l-mdl-gtitle { font-size:13px; font-weight:600; text-transform:none; letter-spacing:0; color:var(--v6-t1); }
/* library: engine panels */
.v6 .v6-lib-body .h3l-ph h3 { display:none; }
.v6 .v6-lib-body .h3l-scroll { overflow:visible; max-height:none; padding:0; }
.v6 .v6-lib-body .h3l-cgrid, .v6 .v6-lib-body .h3l-ggrid { grid-template-columns:repeat(auto-fill, minmax(176px, 1fr)) !important; gap:16px !important; }
.v6 .v6-lib-body .h3l-gal { display:flex; flex-direction:column; gap:12px; min-height:0; }
.v6 .v6-lib-body .h3l-ggrid { align-content:start; overflow:visible; max-height:none; }
.v6 .v6-lib-body .h3l-ccard, .v6 .v6-lib-body .h3l-gcard, .v6 .v6-lib-body .h3l-pcard { border-radius:var(--v6-r2); border:0; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08); background:var(--v6-s2); }
.v6 .v6-lib-body .h3l-ccard:hover, .v6 .v6-lib-body .h3l-gcard:hover, .v6 .v6-lib-body .h3l-pcard:hover { box-shadow:0 10px 24px rgba(0,0,0,.4), inset 0 0 0 .5px rgba(255,255,255,.12); transform:none; }
.v6 .v6-lib-body .h3l-pcard.on, .v6 .v6-lib-body .h3l-pcur { box-shadow:inset 0 0 0 2px var(--v6-acc); }
.v6 .v6-lib-body .h3l-gempty, .v6 .v6-lib-body .h3l-cempty { border:0; background:none; color:var(--v6-t2); }
/* engine menus, themed selects, light-pickers */
html[data-v6] .h3l-menu { background:rgb(40,40,42) !important;  border:0 !important; border-radius:var(--v6-r3) !important;
  box-shadow:var(--v6-sh2) !important; padding:5px !important; font-family:var(--v6-font) !important; font-size:13px !important; color:var(--v6-t1); }
html[data-v6] .h3l-menu .it { border-radius:5px !important; min-height:28px; font-size:13px !important; color:var(--v6-t1); background:transparent; }
html[data-v6] .h3l-menu .it:hover:not(.dis), html[data-v6] .h3l-menu .it.kb, html[data-v6] .h3l-menu .it.act { background:var(--v6-acc) !important; color:var(--v6-acc-ink) !important; }
html[data-v6] .h3l-menu .it.on:not(:hover) { color:var(--v6-t1); background:transparent; }
html[data-v6] .h3l-menu .it svg { color:inherit; opacity:.85; }
html[data-v6] .h3l-menu .sep { background:var(--v6-hl) !important; margin:5px 8px !important; }
html[data-v6] .h3l-menu .hd { color:var(--v6-t3) !important; font-size:11px !important; font-weight:600; text-transform:none !important; letter-spacing:0 !important; }
html[data-v6] .h3l-lp { background:rgba(40,40,42,.94) !important; border:0 !important; border-radius:var(--v6-r3) !important; box-shadow:var(--v6-sh2) !important; font-family:var(--v6-font); }
/* LoRA picker search: ONE focus ring, on the rounded row (scheme accent), kept inside the popover padding; the field draws none */
html[data-v6] .h3l-lp .top { margin:10px 10px 6px; padding:0 10px; height:30px; border:0; border-radius:var(--v6-r2); background:var(--v6-fill); box-shadow:none; transition:box-shadow .12s, background .12s; }
html[data-v6] .h3l-lp .top:focus-within { border:0; background:rgba(255,255,255,.08); box-shadow:0 0 0 3px var(--v6-acc-ring), inset 0 0 0 .5px var(--v6-acc); }
html[data-v6] .h3l-lp .top svg { color:var(--v6-t3); }
html[data-v6] .h3l-lp input.q, html[data-v6] .h3l-lp input.q:focus, html[data-v6] .h3l-lp input.q:focus-visible { outline:none; box-shadow:none; background:transparent; height:100%; padding:0; color:var(--v6-t1); }
html[data-v6] .h3l-root .h3l-modal { background:rgba(0,0,0,.42); -webkit-backdrop-filter:none; backdrop-filter:none; }
html[data-v6] .h3l-root .h3l-modal > :not(.h3l-pe) { border-radius:var(--v6-r4) !important; background:var(--v6-s1) !important; border:0 !important; box-shadow:0 30px 90px rgba(0,0,0,.6), 0 0 0 .5px rgba(255,255,255,.14) !important; }
html[data-v6] .h3l-pe-modal .h3l-pe, html[data-v6] .h3l-root .h3l-pe { background:var(--v6-s1) !important; border:0 !important; border-radius:var(--v6-r4) !important; box-shadow:0 30px 90px rgba(0,0,0,.6), 0 0 0 .5px rgba(255,255,255,.14) !important; }
html[data-v6] .h3l-root.v6 > .h3l-tip, html[data-v6] body > .h3l-tip { display:none !important; }
/* assistant internals */
.v6 .v6-ast-host .h3l-ast-panel { background:transparent; border:0; box-shadow:none; }
.v6 .v6-ast-host .h3l-ast-bubble { border-radius:var(--v6-r3); }
.v6 .v6-ast-host .h3l-ast-compose { border-radius:var(--v6-r3); background:var(--v6-s1); box-shadow:0 0 0 .5px var(--v6-hl2); border:0; }
.v6 .v6-lib-acts { display:flex; align-items:center; gap:8px; flex:none; flex-wrap:wrap; justify-content:flex-end; }
.v6 .v6-lib-acts .v6-search { width:240px; }
.v6 .v6-lib-body > .h3l-chars, .v6 .v6-lib-body > .h3l-gal { display:flex; flex-direction:column; gap:12px; }
.v6 .v6-lib-body .h3l-gempty, .v6 .v6-lib-body .h3l-cempty { grid-column:1 / -1; max-width:440px; margin:56px auto; padding:0; text-align:center; font-size:13px; line-height:1.5; color:var(--v6-t2); }
.v6 .v6-lib-body .h3l-note.tgt { color:var(--v6-t3); }
.v6 .v6-lib-body .h3l-pcur { display:grid; grid-template-columns:200px minmax(0,1fr); grid-template-rows:auto auto 1fr; column-gap:16px; row-gap:6px; padding:12px; border-radius:var(--v6-r3); background:rgba(255,255,255,.04); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06); border:0; }
.v6 .v6-lib-body .h3l-pcur > .pv { grid-row:1 / span 3; border-radius:var(--v6-r2); overflow:hidden; aspect-ratio:16/9; position:relative; background:var(--v6-s2); }
.v6 .v6-lib-body .h3l-pcur > .pv img { width:100%; height:100%; object-fit:cover; display:block; }
.v6 .v6-lib-body .h3l-pcur > .pv .k { position:absolute; left:6px; top:6px; height:18px; padding:0 6px; border-radius:5px; background:rgba(0,0,0,.6); font-size:11px; line-height:18px; }
.v6 .v6-lib-body .h3l-pcur > .h3l-in { font-size:15px; font-weight:600; height:32px; max-width:none; }
.v6 .v6-lib-body .h3l-pcur > .h3l-row { align-self:end; gap:8px; }
.v6 .v6-lib-body > .h3l-gal > .h3l-lbl { font-size:13px; font-weight:600; color:var(--v6-t1); margin-top:12px; }
.v6 .v6-lib-body > .h3l-chars, .v6 .v6-lib-body > .h3l-gal { padding:0; margin:0; }
.v6 .v6-lib-body > * > .h3l-pills { align-self:flex-start; }
/* assistant page: one calm column */
.v6 .v6-ast-host .h3l-ast-panel { gap:0; padding:0; }
.v6 .v6-ast-host .h3l-ast-panel > .h3l-ph { display:flex; align-items:center; gap:12px; padding:20px 0 12px; margin:0; flex:none; }
.v6 .v6-ast-host .h3l-ast-panel > .h3l-ph h3 { font-size:22px; font-weight:700; letter-spacing:-.02em; flex:1; }
.v6 .v6-ast-host .h3l-ast-titlerow { display:flex; align-items:center; gap:6px; }
.v6 .v6-ast-host .h3l-ast-status { height:28px; padding:0 10px; border-radius:14px; border:0; background:var(--v6-fill); color:var(--v6-t1); font:inherit; font-size:12px; display:inline-flex; align-items:center; gap:6px; }
.v6 .v6-ast-host .h3l-ast-status:hover { background:var(--v6-fill2); }
.v6 .v6-ast-host .h3l-ast-dot { width:7px; height:7px; border-radius:50%; background:var(--v6-t4); box-shadow:none; }
.v6 .v6-ast-host .h3l-ast-status.ok .h3l-ast-dot { background:var(--v6-ok); }
.v6 .v6-ast-host .h3l-ast-status.err .h3l-ast-dot, .v6 .v6-ast-host .h3l-ast-status.off .h3l-ast-dot { background:var(--v6-err); }
.v6 .v6-ast-host .h3l-ast-moderow, .v6 .v6-ast-host .h3l-ast-histrow { display:flex; align-items:center; gap:10px; padding:4px 0; flex:none; }
.v6 .v6-ast-host .h3l-ast-moderow > .h3l-lbl, .v6 .v6-ast-host .h3l-ast-histrow > .h3l-lbl { width:56px; flex:none; font-size:12px; }
.v6 .v6-ast-host .h3l-ast-moderow > .h3l-sel, .v6 .v6-ast-host .h3l-ast-histrow > .h3l-sel { flex:1; max-width:none; }
.v6 .v6-ast-host .h3l-ast-histrow { padding-bottom:12px; box-shadow:inset 0 -1px 0 var(--v6-hl); }
.v6 .v6-ast-host .h3l-ast-histacts { display:flex; gap:2px; }
.v6 .v6-ast-host .h3l-ast-histacts .h3l-btn { background:transparent; }
.v6 .v6-ast-host .h3l-ast-histacts .h3l-btn:hover { background:rgba(255,255,255,.07); }
.v6 .v6-ast-host .h3l-ast-panel > .h3l-scroll { padding:16px 0; overflow:auto; }
.v6 .v6-ast-host .h3l-ast-log { display:flex; flex-direction:column; gap:18px; }
.v6 .v6-ast-host .h3l-ast-msg { background:transparent !important; box-shadow:none !important; border:0 !important; padding:0 !important; max-width:100%; }
.v6 .v6-ast-host .h3l-ast-msg > .h3l-card-h { font-size:12px; font-weight:600; color:var(--v6-t3); margin:0 0 4px; padding:0; }
.v6 .v6-ast-host .h3l-ast-msg.user { align-self:flex-end; max-width:76%; }
.v6 .v6-ast-host .h3l-ast-msg.user > .h3l-card-h { display:none; }
.v6 .v6-ast-host .h3l-ast-msg.user .h3l-ast-content { background:var(--v6-s3); border-radius:18px 18px 4px 18px; padding:9px 14px; }
.v6 .v6-ast-host .h3l-ast-content { font-size:13.5px; line-height:1.55; color:var(--v6-t1); }
.v6 .v6-ast-host .h3l-ast-content blockquote { margin:8px 0; padding:8px 12px; border-left:2px solid var(--v6-hl2); background:rgba(255,255,255,.03); border-radius:0 8px 8px 0; color:var(--v6-t2); }
.v6 .v6-ast-host .h3l-ast-content code { font-size:12px; padding:1px 5px; border-radius:4px; background:rgba(255,255,255,.08); }
.v6 .v6-ast-host .h3l-ast-content .h3l-row { margin-top:10px; gap:6px; }
.v6 .v6-ast-host .h3l-ast-compose { flex:none; margin:4px 6px 20px; width:auto !important; max-width:calc(100% - 12px); box-sizing:border-box; padding:10px; display:flex; flex-direction:column; gap:8px; border-radius:var(--v6-r3); background:var(--v6-s1); box-shadow:0 0 0 .5px var(--v6-hl2), 0 8px 30px rgba(0,0,0,.25); border:0; }
.v6 .v6-ast-host .h3l-ast-compose:focus-within { box-shadow:0 0 0 .5px var(--v6-hl2), 0 0 0 3px var(--v6-acc-ring); }
.v6 .v6-ast-host .h3l-ast-input { background:transparent !important; box-shadow:none !important; min-height:44px; padding:4px 6px; font-size:14px; }
.v6 .v6-ast-host .h3l-ast-input:focus { box-shadow:none !important; }
.v6 .v6-ast-host .h3l-ast-toolbar { display:flex; align-items:center; gap:8px; }
.v6 .v6-ast-host .h3l-ast-tools { display:flex; align-items:center; gap:4px; flex:1; min-width:0; }
.v6 .v6-ast-host .h3l-ast-tools .h3l-pill { height:26px; padding:0 10px; border-radius:13px; background:var(--v6-fill); color:var(--v6-t2); }
.v6 .v6-ast-host .h3l-ast-tools .h3l-pill:hover { color:var(--v6-t1); background:var(--v6-fill2); }
.v6 .v6-ast-host .h3l-ast-tools .h3l-pill.on { background:var(--v6-sel); color:#fff; }
.v6 .v6-ast-host .h3l-ast-tools > .h3l-btn { background:transparent; }
.v6 .v6-ast-host .h3l-ast-send { height:28px; padding:0 14px; border-radius:14px; }
html[data-v6] .v6 .h3l-tog i::after, html[data-v6] .v6 .h3l-sw i::after { left:2px !important; transition:transform 200ms var(--v6-e); }
html[data-v6] .v6 .h3l-tog.on i::after, html[data-v6] .v6 .h3l-sw.on i::after { transform:translateX(14px); }
html[data-v6] .v6 .h3l-tog i, html[data-v6] .v6 .h3l-sw i { transition:background-color 180ms var(--v6-e); }
html[data-v6] .v6 .h3l-pills > .h3l-pill { justify-content:center; }
html[data-v6] .v6 .h3l-btn > .v6-gic { width:14px; height:14px; margin-right:2px; color:inherit; opacity:.9; }
html[data-v6] .v6 .h3l-btn.icon > .v6-gic { margin:0; }
html[data-v6] .v6 .h3l-pill > .v6-gic { width:14px; height:14px; margin-right:4px; color:inherit; }
html[data-v6] .v6 .h3l-pill.icon > .v6-gic { margin:0; }
/* hit targets ≥ 28px without changing the visual size */
.v6 .v6-seg-it, .v6 .v6-ref-x, .v6 .v6-sdot, html[data-v6] .v6 .h3l-spk { position:relative; }
.v6 .v6-seg-it::after { content:""; position:absolute; inset:-3px 0; }
.v6 .v6-ref-x::after, .v6 .v6-sdot::after { content:""; position:absolute; inset:-6px; border-radius:50%; }
html[data-v6] .v6 .h3l-spk::after { content:""; position:absolute; inset:-3px -2px; }
html[data-v6][data-v6-motion="reduce"] .v6 *:not(.v6-spin):not(.sp), html[data-v6][data-v6-motion="reduce"] .v6 *:not(.v6-spin)::before, html[data-v6][data-v6-motion="reduce"] .v6 *::after { transition-duration:1ms !important; animation:none !important; }
@media (prefers-reduced-motion: reduce) { html[data-v6] .v6 *:not(.v6-spin):not(.sp), html[data-v6] .v6 *:not(.v6-spin)::before, html[data-v6] .v6 *::after { transition-duration:1ms !important; animation:none !important; } }
/* engine rules use "transition:.15s" (all properties): restrict to compositor-friendly ones so nothing animates layout */
html[data-v6] .v6 [class*="h3l-"], html[data-v6] .v6 [class*="h3l-"]::before, html[data-v6] .v6 [class*="h3l-"]::after, html[data-v6] .v6 [class*="h3l-"] > * { transition-property:opacity, transform, background-color, color, border-color, box-shadow, fill, stroke; }

/* loading indicators: one cheap rotate loop, only while the busy state exists; decorative pulses are off */
html[data-v6] .v6 .h3l-clip.running, html[data-v6] .v6 .h3l-volume .h3l-btn.warn, html[data-v6] .v6 .h3l-region.running .core { animation:none; }
.v6 .v6-spin::before { content:""; display:block; width:12px; height:12px; border-radius:50%; border:1.75px solid currentColor; border-top-color:transparent; animation:v6-spin .8s linear infinite; }
.v6 .v6-gen.is-busy .v6-ic { display:grid; place-items:center; } .v6 .v6-gen.is-busy .v6-ic svg { display:none; }
.v6 .v6-gen.is-busy .v6-ic::before { content:""; width:12px; height:12px; border-radius:50%; border:1.75px solid currentColor; border-top-color:transparent; animation:v6-spin .8s linear infinite; }
html[data-v6] .v6 .h3l-ast-status.busy .h3l-ast-dot { background:transparent !important; border:1.5px solid currentColor; border-top-color:transparent; border-radius:50%; animation:v6-spin .8s linear infinite; box-shadow:none !important; }
.v6 .v6-act-warn { width:auto !important; min-width:24px; padding:0 4px !important; gap:2px; }
.v6 .v6-act-wn { font-size:11px; font-weight:600; color:var(--v6-warn); font-variant-numeric:tabular-nums; }
.v6 .v6-act-wn:empty { display:none; }
html[data-v6][data-v6-motion="reduce"] .v6 .v6-gen.is-busy .v6-ic::before, html[data-v6][data-v6-motion="reduce"] .v6 .h3l-ast-status.busy .h3l-ast-dot { animation:v6-spin 1.6s linear infinite !important; }
@media (prefers-reduced-motion: reduce) { html[data-v6] .v6 .v6-gen.is-busy .v6-ic::before, html[data-v6] .v6 .h3l-ast-status.busy .h3l-ast-dot { animation:v6-spin 1.6s linear infinite !important; } }
.v6 .v6-lib-body .v6-empty { max-width:440px; margin:12vh auto 0; }
.v6 .v6-empty-note { margin-top:8px; padding-top:8px; box-shadow:0 -1px 0 var(--v6-hl); }
.v6 .v6-lib-body .v6-empty { grid-column:1 / -1; justify-self:center; width:100%; }
.v6 .v6-pform .v6-btnrow { display:flex; flex-wrap:wrap; gap:8px; }
.v6 .v6-pform .v6-btnrow > .h3l-btn { width:auto; flex:none; height:28px; padding:0 12px; }
.v6 .v6-pform .h3l-mdl-head { display:flex; align-items:center; gap:8px; }
.v6 .v6-pform .h3l-mdl-head > div:first-child { flex:1; display:flex; align-items:center; gap:8px; }
.v6 .v6-pform .h3l-mdl-count { font-size:12px; color:var(--v6-t3); background:none; padding:0; font-variant-numeric:tabular-nums; }
/* ---------- v6c: left dock (Media | Gallery) */
.v6 .v6-dock { grid-area:d; display:flex; flex-direction:column; min-width:0; min-height:0; background:var(--v6-s1); overflow:hidden; }
.v6 .v6-dock-h { display:flex; align-items:center; gap:8px; height:44px; padding:0 8px 0 12px; flex:none; }
.v6 .v6-dock-h .v6-seg { flex:1; min-width:0; }
.v6 .v6-dock-b { flex:1; min-height:0; overflow:auto; padding:0 12px 16px; outline:none; scrollbar-width:thin; }
.v6 .v6-dock-b.is-over { box-shadow:inset 0 0 0 2px var(--v6-acc-ring); border-radius:var(--v6-r2); }
.v6 .v6-dock-tools { display:flex; align-items:center; gap:8px; padding:4px 0 8px; position:sticky; top:0; z-index:2; background:var(--v6-s1); }
.v6 .v6-dock-tools .v6-search { flex:1; min-width:0; height:28px; }
.v6 .v6-dock-tools .v6-muted { font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.v6 .v6-dock-sec { display:flex; align-items:baseline; gap:6px; margin:12px 0 8px; font-size:11px; font-weight:600; color:var(--v6-t2); letter-spacing:.02em; }
.v6 .v6-dock-sec small { font-size:11px; color:var(--v6-t3); font-weight:500; font-variant-numeric:tabular-nums; }
.v6 .v6-dock-load { display:flex; align-items:center; gap:8px; padding:24px 4px; color:var(--v6-t2); }
.v6 .v6-dock-b .v6-empty { padding:32px 8px; }
.v6 .v6-dgrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(104px, 1fr)); gap:12px 8px; }
.v6 .v6-dgrid.is-aud { grid-template-columns:1fr; gap:4px; }
.v6 .v6-dcard { position:relative; display:flex; flex-direction:column; gap:6px; min-width:0; border-radius:var(--v6-r2); outline:none; cursor:grab; }
.v6 .v6-dcard:active { cursor:grabbing; }
.v6 .v6-dthumb { position:relative; aspect-ratio:16/10; border-radius:var(--v6-r2); overflow:hidden; background:var(--v6-s3); display:grid; place-items:center; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08); transition:box-shadow 140ms var(--v6-e); }
.v6 .v6-dthumb img { width:100%; height:100%; object-fit:cover; display:block; }
.v6 .v6-dthumb > .v6-ic { width:24px; height:24px; color:var(--v6-t3); }
.v6 .v6-dcard:hover .v6-dthumb { box-shadow:inset 0 0 0 1px rgba(255,255,255,.22); }
.v6 .v6-dcard:focus-visible { box-shadow:none; } .v6 .v6-dcard:focus-visible .v6-dthumb { box-shadow:0 0 0 3px var(--v6-acc-ring); }
.v6 .v6-dcard.is-used .v6-dthumb { box-shadow:inset 0 0 0 2px var(--v6-acc); }
.v6 .v6-dused { position:absolute; top:6px; right:6px; width:18px; height:18px; border-radius:9px; background:var(--v6-acc); display:grid; place-items:center; }
.v6 .v6-dused .v6-ic { width:12px; height:12px; color:#fff; }
.v6 .v6-dthumb .v6-mdur { position:absolute; right:6px; bottom:6px; padding:1px 6px; border-radius:4px; background:rgba(0,0,0,.66); font-size:11px; font-variant-numeric:tabular-nums; color:#fff; }
.v6 .v6-dcap { display:flex; flex-direction:column; min-width:0; padding:0 2px; }
.v6 .v6-dcap b { font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--v6-t1); }
.v6 .v6-dcap span { font-size:11px; color:var(--v6-t3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
/* audio files: one row each (waveform icon + name + length) */
.v6 .v6-dgrid.is-aud .v6-dcard { flex-direction:row; align-items:center; gap:8px; padding:4px; border-radius:var(--v6-r2); }
.v6 .v6-dgrid.is-aud .v6-dcard:hover { background:rgba(255,255,255,.05); }
.v6 .v6-dgrid.is-aud .v6-dthumb { width:40px; height:28px; aspect-ratio:auto; flex:none; border-radius:var(--v6-r1); }
.v6 .v6-dgrid.is-aud .v6-dthumb .v6-mdur { display:none; }
.v6 .v6-dgrid.is-aud .v6-dthumb > .v6-ic { width:18px; height:18px; }
.v6 .v6-dgrid.is-aud .v6-dcap { flex:1; }
.v6 .v6-dock-btn.is-on { background:var(--v6-sel); } .v6 .v6-dock-btn.is-on .v6-ic { color:var(--v6-t1); }

/* ---------- quick preview over the player */
.v6 .v6-qp { position:absolute; inset:0; z-index:20; display:flex; flex-direction:column; background:rgba(10,10,11,.96); opacity:0; transform:scale(.985); transition:opacity var(--v6-d) var(--v6-e), transform var(--v6-d) var(--v6-e); }
.v6 .v6-qp.on { opacity:1; transform:none; }
.v6 .v6-qp-h { display:flex; align-items:center; gap:8px; height:44px; padding:0 8px 0 16px; flex:none; box-shadow:inset 0 -1px 0 var(--v6-hl); }
.v6 .v6-qp-h b { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.v6 .v6-qp-h .v6-muted { font-size:12px; }
.v6 .v6-qp-m { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; padding:16px; }
.v6 .v6-qp-m img, .v6 .v6-qp-m video { max-width:100%; max-height:100%; min-width:0; min-height:0; object-fit:contain; border-radius:var(--v6-r2); background:#000; display:block; }
.v6 .v6-qp-aud { display:flex; flex-direction:column; align-items:center; gap:16px; color:var(--v6-t2); }
.v6 .v6-qp-aud > .v6-ic { width:48px; height:48px; }

/* ---------- checkbox (the one checkbox of the kit) */
.v6 .v6-chk { -webkit-appearance:none; appearance:none; display:inline-flex; align-items:center; gap:8px; min-height:28px; padding:0 4px; border:0; background:transparent; color:var(--v6-t1); font:inherit; font-size:13px; cursor:default; border-radius:var(--v6-r1); position:relative; flex:none; }
.v6 .v6-chk-b { width:16px; height:16px; border-radius:4px; display:grid; place-items:center; background:rgba(255,255,255,.06); box-shadow:inset 0 0 0 1px rgba(255,255,255,.34); transition:background-color 140ms var(--v6-e), box-shadow 140ms var(--v6-e); flex:none; }
.v6 .v6-chk-b svg { width:12px; height:12px; stroke:#fff; stroke-width:2.6; opacity:0; transform:scale(.6); transition:opacity 140ms var(--v6-e), transform 140ms var(--v6-e); }
.v6 .v6-chk.on .v6-chk-b { background:var(--v6-acc); box-shadow:none; }
.v6 .v6-chk.on .v6-chk-b svg { opacity:1; transform:none; }
.v6 .v6-chk:hover .v6-chk-b { box-shadow:inset 0 0 0 1px rgba(255,255,255,.5); } .v6 .v6-chk.on:hover .v6-chk-b { box-shadow:none; filter:brightness(1.08); }
.v6 .v6-chk.is-mini { gap:4px; padding:0 4px; min-height:24px; font-size:11px; font-weight:600; color:var(--v6-t2); letter-spacing:.02em; }
.v6 .v6-chk.is-mini::after { content:""; position:absolute; inset:-2px -2px; }
.v6 .v6-chk.is-mini.on { color:var(--v6-t1); }
.v6 .v6-lockrow { display:flex; flex-direction:column; gap:4px; margin-top:8px; }
.v6 .v6-lockrow .v6-note { margin:0 0 0 28px; }
.v6 .v6-atrk-pick { display:flex; flex-direction:column; gap:8px; grid-column:1 / -1; margin:4px 0 8px; }
.v6 .v6-atrk { display:flex; flex-direction:column; gap:8px; }
.v6 .v6-atrk .v6-shead { display:flex; align-items:center; gap:8px; }
.v6 .v6-atrk-n { flex:1; min-width:0; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* ---------- track heads (video rows + audio rows) */
.v6 .v6-tl .h3l-tl-main { grid-template-columns:176px minmax(0,1fr); }
.v6 .v6-tl .h3l-thead.v.v6-vheads { display:block; height:calc(var(--video-h,110px) + 8px); padding:0; }
.v6 .v6-tl .h3l-thead.a.v6-aheads { display:block; padding:0; }
.v6 .v6-vhead { display:flex; align-items:center; gap:8px; padding:0 6px 0 12px; border-radius:0 var(--v6-r1) var(--v6-r1) 0; color:var(--v6-t2); outline:none; cursor:default; min-width:0; }
.v6 .v6-vhead:hover { background:rgba(255,255,255,.04); }
.v6 .v6-vhead:focus-visible { box-shadow:inset 0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-vhead.is-sel { background:var(--v6-sel); color:var(--v6-t1); }
.v6 .v6-vhead-k { flex:none; min-width:24px; height:20px; padding:0 4px; border-radius:4px; display:grid; place-items:center; background:rgba(255,255,255,.07); font-size:11px; font-weight:600; color:var(--v6-t1); font-variant-numeric:tabular-nums; }
.v6 .v6-vhead-n { flex:1; min-width:0; font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-vhead .v6-chk { margin-left:auto; }

/* ---------- video rows */
.v6 .v6-tl .h3l-track.v.v6-vt .v6-vlane { position:absolute; left:0; right:0; border-radius:var(--v6-r1); background:rgba(255,255,255,.018); pointer-events:none; transition:background-color 120ms; }
.v6 .v6-tl .h3l-track.v.v6-vt .v6-vlane.is-drop { background:color-mix(in srgb, var(--v6-acc) 10%, transparent); box-shadow:inset 0 0 0 1px var(--v6-acc-ring); }
.v6 .v6-tl.v6-multi .h3l-track.v .h3l-lane-bg { display:none; }
.v6 .v6-tl .h3l-track.v.v6-vt > .h3l-ovl { display:none; }
.v6 .v6-dropind { position:absolute; width:2px; margin-left:-1px; border-radius:1px; background:var(--v6-acc); z-index:9; pointer-events:none; box-shadow:0 0 0 3px color-mix(in srgb, var(--v6-acc) 25%, transparent); }
/* overlap band: one element over both clips, its length in seconds */
.v6 .v6-ovb { position:absolute; z-index:5; border-radius:var(--v6-r1); pointer-events:auto; cursor:pointer;
  background:repeating-linear-gradient(-45deg, rgba(255,255,255,.22) 0 2px, rgba(255,255,255,0) 2px 7px); box-shadow:inset 0 0 0 1px rgba(255,255,255,.28); }
.v6 .v6-ovb.is-window, .v6 .v6-ovb.is-both { background:repeating-linear-gradient(-45deg, color-mix(in srgb, var(--v6-acc) 55%, transparent) 0 2px, color-mix(in srgb, var(--v6-acc) 12%, transparent) 2px 7px); box-shadow:inset 0 0 0 1px var(--v6-acc); }
.v6 .v6-ovb.is-both { opacity:.75; }
.v6 .v6-ovb.is-sel { box-shadow:inset 0 0 0 2px var(--v6-acc); }
.v6 .v6-ovb-t { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); padding:1px 6px; border-radius:4px; background:rgba(0,0,0,.78); color:#fff; font-size:11px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; pointer-events:none; }

/* ---------- audio rows: one kind of track; locked tracks get a small accent mark */
.v6 .v6-tl .h3l-track.a.v6-at .v6-alane { position:absolute; left:0; right:0; border-radius:var(--v6-r1); background:rgba(255,255,255,.025); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06); }
.v6 .v6-tl .h3l-track.a.v6-at .v6-alane.is-drop { background:color-mix(in srgb, var(--v6-acc) 10%, transparent); box-shadow:inset 0 0 0 1px var(--v6-acc-ring); }
.v6 .v6-alane-h { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--v6-t3); white-space:nowrap; pointer-events:none; }
.v6 .v6-tl .h3l-audio.clip, .v6 .v6-tl .h3l-audio.clip.music { background:#2a2a2d; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.14); }
.v6 .v6-tl .h3l-audio.clip.is-lock { box-shadow:inset 3px 0 0 var(--v6-acc), inset 0 0 0 .5px rgba(255,255,255,.14); }
.v6 .v6-tl .h3l-audio.clip.sel { box-shadow:inset 0 0 0 2px var(--v6-acc); }
.v6 .v6-chk .v6-chk-b svg { width:12px !important; height:12px !important; opacity:0 !important; }
.v6 .v6-chk.on .v6-chk-b svg { opacity:1 !important; }
.v6 .v6-anchor { position:absolute; width:0; height:0; pointer-events:none; }
/* audio clip card (engine block) inside the v6 inspector: one header, label / field rows that never overflow */
.v6 .v6-ctx .h3l-card.h3l-glass { background:transparent; border:0; box-shadow:none; padding:0; margin:0; }
.v6 .v6-ctx .h3l-card-h { display:none; }
.v6 .v6-ctx .h3l-afile { display:flex; align-items:center; gap:8px; padding:8px; border-radius:var(--v6-r2); background:var(--v6-s2); margin-bottom:8px; min-width:0; }
.v6 .v6-ctx .h3l-afile b { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; }
.v6 .v6-ctx .h3l-afile > div { min-width:0; }
.v6 .v6-ctx .h3l-arows { display:flex; flex-direction:column; gap:8px; }
.v6 .v6-ctx .h3l-arows .h3l-field { display:grid; grid-template-columns:minmax(0,1fr) 112px; align-items:center; gap:8px; min-height:28px; }
.v6 .v6-ctx .h3l-arows .h3l-lbl { display:flex; align-items:baseline; gap:6px; min-width:0; font-size:12px; color:var(--v6-t2); white-space:nowrap; overflow:hidden; }
.v6 .v6-ctx .h3l-arows .h3l-lbl em { font-style:normal; font-size:11px; color:var(--v6-t3); overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-ctx .h3l-arows .h3l-in { width:100%; min-width:0; box-sizing:border-box; height:28px; text-align:right; font-variant-numeric:tabular-nums; }
.v6 .v6-ctx .h3l-arows .h3l-in.ro { display:flex; align-items:center; justify-content:flex-end; padding:0 8px; color:var(--v6-t2); }
.v6 .v6-ovinfo { display:flex; gap:8px; align-items:flex-start; padding:8px; border-radius:var(--v6-r2); background:var(--v6-s2); margin-top:4px; }
.v6 .v6-ovinfo-sw { flex:none; width:16px; height:16px; margin-top:1px; border-radius:4px; background:repeating-linear-gradient(-45deg, rgba(255,255,255,.4) 0 2px, rgba(255,255,255,.06) 2px 5px); box-shadow:inset 0 0 0 1px rgba(255,255,255,.3); }
.v6 .v6-ovinfo.is-window .v6-ovinfo-sw, .v6 .v6-ovinfo.is-both .v6-ovinfo-sw { background:repeating-linear-gradient(-45deg, color-mix(in srgb, var(--v6-acc) 80%, transparent) 0 2px, color-mix(in srgb, var(--v6-acc) 15%, transparent) 2px 5px); box-shadow:inset 0 0 0 1px var(--v6-acc); }
.v6 .v6-ovinfo > div { display:flex; flex-direction:column; gap:2px; min-width:0; }
.v6 .v6-ovinfo b { font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; }
.v6 .v6-ovinfo span { font-size:12px; color:var(--v6-t2); }
.v6 .v6-fld-col .v6-seg { flex:0 1 200px; min-width:0; }
.v6 .v6-tl .h3l-heads-inner { padding-top:36px; }
/* v6d: clip chrome never sits under an overlap band */
.v6 .v6-tl .h3l-clip.v6-has-ovr .t, .v6 .v6-tl .h3l-clip.v6-has-ovr .p, .v6 .v6-tl .h3l-clip.v6-has-ovr .rf { margin-right:var(--ovr, 0px); }
.v6 .v6-tl .h3l-clip.v6-has-ovr .bd, .v6 .v6-tl .h3l-clip.v6-has-ovr .acts { margin-right:var(--ovr, 0px); }
/* v6d: per-track listen switch in audio heads */
.v6 .v6-amute { -webkit-appearance:none; appearance:none; position:relative; flex:none; width:24px; height:24px; margin-left:auto; display:grid; place-items:center; border:0; border-radius:5px; background:transparent; color:var(--v6-t2); cursor:default; padding:0; }
.v6 .v6-amute::after { content:""; position:absolute; inset:-2px; }
.v6 .v6-amute .v6-ic { width:14px; height:14px; }
.v6 .v6-amute:hover { background:rgba(255,255,255,.08); color:var(--v6-t1); }
.v6 .v6-amute:focus-visible { outline:none; box-shadow:0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-amute.is-off { color:#ff9f0a; }
.v6 .v6-vhead .v6-amute + .v6-chk { margin-left:0; }
.v6 .v6-ahead.is-mute .v6-vhead-n { color:var(--v6-t3); }
.v6 .v6-tl .h3l-audio.clip.is-mute { opacity:.45; }
/* v6d: calmer overlap bands, one badge */
.v6 .v6-ovb { background:repeating-linear-gradient(-45deg, rgba(255,255,255,.14) 0 1px, rgba(255,255,255,0) 1px 6px), rgba(255,255,255,.025); box-shadow:inset 0 0 0 1px rgba(255,255,255,.2); }
.v6 .v6-ovb.is-window, .v6 .v6-ovb.is-both { background:repeating-linear-gradient(-45deg, color-mix(in srgb, var(--v6-acc) 42%, transparent) 0 1.5px, transparent 1.5px 6px), color-mix(in srgb, var(--v6-acc) 10%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v6-acc) 75%, transparent); }
.v6 .v6-ovb.is-both { opacity:1; }
.v6 .v6-ovb:hover { box-shadow:inset 0 0 0 1px var(--v6-acc); }
.v6 .v6-ovb.is-sel { box-shadow:inset 0 0 0 2px var(--v6-acc); }
.v6 .v6-ovb-t { height:18px; line-height:18px; padding:0 6px; border-radius:9px; background:rgba(28,28,30,.92); box-shadow:0 0 0 .5px rgba(255,255,255,.18); font-weight:600; }
.v6 .v6-ovb.is-window .v6-ovb-t, .v6 .v6-ovb.is-both .v6-ovb-t { background:var(--v6-acc); color:#fff; box-shadow:none; }
/* v6d: dock sections fold, audio rows icon + name + duration */
.v6 .v6-dock-sec { -webkit-appearance:none; appearance:none; width:100%; align-items:center; gap:4px; height:28px; margin:8px 0 4px; padding:0 4px 0 0; border:0; background:transparent; border-radius:5px; font:inherit; font-size:11px; font-weight:600; color:var(--v6-t2); text-align:left; cursor:default; }
.v6 .v6-dock-sec:first-of-type { margin-top:4px; }
.v6 .v6-dock-sec:hover { color:var(--v6-t1); }
.v6 .v6-dock-sec:focus-visible { outline:none; box-shadow:0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-dock-sec > span { flex:none; }
.v6 .v6-dock-chev { width:14px; height:14px; flex:none; transition:transform 160ms var(--v6-e); }
.v6 .v6-dock-sec.is-shut .v6-dock-chev { transform:rotate(-90deg); }
.v6 .v6-dgrid[hidden] { display:none; }
.v6 .v6-dgrid.is-aud { gap:2px; }
.v6 .v6-dgrid.is-aud .v6-dcard { min-height:36px; padding:4px 8px 4px 4px; }
.v6 .v6-dgrid.is-aud .v6-dthumb { width:28px; height:28px; background:color-mix(in srgb, var(--v6-acc) 16%, var(--v6-s2)); color:var(--v6-acc); }
.v6 .v6-dgrid.is-aud .v6-dthumb > .v6-ic { width:16px; height:16px; }
.v6 .v6-dcap.is-row { flex-direction:row; align-items:center; gap:8px; }
.v6 .v6-dcap.is-row b { flex:1; min-width:0; font-size:12px; }
.v6 .v6-ddur { flex:none; font-size:11px; color:var(--v6-t3); font-variant-numeric:tabular-nums; }
.v6 .v6-dgrid.is-aud .v6-dcard.is-used { background:var(--v6-sel); }
/* v6d: toasts on the Montage page sit at the bottom of the picture, clear of the page tabs and the viewer bar */
.v6 .v6-toast.in-stage { position:absolute; top:auto; bottom:12px; max-width:min(560px, calc(100% - 24px)); transform:translate(-50%, 8px); }
.v6 .v6-toast.in-stage.on { transform:translate(-50%, 0); }
/* v6d: brand — monogram (H whose right stem is stacked clips, accent crossbar) + particle wordmark */
.v6 .v6-mono { display:block; }
.v6 .v6-mono .m-ink { fill:var(--v6-t1); } .v6 .v6-mono .m-dim { fill-opacity:.62; } .v6 .v6-mono .m-acc { fill:var(--v6-acc); }
.v6 .v6-monow { display:grid; place-items:center; }
.v6 .v6-mark { width:28px; height:28px; border-radius:8px; background:none; box-shadow:none; color:inherit; }
.v6 .v6-mark .v6-mono .m-acc { transition:transform 220ms var(--v6-e); transform-origin:center; transform-box:fill-box; }
.v6 .v6-proj:hover .v6-mark .v6-mono .m-acc { transform:scaleX(1.06); }
.v6 .v6-about-mark, .v6 .v6-wmark { width:auto; height:auto; border-radius:0; background:none; box-shadow:none; }
.v6 .v6-whero { display:flex; flex-direction:column; align-items:center; gap:14px; }
.v6 .v6-pword { display:block; max-width:100%; }
.v6 .v6-pword canvas { display:block; max-width:100%; height:auto; }
.v6 .v6-welcome h1 { font-size:15px; font-weight:600; color:var(--v6-t2); letter-spacing:0; margin-top:2px; }
.v6 .v6-wordm { font-weight:600; letter-spacing:-.02em; } .v6 .v6-wordm b { color:var(--v6-acc); font-weight:700; }
.v6 .v6-ahead { gap:4px; padding-right:4px; }
.v6 .v6-ahead .v6-vhead-k { margin-right:4px; }
.v6 .v6-mono .m-st { fill:none; stroke:var(--v6-t1); stroke-width:4.75; stroke-linecap:round; stroke-linejoin:round; }
.v6 .v6-mono .m-st.m-acc { stroke:var(--v6-acc); fill:none; }
.v6 .v6-ctx .v6-aacts { display:flex; align-items:center; gap:8px; margin-top:12px; padding-top:12px; box-shadow:inset 0 1px 0 var(--v6-hl); }
/* ===================== v6e: ONE selected-state pattern — the accent, muted into the surface =====================
   --v6-sel  : selected / pressed / current control background (accent ~32 % into the raised surface)
   --v6-sel-h: the same on hover;  --v6-sel-ln: its hairline.  Text on it stays light (t1).
   «Сгенерировать» alone keeps the full saturated accent (the strongest call to action). */
html[data-v6] {
  --v6-sel:color-mix(in srgb, var(--v6-acc) 32%, var(--v6-s2));
  --v6-sel-h:color-mix(in srgb, var(--v6-acc) 40%, var(--v6-s2));
  --v6-sel-ln:color-mix(in srgb, var(--v6-acc) 55%, transparent);
  --v6-acc-sel:var(--v6-sel);
}
/* segmented controls: page tabs, Медиа/Галерея, Отрезок/Ролик, V1/V2, Продолжение/Новая сцена, Авто/Фикс, duration chips, scale… */
.v6 .v6-seg-th { background:var(--v6-sel); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln), 0 1px 1px rgba(0,0,0,.3); }
.v6 .v6-seg-it.on, .v6 .v6-seg-it.on .v6-ic { color:var(--v6-t1); }
/* pressed / open / current buttons and list rows */
.v6 .v6-b.is-open, .v6 .v6-b[aria-pressed="true"], .v6 .v6-dock-btn.is-on,
.v6 .v6-side-it.on, .v6 .v6-tlbar .v6-legacy-tool.on, .v6 .v6-tlbar .v6-legacy-tool.active,
.v6 .v6-vhead.is-sel, .v6 .v6-dgrid.is-aud .v6-dcard.is-used { background:var(--v6-sel); color:var(--v6-t1); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln); }
.v6 .v6-b.is-open:hover, .v6 .v6-b[aria-pressed="true"]:hover, .v6 .v6-dock-btn.is-on:hover, .v6 .v6-side-it.on:hover, .v6 .v6-tlbar .v6-legacy-tool.on:hover { background:var(--v6-sel-h); }
.v6 .v6-b[aria-pressed="true"] .v6-ic, .v6 .v6-dock-btn.is-on .v6-ic, .v6 .v6-tlbar .v6-legacy-tool.on svg { color:var(--v6-t1); }
/* engine widgets inside the v6 shell */
html[data-v6] .v6 .h3l-pill.on, .v6 .v6-ast-host .h3l-ast-tools .h3l-pill.on, html[data-v6] .v6 .h3l-btn.on, html[data-v6] .v6 .h3l-regbtn.on,
html[data-v6] .v6 .h3l-settab.on, html[data-v6] .v6 .h3l-ast-settab.on, html[data-v6] .v6 .h3l-ast-stylecat.on, html[data-v6] .v6 .h3l-q.on,
html[data-v6] .v6 .h3l-tool.on, html[data-v6] .v6 .h3l-panel-toggle.on, html[data-v6] .v6 .h3l-draft.on {
  background:var(--v6-sel); color:var(--v6-t1); border-color:var(--v6-sel-ln); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln); }
html[data-v6] .v6 .h3l-ast-styleitem.on, html[data-v6] .v6 .h3l-ast-presetitem.on { background:var(--v6-sel); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln); }
html[data-v6] .v6 .h3l-tl .h3l-vend.set span, .v6 .v6-tl .h3l-vend.set span { background:var(--v6-sel-h); }
/* v6e: colour scheme picker (Settings → Внешний вид) */
.v6 .v6-schemes { display:grid; grid-template-columns:repeat(auto-fill, minmax(88px, 1fr)); gap:8px; width:100%; }
.v6 .v6-scheme { -webkit-appearance:none; appearance:none; display:flex; flex-direction:column; align-items:stretch; gap:6px; padding:6px; border:0; border-radius:var(--v6-r3); background:transparent; color:var(--v6-t2); font:inherit; font-size:12px; cursor:default; transition:background-color 140ms; }
.v6 .v6-scheme:hover { background:rgba(255,255,255,.05); color:var(--v6-t1); }
.v6 .v6-scheme:focus-visible { outline:none; box-shadow:0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-scheme.on { color:var(--v6-t1); }
.v6 .v6-scheme-pv { position:relative; display:block; height:52px; border-radius:var(--v6-r2); overflow:hidden; background:var(--b); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.14); }
.v6 .v6-scheme.on .v6-scheme-pv { box-shadow:0 0 0 2px var(--v6-s1), 0 0 0 4px var(--a); }
.v6 .v6-scheme-pv i { position:absolute; display:block; }
.v6 .v6-scheme-pv .pv-bar { left:0; right:0; top:0; height:10px; background:var(--w); }
.v6 .v6-scheme-pv .pv-side { left:0; top:10px; bottom:0; width:26%; background:var(--s1); }
.v6 .v6-scheme-pv .pv-sel { left:32%; top:18px; width:36%; height:8px; border-radius:3px; background:color-mix(in srgb, var(--a) 32%, var(--s2)); }
.v6 .v6-scheme-pv .pv-cta { right:6px; top:2px; width:18px; height:6px; border-radius:3px; background:var(--a); }
.v6 .v6-scheme-pv::after { content:""; position:absolute; left:32%; right:8px; top:32px; height:12px; border-radius:3px; background:var(--s2); }
.v6 .v6-scheme-n { text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
/* v6e: quiet «lab» tag next to the monogram (same in every language) */
.v6 .v6-proj .v6-lab { flex:none; margin-left:-6px; height:16px; padding:0 5px; display:inline-flex; align-items:center; border-radius:4px;
  font-size:11px; font-weight:600; line-height:1; letter-spacing:.02em; color:var(--v6-t2); box-shadow:inset 0 0 0 .5px rgba(235,235,245,.22); text-transform:none; }
/* ===================== v6e: Assistant page = [dialogs | conversation | settings] ===================== */
.v6 .v6-ast { grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1fr); }
.v6 .v6-ast.has-list { grid-template-columns:248px minmax(0,1fr); }
.v6 .v6-ast.has-set { grid-template-columns:minmax(0,1fr) 400px; }
.v6 .v6-ast.has-list.has-set { grid-template-columns:248px minmax(0,1fr) 400px; }
.v6 .v6-ast:not(.has-list) > .v6-ast-side, .v6 .v6-ast:not(.has-set) > .v6-ast-set { display:none; }
.v6 .v6-ast[data-mode="narrow"].has-set > .v6-ast-host { display:none; }
.v6 .v6-ast[data-mode="narrow"].has-set { grid-template-columns:minmax(0,1fr); }
.v6 .v6-ast[data-mode="narrow"].has-set > .v6-ast-set { border-left:0; }
.v6 .v6-ast-host { grid-row:1; }
.v6 .v6-ast-host > * { max-width:820px; }
/* left: dialogs */
.v6 .v6-ast-side { grid-row:1; display:flex; flex-direction:column; min-height:0; background:var(--v6-s1); box-shadow:inset -.5px 0 0 var(--v6-hl); }
.v6 .v6-chl-h { display:flex; align-items:center; gap:8px; height:56px; padding:12px 8px 0 16px; flex:none; }
.v6 .v6-chl-h > b { flex:1; font-size:13px; font-weight:600; color:var(--v6-t2); }
.v6 .v6-chl-list { flex:1; min-height:0; overflow:auto; padding:4px 8px 12px; display:flex; flex-direction:column; gap:2px; }
.v6 .v6-chl-it { position:relative; display:flex; align-items:center; gap:4px; min-height:48px; padding:6px 6px 6px 10px; border-radius:var(--v6-r2); color:var(--v6-t1); cursor:default; outline:none; transition:background-color 140ms; }
.v6 .v6-chl-it:hover { background:rgba(255,255,255,.05); }
.v6 .v6-chl-it.on { background:var(--v6-sel); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln); }
.v6 .v6-chl-it:focus-visible { box-shadow:0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-chl-tx { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.v6 .v6-chl-n { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-chl-m { font-size:11px; color:var(--v6-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-chl-acts { display:flex; gap:0; opacity:0; transition:opacity 140ms; }
.v6 .v6-chl-it:hover .v6-chl-acts, .v6 .v6-chl-it:focus-within .v6-chl-acts, .v6 .v6-chl-it.on .v6-chl-acts { opacity:1; }
.v6 .v6-chl-acts .v6-b { width:28px; min-width:28px; padding:0; background:transparent; }
.v6 .v6-chl-acts .v6-b:hover { background:rgba(255,255,255,.08); }
.v6 .v6-chl-in { flex:1; min-width:0; height:28px; padding:0 8px; border:0; border-radius:6px; background:var(--v6-s3); color:var(--v6-t1); font:inherit; font-size:13px; outline:none; box-shadow:0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-chl-empty { padding:16px 10px; font-size:12px; color:var(--v6-t2); }
/* centre: the conversation title replaces «Ассистент» when the list is on screen */
.v6 .v6-ast-host .h3l-ast-panel > .h3l-ph h3.v6-ast-title { font-size:17px; font-weight:600; letter-spacing:-.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.v6 .v6-ast.has-list .v6-ast-host .h3l-ast-moderow { padding-bottom:12px; box-shadow:inset 0 -1px 0 var(--v6-hl); }
.v6 .v6-ast-host .h3l-ast-moderow .h3l-ast-histacts { display:flex; gap:2px; margin-left:4px; }
.v6 .v6-ast-host .h3l-ast-moderow .h3l-ast-histacts .h3l-btn { background:transparent; }
.v6 .v6-ast-host .h3l-ast-moderow .h3l-ast-histacts .h3l-btn:hover { background:rgba(255,255,255,.07); }
/* composer: [growing text] over [tools | Send] — Send always at the bottom-right of the field */
.v6 .v6-ast-host .h3l-ast-compose { display:flex !important; flex-direction:column !important; align-items:stretch !important; }
.v6 .v6-ast-host .h3l-ast-inputbox { display:block !important; width:100%; }
.v6 .v6-ast-host .h3l-ast-input { width:100% !important; resize:none; max-height:40vh; }
.v6 .v6-ast-host .h3l-ast-toolbar { align-items:flex-end !important; margin-top:auto; }
.v6 .v6-ast-host .h3l-ast-send { align-self:flex-end; flex:none; }
/* right: assistant settings column */
.v6 .v6-ast-set { grid-row:1; min-height:0; min-width:0; display:flex; flex-direction:column; background:var(--v6-s1); box-shadow:inset .5px 0 0 var(--v6-hl); overflow:hidden; }
.v6 .v6-ast-set .h3l-ast-panel { height:100%; min-height:0; display:flex; flex-direction:column; background:transparent; border:0; box-shadow:none; padding:0; gap:0; }
.v6 .v6-ast-set .h3l-ast-panel > .h3l-ph { display:flex; align-items:center; gap:8px; height:56px; padding:12px 8px 0 16px; margin:0; flex:none; }
.v6 .v6-ast-set .h3l-ast-panel > .h3l-ph h3 { flex:1; font-size:13px; font-weight:600; color:var(--v6-t2); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-ast-set .v6-ast-hide { width:28px; height:28px; min-width:28px; padding:0; display:grid; place-items:center; border:0; border-radius:var(--v6-r1, 6px); background:transparent; color:var(--v6-t2); }
.v6 .v6-ast-set .v6-ast-hide:hover { background:rgba(255,255,255,.08); color:var(--v6-t1); }
.v6 .v6-ast-set .v6-ast-hide svg { width:16px; height:16px; }
.v6 .v6-ast-set .h3l-settabs { display:flex; flex-wrap:wrap; gap:2px; margin:4px 16px 8px !important; padding:0; border:0; background:transparent; flex:none; }
.v6 .v6-ast-set .h3l-settab { flex:1 1 auto; justify-content:center; height:28px; padding:0 6px; display:inline-flex; align-items:center; border-radius:14px; border:0; background:var(--v6-fill); color:var(--v6-t2); font-size:12px; font-weight:500; cursor:default; white-space:nowrap; transition:background-color 140ms; }
.v6 .v6-ast-set .h3l-settab:hover { background:var(--v6-fill2); color:var(--v6-t1); }
.v6 .v6-ast-set .h3l-settab.on { background:var(--v6-sel); color:var(--v6-t1); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln); }
.v6 .v6-ast-set .h3l-setbody { flex:1; min-height:0; overflow:auto; padding:8px 16px 20px; }
.v6 .v6-ast-set .h3l-setbody .h3l-grid2, .v6 .v6-ast-set .h3l-setbody .h3l-row2 { grid-template-columns:minmax(0,1fr) !important; }
/* delete-dialog confirm */
.v6 .v6-askwin { width:400px; }
.v6 .v6-ask { padding:20px; display:flex; flex-direction:column; gap:8px; }
.v6 .v6-ask h3 { margin:0; font-size:15px; font-weight:600; }
.v6 .v6-ask p { margin:0 0 8px; font-size:13px; color:var(--v6-t2); line-height:1.45; }
.v6 .v6-ask-b { display:flex; justify-content:flex-end; gap:8px; }
/* the engine marks the edited preset with .primary — in the list it is a selection, not a call to action */
html[data-v6] .v6 .h3l-ast-presetlist .h3l-btn { background:transparent; color:var(--v6-t1); border:0; box-shadow:none; height:30px; }
html[data-v6] .v6 .h3l-ast-presetlist .h3l-btn:hover { background:rgba(255,255,255,.06); }
html[data-v6] .v6 .h3l-ast-presetlist .h3l-btn.primary { background:var(--v6-sel); color:var(--v6-t1); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln); font-weight:500; }
/* takes (thumbnail cards): the selected take wears an accent ring, no white halo */
html[data-v6] .v6 .h3l-take.on { box-shadow:0 0 0 2px var(--v6-acc), 0 4px 12px rgba(0,0,0,.35); }
html[data-v6] .v6 .h3l-take.on .k { background:var(--v6-acc); color:var(--v6-acc-ink); }
/* timeline toggles «Участок» / «Магнит»: off = quiet (no fill, like the icon tools), on = the selected state */
html[data-v6] .v6 .v6-tlbar .v6-legacy-tool:not(.on):not(.active) { background:transparent; color:var(--v6-t2); box-shadow:none; }
html[data-v6] .v6 .v6-tlbar .v6-legacy-tool:not(.on):not(.active):hover { background:rgba(255,255,255,.07); color:var(--v6-t1); }
/* assistant reply actions: quiet text buttons under the reply (the reply text is the focus, not three gray pills) */
.v6 .v6-ast-host .h3l-ast-msg:not(.user) .h3l-ast-content > .h3l-row { gap:2px; margin-top:6px; margin-left:-8px; }
.v6 .v6-ast-host .h3l-ast-msg:not(.user) .h3l-ast-content > .h3l-row > .h3l-btn { background:transparent; border:0; box-shadow:none; color:var(--v6-t2); height:28px; padding:0 8px; }
.v6 .v6-ast-host .h3l-ast-msg:not(.user) .h3l-ast-content > .h3l-row > .h3l-btn:hover { background:rgba(255,255,255,.07); color:var(--v6-t1); }
.v6 .v6-ast-host .h3l-ast-msg:not(.user) .h3l-ast-content > .h3l-row > .h3l-btn:last-child { color:var(--v6-acc-text, var(--v6-acc)); }
/* gallery cards: the coloured tag on the picture already names the kind — drop the duplicate «▶ Видео · Дубль» line */
html[data-v6] .v6 .h3l-gcard .cap .gtype { display:none; }
/* ===================== v6f: floating engine overlays get a solid v6 surface =====================
   The glass reset above makes in-flow chrome flat; popovers/modals appended to the root must stay opaque. */
html[data-v6] .h3l-root.v6 :is(.h3l-monpop, .h3l-pop, .h3l-tpop, .h3l-regpop, .h3l-hover) {
  background:var(--v6-s1); color:var(--v6-t1); border:0; border-radius:var(--v6-r3);
  box-shadow:0 24px 72px rgba(0,0,0,.55), 0 0 0 .5px rgba(255,255,255,.14); -webkit-backdrop-filter:none; backdrop-filter:none; }
html[data-v6] .h3l-root.v6 .h3l-monpop { border-radius:var(--v6-r4); padding:20px; }
html[data-v6] .h3l-root.v6 .h3l-pe .pe-confirm { background:var(--v6-s2); border:0; border-radius:var(--v6-r3); box-shadow:0 16px 48px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.14); }
/* modal windows of the engine (save / delete / gallery viewer / crop / meta …): solid window like .v6-win */
html[data-v6] .h3l-root.v6 .h3l-modal { background:rgba(0,0,0,.42); }
/* resources panel contents: visible cards, the v6 selected state, no old borders */
html[data-v6] .h3l-root.v6 .h3l-monpop :is(.h3l-moncard, .h3l-monchart, .h3l-monlog) { background:var(--v6-s2); border:0; border-radius:var(--v6-r2); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06); }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-moncard { cursor:pointer; transition:background-color 140ms; }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-moncard:hover { background:var(--v6-s3); }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-moncard.on { background:var(--v6-sel); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln); }
html[data-v6] .h3l-root.v6 .h3l-monpop :is(.h3l-moncard .lbl, .h3l-moncard .det, .hd .sub, .h3l-mondevice, .h3l-mongenmeta, .h3l-monchart .chd span) { color:var(--v6-t2); }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-moncard-meter { background:rgba(255,255,255,.08); }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-moncard-meter i, html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-mongenbar i { background:var(--v6-acc); }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-mongenbar { background:rgba(255,255,255,.08); }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-monchart .line { stroke:var(--v6-acc); } html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-monchart .area { fill:var(--v6-acc); }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-monsection { border-top:.5px solid var(--v6-hl); }
html[data-v6] .h3l-root.v6 .h3l-monpop .h3l-monlogrow time { color:var(--v6-t3); }
html[data-v6] .v6 .v6-mon, html[data-v6] .h3l-root.v6 .h3l-sysmon { cursor:pointer; }
/* prompt editor: an overlay over the whole studio even before / without its own stylesheet (never a grid row) */
html[data-v6] .h3l-root.v6 > .h3l-pe-modal { position:absolute; inset:0; z-index:100500; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.42); }
html[data-v6] .h3l-root.v6 > .h3l-pe-modal > .h3l-pe { max-width:calc(100% - 48px); max-height:calc(100% - 48px); }
/* ===================== v6f: clip drag ghost (a small lifted card under the pointer) ===================== */
html.v6-grabbing, html.v6-grabbing * { cursor:grabbing !important; }
html[data-v6] body > .v6-ghost { position:fixed; left:0; top:0; z-index:2147483000; pointer-events:none; transform-origin:0 0;
  display:flex; align-items:center; gap:8px; max-width:240px; padding:4px 10px 4px 4px; border-radius:10px;
  background:color-mix(in srgb, var(--v6-s3) 88%, transparent); color:var(--v6-t1); font:500 12px/1.25 var(--v6-font, -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif);
  box-shadow:0 12px 32px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.35), inset 0 0 0 .5px rgba(255,255,255,.18), 0 0 0 1.5px var(--v6-sel-ln);
  -webkit-backdrop-filter:blur(12px) saturate(1.3); backdrop-filter:blur(12px) saturate(1.3);
  opacity:0; transition:opacity 120ms ease-out; will-change:transform; }
html[data-v6] body > .v6-ghost.on { opacity:.94; }
html[data-v6] body > .v6-ghost .v6-ghost-pic { flex:none; width:72px; height:40px; border-radius:6px; background-repeat:no-repeat; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.12); }
html[data-v6] body > .v6-ghost.is-aud .v6-ghost-pic { width:56px; height:28px; background-color:color-mix(in srgb, var(--v6-acc) 30%, var(--v6-s2)); }
html[data-v6] body > .v6-ghost .v6-ghost-tx { min-width:0; display:flex; flex-direction:column; gap:2px; }
html[data-v6] body > .v6-ghost .v6-ghost-tx b { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
html[data-v6] body > .v6-ghost .v6-ghost-tx span { font-size:11px; color:var(--v6-t2); font-variant-numeric:tabular-nums; }
/* the dragged clip stays where it was, dimmed: the hole is obvious (the engine's own lift/translate is off while the card shows) */
html[data-v6] .h3l-root.v6.v6-gdrag .h3l-clip.v6-gsrc, html[data-v6] .h3l-root.v6.v6-gdrag .h3l-audio.clip.v6-gsrc { opacity:.4; transform:none !important; box-shadow:none; }
html[data-v6] .h3l-root.v6.v6-gdrag .h3l-clip.v6-gsrc::after { content:""; position:absolute; inset:0; border-radius:inherit; box-shadow:inset 0 0 0 1px rgba(255,255,255,.35); pointer-events:none; }

/* ===================== v6g: Settings body — centred column, symmetric gutters ===================== */
.v6 .v6-pbody { scrollbar-gutter:stable both-edges; }
.v6 .v6-pform { width:100%; max-width:720px; margin:0 auto; box-sizing:border-box; padding:24px 32px 32px; }
/* engine blocks inside Settings never trap the wheel: no nested scroll box, no scroll-chain stop */
.v6 .v6-pbody .v6-legacy, .v6 .v6-pbody .v6-legacy * { overscroll-behavior:auto; }
.v6 .v6-pbody .v6-legacy .h3l-mt, .v6 .v6-pbody .v6-legacy .h3l-card { overflow:visible; max-height:none; flex:none; }
/* «Модели и LoRA» in the settings column: one column (LoRA stack, then the preset editor), fields full width */
.v6 .v6-pbody .h3l-mt-cols { grid-template-columns:minmax(0,1fr); gap:20px; }
.v6 .v6-pbody .h3l-mp-ed .h3l-grid2 { grid-template-columns:minmax(0,1fr) !important; }
.v6 .v6-pbody .h3l-mp-ed .h3l-grid2[style*="1fr auto"] { grid-template-columns:minmax(0,1fr) 148px !important; gap:8px; }
.v6 .v6-pbody .h3l-mp-ed .h3l-grid2[style*="1fr auto"] > select:last-child { width:148px; }
.v6 .v6-pbody .h3l-mp-ed > .h3l-lbl { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; margin-bottom:-6px; }
.v6 .v6-pbody .h3l-mp-ed > .h3l-lbl em { margin-left:auto; }
.v6 .v6-pbody .h3l-mp-ed select.h3l-sel, .v6 .v6-pbody .h3l-mp-ed .h3l-field { width:100%; min-width:0; }
/* every engine <select> in v6: a v6 popup button — same height / radius as the fields, chevron in its own lane, ellipsis */
html[data-v6] .v6 select.h3l-sel { -webkit-appearance:none; appearance:none; box-sizing:border-box; min-width:0; max-width:100%;
  padding:0 30px 0 10px; line-height:28px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='14' viewBox='0 0 10 14'%3E%3Cpath d='M2 5.2 5 2.2l3 3M2 8.8l3 3 3-3' fill='none' stroke='%23ebebf5' stroke-opacity='.6' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 10px center; background-size:10px 14px; cursor:default; }
html[data-v6] .v6 select.h3l-sel.sm { line-height:24px; padding-right:26px; background-position:right 8px center; }
html[data-v6] .v6 select.h3l-sel:focus-visible { outline:none; box-shadow:0 0 0 3px var(--v6-acc-ring); }
html[data-v6] .v6 select.h3l-sel.miss { box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v6-err, #ff453a) 70%, transparent); }
html[data-v6] .v6 select.h3l-sel option { background:var(--v6-s2, #2c2c2e); color:var(--v6-t1, #fff); }
.v6 .v6-tip { max-width:min(560px, calc(100% - 24px)); }
.v6 .v6-tip > span { white-space:pre-line; overflow-wrap:anywhere; }

/* ===================== v6g: generation preview window (dock bottom / floating / over the player) ===================== */
.v6 .v6-gp { display:flex; flex-direction:column; gap:6px; flex:none; position:relative; color:var(--v6-t1); transition:opacity 200ms var(--v6-e), transform 200ms var(--v6-e); }
.v6 .v6-gp.is-out { opacity:0; transform:translateY(6px); }
.v6 .v6-gp-h { display:flex; align-items:center; gap:8px; min-width:0; height:24px; }
.v6 .v6-gp-dot { width:7px; height:7px; border-radius:50%; flex:none; background:var(--v6-acc); box-shadow:0 0 0 3px color-mix(in srgb, var(--v6-acc) 25%, transparent); animation:v6-gp-pulse 1.4s ease-in-out infinite; }
.v6 .v6-gp.is-end .v6-gp-dot { animation:none; background:var(--v6-ok, #30d158); box-shadow:none; }
@keyframes v6-gp-pulse { 50% { opacity:.35; } }
.v6 .v6-gp-t { flex:1; min-width:0; font-size:11.5px; font-weight:500; color:var(--v6-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
.v6 .v6-gp-tg { flex:none; }
.v6 .v6-gp-m { position:relative; align-self:center; border-radius:var(--v6-r2); overflow:hidden; background:#000; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.08); cursor:zoom-in; }
.v6 .v6-gp-m > canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.v6 .v6-gp-wait { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; gap:8px; font-size:11.5px; color:var(--v6-t2); }
.v6 .v6-gp-wait[hidden], .v6 .v6-gp-tiles[hidden] { display:none; }
.v6 .v6-gp-tiles { position:absolute; inset:0; pointer-events:none; }
.v6 .v6-gp-tiles .cur { position:absolute; box-sizing:border-box; border:1.5px solid var(--v6-acc); background:color-mix(in srgb, var(--v6-acc) 14%, transparent); box-shadow:0 0 0 1px rgba(0,0,0,.45), 0 0 14px color-mix(in srgb, var(--v6-acc) 45%, transparent); border-radius:3px; transition:top 220ms var(--v6-e), left 220ms var(--v6-e), width 220ms var(--v6-e), height 220ms var(--v6-e); }
.v6 .v6-gp-tl { position:absolute; right:8px; top:8px; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:600; background:rgba(10,10,12,.72); color:var(--v6-t1); font-variant-numeric:tabular-nums; }
.v6 .v6-gp-pg { height:2px; border-radius:1px; background:rgba(255,255,255,.08); overflow:hidden; }
.v6 .v6-gp-pg > i { display:block; height:100%; background:var(--v6-acc); transform-origin:0 50%; transform:scaleX(0); transition:transform 300ms linear; }
/* dock: the last block of the dock column */
.v6 .v6-gp[data-mode="dock"] { margin:0 12px 12px; padding:10px 10px 10px; border-radius:var(--v6-r3); background:var(--v6-s2); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.07); }
.v6 .v6-gp[data-mode="dock"] .v6-gp-tl, .v6 .v6-gp[data-mode="float"] .v6-gp-tl { display:none; }
/* dock hidden: a small floating card in the player's bottom-left corner */
.v6 .v6-gp[data-mode="float"] { position:absolute; left:16px; bottom:12px; z-index:8; width:260px; padding:8px; border-radius:var(--v6-r3); background:color-mix(in srgb, var(--v6-s1) 94%, transparent); box-shadow:0 10px 30px rgba(0,0,0,.45), inset 0 0 0 .5px rgba(255,255,255,.09); }
/* expanded over the player */
.v6 .v6-gp[data-mode="big"] { position:absolute; inset:0; z-index:9; padding:8px 24px 12px; gap:8px; background:var(--v6-bg, #0b0b0c); justify-content:center; }
.v6 .v6-gp[data-mode="big"] .v6-gp-h { height:28px; }
.v6 .v6-gp[data-mode="big"] .v6-gp-t { font-size:12.5px; color:var(--v6-t1); }
.v6 .v6-gp[data-mode="big"] .v6-gp-m { cursor:default; }
.v6 .v6-gp[data-mode="big"] .v6-gp-pg { width:100%; }
html[data-v6][data-v6-motion="reduce"] .v6 .v6-gp-dot { animation:none; }
/* v6h «Кадры»: first / last frame slots, mode line, timeline badge */
.v6 .v6-kf-mode { display:flex; align-items:center; gap:8px; margin-top:8px; padding:6px 10px; border-radius:var(--v6-r2); background:rgba(255,255,255,.04); font-size:12px; }
.v6 .v6-kf-mode b { font-weight:600; color:var(--v6-t1); }
.v6 .v6-kf-mode.is-i2v b, .v6 .v6-kf-mode.is-flf b, .v6 .v6-kf-mode.is-l2v b { color:var(--v6-acc); }
.v6 .v6-kf-warn { display:flex; flex-direction:column; align-items:flex-start; gap:6px; }
.v6 .v6-sec.is-kf-off .v6-refs, .v6 .v6-sec.is-kf-off .v6-cards, .v6 .v6-sec.is-kf-off .v6-vrefs { opacity:.42; filter:saturate(.4); }
.v6 .v6-sec.is-kf-off .v6-sec-h h3::after { content:" · " attr(data-off); font-weight:400; color:var(--v6-t3); }
.v6 .v6-tl .h3l-clip .t .kfb { flex:none; padding:0 5px; border-radius:4px; font-size:9.5px; font-weight:700; letter-spacing:.03em; line-height:15px;
  color:var(--v6-acc-ink); background:var(--v6-acc); }
/* v6i: generation-mode badges — frame modes in accent, REF / T2V / V2V quieter, same shape */
.v6 .v6-tl .h3l-clip .t .kfb[data-mode="ref"], .v6 .v6-tl .h3l-clip .t .kfb[data-mode="t2v"], .v6 .v6-tl .h3l-clip .t .kfb[data-mode="v2v"] {
  color:var(--v6-t1); background:color-mix(in srgb, var(--v6-t1) 16%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v6-t1) 22%, transparent); }
/* v6i: mode selector REF | FLF; «Связь» neutral when a first frame replaces the continuation */
.v6 .v6-kf > .v6-kf-ctl { margin:0 0 10px; }
.v6 .v6-kf-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
.v6 .v6-kf-cell { aspect-ratio:var(--kf-ar, 4/3); cursor:pointer; position:relative; overflow:hidden; }
/* v6m «Вписать кадр»: the slots show the frame on the canvas aspect as it will be used */
.v6 .v6-kf-cell > img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.v6 .v6-kf-cell > img.v6-kf-bg { display:none; pointer-events:none; }
.v6 .v6-kf-grid.is-fit-stretch .v6-kf-cell > img:not(.v6-kf-bg), .v6 .v6-kf-grid.is-fit-legacy .v6-kf-cell[data-kf="first"] > img:not(.v6-kf-bg) { object-fit:fill; }
.v6 .v6-kf-grid.is-fit-pad .v6-kf-cell > img:not(.v6-kf-bg) { object-fit:contain; z-index:1; }
.v6 .v6-kf-grid.is-fit-pad.is-pad-blur .v6-kf-cell > img.v6-kf-bg { display:block; filter:blur(6px) brightness(.6); transform:scale(1.12); }
.v6 .v6-kf-grid.is-fit-pad.is-pad-black .v6-kf-cell:not(.is-add) { background:#000; }
.v6 .v6-kf-cell > .v6-ref-x, .v6 .v6-kf-cell > .v6-ref-tag { z-index:2; }
.v6 .v6-kf-fitbox { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
.v6 .v6-kf-fitrow { margin:0; }
.v6 .v6-kf-cell.is-add { background:repeating-linear-gradient(135deg, rgba(255,255,255,.03) 0 6px, transparent 6px 12px); box-shadow:inset 0 0 0 1px rgba(255,255,255,.16); }
.v6 .v6-kf-cell.is-over { box-shadow:inset 0 0 0 2px var(--v6-acc); }
.v6 .v6-kf-cell > .v6-ic { margin-bottom:12px; }
.v6 .v6-kf-tag { font-size:10.5px; }
.v6 .v6-kf-none { margin-top:6px; }
/* v6k: ControlNet row (under V1) — head, lane, clips with the processed filmstrip, progress, inspector card */
.v6 .v6-ctl-head { flex-direction:column; align-items:stretch; justify-content:center; gap:4px; padding:0 6px 0 12px; }
.v6 .v6-ctl-hl { display:flex; align-items:center; gap:6px; min-width:0; }
.v6 .v6-ctl-hn { flex:1; min-width:0; font-size:11px; color:var(--v6-t2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-ctl-head .v6-vhead-k { height:18px; background:color-mix(in srgb, var(--v6-acc) 22%, transparent); color:var(--v6-t1); font-size:10px; letter-spacing:.04em; }
.v6 .v6-ctl-head.is-off .v6-vhead-k { background:rgba(255,255,255,.07); color:var(--v6-t3); }
.v6 .v6-ctl-mode { -webkit-appearance:none; appearance:none; height:20px; display:flex; align-items:center; gap:4px; padding:0 4px 0 6px; border:0; border-radius:5px;
  background:rgba(255,255,255,.06); color:var(--v6-t1); font:500 11.5px/1 var(--v6-font); cursor:default; min-width:0; }
.v6 .v6-ctl-mode span { flex:1; min-width:0; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.v6 .v6-ctl-mode .v6-ic { flex:none; width:11px; height:11px; opacity:.7; }
.v6 .v6-ctl-mode:hover, .v6 .v6-ctl-mode.is-open { background:rgba(255,255,255,.11); }
.v6 .v6-ctl-mode:focus-visible { outline:none; box-shadow:0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-ctl-head.is-off .v6-ctl-mode { color:var(--v6-t3); }
.v6 .v6-ctl-head .v6-chk { margin-left:0; }
.v6 .v6-ctl-modes { display:flex; flex-direction:column; gap:2px; margin:6px 0 2px; }
.v6 .v6-ctl-mi { -webkit-appearance:none; appearance:none; display:grid; grid-template-columns:1fr auto; gap:1px 8px; text-align:left; padding:6px 8px; border:0; border-radius:6px; background:transparent; color:var(--v6-t1); font:inherit; cursor:default; }
.v6 .v6-ctl-mi b { font-size:12.5px; font-weight:600; }
.v6 .v6-ctl-mi span { grid-column:1; font-size:11px; line-height:1.35; color:var(--v6-t3); }
.v6 .v6-ctl-mi .v6-ic { grid-column:2; grid-row:1 / span 2; align-self:center; width:14px; height:14px; color:var(--v6-warn); }
.v6 .v6-ctl-mi:hover { background:rgba(255,255,255,.06); }
.v6 .v6-ctl-mi.on { background:var(--v6-sel); box-shadow:inset 0 0 0 .5px var(--v6-sel-ln); }
.v6 .v6-ctl-mi:focus-visible { outline:none; box-shadow:inset 0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-ctl-pop .v6-menu-sep { margin:8px -14px 10px; }
.v6 .v6-ctl-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:4px; }
.v6 .v6-ctl-gi { -webkit-appearance:none; appearance:none; height:26px; padding:0 6px; border:0; border-radius:6px; background:rgba(255,255,255,.05); color:var(--v6-t2); font:500 12px/1 var(--v6-font);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:default; }
.v6 .v6-ctl-gi:hover { background:rgba(255,255,255,.09); color:var(--v6-t1); }
.v6 .v6-ctl-gi.on { background:var(--v6-acc); color:var(--v6-acc-ink); }
.v6 .v6-ctl-gi:focus-visible { outline:none; box-shadow:0 0 0 2px var(--v6-acc-ring); }
.v6 .v6-tl .h3l-track.v.v6-vt .v6-ctl-lane { position:absolute; left:0; right:0; border-radius:var(--v6-r1);
  background:repeating-linear-gradient(135deg, color-mix(in srgb, var(--v6-acc) 5%, transparent) 0 6px, transparent 6px 12px), rgba(255,255,255,.018);
  box-shadow:inset 0 0 0 .5px color-mix(in srgb, var(--v6-acc) 18%, transparent); transition:background-color 120ms; }
.v6 .v6-tl .h3l-track.v.v6-vt .v6-ctl-lane.is-off { background:rgba(255,255,255,.015); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06); }
.v6 .v6-tl .h3l-track.v.v6-vt .v6-ctl-lane.is-drop { background:color-mix(in srgb, var(--v6-acc) 12%, transparent); box-shadow:inset 0 0 0 1px var(--v6-acc-ring); }
.v6 .v6-ctl-clip { position:absolute; z-index:2; overflow:hidden; border-radius:var(--v6-r1); background:#202024; cursor:grab;
  box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v6-acc) 45%, transparent); touch-action:none; }
.v6 .v6-ctl-clip.is-drag { cursor:grabbing; opacity:.9; }
.v6 .v6-ctl-clip.is-sel { box-shadow:inset 0 0 0 2px var(--v6-acc); z-index:3; }
.v6 .v6-ctl-clip.is-off { box-shadow:inset 0 0 0 1px rgba(255,255,255,.14); }
.v6 .v6-ctl-clip.is-off .v6-ctl-strip { filter:grayscale(1); opacity:.3; }
.v6 .v6-ctl-clip.is-warn { box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v6-warn) 70%, transparent); }
.v6 .v6-ctl-clip.is-sel.is-warn { box-shadow:inset 0 0 0 2px var(--v6-warn); }
.v6 .v6-ctl-strip { position:absolute; inset:0; pointer-events:none; opacity:.62; }
.v6 .v6-ctl-clip.is-proc .v6-ctl-strip { opacity:.9; }
.v6 .v6-ctl-clip.is-busy .v6-ctl-strip { opacity:.35; }
.v6 .v6-ctl-strip > i { position:absolute; top:0; bottom:0; background-repeat:no-repeat; }
.v6 .v6-ctl-chip { position:absolute; left:6px; top:5px; max-width:calc(100% - 12px); display:flex; align-items:center; gap:5px; padding:0 6px 0 2px; height:18px; border-radius:4px;
  background:rgba(0,0,0,.55); color:var(--v6-t1); font-size:11px; line-height:18px; white-space:nowrap; overflow:hidden; backdrop-filter:blur(6px); }
.v6 .v6-ctl-chip b { flex:none; padding:0 5px; border-radius:3px; font-size:9.5px; font-weight:700; letter-spacing:.03em; line-height:14px; color:var(--v6-acc-ink); background:var(--v6-acc); }
.v6 .v6-ctl-clip.is-off .v6-ctl-chip b { color:var(--v6-t2); background:rgba(255,255,255,.14); }
.v6 .v6-ctl-chip span { min-width:0; overflow:hidden; text-overflow:ellipsis; color:var(--v6-t2); }
.v6 .v6-ctl-chip .v6-ic { flex:none; width:12px; height:12px; color:var(--v6-warn); }
.v6 .v6-ctl-prog { position:absolute; left:0; right:0; bottom:0; height:3px; background:rgba(255,255,255,.10); pointer-events:none; }
.v6 .v6-ctl-prog::after { content:""; position:absolute; left:0; top:0; bottom:0; width:var(--k,0%); background:var(--v6-acc); transition:width 300ms ease; }
.v6 .v6-ctl-pt { position:absolute; right:6px; bottom:6px; font-size:10.5px; line-height:14px; padding:0 5px; border-radius:3px; background:rgba(0,0,0,.55); color:var(--v6-t1); font-variant-numeric:tabular-nums; pointer-events:none; }
.v6 .v6-ctl-h { position:absolute; top:0; bottom:0; width:7px; cursor:ew-resize; }
.v6 .v6-ctl-h.is-l { left:0; } .v6 .v6-ctl-h.is-r { right:0; }
.v6 .v6-ctl-clip:hover .v6-ctl-h::after { content:""; position:absolute; top:30%; bottom:30%; left:3px; width:2px; border-radius:1px; background:rgba(255,255,255,.55); }
.v6 .v6-tl .h3l-clip .t .kfb.is-ctl { color:var(--v6-t1); background:color-mix(in srgb, var(--v6-acc) 30%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v6-acc) 55%, transparent); }
.v6 .v6-tl .h3l-clip .t .kfb.is-ctl.is-warn { background:color-mix(in srgb, var(--v6-warn) 28%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v6-warn) 60%, transparent); }
.v6 .v6-ctl-card, .v6 .v6-ctl-set { display:flex; flex-direction:column; gap:12px; }
.v6 .v6-ctl-row { display:flex; flex-direction:column; gap:6px; min-width:0; }
.v6 .v6-ctl-row.is-sw { flex-direction:row; align-items:center; justify-content:space-between; }
.v6 .v6-ctl-row.is-chk { flex-direction:row; gap:16px; }
.v6 .v6-ctl-l { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.v6 .v6-ctl-v { font-size:12px; font-weight:600; color:var(--v6-t1); font-variant-numeric:tabular-nums; }
.v6 .v6-ctl-pop { padding:12px 14px; }
.v6 .v6-note.is-warn { color:var(--v6-warn); }
.v6 .v6-ctl-miss { display:grid; grid-template-columns:auto 1fr; gap:6px 8px; align-items:start; padding:8px 10px; border-radius:var(--v6-r1); background:color-mix(in srgb, var(--v6-warn) 10%, transparent); }
.v6 .v6-ctl-miss > .v6-ic { width:14px; height:14px; color:var(--v6-warn); margin-top:2px; }
.v6 .v6-ctl-miss .v6-note { margin:0; }
.v6 .v6-ctl-miss .v6-b { grid-column:2; justify-self:start; }
/* v6k «Рефайн лица»: window, face picker, take / clip marks */
.v6 .v6-facewin { width:min(500px, calc(100% - 48px)); }
.v6 .v6-face { display:flex; flex-direction:column; gap:14px; padding:20px 22px 18px; }
.v6 .v6-face-h { display:flex; align-items:center; gap:10px; font-size:15px; color:var(--v6-t1); }
.v6 .v6-face-h .v6-ic { width:18px; height:18px; color:var(--v6-acc); }
.v6 .v6-face-sub { font-size:12px; color:var(--v6-t2); margin-bottom:-6px; }
.v6 .v6-face-list { display:flex; flex-wrap:wrap; gap:10px; min-height:112px; align-items:flex-start; }
.v6 .v6-face-it { display:flex; flex-direction:column; align-items:center; gap:5px; width:92px; padding:6px 6px 5px; border:0; border-radius:var(--v6-r2); background:var(--v6-s2);
  color:var(--v6-t2); font:inherit; font-size:10.5px; line-height:13px; cursor:pointer; box-shadow:inset 0 0 0 1px rgba(255,255,255,.06); transition:box-shadow 140ms ease, background 140ms ease; }
.v6 .v6-face-it:hover { background:var(--v6-s3); }
.v6 .v6-face-it:focus-visible { outline:none; box-shadow:0 0 0 2px var(--v6-acc-ring, var(--v6-acc)); }
.v6 .v6-face-it img { width:80px; height:80px; object-fit:cover; border-radius:var(--v6-r1); background:#111; }
.v6 .v6-face-it.on { box-shadow:0 0 0 2px var(--v6-acc); color:var(--v6-t1); }
.v6 .v6-face-it span { text-align:center; }
.v6 .v6-face-wait, .v6 .v6-face-empty { display:flex; align-items:center; gap:8px; min-height:100px; font-size:12px; color:var(--v6-t2); }
.v6 .v6-face-params { display:flex; flex-direction:column; gap:12px; padding:12px 14px; border-radius:var(--v6-r2); background:var(--v6-s2); }
.v6 .v6-face-foot { display:flex; align-items:center; gap:8px; }
.v6 .v6-tl .h3l-clip .t .kfb.is-face { color:var(--v6-t1); background:color-mix(in srgb, var(--v6-ok, #3fb950) 26%, transparent); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--v6-ok, #3fb950) 55%, transparent); }
.v6 .h3l-take .fb { position:absolute; right:4px; top:4px; z-index:1; padding:0 4px; border-radius:3px; font-size:9px; font-weight:700; letter-spacing:.03em; line-height:13px;
  color:var(--v6-t1); background:color-mix(in srgb, var(--v6-ok, #3fb950) 45%, rgba(0,0,0,.5)); }
/* v6k «Обучение»: dim backdrop + spotlight + card (theme colours, calm motion) */
.v6 .v6-tour { position:fixed; inset:0; z-index:2147483000; pointer-events:auto; opacity:0; transition:opacity 180ms var(--v6-e, ease); }
.v6 .v6-tour.on { opacity:1; }
.v6 .v6-tour-dim { position:absolute; inset:0; background:transparent; }
.v6 .v6-tour.is-center .v6-tour-dim { background:rgba(0,0,0,.55); }
.v6 .v6-tour-spot { position:absolute; border-radius:var(--v6-r2, 10px); box-shadow:0 0 0 9999px rgba(0,0,0,.55), 0 0 0 2px var(--v6-acc);
  transition:left 260ms var(--v6-e, ease), top 260ms var(--v6-e, ease), width 260ms var(--v6-e, ease), height 260ms var(--v6-e, ease); pointer-events:none; }
.v6 .v6-tour.is-center .v6-tour-spot { display:none; }
.v6 .v6-tour-card { position:absolute; width:340px; max-width:calc(100% - 16px); display:flex; flex-direction:column; gap:8px; padding:14px 16px 12px; border-radius:var(--v6-r3, 12px);
  background:var(--v6-s1); color:var(--v6-t1); box-shadow:0 18px 60px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.14); outline:none;
  transition:left 260ms var(--v6-e, ease), top 260ms var(--v6-e, ease); }
.v6 .v6-tour-top { display:flex; align-items:center; gap:8px; font-size:11.5px; color:var(--v6-t2); }
.v6 .v6-tour-top > .v6-ic { width:16px; height:16px; color:var(--v6-acc); }
.v6 .v6-tour-n { font-variant-numeric:tabular-nums; }
.v6 .v6-tour-t { font-size:15px; line-height:1.3; }
.v6 .v6-tour-x { margin:0; font-size:12.5px; line-height:1.5; color:var(--v6-t2); }
.v6 .v6-tour-h { margin:0; font-size:12px; line-height:1.45; padding:6px 8px; border-radius:var(--v6-r1, 6px); color:var(--v6-t1); background:color-mix(in srgb, var(--v6-acc) 14%, transparent); }
.v6 .v6-tour-dots { display:flex; gap:4px; margin-top:2px; }
.v6 .v6-tour-dots i { width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,.18); transition:background 160ms ease, width 160ms ease; }
.v6 .v6-tour-dots i.on { width:14px; border-radius:3px; background:var(--v6-acc); }
.v6 .v6-tour-foot { display:flex; align-items:center; gap:8px; margin-top:2px; }
html[data-v6][data-v6-motion="reduce"] .v6 .v6-tour, html[data-v6][data-v6-motion="reduce"] .v6 .v6-tour-spot, html[data-v6][data-v6-motion="reduce"] .v6 .v6-tour-card { transition:none; }
/* the «?» gives way first when the header is tight (the tour stays in «Ещё» and Ctrl+K) */
.v6 .v6-tb:is([data-size="h"],[data-size="s"],[data-size="xs"],[data-size="xxs"]) .v6-tb-help { display:none; }
/* v6l ControlNet clip: visible trim handles (like the audio clips), snap guide while dragging */
.v6 .v6-ctl-h { position:absolute; top:0; bottom:0; width:10px; z-index:4; cursor:ew-resize; }
.v6 .v6-ctl-h.is-l { left:0; } .v6 .v6-ctl-h.is-r { right:0; }
.v6 .v6-ctl-h::after { content:""; position:absolute; top:50%; width:3px; height:22px; margin-top:-11px; border-radius:3px; background:rgba(255,255,255,.9); box-shadow:0 0 0 1px rgba(0,0,0,.35); opacity:0; transition:opacity 120ms; }
.v6 .v6-ctl-h.is-l::after { left:3px; } .v6 .v6-ctl-h.is-r::after { right:3px; }
.v6 .v6-ctl-clip:hover .v6-ctl-h::after, .v6 .v6-ctl-clip.is-sel .v6-ctl-h::after, .v6 .v6-ctl-clip.is-drag .v6-ctl-h::after { opacity:1; }
.v6 .v6-ctl-chip { z-index:2; }
.v6 .v6-ctl-snap { position:absolute; top:0; bottom:0; width:0; border-left:1px solid var(--v6-acc); z-index:6; pointer-events:none; box-shadow:0 0 6px var(--v6-acc); }
/* v6l: ControlNet patch fallback / missing — chip in the track head */
.v6 .v6-ctl-pw { display:inline-flex; align-items:center; gap:3px; height:18px; padding:0 6px; margin-left:4px; border:0; border-radius:9px; font:600 10px/1 var(--v6-font, inherit); color:var(--v6-warn); background:color-mix(in srgb, var(--v6-warn) 16%, transparent); cursor:pointer; flex:none; }
.v6 .v6-ctl-pw .v6-ic { width:11px; height:11px; }
.v6 .v6-ctl-pw.is-err { color:var(--v6-danger, #ff6b6b); background:color-mix(in srgb, var(--v6-danger, #ff6b6b) 16%, transparent); }
.v6 .v6-ctl-pw:hover { filter:brightness(1.2); }
.v6 .v6-ctl-miss .v6-note { white-space:pre-line; overflow-wrap:anywhere; min-width:0; }
.v6 .v6-ctl-miss { min-width:0; }
/* v6l: global downloads mini-window (bottom-right, every page) */
.v6 .v6-dlm { position:absolute; right:14px; bottom:14px; z-index:100020; width:300px; max-width:calc(100% - 28px); display:flex; flex-direction:column; gap:6px; padding:8px 10px 10px; border-radius:var(--v6-r2, 12px);
  background:color-mix(in srgb, var(--v6-bg2, #1c1c1e) 94%, transparent); color:var(--v6-t1); border:1px solid var(--v6-sep, rgba(255,255,255,.1)); box-shadow:0 10px 30px rgba(0,0,0,.45); backdrop-filter:blur(14px); font-size:12px; }
.v6 .v6-dlm.is-min { width:auto; padding:6px 8px; }
.v6 .v6-dlm-h { display:flex; align-items:center; gap:6px; min-width:0; cursor:pointer; height:22px; }
.v6 .v6-dlm-h > .v6-ic { width:14px; height:14px; color:var(--v6-accent, #0a84ff); flex:none; }
.v6 .v6-dlm-h b { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1; }
.v6 .v6-dlm-n { min-width:16px; height:16px; padding:0 4px; border-radius:8px; font-size:10px; line-height:16px; text-align:center; background:var(--v6-fill, rgba(255,255,255,.1)); color:var(--v6-t2); flex:none; }
.v6 .v6-dlm-ib { display:inline-grid; place-items:center; width:22px; height:22px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--v6-t2); cursor:pointer; flex:none; }
.v6 .v6-dlm-ib svg { width:13px; height:13px; }
.v6 .v6-dlm-ib:hover { background:var(--v6-fill, rgba(255,255,255,.1)); color:var(--v6-t1); }
.v6 .v6-dlm-ib.is-x:hover { color:var(--v6-danger, #ff6b6b); }
.v6 .v6-dlm-ib:disabled { opacity:.4; cursor:default; }
.v6 .v6-dlm.is-min .v6-dlm-h .v6-dlm-ib:first-of-type svg { transform:rotate(180deg); }
.v6 .v6-dlm-r { display:flex; flex-direction:column; gap:4px; padding:6px 8px; border-radius:8px; background:var(--v6-fill2, rgba(255,255,255,.04)); cursor:pointer; min-width:0; }
.v6 .v6-dlm-r:hover { background:var(--v6-fill, rgba(255,255,255,.08)); }
.v6 .v6-dlm-t { display:flex; align-items:center; gap:2px; min-width:0; }
.v6 .v6-dlm-nm { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500; }
.v6 .v6-dlm-bar { height:4px; border-radius:2px; background:var(--v6-fill, rgba(255,255,255,.1)); overflow:hidden; }
.v6 .v6-dlm-bar > i { display:block; height:100%; background:var(--v6-accent, #0a84ff); border-radius:2px; transition:width 400ms linear; }
.v6 .v6-dlm-r.is-paused .v6-dlm-bar > i { background:var(--v6-warn); }
.v6 .v6-dlm-r.is-error .v6-dlm-bar > i { background:var(--v6-danger, #ff6b6b); }
.v6 .v6-dlm-r.is-done .v6-dlm-bar > i { background:var(--v6-ok, #30d158); }
.v6 .v6-dlm-i { color:var(--v6-t2); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
.v6 .v6-dlm-r.is-error .v6-dlm-i { color:var(--v6-danger, #ff6b6b); white-space:normal; }
.v6 .h3l-mdl-act { display:grid; grid-template-columns:auto auto; align-items:center; justify-content:end; gap:4px 6px; flex:none; }
.v6 .h3l-mdl-act .h3l-mdl-badge { grid-column:1 / -1; justify-self:end; white-space:nowrap; }
/* v6l «Звук в H3» on a ControlNet clip */
.v6 .v6-ctl-chip .v6-ctl-snd { width:12px; height:12px; flex:none; margin-left:2px; color:#5ee08a; }
.v6 .v6-ctl-chip .v6-ctl-snd.is-off { color:var(--v6-t3, #888); }
.v6 .v6-ctl-clip.has-snd::after { content:""; position:absolute; left:2px; right:2px; bottom:2px; height:3px; border-radius:2px; pointer-events:none;
  background:repeating-linear-gradient(90deg, rgba(94,224,138,.85) 0 2px, transparent 2px 4px); }
.v6 .v6-ctl-clip.has-snd.is-off::after { opacity:.35; }
.v6 .v6-ctl-snd-row { display:flex; flex-direction:column; align-items:stretch; gap:4px; }
.v6 .v6-ctl-snd-row .v6-note { margin:0; }
/* v6m «Своё соотношение» / «Как у изображения» */
.v6 .v6-in-wrap.is-bad .v6-in { box-shadow:inset 0 0 0 1px var(--v6-red, #ff6b6b); }
.v6 .v6-asp-img { margin-top:-2px; }
.v6 .v6-ratio-q .v6-seg-it { font-variant-numeric:tabular-nums; }

/* v6m hotfix: stop buttons — always solid red with a white square, in every theme */
html[data-v6] { --v6-stop:#d92d20; --v6-stop-h:#f04438; }
.v6 .v6-act .v6-b.v6-act-stop, html[data-v6] .v6 .h3l-btn.danger.is-stop, .h3l-btn.danger.is-stop {
  background:var(--v6-stop, #d92d20) !important; color:#fff !important; border-color:transparent !important;
  box-shadow:0 0 0 1px rgba(0,0,0,.35), 0 1px 6px rgba(217,45,32,.35); }
.v6 .v6-act .v6-b.v6-act-stop .v6-ic, .v6 .v6-act .v6-b.v6-act-stop svg, .h3l-btn.danger.is-stop svg { color:#fff !important; fill:#fff; stroke:#fff; }
.v6 .v6-act .v6-b.v6-act-stop:hover, html[data-v6] .v6 .h3l-btn.danger.is-stop:hover:not(:disabled), .h3l-btn.danger.is-stop:hover:not(:disabled) { background:var(--v6-stop-h, #f04438) !important; }
.v6 .v6-act .v6-b.v6-act-stop:active { transform:scale(.94); }
.v6 .v6-act .v6-b.v6-act-stop:focus-visible, .h3l-btn.danger.is-stop:focus-visible { outline:2px solid #fff; outline-offset:1px; }
.v6 .v6-act .v6-b.v6-act-stop[hidden] { display:none !important; }

/* GTA VI / Vice Neon — original Miami sunset palette, no external images or assets.
   Theme-only overrides; the high-contrast stop button remains red and untouched. */
html[data-v6-scheme="vice"] {
  --v6-hl:rgba(255,181,223,.13); --v6-hl2:rgba(255,181,223,.21);
  --v6-fill:rgba(173,110,203,.23); --v6-fill2:rgba(196,118,216,.31);
  --v6-t1:#fff5fc; --v6-t2:rgba(255,237,251,.76); --v6-t3:rgba(249,220,245,.59);
  --v6-ok:#52dfd4; --v6-warn:#ffce78; --v6-sel:rgba(255,112,184,.23);
  --v6-acc-ring:rgba(93,225,226,.62);
}
html[data-v6-scheme="vice"] .h3l-root.v6 {
  background:radial-gradient(ellipse at 82% 8%,rgba(248,96,170,.13),transparent 43%),
             radial-gradient(ellipse at 8% 88%,rgba(72,210,220,.08),transparent 48%),var(--v6-win);
}
html[data-v6-scheme="vice"] .v6 .v6-tb {
  background:linear-gradient(105deg,#29152e 0%,#21122f 48%,#341a43 76%,#44243e 100%);
  box-shadow:inset 0 -1px 0 rgba(255,166,211,.25),0 4px 22px rgba(12,4,27,.3);
}
html[data-v6-scheme="vice"] .v6 .v6-mark {
  background:linear-gradient(140deg,#ffb26d 0%,#ff6dba 52%,#905ee9 100%);
  color:#28102d; box-shadow:0 1px 10px rgba(255,99,184,.23),inset 0 1px 0 rgba(255,255,255,.4);
}
html[data-v6-scheme="vice"] .v6 .v6-b.is-primary:not(.v6-act-stop),
html[data-v6-scheme="vice"] .v6 .h3l-btn.primary:not(.danger) {
  background:linear-gradient(115deg,#ffb16d 0%,#ff70b8 50%,#e56cca 100%);
  color:#29112c; box-shadow:0 2px 12px rgba(255,91,178,.2),inset 0 1px 0 rgba(255,255,255,.35);
}
html[data-v6-scheme="vice"] .v6 .v6-b.is-primary:not(.v6-act-stop):hover,
html[data-v6-scheme="vice"] .v6 .h3l-btn.primary:not(.danger):hover {
  background:linear-gradient(115deg,#ffd098 0%,#ff91c9 55%,#ed88dd 100%);
}
html[data-v6-scheme="vice"] .v6 .v6-seg-th {
  background:linear-gradient(110deg,#9e54c4,#e563bd);
}
html[data-v6-scheme="vice"] .v6 .v6-side-it.on {
  background:linear-gradient(100deg,rgba(239,89,181,.29),rgba(119,84,208,.22));
  box-shadow:inset 3px 0 0 #ff86bb;
}
html[data-v6-scheme="vice"] .v6 .v6-pside {
  background:linear-gradient(180deg,#24152f 0%,#1d132c 64%,#18172b 100%);
}
html[data-v6-scheme="vice"] .v6 .v6-pmain {
  background:radial-gradient(ellipse at 100% 0%,rgba(240,99,177,.075),transparent 43%),var(--v6-s1);
}
html[data-v6-scheme="vice"] .v6 .v6-phead {
  background:linear-gradient(90deg,rgba(151,67,167,.15),rgba(250,112,157,.09));
}
.v6 .v6-scheme[data-scheme="vice"] .v6-scheme-pv {
  background:linear-gradient(180deg,#37204d 0%,#793e82 45%,#ed76a1 78%,#faad83 100%);
}
.v6 .v6-scheme[data-scheme="vice"] .v6-scheme-pv .pv-bar {
  background:linear-gradient(100deg,#2a1839,#e65a9b);
}
`;
