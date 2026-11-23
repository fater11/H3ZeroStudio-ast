import { T } from "./h3s_i18n.js";
import { applyTheme } from "./h3s_theme.js";
import { applyUiBlur } from "./h3s_ui_blur.js";
// H3ZeroStudio styles (CapCut-like: deep navy-black, purple→cyan gradients, glassy rounded panels).
export const CSS = String.raw`
.h3l-root, .h3l-compact { --bg0:#07080b; --bg1:#0b0d12; --bg2:#12151b; --panel:rgba(16,18,23,.72); --panel2:rgba(24,27,34,.78);
  --line:rgba(200,208,224,.10); --line2:rgba(200,208,224,.18); --txt:#eceff4; --mut:#9aa1ad; --mut2:#666d7a;
  --a1:#4f8cff; --a2:#7fb0ff; --a3:#5b8fe8; --ok:#34d399; --warn:#fbbf24; --err:#fb7185;
  --field:rgba(6,7,10,.55); --control:rgba(200,208,224,.07); --on-accent:#fff;
  --glow1:rgba(79,140,255,.22); --glow2:rgba(127,176,255,.14); --glow3:rgba(79,140,255,.10);
  --grad:linear-gradient(135deg,#4f8cff 0%,#3d6fe0 45%,#7fb0ff 100%);
  --grad2:linear-gradient(135deg,#5b8fe8 0%,#4f8cff 55%,#7fb0ff 100%);
  --r:16px; --r2:12px; --r3:9px;
  font-family: Inter, "Segoe UI Variable", "Segoe UI", "Segoe UI Symbol", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Noto Sans Symbols 2", system-ui, -apple-system, Roboto, sans-serif; color:var(--txt);
  font-size:13px; line-height:1.35; -webkit-font-smoothing:antialiased; }
.h3l-root *, .h3l-compact * { box-sizing:border-box; }
.h3l-root { box-sizing:border-box; position:fixed; inset:0; z-index:100000; display:grid; grid-template-rows:56px minmax(0,1fr) auto; gap:10px; padding:10px;
  /* ui-scale: width/height override inset when zoom≠1 */
  background: radial-gradient(1200px 600px at 12% -10%, var(--glow1), transparent 60%),
              radial-gradient(900px 500px at 95% 0%, var(--glow2), transparent 60%),
              radial-gradient(800px 600px at 50% 120%, var(--glow3), transparent 60%), var(--bg0);
  animation: h3l-in .18s ease-out; user-select:none; }
@keyframes h3l-in { from { opacity:0; transform:scale(.985); } to { opacity:1; transform:none; } }
.h3l-root ::-webkit-scrollbar { width:8px; height:8px; } .h3l-root ::-webkit-scrollbar-thumb { background:rgba(200,208,224,.18); border-radius:8px; }
.h3l-root ::-webkit-scrollbar-track { background:transparent; }
.h3l-glass { background:var(--panel); border:1px solid var(--line); border-radius:var(--r); backdrop-filter:blur(18px) saturate(140%);
  box-shadow:0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04); }
/* ---------- header */
.h3l-head { display:flex; align-items:center; gap:12px; padding:0 10px 0 14px; }
.h3l-logo { display:flex; align-items:center; gap:10px; font-weight:800; font-size:16px; letter-spacing:.2px; white-space:nowrap; }
.h3l-logo i { width:30px; height:30px; border-radius:10px; background:var(--grad); display:grid; place-items:center; box-shadow:0 6px 18px rgba(79,140,255,.45); font-style:normal; }
.h3l-logo b { background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
.h3l-pname { background:transparent; border:1px solid transparent; color:var(--txt); font:inherit; font-weight:600; padding:6px 10px; border-radius:10px; width:220px; }
.h3l-pname:hover { border-color:var(--line2); } .h3l-pname:focus { outline:none; border-color:var(--a1); background:rgba(79,140,255,.08); }
.h3l-chips { display:flex; gap:6px; flex:1; min-width:0; overflow:hidden; }
.h3l-chip { display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:999px; background:rgba(200,208,224,.07); border:1px solid var(--line);
  color:var(--mut); font-size:12px; white-space:nowrap; }
.h3l-chip b { color:var(--txt); font-weight:600; }
.h3l-chip.warn { color:var(--warn); border-color:rgba(251,191,36,.35); background:rgba(251,191,36,.08); cursor:pointer; }
.h3l-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 14px; border-radius:11px; border:1px solid var(--line2);
  background:rgba(200,208,224,.07); color:var(--txt); font:inherit; font-weight:600; cursor:pointer; transition:.15s; white-space:nowrap; }
.h3l-btn:hover { background:rgba(200,208,224,.14); border-color:rgba(200,208,224,.3); }
.h3l-btn:disabled { opacity:.4; cursor:default; }
.h3l-btn.icon { width:34px; padding:0; }
.h3l-btn.sm { height:28px; padding:0 10px; border-radius:9px; font-size:12px; }
.h3l-btn.sm.icon { width:28px; padding:0; }
.h3l-btn.primary { background:var(--grad); border:none; box-shadow:0 8px 24px rgba(61,111,224,.45), inset 0 1px 0 rgba(255,255,255,.25); padding:0 18px; }
.h3l-btn.primary:hover { filter:brightness(1.1); }
.h3l-btn.danger:hover { background:rgba(251,113,133,.16); border-color:rgba(251,113,133,.45); color:#ffd1da; }
.h3l-btn.danger.is-stop { background:#d92d20; border-color:#d92d20; color:#fff; } .h3l-btn.danger.is-stop:hover { background:#f04438; border-color:#f04438; color:#fff; } .h3l-btn.danger.is-stop svg { color:#fff; }
.h3l-btn svg { width:16px; height:16px; }
.h3l-run { position:relative; overflow:hidden; display:flex; align-items:center; gap:10px; height:34px; padding:0 14px; border-radius:11px; min-width:280px;
  background:rgba(79,140,255,.12); border:1px solid rgba(79,140,255,.4); font-weight:600; font-size:12px; }
.h3l-run > i { position:absolute; left:0; top:0; bottom:0; background:var(--grad); opacity:.35; transition:width .3s; }
.h3l-run > span { position:relative; white-space:nowrap; }
.h3l-run .sp { width:14px; height:14px; border-radius:50%; border:2px solid rgba(255,255,255,.25); border-top-color:#fff; animation:h3l-spin .8s linear infinite; position:relative; }
@keyframes h3l-spin { to { transform:rotate(360deg); } }
/* ---------- body */
.h3l-body { display:grid; grid-template-columns:60px 272px minmax(0,1fr) 372px; gap:10px; min-height:0; }
.h3l-tools { display:flex; flex-direction:column; align-items:center; gap:6px; padding:10px 0; }
.h3l-tool { width:44px; height:52px; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; color:var(--mut);
  cursor:pointer; font-size:9.5px; transition:.15s; border:1px solid transparent; }
.h3l-tool svg { width:20px; height:20px; }
.h3l-tool:hover { color:var(--txt); background:rgba(200,208,224,.07); }
.h3l-tool.on { color:#fff; background:linear-gradient(160deg,rgba(79,140,255,.35),rgba(127,176,255,.18)); border-color:rgba(79,140,255,.45); box-shadow:0 6px 18px rgba(79,140,255,.25); }
.h3l-tools .sp { flex:1; }
.h3l-socials { display:flex; align-items:center; justify-content:center; gap:6px; padding:2px 0; flex:none; }
.h3l-social-link { width:26px; height:28px; display:grid; place-items:center; border:1px solid transparent; border-radius:8px; color:var(--mut); }
.h3l-social-link svg { width:17px; height:17px; display:block; }
.h3l-social-link:hover { color:var(--txt); background:var(--control); border-color:var(--line); }
.h3l-support { width:64px; height:32px; display:flex; align-items:center; justify-content:center; gap:4px; flex:none; border:1px solid color-mix(in srgb,#f47b4d 35%,var(--line)); border-radius:9px; background:color-mix(in srgb,#f47b4d 9%,var(--control)); color:var(--txt); text-decoration:none; font-size:12px; font-weight:600; }
.h3l-support svg { width:14px; height:14px; color:#f47b4d; }
.h3l-support:hover { background:color-mix(in srgb,#f47b4d 16%,var(--control)); border-color:color-mix(in srgb,#f47b4d 55%,var(--line)); }
.h3l-social-link:focus-visible, .h3l-support:focus-visible { outline:2px solid var(--a2); outline-offset:2px; }
.h3l-panel { display:flex; flex-direction:column; min-height:0; overflow:hidden; }
.h3l-ph { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:14px 14px 10px; }
.h3l-ph h3 { margin:0; font-size:14px; font-weight:700; letter-spacing:.2px; }
.h3l-ph small { color:var(--mut); font-weight:500; }
.h3l-scroll { overflow:auto; min-height:0; flex:1; padding:0 14px 14px; }
.h3l-pills { display:flex; gap:4px; padding:3px; background:rgba(6,7,10,.5); border:1px solid var(--line); border-radius:11px; }
.h3l-pill { flex:1; text-align:center; padding:5px 8px; border-radius:8px; color:var(--mut); cursor:pointer; font-size:12px; font-weight:600; white-space:nowrap; transition:.15s; }
.h3l-pill:hover { color:var(--txt); }
.h3l-pill.on { color:#fff; background:var(--grad); box-shadow:0 4px 14px rgba(61,111,224,.35); }
.h3l-pill.dis { opacity:.35; pointer-events:none; }

button.h3l-pill, button.h3l-theme, button.h3l-ast-status, button.h3l-ast-stylechip, button.h3l-ast-chip, button.h3l-ast-action, button.h3l-ast-settab, button.h3l-ast-stylecat, button.h3l-ast-presetitem {
  appearance:none; -webkit-appearance:none; font:inherit; color:inherit; margin:0;
}
button.h3l-pill { background:transparent; border:0; padding:5px 8px; }
.h3l-pill.off { opacity:.35; pointer-events:none; cursor:not-allowed; }

/* ---------- assets */
.h3l-drop { margin:10px 0; border:1.5px dashed rgba(200,208,224,.25); border-radius:14px; padding:16px 10px; text-align:center; color:var(--mut); cursor:pointer; transition:.15s;
  background:rgba(200,208,224,.03); font-size:12px; }
.h3l-drop:hover, .h3l-drop.over { border-color:var(--a2); color:var(--txt); background:rgba(127,176,255,.06); }
.h3l-drop svg { width:24px; height:24px; display:block; margin:0 auto 6px; color:var(--a2); }
.h3l-agrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.h3l-asset { position:relative; border-radius:12px; overflow:hidden; background:var(--bg2); border:1px solid var(--line); cursor:grab; transition:.15s; aspect-ratio:1/1.12; }
.h3l-asset:hover { border-color:rgba(79,140,255,.6); transform:translateY(-1px); box-shadow:0 8px 22px rgba(0,0,0,.35); }
.h3l-asset img { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
.h3l-asset .cap { position:absolute; left:0; right:0; bottom:0; padding:18px 8px 6px; background:linear-gradient(transparent,rgba(6,7,10,.92)); font-size:11px; }
.h3l-asset .cap div { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; }
.h3l-asset .cat { position:absolute; top:6px; left:6px; font-size:9.5px; font-weight:700; padding:2px 7px; border-radius:999px; background:rgba(6,7,10,.7); border:1px solid var(--line2); cursor:pointer; }
.h3l-asset .cat.character { color:#c4b5fd; } .h3l-asset .cat.location { color:#67e8f9; } .h3l-asset .cat.other { color:#f9a8d4; }
.h3l-asset .del { position:absolute; top:6px; right:6px; width:22px; height:22px; border-radius:7px; display:none; place-items:center; background:rgba(6,7,10,.75); color:#fda4af; cursor:pointer; }
.h3l-asset:hover .del { display:grid; }
.h3l-asset.used::after { content:"✓"; position:absolute; right:6px; bottom:6px; width:20px; height:20px; border-radius:50%; display:grid; place-items:center; background:var(--grad); font-size:11px; font-weight:800; }
.h3l-empty { color:var(--mut2); text-align:center; padding:26px 8px; font-size:12px; }
/* ---------- preview */
.h3l-center { display:flex; flex-direction:column; min-height:0; min-width:0; }
.h3l-pv-top { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; }
.h3l-stage { flex:1; min-height:0; display:grid; place-items:center; padding:0 14px; position:relative; }
.h3l-frame { position:relative; max-width:100%; max-height:100%; border-radius:14px; overflow:hidden; background:#000; box-shadow:0 20px 60px rgba(0,0,0,.6), 0 0 0 1px var(--line);
  display:grid; place-items:center; }
.h3l-frame video, .h3l-frame img.poster { width:100%; height:100%; object-fit:contain; display:block; background:#000; }
.h3l-ph-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--mut); text-align:center; padding:20px;
  background: radial-gradient(400px 260px at 30% 30%, rgba(79,140,255,.22), transparent 70%), radial-gradient(400px 260px at 75% 70%, rgba(127,176,255,.16), transparent 70%), #070a16; }
.h3l-ph-empty .big { width:64px; height:64px; border-radius:20px; background:var(--grad); display:grid; place-items:center; box-shadow:0 10px 30px rgba(61,111,224,.5); }
.h3l-ph-empty .big svg { width:30px; height:30px; color:#fff; }
.h3l-ph-empty b { color:var(--txt); font-size:15px; }
.h3l-ph-empty .tag { position:absolute; left:14px; top:12px; font-size:11px; color:var(--mut); }
.h3l-comp-ph { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background-size:cover; background-position:center;
  background-color:#0d0f13; }
.h3l-comp-ph::before { content:""; position:absolute; inset:0; background:linear-gradient(135deg, color-mix(in srgb, var(--c) 55%, transparent), rgba(6,7,10,.88));
  backdrop-filter:blur(6px) saturate(.6); }
.h3l-comp-ph.gap::before { background:repeating-linear-gradient(45deg, rgba(255,255,255,.03) 0 12px, rgba(0,0,0,.25) 12px 24px), rgba(6,7,10,.92); }
.h3l-comp-ph .in { position:relative; display:flex; flex-direction:column; gap:6px; align-items:center; text-align:center; max-width:70%; }
.h3l-comp-ph b { font-size:17px; color:#fff; } .h3l-comp-ph span { color:var(--mut); font-size:12px; }
.h3l-comp-ph small { color:rgba(255,255,255,.55); font-size:11px; font-style:italic; }
.h3l-btn.h3l-draft.on { background:rgba(250,204,21,.16); border-color:rgba(250,204,21,.55); color:#fde68a; }
.h3l-btn small.q { margin-left:6px; padding:1px 6px; border-radius:999px; background:rgba(255,255,255,.18); font-size:10px; font-weight:700; }
.h3l-clip .bd.draft { background:rgba(250,204,21,.2); color:#fde68a; }
.h3l-pill.old { color:var(--warn); }
.h3l-uptags { position:absolute; right:8px; top:6px; z-index:4; display:flex; gap:4px; pointer-events:auto; }
.h3l-clip .foot ~ .h3l-uptags, .h3l-uptags:has(~ .foot) { right:40px; }
.h3l-uptags span { font-size:10px; font-weight:800; padding:1px 6px; border-radius:999px; background:rgba(6,7,10,.7); color:#c4b5fd; border:1px solid rgba(167,139,250,.5); }
.h3l-uptags span.done { background:linear-gradient(90deg,#7c3aed,#2563eb); color:#fff; border-color:transparent; }
.h3l-uptags span.ok { color:#4ade80; border-color:rgba(74,222,128,.55); }
.h3l-upblock { display:flex; flex-direction:column; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid var(--line); }
.h3l-upblock .h3l-pills { flex-wrap:wrap; }
.h3l-upblock .h3l-pill.dis { opacity:.4; cursor:not-allowed; }
.h3l-btn.on { border-color:#4ade80; color:#4ade80; }
.h3l-note.ok { color:#86efac; }
.h3l-pvtabs { display:inline-flex; flex:none; width:auto; max-width:100%; flex-wrap:nowrap; }
.h3l-pvtabs .h3l-pill { flex:0 0 auto; }
.h3l-pill .dot { display:inline-block; width:7px; height:7px; margin-left:6px; border-radius:50%; background:var(--warn); box-shadow:0 0 6px rgba(251,191,36,.7); vertical-align:middle; }
.h3l-badge-live { position:absolute; left:12px; top:12px; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:700; background:rgba(6,7,10,.7); border:1px solid var(--line2); }
.h3l-transport { display:flex; align-items:center; justify-content:center; gap:8px; padding:12px 14px; }
.h3l-play { width:44px; height:44px; border-radius:50%; background:var(--grad); border:none; color:#fff; display:grid; place-items:center; cursor:pointer; box-shadow:0 8px 22px rgba(61,111,224,.45); }
.h3l-play svg { width:18px; height:18px; }
/* main player in browser fullscreen (⛶ / F) */
.h3l-center:fullscreen { background:#07080b; border-radius:0; padding:8px 0 0; }
.h3l-center:fullscreen .h3l-dyn { display:none; }
.h3l-center:fullscreen .h3l-frame { border-radius:4px; }
/* «Удобный просмотр» */
.h3l-viewer { position:fixed; inset:0; z-index:100000; display:flex; flex-direction:column; background:#03040a; color:var(--txt, #e7e9ff); outline:none; }
.h3l-viewer .vhd { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--line); min-width:0; }
.h3l-viewer .vtag { font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; padding:2px 8px; border-radius:6px; background:var(--grad); color:#fff; white-space:nowrap; }
.h3l-viewer .vtitle { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; } .h3l-viewer .vsub { white-space:nowrap; }
.h3l-viewer .grow { flex:1; }
.h3l-viewer .vzoom { display:flex; align-items:center; gap:4px; } .h3l-viewer .vzoom .zl { min-width:46px; text-align:right; font-variant-numeric:tabular-nums; }
.h3l-viewer .on { background:var(--grad) !important; color:#fff !important; border-color:transparent !important; }
.h3l-viewer .vvp { position:relative; flex:1; min-height:0; overflow:hidden; background:#000; touch-action:none; user-select:none; }
.h3l-viewer .vvp.zoomed { cursor:grab; } .h3l-viewer .vvp.drag { cursor:grabbing; }
.h3l-viewer .vct { position:absolute; left:50%; top:50%; transform-origin:50% 50%; will-change:transform; }
.h3l-viewer .vct > video { width:100%; height:100%; display:block; object-fit:contain; background:#000; pointer-events:none; }
.h3l-viewer .vct > .h3l-frame { border-radius:0; box-shadow:none; max-width:none; max-height:none; pointer-events:none; }
.h3l-viewer .vct .h3l-badge-live { display:none; }
.h3l-viewer .vct.px video, .h3l-viewer .vct.px img, .h3l-viewer .vct.px canvas { image-rendering:pixelated; }
.h3l-viewer .vbar { padding:8px 14px 0; }
.h3l-viewer .scrubw { position:relative; } .h3l-viewer .scrubw .scrub { width:100%; position:relative; z-index:1; }
.h3l-viewer .loopband { position:absolute; top:50%; height:14px; transform:translateY(-50%); border-radius:4px; background:rgba(127,176,255,.18); border:1px solid rgba(127,176,255,.45); display:none; pointer-events:none; }
.h3l-viewer .loopband.on { display:block; }
.h3l-viewer .vctr { display:flex; align-items:center; gap:8px; padding:8px 14px; flex-wrap:wrap; }
.h3l-viewer .vtime { font-variant-numeric:tabular-nums; font-size:12.5px; color:var(--mut); white-space:nowrap; } .h3l-viewer .vtime b { color:var(--txt, #fff); }
.h3l-viewer .sep { width:1px; height:20px; background:var(--line); margin:0 2px; }
.h3l-viewer .vkeys { padding:0 14px 8px; font-size:11px; opacity:.75; }
.h3l-time { font-variant-numeric:tabular-nums; color:var(--mut); font-size:12px; min-width:150px; text-align:center; }
.h3l-time b { color:var(--txt); }
/* ---------- inspector */
.h3l-insp { display:flex; flex-direction:column; gap:10px; min-height:0; overflow-x:clip; overflow-y:auto; padding-right:2px; align-content:flex-start; }
.h3l-insp > .h3l-card { flex:0 0 auto; overflow:visible; min-height:auto; max-height:none; }
.h3l-card { padding:14px; display:flex; flex-direction:column; gap:12px; }
.h3l-card-h { display:flex; align-items:center; gap:8px; }
.h3l-card-h h4 { margin:0; font-size:13px; font-weight:700; flex:1; display:flex; align-items:center; gap:8px; }
.h3l-num { min-width:24px; height:24px; padding:0 6px; border-radius:8px; display:grid; place-items:center; font-weight:800; font-size:12px; color:#fff; }
.h3l-lbl { font-size:11px; font-weight:600; color:var(--mut); text-transform:uppercase; letter-spacing:.6px; display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px; }
.h3l-lbl em { font-style:normal; text-transform:none; letter-spacing:0; color:var(--mut2); font-weight:500; }
.h3l-in, .h3l-ta, .h3l-sel { width:100%; background:rgba(6,7,10,.55); border:1px solid var(--line2); color:var(--txt); border-radius:10px; font:inherit; padding:8px 10px; transition:.15s; user-select:text; }
.h3l-in::placeholder, .h3l-ta::placeholder { color:var(--mut2); }
.h3l-in:focus, .h3l-ta:focus, .h3l-sel:focus { outline:none; border-color:var(--a1); box-shadow:0 0 0 3px rgba(79,140,255,.18); }
.h3l-ta { resize:vertical; min-height:84px; line-height:1.45; }
.h3l-ta.sm { min-height:54px; }
.h3l-ta.lg { min-height:128px; }
.h3l-ta.bad { border-color:var(--err,#ff5c7a); }
.h3l-sel { appearance:none; padding-right:26px; background-image:linear-gradient(45deg,transparent 50%,var(--mut) 50%),linear-gradient(135deg,var(--mut) 50%,transparent 50%);
  background-position:calc(100% - 14px) 52%, calc(100% - 9px) 52%; background-size:5px 5px; background-repeat:no-repeat; }
.h3l-sel option { background:#11152a; }
button.h3l-sel { display:inline-flex; align-items:center; gap:8px; cursor:pointer; text-align:left; user-select:none; }
button.h3l-sel .h3l-dd-lab { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
button.h3l-sel:disabled { opacity:.45; cursor:not-allowed; }
.h3l-menu .it.kb { background:color-mix(in srgb,var(--a1) 18%,transparent); }

.h3l-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.h3l-grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
.h3l-field .h3l-in, .h3l-field .h3l-sel { padding:7px 9px; }
.h3l-field.ov .h3l-in, .h3l-field.ov .h3l-sel { border-color:rgba(127,176,255,.55); background:rgba(127,176,255,.06); }
.h3l-row { display:flex; align-items:center; gap:8px; }
.h3l-range { -webkit-appearance:none; appearance:none; flex:1; height:6px; border-radius:6px; background:linear-gradient(90deg,var(--a1) var(--p,50%), rgba(200,208,224,.15) var(--p,50%)); outline:none; }
.h3l-range::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 0 0 4px rgba(79,140,255,.35); cursor:pointer; }
.h3l-val { font-variant-numeric:tabular-nums; font-weight:700; min-width:92px; text-align:right; font-size:12px; }
.h3l-val small { color:var(--mut); font-weight:500; }
.h3l-qs { display:flex; gap:6px; flex-wrap:wrap; }
.h3l-q { padding:3px 9px; border-radius:999px; border:1px solid var(--line2); color:var(--mut); font-size:11px; cursor:pointer; font-weight:600; }
.h3l-q:hover { color:var(--txt); border-color:var(--a2); } .h3l-q.on { color:#fff; border-color:transparent; background:var(--grad); }
.h3l-refs { display:flex; flex-wrap:wrap; gap:6px; min-height:40px; padding:6px; border-radius:12px; border:1.5px dashed rgba(200,208,224,.2); transition:.15s; }
.h3l-refs.over { border-color:var(--a2); background:rgba(127,176,255,.06); }
.h3l-ref { display:flex; align-items:center; gap:6px; padding:3px 6px 3px 3px; border-radius:10px; background:var(--panel2); border:1px solid var(--line2); cursor:pointer; font-size:11.5px; transition:.12s; }
.h3l-ref:hover { border-color:var(--a1); }
.h3l-ref img { width:26px; height:26px; border-radius:7px; object-fit:cover; }
.h3l-ref .tg { font-weight:700; background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; }
.h3l-ref .x { color:var(--mut2); padding:0 2px; } .h3l-ref .x:hover { color:var(--err); }
.h3l-ref.auto { border-style:dashed; cursor:default; } .h3l-ref.auto .ico { width:26px; height:26px; border-radius:7px; display:grid; place-items:center; background:rgba(127,176,255,.12); color:var(--a2); }
.h3l-refs .hint { color:var(--mut2); font-size:11.5px; align-self:center; padding:0 6px; }
.h3l-final { font-family:ui-monospace, "Cascadia Code", Consolas, monospace; font-size:11px; color:#b9c0ea; white-space:pre-wrap; background:rgba(6,7,10,.55); border:1px solid var(--line); border-radius:10px; padding:8px 10px; max-height:140px; overflow:auto; user-select:text; }
.h3l-final mark { background:rgba(79,140,255,.25); color:#e9d5ff; border-radius:4px; padding:0 2px; }
details.h3l-det > summary { cursor:pointer; list-style:none; display:flex; align-items:center; gap:6px; color:var(--mut); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; }
details.h3l-det > summary::-webkit-details-marker { display:none; }
details.h3l-det > summary::before { content:"›"; display:inline-block; transition:.15s; font-size:14px; }
details.h3l-det[open] > summary::before { transform:rotate(90deg); }
details.h3l-det > summary .cnt { background:var(--grad); color:#fff; border-radius:999px; padding:0 7px; font-size:10px; text-transform:none; }
details.h3l-det > .in { margin-top:10px; display:flex; flex-direction:column; gap:10px; }
.h3l-tog { display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; font-size:12.5px; }
.h3l-tog i { width:34px; height:20px; border-radius:20px; background:rgba(200,208,224,.18); position:relative; transition:.15s; flex:none; }
.h3l-tog i::after { content:""; position:absolute; top:3px; left:3px; width:14px; height:14px; border-radius:50%; background:#fff; transition:.15s; }
.h3l-tog.on i { background:var(--grad); } .h3l-tog.on i::after { left:17px; }
.h3l-note { font-size:11.5px; color:var(--mut); line-height:1.45; }
.h3l-note b { color:var(--txt); }
.h3l-colors { display:flex; gap:5px; }
.h3l-colors span { width:14px; height:14px; border-radius:50%; cursor:pointer; box-shadow:0 0 0 2px transparent; }
.h3l-colors span.on { box-shadow:0 0 0 2px #fff; }
.h3l-status { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; font-size:12px; background:rgba(52,211,153,.08); border:1px solid rgba(52,211,153,.25); color:#a7f3d0; }
.h3l-status.stale { background:rgba(251,191,36,.08); border-color:rgba(251,191,36,.3); color:#fde68a; }
.h3l-status.none { background:rgba(200,208,224,.06); border-color:var(--line); color:var(--mut); }
/* ---------- timeline */
.h3l-tl { display:flex; flex-direction:column; height:268px; min-height:0; }
.h3l-tl-bar { display:flex; align-items:center; gap:8px; padding:10px 12px 8px; }
.h3l-tl-bar .sep { width:1px; height:20px; background:var(--line2); margin:0 4px; }
.h3l-tl-bar .grow { flex:1; }
.h3l-zoom { display:flex; align-items:center; gap:8px; color:var(--mut); font-size:11px; }
.h3l-zoom .h3l-range { width:120px; flex:none; }
.h3l-tl-main { flex:1; display:grid; grid-template-columns:118px minmax(0,1fr); min-height:0; }
.h3l-heads { display:flex; flex-direction:column; padding-top:30px; }
.h3l-thead { display:flex; align-items:center; gap:7px; padding:0 12px; color:var(--mut); font-size:11.5px; font-weight:600; }
.h3l-thead svg { width:15px; height:15px; }
.h3l-thead.v { height:118px; } .h3l-thead.a { height:46px; }
.h3l-tscroll { position:relative; overflow-x:auto; overflow-y:hidden; min-height:0; }
.h3l-tinner { position:relative; height:100%; min-width:100%; }
.h3l-ruler { position:absolute; left:0; right:0; top:0; height:28px; cursor:pointer; border-bottom:1px solid var(--line); }
.h3l-tick { position:absolute; top:0; bottom:0; border-left:1px solid rgba(200,208,224,.16); }
.h3l-tick span { position:absolute; left:5px; top:6px; font-size:10.5px; color:var(--mut); font-variant-numeric:tabular-nums; white-space:nowrap; }
.h3l-tick.minor { top:20px; border-left-color:rgba(200,208,224,.10); }
.h3l-track { position:absolute; left:0; right:0; }
.h3l-track.v { top:36px; height:110px; } .h3l-track.a { top:154px; height:38px; }
.h3l-lane-bg { position:absolute; inset:0; border-radius:12px; background:rgba(200,208,224,.03); border:1px solid rgba(200,208,224,.05); }
.h3l-clip { position:absolute; top:0; bottom:0; border-radius:12px; overflow:hidden; cursor:pointer; color:#fff;
  background:linear-gradient(135deg,var(--c1),var(--c2)); box-shadow:0 6px 20px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.25); transition:box-shadow .15s, transform .15s, opacity .15s; }
.h3l-clip:hover { box-shadow:0 10px 26px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.3); }
.h3l-clip.sel { box-shadow:0 0 0 2px #fff, 0 0 0 5px rgba(79,140,255,.55), 0 12px 30px rgba(0,0,0,.5); z-index:3; }
.h3l-clip.dragging { opacity:.85; z-index:10; transform:translateY(-4px) scale(1.01); cursor:grabbing; transition:none; }
.h3l-clip.dropover { box-shadow:0 0 0 2px var(--a2), 0 0 26px rgba(127,176,255,.6); }
.h3l-clip .strip { position:absolute; inset:0; background-size:100% 100%; opacity:.62; mix-blend-mode:luminosity; }
.h3l-clip.has-strip .strip { mix-blend-mode:normal; opacity:.9; }
.h3l-clip.has-strip::before { content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(6,7,10,.72) 0%, rgba(6,7,10,.1) 45%, rgba(6,7,10,.75) 100%); z-index:1; }
.h3l-clip.has-strip { background:linear-gradient(135deg,var(--c1),var(--c2)); }
.h3l-clip.has-strip::after { content:""; position:absolute; left:0; right:0; top:0; height:3px; background:linear-gradient(90deg,var(--c1),var(--c2)); z-index:2; }
.h3l-clip > .c { position:absolute; inset:0; padding:8px 10px; display:flex; flex-direction:column; gap:4px; z-index:2; }
.h3l-clip .t { display:flex; align-items:center; gap:6px; font-weight:700; font-size:12px; white-space:nowrap; }
.h3l-clip .t .n { width:20px; height:20px; border-radius:7px; background:rgba(0,0,0,.28); display:grid; place-items:center; font-size:11px; flex:none; }
.h3l-clip .t .nm { overflow:hidden; text-overflow:ellipsis; }
.h3l-clip .t .d { margin-left:auto; font-size:10.5px; font-weight:600; background:rgba(0,0,0,.28); padding:1px 6px; border-radius:6px; flex:none; }
.h3l-clip .p { font-size:11px; opacity:.85; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.3; }
.h3l-clip .rf { display:flex; gap:-4px; margin-top:auto; align-items:center; }
.h3l-clip .rf img { width:20px; height:20px; border-radius:50%; object-fit:cover; border:2px solid rgba(255,255,255,.85); margin-right:-6px; }
.h3l-clip .rf .lk { margin-left:12px; font-size:10px; font-weight:700; background:rgba(0,0,0,.3); padding:1px 6px; border-radius:6px; }
.h3l-clip .bd { position:absolute; right:8px; bottom:7px; z-index:3; font-size:10px; font-weight:800; padding:2px 7px; border-radius:999px; background:rgba(6,7,10,.6); }
.h3l-clip .bd.ok { color:#6ee7b7; } .h3l-clip .bd.stale { color:#fde68a; } .h3l-clip .bd.cache { color:#93c5fd; }
.h3l-clip .hr { position:absolute; right:0; top:0; bottom:0; width:10px; cursor:ew-resize; z-index:4; }
.h3l-clip .hr::after { content:""; position:absolute; right:3px; top:50%; width:3px; height:28px; margin-top:-14px; border-radius:3px; background:rgba(255,255,255,.7); opacity:0; transition:.15s; }
.h3l-clip:hover .hr::after, .h3l-clip.sel .hr::after { opacity:1; }
.h3l-clip .pg { position:absolute; left:0; right:0; bottom:0; height:100%; z-index:1; pointer-events:none; display:none; }
.h3l-clip.running .pg { display:block; }
.h3l-clip .pg i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg, rgba(255,255,255,.0), rgba(255,255,255,.28)); border-right:2px solid #fff; transition:width .3s; }
.h3l-clip.running { animation:h3l-pulse 1.6s ease-in-out infinite; }
@keyframes h3l-pulse { 0%,100% { box-shadow:0 0 0 2px rgba(255,255,255,.7), 0 0 18px rgba(79,140,255,.5); } 50% { box-shadow:0 0 0 2px #fff, 0 0 34px rgba(127,176,255,.75); } }
.h3l-clip.queued { opacity:.75; }
.h3l-blend { position:absolute; top:6px; bottom:6px; z-index:5; border-radius:9px; pointer-events:auto;
  background:repeating-linear-gradient(-45deg, rgba(255,255,255,.28) 0 6px, rgba(255,255,255,.06) 6px 12px); border:1.5px solid rgba(255,255,255,.65);
  box-shadow:0 0 18px rgba(127,176,255,.35); display:grid; place-items:center; }
.h3l-blend span { font-size:10px; font-weight:800; background:rgba(6,7,10,.75); padding:2px 6px; border-radius:6px; white-space:nowrap; }
.h3l-seamq { position:absolute; top:3px; width:10px; height:10px; margin-left:-5px; border-radius:50%; z-index:7; cursor:pointer; border:2px solid rgba(0,0,0,.55); }
.h3l-seamq.ok { background:#5fd38d; } .h3l-seamq.soft { background:#ffb547; box-shadow:0 0 8px #ffb547; } .h3l-seamq.hard { background:#ff5c7a; box-shadow:0 0 10px #ff5c7a; }
.h3l-seamv { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; margin-top:6px; padding:3px 8px; border-radius:8px; background:rgba(255,255,255,.05); }
.h3l-seamv b { width:8px; height:8px; border-radius:50%; display:inline-block; } .h3l-seamv.ok b { background:#5fd38d; } .h3l-seamv.soft b { background:#ffb547; } .h3l-seamv.hard b { background:#ff5c7a; }
.h3l-cutmark { position:absolute; top:10px; bottom:10px; width:3px; margin-left:-1.5px; border-radius:3px; background:var(--a3); z-index:5; box-shadow:0 0 12px var(--a3); }
.h3l-ext { position:absolute; top:0; bottom:0; width:116px; border-radius:12px; border:1.5px dashed rgba(200,208,224,.35); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
  color:var(--mut); cursor:pointer; font-weight:700; font-size:12px; transition:.15s; background:rgba(200,208,224,.03); }
.h3l-ext:hover { color:#fff; border-color:transparent; background:var(--grad); box-shadow:0 8px 24px rgba(61,111,224,.45); }
.h3l-ext svg { width:22px; height:22px; }
.h3l-ext small { font-weight:500; font-size:10px; opacity:.8; }
.h3l-ins { position:absolute; top:-4px; bottom:-4px; width:4px; margin-left:-2px; border-radius:4px; background:var(--a2); box-shadow:0 0 14px var(--a2); z-index:12; }
.h3l-audio { position:absolute; top:0; bottom:0; border-radius:10px; overflow:hidden; display:flex; align-items:center; padding:0 12px; font-size:11px; font-weight:600; gap:8px; }
.h3l-audio.none { background:rgba(200,208,224,.05); color:var(--mut2); border:1px dashed rgba(200,208,224,.15); }
.h3l-audio.reference { background:linear-gradient(90deg,rgba(79,140,255,.45),rgba(79,140,255,.35)); color:#fff; }
.h3l-audio.locked { background:linear-gradient(90deg,rgba(127,176,255,.45),rgba(16,185,129,.35)); color:#fff; }
.h3l-audio .wv { position:absolute; inset:6px 0; opacity:.35; background:repeating-linear-gradient(90deg, rgba(255,255,255,.9) 0 2px, transparent 2px 5px);
  -webkit-mask:linear-gradient(180deg,transparent 0,#000 30%,#000 70%,transparent 100%); }
.h3l-audio span { position:relative; }
.h3l-phead { position:absolute; top:0; bottom:0; width:0; z-index:20; pointer-events:none; }
.h3l-phead::before { content:""; position:absolute; top:0; bottom:0; left:-1px; width:2px; background:#fff; box-shadow:0 0 10px rgba(255,255,255,.6); }
.h3l-phead::after { content:""; position:absolute; top:0; left:-7px; width:14px; height:16px; background:#fff; clip-path:polygon(0 0,100% 0,100% 60%,50% 100%,0 60%); border-radius:3px; }
.h3l-tip { position:fixed; z-index:100002; pointer-events:none; padding:5px 9px; border-radius:8px; background:#0d0f13; border:1px solid var(--line2); font-size:11.5px; font-weight:600; color:#fff; box-shadow:0 8px 20px rgba(0,0,0,.5); }
.h3l-pop { position:absolute; z-index:100003; top:62px; right:220px; width:440px; max-height:50vh; overflow:auto; padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
.h3l-pop div { font-size:12px; color:#fde68a; display:flex; gap:8px; } .h3l-pop div::before { content:"⚠"; }
.h3l-toast { position:fixed; left:50%; bottom:300px; transform:translateX(-50%); z-index:100004; padding:10px 16px; border-radius:12px; background:linear-gradient(var(--panel2),var(--panel2)),var(--bg1); border:1px solid var(--line2);
  box-shadow:0 12px 30px rgba(0,0,0,.5); font-weight:600; font-size:12.5px; animation:h3l-toast-in .15s ease-out; }
@keyframes h3l-toast-in { from { opacity:0; transform:translateX(-50%) scale(.985); } to { opacity:1; transform:translateX(-50%); } }
.h3l-toast.act { display:flex; align-items:center; gap:12px; }
.h3l-toast.err { border-color:rgba(251,113,133,.5); color:#fecdd3; }
.h3l-keys { display:grid; grid-template-columns:auto 1fr; gap:8px 12px; font-size:12px; }
.h3l-keys kbd { font-family:inherit; font-size:11px; font-weight:700; padding:2px 7px; border-radius:6px; background:rgba(200,208,224,.1); border:1px solid var(--line2); border-bottom-width:2px; white-space:nowrap; }
/* ---------- compact node view */
.h3l-compact { display:flex; flex-direction:column; gap:8px; padding:8px; border-radius:14px; height:100%; overflow:hidden;
  background: radial-gradient(300px 140px at 10% 0%, rgba(79,140,255,.25), transparent 70%), radial-gradient(260px 140px at 100% 100%, rgba(127,176,255,.16), transparent 70%), #070a14;
  border:1px solid rgba(200,208,224,.14); }
.h3l-compact .pv { position:relative; flex:1; min-height:70px; border-radius:10px; overflow:hidden; background:#07080b; display:grid; place-items:center; color:var(--mut); font-size:11px; }
.h3l-compact .pv img { width:100%; height:100%; object-fit:cover; position:absolute; inset:0; }
.h3l-compact .pv .ttl { position:relative; display:flex; align-items:center; gap:8px; font-weight:800; font-size:14px; color:#fff; }
.h3l-compact .pv .ttl i { width:26px; height:26px; border-radius:9px; background:var(--grad); display:grid; place-items:center; font-style:normal; font-size:13px; }
.h3l-compact .mini { display:flex; gap:3px; height:12px; }
.h3l-compact .mini span { border-radius:4px; background:linear-gradient(135deg,var(--c1),var(--c2)); min-width:4px; }
.h3l-compact .mini span.done { box-shadow:inset 0 -3px 0 rgba(255,255,255,.65); }
.h3l-compact .inf { display:flex; justify-content:space-between; gap:6px; color:var(--mut); font-size:11px; white-space:nowrap; overflow:hidden; }
.h3l-compact .inf b { color:var(--txt); }
.h3l-compact .prog { height:4px; border-radius:4px; background:rgba(200,208,224,.12); overflow:hidden; display:none; }
.h3l-compact .prog.on { display:block; } .h3l-compact .prog i { display:block; height:100%; background:var(--grad); width:0; transition:width .3s; }
.h3l-compact .open { height:38px; border:none; border-radius:11px; background:var(--grad); color:#fff; font:inherit; font-weight:800; font-size:13.5px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 6px 18px rgba(61,111,224,.45), inset 0 1px 0 rgba(255,255,255,.25); }
.h3l-compact .open:hover { filter:brightness(1.12); }
.h3l-compact .open svg { width:16px; height:16px; }
.h3l-compact .open.legacy { height:30px; font-size:12.5px; background:rgba(251,191,36,.16); color:#fde68a; box-shadow:inset 0 0 0 1px rgba(251,191,36,.45); }
/* ---------------- v2: takes, markers, audio clip, thumbnails, menus, live preview ---------------- */
.h3l-tl { height:282px; }
.h3l-thead.a { height:56px; }
.h3l-track.a { top:154px; height:48px; }
.h3l-row.wrap { flex-wrap:wrap; gap:8px; }
.h3l-takes { display:flex; flex-direction:column; gap:8px; padding-top:2px; }
.h3l-take-row { display:flex; gap:8px; overflow-x:auto; padding:2px 2px 6px; scrollbar-width:thin; }
.h3l-take { position:relative; flex:none; width:84px; height:52px; border-radius:10px; overflow:hidden; cursor:pointer; border:1.5px solid var(--line2);
  background:var(--bg2); transition:transform .12s, border-color .12s, box-shadow .12s; }
.h3l-take:hover { transform:translateY(-2px); border-color:var(--a2); }
.h3l-take.on { border-color:transparent; box-shadow:0 0 0 2px #fff, 0 0 0 4px rgba(79,140,255,.6), 0 6px 18px rgba(0,0,0,.45); }
.h3l-take img, .h3l-take .ph { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.h3l-take .ph { background:linear-gradient(135deg,rgba(79,140,255,.35),rgba(127,176,255,.25)); }
.h3l-take .k { position:absolute; left:5px; top:4px; font-size:10px; font-weight:800; background:rgba(6,7,10,.72); padding:1px 6px; border-radius:6px; }
.h3l-take.on .k { background:var(--grad); }
.h3l-take .sd { position:absolute; left:0; right:0; bottom:0; font-size:9.5px; padding:8px 5px 3px; background:linear-gradient(180deg,transparent,rgba(6,7,10,.85)); color:#cbd5ff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3l-take .x { position:absolute; right:3px; top:2px; font-size:10px; color:#fff; background:rgba(6,7,10,.6); border-radius:6px; padding:0 4px; opacity:0; transition:.12s; }
.h3l-take:hover .x { opacity:1; } .h3l-take .x:hover { color:var(--err); }
.h3l-clip .tk { position:absolute; left:8px; bottom:7px; z-index:4; font-size:10px; font-weight:800; padding:2px 7px 2px 5px; border-radius:999px; background:rgba(6,7,10,.68);
  color:#e9d5ff; display:flex; gap:4px; align-items:center; cursor:pointer; border:1px solid rgba(167,139,250,.45); }
.h3l-clip .tk:hover { background:var(--grad); color:#fff; }
.h3l-clip .tk i { font-style:normal; opacity:.85; }
.h3l-clip .rf { margin-left:0; }
.h3l-clip:has(.tk) .rf { padding-left:54px; }
.h3l-clip .strip.tiles { background:#000; opacity:1; mix-blend-mode:normal; }
.h3l-clip .strip.tiles i { position:absolute; top:0; bottom:0; background-repeat:no-repeat; border-right:1px solid rgba(0,0,0,.55); }
.h3l-clip.is-stale .strip { filter:saturate(.35) brightness(.8); }
.h3l-clip.is-stale::after { background:repeating-linear-gradient(90deg,var(--warn) 0 8px,transparent 8px 14px) !important; }
.h3l-mk { position:absolute; top:2px; height:24px; z-index:22; transform:translateX(-1px); display:flex; align-items:center; gap:3px; cursor:grab; pointer-events:auto; }
.h3l-mk .f { width:18px; height:18px; display:grid; place-items:center; font-size:10px; color:#07080b; font-weight:900; background:var(--mc);
  clip-path:polygon(0 0,100% 0,100% 72%,50% 100%,0 72%); border-radius:3px; box-shadow:0 0 10px var(--mc); margin-left:-9px; }
.h3l-mk .lb { font-size:10px; font-weight:700; color:var(--mc); white-space:nowrap; max-width:120px; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 4px #000; }
.h3l-mk.sel .f { outline:2px solid #fff; outline-offset:1px; }
.h3l-mk.off { opacity:.45; }
.h3l-mk-line { position:absolute; top:26px; bottom:0; width:0; border-left:1px dashed var(--mc); opacity:.38; z-index:6; pointer-events:none; }
.h3l-mk-line.sel { opacity:.9; }
.h3l-mcard { border-color:color-mix(in srgb, var(--mc) 45%, transparent) !important; box-shadow:0 0 0 1px color-mix(in srgb, var(--mc) 25%, transparent), 0 12px 32px rgba(0,0,0,.35); }
.h3l-num.mk { background:var(--mc) !important; color:#07080b; }
.h3l-audio.clip { padding:0; cursor:grab; border:1px solid rgba(255,255,255,.18); }
.h3l-audio.clip.reference { background:linear-gradient(90deg,rgba(127,176,255,.30),rgba(59,130,246,.22)); border:1.5px dashed rgba(127,176,255,.8); }
.h3l-audio.clip.locked { background:linear-gradient(90deg,rgba(245,158,11,.42),rgba(249,115,22,.30)); border:1.5px solid rgba(251,191,36,.9); box-shadow:0 0 16px rgba(251,191,36,.25); }
.h3l-audio.clip.none { background:rgba(200,208,224,.07); border:1px dashed rgba(200,208,224,.25); }
.h3l-audio.clip .wf { position:absolute; left:0; top:4px; pointer-events:none; }
.h3l-audio.clip .lbl { position:absolute; left:10px; top:3px; font-size:10.5px; font-weight:800; color:#fff; text-shadow:0 1px 4px #000; white-space:nowrap; pointer-events:none; z-index:2; }
.h3l-audio.clip .lbl small { font-weight:500; opacity:.8; }
.h3l-audio.clip .th { position:absolute; top:0; bottom:0; width:9px; cursor:ew-resize; z-index:3; }
.h3l-audio.clip .th.l { left:0; } .h3l-audio.clip .th.r { right:0; }
.h3l-audio.clip .th::after { content:""; position:absolute; top:50%; width:3px; height:22px; margin-top:-11px; border-radius:3px; background:rgba(255,255,255,.85); opacity:0; transition:.12s; }
.h3l-audio.clip .th.l::after { left:3px; } .h3l-audio.clip .th.r::after { right:3px; }
.h3l-audio.clip:hover .th::after { opacity:1; }
.h3l-aend { position:absolute; top:-3px; bottom:-3px; width:2px; background:var(--err); opacity:.7; border-radius:2px; z-index:3; }
.h3l-afile { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:12px; background:rgba(127,176,255,.07); border:1px solid rgba(127,176,255,.25); }
.h3l-afile > i { width:30px; height:30px; border-radius:9px; display:grid; place-items:center; background:var(--grad); color:#fff; flex:none; }
.h3l-afile > i svg { width:16px; height:16px; }
.h3l-afile > div { min-width:0; flex:1; display:flex; flex-direction:column; }
.h3l-afile b { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .h3l-afile small { color:var(--mut); font-size:11px; }
.h3l-pill.lk.on { background:linear-gradient(135deg,#f59e0b,#f97316); }
.h3l-hover { position:absolute; z-index:100003; display:none; pointer-events:none; padding:5px; border-radius:12px; background:rgba(10,14,28,.92);
  border:1px solid var(--line2); box-shadow:0 14px 40px rgba(0,0,0,.6); backdrop-filter:blur(10px); }
.h3l-hover .im { border-radius:8px; background-repeat:no-repeat; }
.h3l-hover span { display:block; text-align:center; font-size:11px; font-weight:700; padding:4px 0 1px; color:var(--txt); font-variant-numeric:tabular-nums; }
.h3l-menu { position:fixed; z-index:100004; min-width:250px; padding:6px; border-radius:14px; box-shadow:0 18px 48px rgba(0,0,0,.6); }
.h3l-menu .hd { font-size:11px; color:var(--mut); font-weight:700; padding:6px 10px 4px; text-transform:uppercase; letter-spacing:.04em; }
.h3l-menu { max-width:440px; }
.h3l-menu .it { display:flex; align-items:center; gap:10px; padding:0 10px; height:32px; min-height:32px; border-radius:9px; cursor:pointer; font-size:12.5px; white-space:nowrap; overflow:hidden; }
.h3l-menu .it .ic { width:16px; height:16px; flex:none; display:grid; place-items:center; font-style:normal; font-size:13px; line-height:1; color:var(--a2); }
.h3l-menu .it .lb { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.h3l-menu .it img, .h3l-menu .it video, .h3l-menu .it audio { display:none !important; }
.h3l-menu .it svg { width:15px; height:15px; color:var(--a2); flex:none; }
.h3l-menu .it:hover { background:color-mix(in srgb,var(--a1) 18%,transparent); }
.h3l-menu .it.dis { opacity:.4; cursor:default; } .h3l-menu .it.dis:hover { background:none; }
.h3l-menu .it.danger, .h3l-menu .it.danger svg, .h3l-menu .it.danger .ic { color:var(--err); }
.h3l-menu .it kbd { margin-left:auto; font-size:10px; color:var(--mut); border:1px solid var(--line2); border-radius:5px; padding:0 5px; }
.h3l-menu .sep { height:1px; margin:4px 6px; background:var(--line); }
.h3l-live { position:absolute; inset:0; z-index:6; background:#000; }
.h3l-tileov { position:absolute; inset:0; z-index:7; pointer-events:none; background-image:linear-gradient(rgba(255,255,255,.0),rgba(255,255,255,0)); }
.h3l-tileov .cur { position:absolute; border:2px solid #a78bfa; background:rgba(167,139,250,.14); box-shadow:0 0 0 1px rgba(0,0,0,.5), 0 0 18px rgba(167,139,250,.5); border-radius:4px; transition:all .25s; }
.h3l-tileov .lbl { position:absolute; right:10px; top:10px; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:700; background:rgba(6,7,10,.75); border:1px solid var(--line2); color:#e9e5ff; }
.h3l-tileset { display:flex; flex-direction:column; gap:6px; }
.h3l-live img { width:100%; height:100%; object-fit:contain; image-rendering:auto; filter:saturate(1.05); }
.h3l-badge-live.rec i { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--err); margin-right:6px; box-shadow:0 0 8px var(--err); animation:h3l-blink 1s infinite; }
@keyframes h3l-blink { 50% { opacity:.25; } }
.h3l-ruler { background:linear-gradient(180deg,rgba(200,208,224,.05),transparent); }
.h3l-clip .t .n { background:rgba(0,0,0,.38); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); }

.h3l-live canvas { position:absolute; inset:0; width:100%; height:100%; }
.h3l-live .h3l-badge-live { z-index:2; }
.h3l-live-pg { position:absolute; left:0; right:0; bottom:0; height:3px; background:rgba(255,255,255,.12); z-index:2; }
.h3l-live-pg i { display:block; height:100%; background:var(--grad); transition:width .3s; }
.h3l-compact canvas.live { position:absolute; inset:0; width:100%; height:100%; }
.h3l-compact .ttl.live i { color:#fb7185; background:none; animation:h3l-blink 1s infinite; }
.h3l-seam { position:absolute; top:-2px; bottom:-2px; width:14px; margin-left:-7px; z-index:8; cursor:col-resize; display:grid; place-items:center; }
.h3l-seam::before { content:""; width:4px; height:46px; border-radius:4px; background:#fff; opacity:0; box-shadow:0 0 12px rgba(127,176,255,.9); transition:opacity .12s, height .12s; }
.h3l-seam:hover::before, .h3l-seam.on::before { opacity:1; height:70px; }
.h3l-seam span { position:absolute; top:50%; margin-top:-9px; width:18px; height:18px; border-radius:50%; background:var(--grad); color:#fff; font-size:10px; display:grid; place-items:center; opacity:0; transition:.12s; pointer-events:none; }
.h3l-seam:hover span, .h3l-seam.on span { opacity:1; }

.h3l-compact .pv .ttl.live { position:absolute; left:8px; bottom:6px; font-size:11px; gap:4px; text-shadow:0 1px 6px #000; }
.h3l-compact .pv .ttl.live i { width:auto; height:auto; }

.h3l-sink { position:fixed; left:-9999px; top:0; width:1px; height:1px; opacity:0; pointer-events:none; }
.h3l-arows { display:flex; flex-direction:column; gap:6px; }
.h3l-arows .h3l-field { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.h3l-arows .h3l-lbl { margin:0; align-items:flex-start; text-align:left; text-transform:none; letter-spacing:0; font-size:12px; display:flex; flex-direction:row; justify-content:flex-start; align-items:baseline; gap:6px; }
.h3l-arows .h3l-lbl em { font-style:normal; opacity:.6; font-size:10.5px; }
.h3l-arows input { width:92px; flex:none; text-align:right; }

/* ---- v3: resizable panels, video end marker, audio assets + 2-lane track, volume */
.h3l-root { grid-template-rows:56px minmax(0,1fr) 8px var(--th,282px); row-gap:3px; }
.h3l-body { grid-template-columns:60px var(--lw,272px) 8px minmax(0,1fr) 8px var(--rw,372px); column-gap:2px; }
.h3l-tl { height:auto; min-height:0; }
.h3l-split { position:relative; z-index:5; border-radius:6px; transition:background .12s; }
.h3l-split.v { cursor:col-resize; } .h3l-split.hz { cursor:row-resize; }
.h3l-split::after { content:""; position:absolute; border-radius:3px; background:rgba(200,208,224,.18); transition:.12s; }
.h3l-split.v::after { top:50%; left:3px; width:2px; height:44px; margin-top:-22px; }
.h3l-split.hz::after { left:50%; top:3px; height:2px; width:64px; margin-left:-32px; }
.h3l-split:hover, .h3l-split.on { background:rgba(79,140,255,.16); }
.h3l-split:hover::after, .h3l-split.on::after { background:var(--a1); }
.h3l-split.v:hover::after, .h3l-split.v.on::after { top:0; height:100%; margin-top:0; }
.h3l-split.hz:hover::after, .h3l-split.hz.on::after { left:0; width:100%; margin-left:0; }
.h3l-agrid { grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)); }
.h3l-tscroll { overflow-y:auto; }
.h3l-tinner { min-height:214px; }
.h3l-thead.a { height:92px; align-items:flex-start; padding-top:12px; }
.h3l-track.a { top:154px; height:84px; }
.h3l-track.a.dropover .h3l-alane { background:rgba(251,191,36,.12); border-color:rgba(251,191,36,.6); }
.h3l-alane { position:absolute; left:0; right:0; border-radius:10px; background:rgba(200,208,224,.035); border:1px dashed rgba(200,208,224,.08); }
.h3l-audio.none { top:0; }
.h3l-audio.clip.sel { box-shadow:0 0 0 2px #fff, 0 0 18px rgba(251,191,36,.45); z-index:4; }
.h3l-audio.clip.unknown { border-style:dashed; }
/* video end */
.h3l-beyond { position:absolute; top:26px; bottom:0; z-index:15; pointer-events:none;
  background:repeating-linear-gradient(135deg, rgba(6,7,10,.62) 0 10px, rgba(6,7,10,.74) 10px 20px); border-left:2px solid rgba(244,63,94,.85); }
.h3l-vend { position:absolute; top:2px; z-index:22; transform:translateX(-1px); cursor:ew-resize; }
.h3l-vend span { display:block; padding:2px 8px; border-radius:0 7px 7px 0; font-size:10px; font-weight:800; color:#fff; background:rgba(244,63,94,.55); border:1px dashed rgba(255,255,255,.6); white-space:nowrap; }
.h3l-vend.set span { background:linear-gradient(90deg,#f43f5e,#5b8fe8); border:none; box-shadow:0 2px 10px rgba(244,63,94,.45); }
.h3l-clip.is-out { filter:grayscale(.85) brightness(.55); }
.h3l-clip .bd.out { background:rgba(244,63,94,.85); color:#fff; }
.h3l-endbox { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--mut); }
.h3l-endbox .h3l-in { width:74px; padding:4px 6px; text-align:right; }
.h3l-endbox .h3l-btn.on { background:rgba(79,140,255,.25); border-color:rgba(79,140,255,.6); color:#fff; }
.h3l-zoom .h3l-range { width:160px; }
/* audio assets */
.h3l-asset.audio { background:linear-gradient(160deg,rgba(245,158,11,.20),rgba(16,18,23,.9) 60%); display:flex; flex-direction:column; }
.h3l-asset.audio.virtual { background:linear-gradient(160deg,rgba(127,176,255,.16),rgba(16,18,23,.9) 60%); border-style:dashed; }
.h3l-asset.audio canvas.wf { position:absolute; left:8px; right:8px; top:34%; width:calc(100% - 16px); height:30%; pointer-events:none; }
.h3l-asset.audio .play { position:absolute; right:6px; bottom:30px; width:28px; height:28px; padding:0; z-index:3; }
.h3l-asset.audio .cap small { opacity:.7; font-size:10px; }
.h3l-asset .cat.audio { color:#fcd34d; }
.h3l-ref.aud .ico { width:26px; height:26px; border-radius:7px; display:grid; place-items:center; background:rgba(251,191,36,.16); color:#fcd34d; font-weight:800; }
.h3l-ref.aud.over { border-color:var(--err); opacity:.6; }
.h3l-alist { display:flex; flex-direction:column; gap:4px; }
.h3l-alist .it { display:flex; justify-content:space-between; gap:8px; padding:6px 9px; border-radius:9px; background:var(--panel2); border:1px solid var(--line2); cursor:pointer; font-size:11.5px; }
.h3l-alist .it span { color:var(--mut); white-space:nowrap; } .h3l-alist .it b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.h3l-alist .it.on { border-color:rgba(251,191,36,.8); background:rgba(251,191,36,.12); }
.h3l-in.ro { color:var(--mut); width:92px; text-align:right; }
/* player volume */
.h3l-transport .grow { flex:1; }
.h3l-volume { display:flex; align-items:center; gap:6px; }
.h3l-volume .h3l-range { width:96px; flex:none; }
.h3l-volume .h3l-btn.warn { color:#fbbf24; border-color:rgba(251,191,36,.7); animation:h3lpulse 1.2s ease-in-out infinite; }
@keyframes h3lpulse { 50% { box-shadow:0 0 0 4px rgba(251,191,36,.25); } }

/* ---- sampling dynamics under the player */
.h3l-dyn { margin:0 14px 12px; border-radius:12px; background:rgba(6,7,10,.55); border:1px solid var(--line2); font-size:11px; color:var(--mut); flex:none; }
.h3l-dyn .hd { display:flex; align-items:center; gap:10px; padding:7px 12px; cursor:pointer; user-select:none; }
.h3l-dyn .hd b { color:var(--txt,#eceff4); font-weight:700; letter-spacing:.02em; }
.h3l-dyn .hd .grow { flex:1; }
.h3l-dyn .hd .nf { font-variant-numeric:tabular-nums; }
.h3l-dyn .st { padding:2px 8px; border-radius:7px; background:rgba(200,208,224,.10); font-family:ui-monospace,monospace; }
.h3l-dyn .st.on { background:rgba(34,197,94,.16); color:#86efac; }
.h3l-dyn .bd { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:0 10px 10px; }
.h3l-dyn.closed .bd { display:none; }
.h3l-dyn .ch { position:relative; height:84px; border-radius:9px; background:rgba(0,0,0,.35); border:1px solid rgba(200,208,224,.08); }
.h3l-dyn .ch canvas { position:absolute; inset:18px 0 0 0; width:100%; height:calc(100% - 18px); }
.h3l-dyn .lb { position:absolute; left:9px; top:4px; font-family:ui-monospace,monospace; font-size:10px; }
.h3l-dyn .lb b { color:#eceff4; } .h3l-dyn .lb em { color:#fb923c; font-style:normal; }

.h3l-panel .h3l-pills { flex-wrap:wrap; height:auto; }
.h3l-panel .h3l-pills .h3l-pill { flex:1 0 auto; }

/* per-clip generate / new take */
.h3l-clip .acts { position:absolute; right:6px; bottom:6px; display:flex; gap:4px; z-index:5; opacity:0; transition:opacity .12s; }
.h3l-clip:hover .acts, .h3l-clip.sel .acts { opacity:1; }
.h3l-cb { width:24px; height:24px; padding:0; display:grid; place-items:center; border-radius:7px; border:1px solid rgba(255,255,255,.25); background:rgba(10,12,24,.78); color:#fff; cursor:pointer; }
.h3l-cb svg { width:13px; height:13px; }
.h3l-cb:hover { background:var(--grad); border-color:transparent; }
.h3l-cb.dis { opacity:.35; cursor:not-allowed; }
.h3l-cb.dis:hover { background:rgba(10,12,24,.78); border-color:rgba(255,255,255,.25); }
.h3l-note.warn { color:#fbbf24; }
.h3l-menu .why { padding:4px 12px 8px; font-size:11px; color:#fbbf24; max-width:280px; line-height:1.35; }

/* frozen segment */
.h3l-clip.frozen { box-shadow:inset 0 0 0 2px rgba(148,163,184,.75); }
.h3l-clip.frozen::after { content:""; position:absolute; inset:0; pointer-events:none; border-radius:inherit; background:repeating-linear-gradient(135deg, rgba(148,163,184,.10) 0 6px, transparent 6px 14px); }
.h3l-clip .frz { position:absolute; left:8px; bottom:6px; z-index:4; padding:1px 7px; border-radius:6px; font-size:10px; font-weight:700; color:#e2e8f0; background:rgba(15,23,42,.85); border:1px solid rgba(148,163,184,.6); }

/* video assets / footage */
.h3l-asset.video .ph { height:100%; display:flex; align-items:center; justify-content:center; font-size:28px; background:linear-gradient(135deg,#1e293b,#0f172a); }
.h3l-asset.video .dur { position:absolute; right:6px; bottom:26px; padding:1px 6px; border-radius:5px; font-size:10px; font-weight:700; background:rgba(0,0,0,.65); color:#fff; }
.h3l-asset .cat.video { background:rgba(14,165,233,.85); }
.h3l-ref.vid img { width:26px; height:18px; object-fit:cover; border-radius:4px; }
.h3l-ref.vid.over { opacity:.45; text-decoration:line-through; }
.h3l-clip .foot { position:absolute; right:8px; top:6px; z-index:4; padding:0 6px; border-radius:6px; font-size:11px; background:rgba(14,165,233,.85); color:#fff; }
.h3l-foot { display:flex; flex-direction:column; gap:8px; padding:10px; border-radius:10px; background:rgba(14,165,233,.08); border:1px solid rgba(14,165,233,.35); }
.h3l-foot .h3l-val.warn { color:var(--warn); }
.h3l-sw-lora-panel { display:flex; flex-direction:column; gap:8px; min-width:0; border-top:1px solid var(--line2); padding-top:12px; }
.h3l-sw-lora-head { justify-content:space-between; flex-wrap:wrap; }
.h3l-sw-lora-head b { font-size:12px; }
.h3l-sw-lora-choice { width:100%; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:4px;
  padding:9px 11px; border-radius:9px; background:var(--field); border:1px solid var(--line2);
  color:var(--txt); font:inherit; text-align:left; cursor:pointer; }
.h3l-sw-lora-choice:hover, .h3l-sw-lora-choice[aria-expanded="true"] { border-color:var(--a1); }
.h3l-sw-lora-choice b { max-width:100%; font-size:12px; white-space:normal; overflow-wrap:anywhere; }
.h3l-sw-lora-choice small { color:var(--mut); max-width:100%; font-size:11px; overflow-wrap:anywhere; }
.h3l-sw-lora-search { width:100%; min-width:0; }
.h3l-sw-lora-list { max-height:240px; min-height:0; overflow-y:auto; overscroll-behavior:contain;
  background:var(--bg2); border:1px solid var(--line2); border-radius:9px; padding:4px; scrollbar-width:thin; }
.h3l-sw-lora-option { display:flex; flex-direction:column; gap:3px; min-width:0; width:100%; padding:8px 10px;
  background:transparent; border:0; border-radius:6px; font:inherit; color:var(--txt); cursor:pointer; text-align:left; }
.h3l-sw-lora-option:hover, .h3l-sw-lora-option:focus-visible { background:var(--control); }
.h3l-sw-lora-option.on { background:rgba(79,140,255,.20); box-shadow:inset 3px 0 var(--a1); }
.h3l-sw-lora-option b, .h3l-sw-lora-option small { overflow-wrap:anywhere; }
.h3l-sw-lora-option small, .h3l-sw-lora-empty { font-size:11px; color:var(--mut); }
.h3l-sw-lora-empty { padding:11px; }
.h3l-sw-lora-strength { width:100%; min-width:0; accent-color:var(--a1); }
.h3l-sw-lora-panel > .h3l-row { justify-content:space-between; }
.h3l-sw-lora-panel > .h3l-btn { align-self:flex-start; }

.h3l-ext.dropover { outline:2px dashed #38bdf8; background:rgba(56,189,248,.18); }

/* empty gap before a fixed end marker */
.h3l-gap { position:absolute; top:6px; bottom:6px; z-index:1; border-radius:8px; border:1.5px dashed rgba(251,191,36,.7); background:repeating-linear-gradient(135deg, rgba(251,191,36,.10) 0 8px, transparent 8px 16px); display:flex; align-items:center; justify-content:center; cursor:pointer; color:#fbbf24; font-size:11px; font-weight:600; }
.h3l-gap:hover { background:rgba(251,191,36,.18); }
.h3l-endmode { display:inline-flex; gap:2px; margin-left:4px; }
.h3l-endmode .h3l-pill { padding:2px 8px; font-size:11px; }

/* run pill: flexible width, never truncated */
.h3l-run { min-width:360px; width:max-content; max-width:none; flex:0 0 auto; }
.h3l-run > span { overflow:visible; font-variant-numeric:tabular-nums; }

/* three audio lanes: 1-2 lock, 3 music */
.h3l-thead.a { height:126px; }
.h3l-track.a { height:118px; }
.h3l-alane.music { background:rgba(52,211,153,.05); border-color:rgba(52,211,153,.25); }
.h3l-alane > span { position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:11px; color:rgba(110,231,183,.7); white-space:nowrap; pointer-events:none; }
.h3l-audio.clip.music { background:linear-gradient(135deg, rgba(16,185,129,.55), rgba(5,150,105,.45)); border-color:rgba(52,211,153,.8); }
.h3l-audio.clip .fd { position:absolute; top:0; bottom:0; pointer-events:none; z-index:2; }
.h3l-audio.clip .fd.in { left:0; background:linear-gradient(to top right, rgba(0,0,0,.55) 50%, transparent 50%); }
.h3l-audio.clip .fd.out { right:0; background:linear-gradient(to top left, rgba(0,0,0,.55) 50%, transparent 50%); }

/* menus: submenus + inline controls */
.h3l-menu .it.has-sub { position:relative; }
.h3l-menu .it .ar { margin-left:auto; opacity:.7; }
.h3l-menu .it.on span::before { content:"✓ "; color:var(--a2); }
.h3l-menu.sub { position:absolute; z-index:2; }
.h3l-menu .ctl { display:flex; align-items:center; gap:8px; padding:4px 10px; font-size:12px; }
.h3l-menu .ctl .l { width:64px; color:var(--mut); }
.h3l-menu .ctl .h3l-range { width:120px; }
.h3l-menu .ctl .v { width:46px; text-align:right; font-variant-numeric:tabular-nums; }
.h3l-asset .edt { position:absolute; left:6px; bottom:26px; width:18px; height:18px; display:grid; place-items:center; border-radius:5px; font-size:11px; background:rgba(56,189,248,.9); color:#fff; }
/* modal dialogs */
.h3l-modal { position:fixed; inset:0; z-index:300; background:rgba(3,4,7,.6); display:flex; align-items:center; justify-content:center; backdrop-filter:blur(3px); }
.h3l-modal.busy { cursor:progress; }
.h3l-modal.busy .h3l-ae::after { content:"${T("Обработка… не закрывайте окно")}"; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); padding:10px 18px; border-radius:10px; background:rgba(0,0,0,.75); color:#fff; font-size:13px; z-index:5; pointer-events:none; }
.h3l-modal.busy .h3l-ae, .h3l-modal.busy .h3l-save { opacity:.75; pointer-events:none; }
.h3l-save { width:min(620px, 94vw); display:flex; flex-direction:column; gap:12px; padding:16px; border-radius:16px; }
.h3l-save .hd, .h3l-ae .hd { display:flex; align-items:center; gap:8px; }
.h3l-save .h3l-note.err { color:var(--err); }
.h3l-btn.busy { opacity:.6; cursor:progress; }
/* asset editor */
.h3l-ae { width:min(1100px, 96vw); height:min(820px, 94vh); display:flex; position:relative; flex-direction:column; gap:8px; padding:12px 14px; border-radius:16px; }
.h3l-ae .hd b { display:flex; align-items:center; gap:6px; font-size:14px; max-width:40%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.h3l-ae .hd svg { width:15px; height:15px; }
.h3l-ae .hd .dims { font-size:11.5px; color:#7dd3fc; font-variant-numeric:tabular-nums; white-space:nowrap; }
.h3l-ae .h3l-btn.on { background:rgba(56,189,248,.25); border-color:#38bdf8; }
.h3l-ae .stage { flex:1; min-height:120px; position:relative; background:#000; border-radius:10px; overflow:hidden; }
.h3l-ae .stage.audio { flex:0 0 220px; }
.h3l-ae .stage .cv { position:absolute; inset:0; cursor:crosshair; }
.h3l-ae .ticks { position:relative; height:14px; font-size:10px; color:var(--mut); }
.h3l-ae .ticks span { position:absolute; transform:translateX(-50%); font-variant-numeric:tabular-nums; }
.h3l-ae .ticks span:first-child { transform:none; } .h3l-ae .ticks span:last-child { transform:translateX(-100%); }
.h3l-ae .bar { position:relative; height:26px; border-radius:6px; background:rgba(255,255,255,.06); cursor:pointer; touch-action:none; }
.h3l-ae .bar .rng { position:absolute; top:4px; bottom:4px; background:rgba(14,165,233,.55); border-radius:4px; }
.h3l-ae .bar .hl { position:absolute; top:0; bottom:0; width:10px; margin-left:-5px; border-radius:4px; background:#38bdf8; cursor:ew-resize; }
.h3l-ae .bar .ph { position:absolute; top:-4px; bottom:-4px; width:2px; margin-left:-1px; background:#f59e0b; pointer-events:none; }
.h3l-ae .phl { text-align:right; font-size:10.5px; color:var(--mut); letter-spacing:.06em; } .h3l-ae .phl .pht { color:#f59e0b; font-variant-numeric:tabular-nums; }
.h3l-ae .row { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.h3l-ae .row .h3l-in.sm { width:76px; } .h3l-ae .row .sp { width:10px; } .h3l-ae .row .lb { font-size:11px; color:var(--mut); margin-left:6px; }
.h3l-ae .row .kept { font-size:11.5px; color:var(--mut); font-variant-numeric:tabular-nums; margin-left:4px; }
.h3l-ae .hint { font-size:10.5px; color:var(--mut); }

.h3l-sel.sm { width:auto; padding:4px 26px 4px 9px; font-size:12px; border-radius:8px; }


/* overlap zone at the start of an extension (shared with the previous segment's tail) */
.h3l-ovl { position:absolute; top:4px; bottom:4px; z-index:4; pointer-events:auto; border-radius:6px;
  background:repeating-linear-gradient(135deg, rgba(56,189,248,.28) 0 5px, rgba(56,189,248,.10) 5px 10px);
  border:1px solid rgba(56,189,248,.65); box-shadow:inset 0 0 0 1px rgba(0,0,0,.25); }
.h3l-ovl > span { position:absolute; left:50%; top:50%; margin-top:-8px; padding:1px 6px; border-radius:6px; background:rgba(8,47,73,.85); transform:translateX(-50%); font-size:10px; font-weight:700; color:#e0f2fe; text-shadow:0 1px 2px #000; white-space:nowrap; pointer-events:none; }
/* audio track header: one row per lane */
.h3l-thead.a { position:relative; display:block; padding:0; }
.h3l-arow { position:absolute; left:0; right:0; display:flex; align-items:center; gap:4px; padding:0 6px 0 10px; white-space:nowrap; font-size:11px; }
.h3l-arow .nm { overflow:hidden; text-overflow:ellipsis; min-width:0; }
.h3l-arow i svg { width:15px; height:15px; display:block; }
.h3l-arow .nm { font-weight:600; } .h3l-arow .nm.music { color:rgba(110,231,183,.85); }
.h3l-arow .sub { font-size:10.5px; opacity:.6; font-weight:500; }
.h3l-spk { margin-left:auto; border:1px solid rgba(200,208,224,.25); background:rgba(200,208,224,.08); color:inherit; border-radius:7px; width:26px; height:22px; font-size:12px; line-height:1; cursor:pointer; padding:0; }
.h3l-spk.off { opacity:.55; background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.45); }
.h3l-spk:hover { filter:brightness(1.3); }
.h3l-warn { color:#fbbf24; font-size:14px; cursor:help; }
.h3l-note.err { color:#fca5a5; }

/* ---- v4: one spacing system. Same outer padding, the same gap between ALL panels (header, rail, assets, player,
   right panel, timeline), splitters sit inside the gap, one panel radius. */
.h3l-root { --h3l-pad:12px; --h3l-gap:12px; --h3l-r:14px; --r:var(--h3l-r); padding:var(--h3l-pad);
  grid-template-rows:56px var(--h3l-gap) minmax(0,1fr) var(--h3l-gap) var(--th,282px); gap:0; row-gap:0; }
.h3l-root > .h3l-head { grid-row:1; } .h3l-root > .h3l-body { grid-row:3; } .h3l-root > .h3l-split.hz { grid-row:4; } .h3l-root > .h3l-tl { grid-row:5; }
.h3l-root > .h3l-head::before { display:none; }
.h3l-head { padding:0 var(--h3l-gap); gap:var(--h3l-gap); }
.h3l-body { grid-template-columns:60px var(--h3l-gap) var(--lw,272px) var(--h3l-gap) minmax(0,1fr) var(--h3l-gap) var(--rw,372px); column-gap:0; gap:0; }
.h3l-body > .h3l-tools { grid-column:1; } .h3l-body > .h3l-panel { grid-column:3; } .h3l-body > .h3l-split.sl { grid-column:4; } .h3l-body > .h3l-split.sr { grid-column:6; }
.h3l-body > .h3l-center { grid-column:5; } .h3l-body > .h3l-insp { grid-column:7; }
.h3l-insp { gap:var(--h3l-gap); padding-right:0; }
.h3l-glass, .h3l-head, .h3l-tools, .h3l-panel, .h3l-center, .h3l-tl, .h3l-insp > .h3l-card { border-radius:var(--h3l-r); }
.h3l-split.v::after { left:50%; margin-left:-1px; } .h3l-split.hz::after { top:50%; margin-top:-1px; }
/* submenus: solid (a nested backdrop-filter shows the timeline through) */
.h3l-body > * { grid-row:1; }
.h3l-body > .h3l-helpview { grid-column:5 / 8; grid-row:1; z-index:20; display:flex; flex-direction:column; min-height:0; border-radius:var(--h3l-r); overflow:hidden; background:var(--bg1); border:1px solid var(--line); }
.h3l-helphd { display:flex; align-items:center; gap:var(--h3l-gap); padding:var(--h3l-gap) calc(var(--h3l-gap) * 1.5); border-bottom:1px solid var(--line); }
.h3l-helphd h2 { margin:0; font-size:17px; font-weight:800; background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; white-space:nowrap; }
.h3l-helphd .grow { flex:1; }
.h3l-helpscroll { overflow:auto; min-height:0; flex:1; padding:var(--h3l-gap); }
.h3l-helpcols { columns:3 600px; column-gap:var(--h3l-gap); }
.h3l-helpsec { break-inside:avoid; margin:0 0 var(--h3l-gap); border:1px solid var(--line); border-radius:12px; background:var(--control); scroll-margin-top:var(--h3l-gap); transition:box-shadow .4s; }
.h3l-helpsec.flash { box-shadow:0 0 0 2px color-mix(in srgb,var(--a1) 60%,transparent); }
.h3l-helpsec > summary { cursor:pointer; list-style:none; padding:10px 14px; font-weight:800; font-size:14px; color:var(--txt); display:flex; align-items:center; gap:8px; }
.h3l-helpsec > summary::-webkit-details-marker { display:none; }
.h3l-helpsec > summary::before { content:"›"; display:inline-block; transition:transform .15s; color:var(--a2); font-size:16px; }
.h3l-helpsec[open] > summary::before { transform:rotate(90deg); }
.h3l-helpsec .hb { padding:0 16px 12px; font-size:13px; line-height:1.6; color:var(--txt); }
.h3l-helpsec .hb p { margin:6px 0; } .h3l-helpsec .hb ul, .h3l-helpsec .hb ol { margin:6px 0; padding-left:20px; } .h3l-helpsec .hb li { margin:3px 0; }
.h3l-helpsec .hb b { color:var(--txt); } .h3l-helpsec .hb code { font-family:ui-monospace,Consolas,monospace; font-size:12px; background:var(--control); padding:1px 5px; border-radius:5px; color:var(--a1); word-break:break-all; }
.h3l-helpsec kbd, .h3l-hkeys kbd { font-family:inherit; font-size:11.5px; padding:1px 6px; border-radius:6px; background:var(--control); border:1px solid var(--line2); box-shadow:0 1px 0 var(--line2); color:var(--txt); white-space:nowrap; }
.h3l-helpsec dt { font-weight:700; color:var(--txt); margin-top:9px; } .h3l-helpsec dd { margin:3px 0 0 0; }
.h3l-hkeys { border-collapse:collapse; width:100%; } .h3l-hkeys td { padding:4px 6px; border-bottom:1px solid var(--line); vertical-align:top; } .h3l-hkeys td:first-child { white-space:nowrap; width:1%; }
.h3l-helpsec mark { background:color-mix(in srgb,var(--warn) 35%,transparent); color:var(--txt); border-radius:3px; padding:0 1px; }
.h3l-helpnav { display:flex; flex-direction:column; gap:var(--h3l-gap); }
.h3l-helptoc { display:flex; flex-direction:column; gap:2px; }
.h3l-helptoc .it { display:flex; gap:8px; align-items:center; padding:6px 8px; border-radius:8px; cursor:pointer; color:var(--txt); font-size:12.5px; }
.h3l-helptoc .it:hover { background:var(--control); } .h3l-helptoc .it.on { background:color-mix(in srgb,var(--a1) 22%,transparent); color:var(--txt); }
.h3l-helptoc .it.dim { opacity:.35; }
.h3l-helptoc .n { width:20px; text-align:right; color:var(--mut); font-variant-numeric:tabular-nums; flex:none; }
.h3l-helpnone { padding:20px; text-align:center; }
.h3l-setbody { display:flex; flex-direction:column; gap:10px; padding-bottom:12px; overflow-x:clip; overflow-y:visible; }
.h3l-setbody > .h3l-det, .h3l-setbody > .h3l-card, .h3l-setbody > .h3l-note, .h3l-panel .h3l-scroll > .h3l-card { flex:0 0 auto; overflow:visible; max-height:none; min-height:auto; }
.h3l-panel .h3l-settabs { margin-left:-12px; margin-right:-12px; padding-left:12px; padding-right:12px; }
.h3l-setbody .h3l-det .in { display:flex; flex-direction:column; gap:9px; }
.h3l-setscope { display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--line); border-radius:10px; background:rgba(255,255,255,.025); }
.h3l-setscope .h3l-btn { align-self:flex-start; }
.h3l-gen-presets { display:flex; flex-direction:column; gap:10px; padding:14px; border:1px solid color-mix(in srgb,var(--a1) 42%,var(--line)); border-radius:12px; background:linear-gradient(135deg,color-mix(in srgb,var(--a1) 11%,transparent),transparent 72%),var(--panel2); }
.h3l-gen-presets > .h3l-lbl { font-size:13px; font-weight:700; letter-spacing:.01em; }
.h3l-gen-presets-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; min-width:0; }
.h3l-gen-presets-grid > * { min-width:0; }
.h3l-gen-presets .h3l-in,.h3l-gen-presets .h3l-sel { width:100%; min-width:0; box-sizing:border-box; }
.h3l-gen-manage { padding:7px 10px; border:1px solid var(--line); border-radius:9px; min-width:0; color:var(--mut); }
.h3l-gen-manage > summary { cursor:pointer; font-size:12px; user-select:none; }
.h3l-gen-manage[open] > summary { margin-bottom:9px; }
.h3l-gen-manage .h3l-row { margin-top:4px; }
.h3l-setbody > .h3l-setreset { align-self:stretch; width:100%; min-width:0; height:auto; min-height:28px; padding:5px 10px; box-sizing:border-box; white-space:normal; overflow-wrap:anywhere; text-align:center; line-height:1.25; }
.h3l-langrow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; } .h3l-langrow .h3l-lbl { margin:0; } .h3l-langrow .h3l-sel { flex:1 1 140px; min-width:0; max-width:220px; }
.h3l-settabs { display:flex; flex-wrap:wrap; gap:4px; position:sticky; top:0; z-index:3; padding:8px 14px; margin:0 -14px 2px; background:var(--panel); backdrop-filter:blur(18px) saturate(140%); border-bottom:1px solid var(--line); }
.h3l-settab { flex:1 1 auto; text-align:center; padding:7px 10px; border-radius:8px; cursor:pointer; font-size:12px; white-space:nowrap; color:#d6dbe3; border:1px solid var(--line); background:rgba(255,255,255,.03); user-select:none; }
.h3l-settab:hover { background:rgba(200,208,224,.12); } .h3l-settab.on { background:rgba(79,140,255,.28); color:#fff; border-color:rgba(79,140,255,.6); }
.h3l-modrow { display:flex; gap:9px; align-items:flex-start; font-size:12px; }
.h3l-modrow > b { width:18px; height:18px; border-radius:50%; display:grid; place-items:center; font-size:11px; background:rgba(255,255,255,.08); flex:none; }
.h3l-modrow.ok > b { background:rgba(60,200,120,.22); color:#7ee2a8; }
.h3l-modrow.bad > b { background:rgba(240,80,90,.2); color:#ff9aa2; }
.h3l-modrow small { color:var(--mut); display:block; word-break:break-all; }
.h3l-note.mono { font-family:ui-monospace,Consolas,monospace; font-size:10.5px; white-space:pre-wrap; word-break:break-all; opacity:.8; }
.h3l-stagebtns { gap:6px; margin-top:6px; }
.h3l-stagebtns .h3l-btn { flex:1; }
.h3l-setlink { width:100%; justify-content:flex-start; margin-top:4px; }
.h3l-setlink span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.h3l-card-h > em.h3l-note { margin-left:auto; font-style:normal; font-size:11px; }
.h3l-menu.sub.solid { background:linear-gradient(var(--panel2),var(--panel2)),var(--bg1); border:1px solid var(--line2); border-radius:12px; backdrop-filter:none; box-shadow:0 18px 48px rgba(0,0,0,.7); }
/* ↑ Финал из черновика */
.h3l-cb.txt { width:auto; padding:0 7px; gap:3px; display:inline-flex; align-items:center; font:inherit; font-size:11px; font-weight:700; white-space:nowrap; }
.h3l-cb.fin { background:linear-gradient(135deg,rgba(79,140,255,.92),rgba(127,176,255,.85)); border-color:rgba(255,255,255,.35); }
.h3l-cb.fin b { font-size:12px; }
.h3l-finall { background:linear-gradient(135deg,rgba(79,140,255,.22),rgba(127,176,255,.14)); border-color:rgba(79,140,255,.5); }
.h3l-finall b { color:var(--a2); font-size:14px; }
.h3l-finall.dis { opacity:.5; }
.h3l-finblock { display:flex; flex-direction:column; gap:8px; padding:12px; border-radius:var(--r2); border:1px solid rgba(79,140,255,.35); background:linear-gradient(135deg,rgba(79,140,255,.10),rgba(127,176,255,.06)); }
.h3l-finblock .hd { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.h3l-finblock .row { display:flex; gap:8px; flex-wrap:wrap; }
.h3l-root .bd.draft { cursor:pointer; }

/* ---- «Галерея» / «Проекты» */
.h3l-gal { display:flex; flex-direction:column; gap:10px; padding:12px; min-height:0; flex:1; overflow:hidden; }
.h3l-ghead { display:flex; align-items:center; gap:8px; } .h3l-ghead b { font-size:14px; } .h3l-ghead .grow, .h3l-row .grow { flex:1; }
.h3l-pills.wrap { flex-wrap:wrap; } .h3l-pills.wrap .h3l-pill { flex:0 0 auto; }
.h3l-gbar { display:flex; gap:6px; align-items:center; } .h3l-gbar:empty { display:none; }
.h3l-ggrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(168px,1fr)); grid-auto-rows:max-content; gap:10px; overflow-x:hidden; overflow-y:auto; flex:1 1 0; min-height:0; align-content:start; padding:2px 4px 8px 2px; scrollbar-gutter:stable; }
.h3l-ggrid > .h3l-gcard { min-height:max-content; }
.h3l-ghead .gmode { flex:0 0 auto; padding:2px; } .h3l-ghead .gmode .h3l-pill { padding:3px 9px; font-size:11px; white-space:nowrap; }
.h3l-gcrumbs:empty { display:none; }
.h3l-gcrumb { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:var(--r3); background:rgba(79,140,255,.10); border:1px solid rgba(79,140,255,.28); font-size:12px; min-width:0; }
.h3l-gcrumb b { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .h3l-gcrumb .sep { color:var(--mut); }
.h3l-gcard.stack { position:relative; margin:0 6px 6px 0; overflow:visible; }
.h3l-gcard.stack::before, .h3l-gcard.stack::after { content:""; position:absolute; inset:0; border-radius:var(--r3); border:1px solid var(--line); background:rgba(28,31,38,.92); z-index:-1; pointer-events:none; }
.h3l-gcard.stack::before { transform:translate(3px,3px); } .h3l-gcard.stack::after { transform:translate(6px,6px); opacity:.6; z-index:-2; }
.h3l-gcard.stack .pv { border-radius:var(--r3) var(--r3) 0 0; overflow:hidden; }
.h3l-gcard .chips { position:absolute; left:4px; bottom:4px; display:flex; flex-wrap:wrap; gap:3px; z-index:2; max-width:calc(100% - 50px); }
.h3l-gcard .cnt { position:absolute; right:4px; bottom:4px; z-index:2; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:6px; background:var(--grad); color:#fff; box-shadow:0 1px 6px rgba(0,0,0,.5); }
.h3l-gempty { grid-column:1/-1; color:var(--mut); font-size:12px; text-align:center; padding:24px 8px; border:1.5px dashed var(--line2); border-radius:var(--r2); }
.h3l-gcard { border-radius:var(--r3); overflow:hidden; background:rgba(200,208,224,.06); border:1px solid var(--line); cursor:pointer; transition:.12s; }
.h3l-gcard:hover { border-color:rgba(79,140,255,.5); } .h3l-gcard.sel { border-color:var(--a2); box-shadow:0 0 0 2px rgba(127,176,255,.35); }
.h3l-gcard .pv { position:relative; aspect-ratio:16/9; background:#07080b; }
.h3l-gcard .pv img, .h3l-gcard .pv video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.h3l-gcard .noimg, .h3l-pcard .noimg, .h3l-pcur .noimg { position:absolute; inset:0; display:grid; place-items:center; font-size:22px; opacity:.5; }
.h3l-gcard .tags { position:absolute; left:4px; top:4px; display:flex; gap:3px; z-index:2; }
.h3l-gcard .k { font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:5px; background:rgba(6,7,10,.78); color:#cdd3ff; }
.h3l-gcard .k.draft { color:#fbbf24; } .h3l-gcard .k.refine { color:#67e8f9; } .h3l-gcard .k.upscale { color:#c4b5fd; } .h3l-gcard .k.final { color:#86efac; } .h3l-gcard .k.region { color:#f9a8d4; } .h3l-gcard .k.on { background:var(--grad); color:#fff; }
.h3l-gcard .star { position:absolute; right:4px; top:2px; z-index:2; font-size:15px; color:rgba(255,255,255,.7); text-shadow:0 1px 4px #000; }
.h3l-gcard .star.on { color:#fbbf24; }
.h3l-gcard .cap { padding:5px 7px 6px; display:flex; flex-direction:column; gap:2px; min-width:0; }
.h3l-gcard .l1 { font-size:10.5px; color:var(--mut); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3l-gcard .l2 { font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .h3l-gcard .l3 { font-size:10px; color:var(--a2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3l-gview { width:min(1500px,94vw); max-height:92vh; padding:14px; display:flex; flex-direction:column; gap:10px; }
.h3l-gview .hd { display:flex; align-items:center; gap:8px; }
.h3l-gview .vids { display:grid; grid-template-columns:1fr; gap:12px; min-height:0; } .h3l-gview.two .vids { grid-template-columns:1fr 1fr; }
.h3l-gview .col { display:flex; flex-direction:column; gap:6px; min-width:0; }
.h3l-gview video { width:100%; max-height:70vh; background:#000; border-radius:var(--r3); }
.h3l-gview .vp { position:relative; overflow:hidden; border-radius:var(--r3); background:#000; touch-action:none; }
.h3l-gview .vp video { display:block; border-radius:0; transform-origin:50% 50%; will-change:transform; }
.h3l-gview .vp video.px { image-rendering:pixelated; }
.h3l-gview .vp.zoomed { cursor:grab; } .h3l-gview .vp.zoomed.drag { cursor:grabbing; }
.h3l-gview .zoom { display:flex; gap:3px; } .h3l-gview .zoom .on, .h3l-gview .ctr .on { background:var(--grad); color:#fff; border-color:transparent; }
.h3l-gview .lbl select { max-width:100%; }
.h3l-gview .lbl { display:flex; flex-direction:column; gap:2px; font-size:12px; } .h3l-gview .lbl span { color:var(--mut); } .h3l-gview .lbl small { color:var(--mut); opacity:.8; }
.h3l-gview .ctr { display:flex; align-items:center; gap:10px; } .h3l-gview .ctr .h3l-range { flex:1; }
.h3l-pcur { display:flex; flex-direction:column; gap:8px; padding:10px; border-radius:var(--r2); border:1px solid rgba(79,140,255,.35); background:linear-gradient(135deg,rgba(79,140,255,.10),rgba(127,176,255,.05)); }
.h3l-pcur .pv { position:relative; aspect-ratio:16/9; border-radius:var(--r3); overflow:hidden; background:#07080b; }
.h3l-pcur .pv img { width:100%; height:100%; object-fit:cover; display:block; }
.h3l-pcur .pv .k { position:absolute; left:6px; top:6px; font-size:10px; font-weight:700; padding:2px 6px; border-radius:6px; background:var(--grad); }
.h3l-pcur { display:grid; grid-template-columns:132px minmax(0,1fr); grid-template-rows:auto auto 1fr; column-gap:10px; row-gap:6px; align-items:start; padding:8px; border-color:color-mix(in srgb,var(--a1) 35%,var(--line)); background:color-mix(in srgb,var(--a1) 7%,var(--panel2)); }
.h3l-pcur .pv { grid-row:1 / 4; grid-column:1; width:132px; align-self:start; }
.h3l-pcur > :not(.pv) { grid-column:2; min-width:0; }
.h3l-pcur .h3l-note { font-size:11px; line-height:1.35; }
.h3l-pcur .h3l-row { gap:4px; }
.h3l-row.wrap { flex-wrap:wrap; }
.h3l-plist { display:flex; flex-direction:column; gap:6px; overflow:auto; min-height:0; }
.h3l-pcard { display:flex; align-items:center; gap:10px; padding:6px; border-radius:var(--r3); border:1px solid var(--line); background:rgba(200,208,224,.05); cursor:pointer; }
.h3l-pcard:hover { border-color:rgba(79,140,255,.5); } .h3l-pcard.open { border-color:var(--a2); cursor:default; }
.h3l-pcard .pv { position:relative; width:84px; flex:none; aspect-ratio:16/9; border-radius:7px; overflow:hidden; background:#07080b; }
.h3l-pcard .pv img { width:100%; height:100%; object-fit:cover; display:block; }
.h3l-pcard .in { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.h3l-pcard .in b { font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .h3l-pcard .in span, .h3l-pcard .in small { font-size:11px; color:var(--mut); }

/* «Участок»: middle regeneration */
.h3l-btn.h3l-regbtn b { color:#f472b6; font-size:13px; }
.h3l-btn.h3l-regbtn.on { background:rgba(79,140,255,.18); border-color:rgba(79,140,255,.7); color:#fff; box-shadow:0 0 0 2px rgba(79,140,255,.18), 0 6px 18px rgba(79,140,255,.25); }
.h3l-reghint { font-size:11.5px; color:#f9a8d4; padding:3px 9px; border-radius:999px; border:1px dashed rgba(79,140,255,.45); background:rgba(79,140,255,.07); white-space:nowrap; }
.h3l-regmode .h3l-track.v, .h3l-regmode .h3l-track.v .h3l-clip { cursor:crosshair; }
.h3l-region { position:absolute; top:-3px; bottom:-3px; z-index:14; pointer-events:none; }
.h3l-region .core { position:absolute; top:0; bottom:0; border-radius:8px; background:rgba(79,140,255,.16); border:2px solid rgba(244,114,182,.95); box-shadow:0 0 0 1px rgba(0,0,0,.35), 0 0 18px rgba(79,140,255,.35); }
.h3l-region .zh, .h3l-region .zt { position:absolute; top:6px; bottom:6px; background:repeating-linear-gradient(135deg, rgba(127,176,255,.20) 0 6px, rgba(127,176,255,.05) 6px 12px); border:1px dashed rgba(127,176,255,.7); }
.h3l-region .zh { border-right:none; border-radius:7px 0 0 7px; } .h3l-region .zt { border-left:none; border-radius:0 7px 7px 0; }
.h3l-region .zh, .h3l-region .zt { pointer-events:auto; }
.h3l-region .tab { position:absolute; top:-1px; transform:translateY(-100%); padding:2px 8px; border-radius:7px 7px 0 0; background:linear-gradient(135deg,#5b8fe8,#4f8cff); color:#fff; font-size:11px; font-weight:700; white-space:nowrap; pointer-events:auto; cursor:grab; box-shadow:0 -2px 10px rgba(79,140,255,.35); }
.h3l-region .eg { position:absolute; top:0; bottom:0; width:12px; margin-left:-6px; cursor:ew-resize; pointer-events:auto; z-index:2; }
.h3l-region .eg::after { content:""; position:absolute; left:4px; top:28%; bottom:28%; width:4px; border-radius:3px; background:#fff; box-shadow:0 0 8px rgba(79,140,255,.9); }
.h3l-region.sel .core { border-color:#fff; background:rgba(79,140,255,.24); }
.h3l-region.sel .tab { box-shadow:0 0 0 2px #fff; }
.h3l-region.draft .core { border-style:dashed; background:rgba(79,140,255,.10); }
.h3l-region.bad .core { border-color:var(--err); background:rgba(251,113,133,.14); }
.h3l-region.stale .tab { background:linear-gradient(135deg,#b45309,#f59e0b); }
.h3l-region.applied .core { background:rgba(79,140,255,.10); }
.h3l-region .core.filled { overflow:hidden; pointer-events:auto; cursor:pointer; background:#07080b; }
.h3l-region .core.filled .fillstrip { position:absolute; left:0; right:0; top:6px; bottom:6px; overflow:hidden; border-radius:6px; }
.h3l-region .core.filled .fillstrip i { position:absolute; top:0; bottom:0; background-repeat:no-repeat; border-right:1px solid rgba(0,0,0,.55); }
.h3l-region .core.filled::before { content:""; position:absolute; inset:0; z-index:1; pointer-events:none; background:linear-gradient(180deg, rgba(6,7,10,.6) 0%, rgba(6,7,10,0) 40%, rgba(6,7,10,.55) 100%); }
.h3l-region .core.filled .flbl { position:absolute; left:8px; top:9px; z-index:2; display:flex; gap:6px; align-items:center; pointer-events:none; white-space:nowrap; }
.h3l-region .core.filled .flbl b { font-size:11.5px; color:#fff; padding:2px 7px; border-radius:6px; background:linear-gradient(135deg,#4f8cff,#7fb0ff); }
.h3l-region .core.filled .flbl i.up { font-style:normal; font-size:10.5px; font-weight:800; padding:1px 6px; border-radius:6px; color:#fde68a; background:rgba(6,7,10,.75); border:1px dashed rgba(253,230,138,.6); }
.h3l-region .core.filled .flbl i.up.done { color:#bbf7d0; border-style:solid; border-color:rgba(74,222,128,.7); }
.h3l-regpop .upr .h3l-lbl { margin-bottom:4px; } .h3l-regpop .upr .h3l-note { margin:0; }
.h3l-region .core.filled .flbl span { font-size:10.5px; font-weight:700; color:rgba(255,255,255,.85); text-shadow:0 1px 3px #000; }
.h3l-region .core.filled.stale .fillstrip { filter:saturate(.3) brightness(.55); }
.h3l-region .core.filled.stale .flbl b { background:linear-gradient(135deg,#b45309,#f59e0b); }
.h3l-region .core.filled .rbadge { position:absolute; right:8px; top:50%; transform:translateY(-50%); z-index:3; pointer-events:auto; }
.h3l-region .core.filled { cursor:pointer; }
.h3l-region.running .core { animation:h3l-pulse 1.6s ease-in-out infinite; }
.h3l-regpop { position:absolute; z-index:100001; width:560px; padding:12px 14px; display:flex; flex-direction:column; gap:9px; border-color:rgba(79,140,255,.45); box-shadow:0 18px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(79,140,255,.2); }
.h3l-regpop.dropover { border-color:var(--a2); }
.h3l-regpop .hd { display:flex; align-items:center; gap:8px; } .h3l-regpop .hd b { font-size:13.5px; color:#f9a8d4; } .h3l-regpop .tm { font-size:12px; color:var(--mut); font-variant-numeric:tabular-nums; }
.h3l-regpop .grow { flex:1; }
.h3l-regpop .info { display:flex; flex-direction:column; gap:3px; font-size:11.5px; color:var(--mut); line-height:1.4; }
.h3l-region .h3l-seamq.rs { pointer-events:auto; top:5px; z-index:3; }
.h3l-region.span-bridge .core, .h3l-region.span-prologue .core, .h3l-region.span-extension .core { border-color:rgba(167,139,250,.95); background:rgba(79,140,255,.16); box-shadow:0 0 0 1px rgba(0,0,0,.35), 0 0 18px rgba(79,140,255,.35); }
.h3l-region.span-prologue .core { border-left-style:dashed; } .h3l-region.span-extension .core { border-right-style:dashed; }
.h3l-region.span-bridge .tab, .h3l-region.span-prologue .tab, .h3l-region.span-extension .tab { background:linear-gradient(135deg,#4f8cff,#7fb0ff); }
.h3l-regpop .info .kd { color:var(--mut); } .h3l-regpop .info .sq { display:flex; align-items:center; flex-wrap:wrap; gap:6px; } .h3l-regpop .info .sq .h3l-seamv { margin-top:0; }
.h3l-regpop .info b { color:var(--txt); } .h3l-regpop .info .snap { color:#67e8f9; } .h3l-regpop .info .wr { color:var(--warn); } .h3l-regpop .info .err { color:var(--err); font-weight:600; }
.h3l-regpop .refs { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.h3l-regpop .refs .rf { position:relative; width:38px; height:38px; border-radius:9px; overflow:hidden; border:1px solid var(--line2); background:var(--bg2); display:grid; place-items:center; }
.h3l-regpop .refs .rf img { width:100%; height:100%; object-fit:cover; }
.h3l-regpop .refs .rf i { position:absolute; top:0; right:0; width:15px; height:15px; line-height:14px; text-align:center; font-style:normal; font-size:12px; background:rgba(6,7,10,.8); border-radius:0 0 0 6px; cursor:pointer; color:#fff; }
.h3l-regpop .h3l-sel.sm, .h3l-regpop .h3l-in.sm { padding:5px 26px 5px 8px; font-size:12px; height:30px; }
.h3l-regpop .h3l-in.sm { padding-right:8px; width:120px; }
.h3l-regpop .row { display:grid; grid-template-columns:minmax(0,auto) minmax(0,1fr) minmax(0,1fr); gap:10px; align-items:end; }
.h3l-regpop .row > *, .h3l-regpop > * { min-width:0; }
.h3l-regpop .row .h3l-sel { width:100%; max-width:100%; min-width:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; }
.h3l-regpop .row .h3l-lbl { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3l-regpop .sd { min-width:0; } .h3l-regpop .sd .h3l-in.sm { width:auto; min-width:0; flex:1 1 90px; max-width:120px; }
.h3l-regpop .ft { flex-wrap:wrap; } .h3l-regpop textarea { max-width:100%; box-sizing:border-box; }
.h3l-regpop .row .h3l-lbl { margin-bottom:4px; }
.h3l-regpop .sd { display:flex; gap:5px; }
.h3l-regpop .takes { flex-wrap:wrap; } .h3l-regpop .takes .h3l-pill { flex:0 0 auto; min-width:34px; }
.h3l-regpop .ft { display:flex; align-items:center; gap:10px; }
/* ---- fit-to-screen: the grid column must never grow past the window (wide header / long text pushed the UI off the right edge) ---- */
.h3l-root { grid-template-columns:minmax(0,1fr); }
.h3l-root > * { min-width:0; }
.h3l-head { overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
.h3l-head::-webkit-scrollbar { display:none; }
.h3l-body { grid-template-columns:60px var(--h3l-gap) min(var(--lw,272px),26vw) var(--h3l-gap) minmax(0,1fr) var(--h3l-gap) min(var(--rw,372px),30vw); }
.h3l-body > *, .h3l-insp, .h3l-insp > .h3l-card, .h3l-center, .h3l-panel { min-width:0; }
.h3l-insp { overflow-x:hidden; }
@media (max-width:1700px) { .h3l-run { min-width:240px; } .h3l-head { gap:8px; } .h3l-head .h3l-chip { padding:5px 8px; } }
.h3l-rs{margin-top:6px;padding:8px 10px;border-radius:10px;display:flex;flex-direction:column;gap:4px;font-size:12px}
.h3l-rs-row{display:flex;gap:6px;align-items:baseline;cursor:pointer}.h3l-rs-row em{opacity:.6;font-style:normal;margin-left:auto;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.h3l-rs-row.proj span::after{content:"${T(" · проект")}";opacity:.55}.h3l-rs-row.lib span::after{content:"${T(" · библиотека")}";opacity:.55}.h3l-rs-warn{color:var(--warn)}.h3l-rs-warn:empty{display:none}.h3l-rs-btns{display:flex;gap:6px;margin-top:4px}
.h3l-rsb{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;z-index:6;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.45)}
.h3l-rsb button{border:0;background:rgba(255,181,71,.92);color:#1b1205;font:600 11.5px/1 inherit;padding:5px 9px;cursor:pointer}
.h3l-rsb button:hover{background:#ffc66b}.h3l-rsb.icon .h3l-rsb-main{padding:5px 7px;font-size:13px}.h3l-rsb .h3l-rsb-more{padding:5px 6px;border-left:1px solid rgba(0,0,0,.18)}
/* «Персонажи» */
.h3l-chars { display:flex; flex-direction:column; gap:10px; min-width:0; min-height:0; flex:1 1 0; padding:12px; overflow-x:hidden; overflow-y:auto; box-sizing:border-box; }
.h3l-chars.form { overflow:hidden; padding:12px 0 0; gap:0; }
.h3l-chars.form > .hd { padding:0 12px 10px; }
.h3l-chars .cf-body { flex:1 1 0; min-height:0; overflow-x:hidden; overflow-y:auto; padding:0 12px 12px; display:flex; flex-direction:column; gap:12px; }
.h3l-chars .cf-ft { flex:none; display:flex; flex-direction:column; gap:6px; padding:10px 12px 12px; border-top:1px solid var(--line2); background:rgba(6,7,10,.35); }
.h3l-chars.form.over { box-shadow:inset 0 0 0 2px var(--a1); }
.h3l-chars .h3l-lbl { flex-wrap:wrap; row-gap:2px; } .h3l-chars .h3l-lbl em { white-space:normal; text-align:right; min-width:0; overflow-wrap:anywhere; }
.h3l-chars .h3l-field { margin:0; } .h3l-chars .h3l-field > .h3l-lbl { margin-bottom:5px; }
.h3l-chars .h3l-grid2 { grid-template-columns:repeat(auto-fit, minmax(min(100%, 112px), 1fr)); }
.h3l-chars .hd, .h3l-chars .ft { flex-wrap:wrap; row-gap:6px; } .h3l-chars .ft > .h3l-btn { flex:1 1 auto; }
.h3l-chars .h3l-cseg .it { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.h3l-chars .add { flex-wrap:wrap; } .h3l-chars .add > select { flex:1 1 120px; }
.h3l-chars .h3l-sel, .h3l-chars .h3l-in, .h3l-chars .h3l-ta { width:100%; min-width:0; box-sizing:border-box; }
.h3l-chars .add { display:flex; gap:6px; align-items:center; flex:1 1 100%; min-width:0; }
.h3l-chars .add > select { flex:1 1 auto; min-width:0; width:auto; }
.h3l-chars .add .fb { flex:none; } .h3l-chars .add .fb .h3l-btn { white-space:nowrap; }
.h3l-chars .h3l-note { overflow-wrap:anywhere; }
.h3l-chars .hd { align-items:center; gap:6px; padding-top:2px; } .h3l-chars .hd .h3l-lbl { margin:0; } .h3l-chars .grow { flex:1; }
.h3l-chars .h3l-note.tgt { font-size:11.5px; color:var(--mut); }
.h3l-chars .h3l-note.err { color:var(--err); }
.h3l-chars.busy { opacity:.8; pointer-events:none; cursor:progress; }
.h3l-cfold { font-size:11px; font-weight:700; color:var(--mut); margin:4px 0 -4px; letter-spacing:.02em; }
.h3l-cgrid-wrap { display:flex; flex-direction:column; gap:8px; }
.h3l-cgrid { display:grid; grid-template-columns:repeat(auto-fill, minmax(112px, 1fr)); gap:8px; }
.h3l-ccard { position:relative; aspect-ratio:3/4; border-radius:12px; overflow:hidden; background:rgba(6,7,10,.55); border:1px solid var(--line2); cursor:pointer; transition:border-color .12s, transform .12s; }
.h3l-ccard:hover { border-color:var(--a1); transform:translateY(-1px); }
.h3l-ccard.used { border-color:var(--ok); box-shadow:0 0 0 2px rgba(52,211,153,.25); }
.h3l-ccard img { width:100%; height:100%; object-fit:cover; display:block; }
.h3l-ccard .gl { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:34px; background:linear-gradient(160deg, rgba(79,140,255,.25), rgba(127,176,255,.15)); }
.h3l-ccard .cc, .h3l-ccard .vo { position:absolute; top:5px; font-size:12px; padding:1px 5px; border-radius:7px; background:rgba(6,7,10,.7); }
.h3l-ccard .cc { left:5px; } .h3l-ccard .vo { right:5px; }
.h3l-ccard .cap { position:absolute; left:0; right:0; bottom:0; padding:14px 7px 6px; background:linear-gradient(transparent, rgba(6,7,10,.92) 45%); display:flex; flex-direction:column; min-width:0; }
.h3l-ccard .cap b { font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3l-ccard .cap span { font-size:10px; color:var(--mut); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3l-cempty { font-size:12px; color:var(--mut); padding:18px 8px; text-align:center; border:1px dashed var(--line2); border-radius:12px; line-height:1.5; }
.h3l-cseg { display:flex; border:1px solid var(--line2); border-radius:10px; overflow:hidden; }
.h3l-cseg .it { flex:1; text-align:center; padding:6px 4px; font-size:12px; cursor:pointer; color:var(--mut); }
.h3l-cseg .it.on { background:linear-gradient(135deg, rgba(79,140,255,.45), rgba(127,176,255,.3)); color:var(--txt); font-weight:700; }
.h3l-chars .h3l-grid3 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; gap:8px; align-items:end; }
.h3l-chars .h3l-grid3 .h3l-in { min-width:0; }
.h3l-chars .h3l-grid2 > *, .h3l-chars .h3l-field { min-width:0; }
.h3l-chars .h3l-in.bad { border-color:var(--err); }
.h3l-chars .est { font-size:11.5px; color:var(--a2); }
.h3l-chars .ft { gap:8px; }
.h3l-cphotos { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start; padding:6px; border:1px dashed var(--line2); border-radius:10px; min-height:40px; }
.h3l-cphotos.over { border-color:var(--a1); background:rgba(79,140,255,.08); }
.h3l-cphotos .ph { position:relative; width:72px; height:72px; border-radius:8px; overflow:hidden; border:1px solid var(--line2); }
.h3l-cphotos .ph.first { border-color:var(--a1); }
.h3l-cphotos .ph img { width:100%; height:100%; object-fit:cover; }
.h3l-cphotos .ph .n { position:absolute; left:3px; top:3px; font-size:9.5px; font-weight:700; padding:0 4px; border-radius:5px; background:rgba(6,7,10,.75); }
.h3l-cphotos .ph .cr { position:absolute; right:3px; top:3px; font-size:10px; }
.h3l-cphotos .ph .bt { position:absolute; left:0; right:0; bottom:0; display:flex; justify-content:space-around; background:rgba(6,7,10,.8); opacity:0; transition:opacity .12s; }
.h3l-cphotos .ph:hover .bt { opacity:1; }
.h3l-cphotos .ph .bt span { cursor:pointer; font-size:12px; padding:1px 3px; } .h3l-cphotos .ph .bt span:hover { color:var(--a2); }
.h3l-cphotos > .add { flex:1 1 100%; }
.h3l-cblock { min-width:0; }
.h3l-crefs { display:flex; flex-wrap:wrap; gap:6px; padding:6px; border:1px dashed var(--line2); border-radius:10px; }
.h3l-crefs.over { border-color:var(--a1); background:rgba(79,140,255,.08); }
.h3l-crefs > select { flex:1 1 110px; width:auto; min-width:0; }
.h3l-cref { display:flex; align-items:center; gap:5px; max-width:100%; min-width:0; padding:3px 6px 3px 3px; border-radius:9px; background:rgba(79,140,255,.14); border:1px solid rgba(79,140,255,.4); font-size:11.5px; cursor:pointer; }
.h3l-cref img, .h3l-cref .gl { width:22px; height:22px; border-radius:6px; object-fit:cover; flex:none; display:flex; align-items:center; justify-content:center; background:rgba(6,7,10,.5); }
.h3l-cref .nm { font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; max-width:120px; }
.h3l-cref .tg { font-size:10px; color:#c4b5fd; white-space:nowrap; } .h3l-cref .tg.dim { color:var(--mut2); }
.h3l-cref select.w { background:rgba(6,7,10,.55); border:1px solid var(--line2); color:var(--txt); border-radius:6px; font-size:10.5px; padding:0 2px; height:20px; }
.h3l-cref .tg2 { font-size:11px; opacity:.35; cursor:pointer; } .h3l-cref .tg2.on { opacity:1; }
.h3l-cref .x { opacity:.55; cursor:pointer; } .h3l-cref .x:hover { opacity:1; color:var(--err); }
.h3l-cref.off { opacity:.55; background:rgba(100,116,139,.12); border-color:var(--line2); }
.h3l-cref.gone { border-color:var(--err); background:rgba(251,113,133,.12); }
.h3l-ccrop { padding:14px; border-radius:16px; display:flex; flex-direction:column; gap:10px; max-width:80vw; }
.h3l-ccrop .stage { position:relative; align-self:center; user-select:none; touch-action:none; overflow:hidden; }
.h3l-ccrop .stage img { display:block; max-width:76vw; max-height:68vh; }
.h3l-ccrop .rect { position:absolute; border:2px solid #fff; box-shadow:0 0 0 9999px rgba(3,4,7,.55); cursor:move; }
.h3l-ccrop .rect .hd { position:absolute; right:-7px; bottom:-7px; width:14px; height:14px; border-radius:4px; background:#fff; cursor:nwse-resize; }
.h3l-ccrop .hint { font-size:11px; color:var(--mut2); }
.h3l-ccrop .grow { flex:1; }

/* Interface themes */
.h3l-themerow { display:flex; flex-direction:column; align-items:stretch; gap:7px; padding:2px 0 4px; }
.h3l-themerow .h3l-lbl { margin:0; }
.h3l-themegrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
.h3l-theme { display:flex; flex-direction:column; align-items:stretch; gap:7px; min-width:0; padding:8px; border:1px solid var(--line2); border-radius:10px; background:var(--control); color:var(--mut); font:inherit; font-size:11px; text-align:left; cursor:pointer; }
.h3l-theme:hover { border-color:var(--a1); color:var(--txt); }
.h3l-theme.on { border-color:var(--a1); color:var(--txt); background:color-mix(in srgb,var(--a1) 10%,transparent); box-shadow:0 0 0 1px color-mix(in srgb,var(--a1) 16%,transparent); }
.h3l-theme:focus-visible { outline:2px solid var(--a2); outline-offset:2px; }
.h3l-theme .swatches { display:flex; gap:4px; height:12px; }
.h3l-theme .swatches i { flex:1; border-radius:4px; border:1px solid rgba(127,127,127,.16); }
.h3l-root .h3l-btn:not(.primary):not(.on) { background:var(--control); }
.h3l-root .h3l-btn.primary { background:var(--grad); color:var(--on-accent); box-shadow:0 8px 24px color-mix(in srgb,var(--a1) 28%,transparent),inset 0 1px 0 rgba(255,255,255,.25); }
.h3l-root .h3l-pills { background:var(--field); }
.h3l-root .h3l-pill.on, .h3l-root .h3l-q.on { background:var(--grad); color:var(--on-accent); box-shadow:0 4px 14px color-mix(in srgb,var(--a1) 22%,transparent); }
.h3l-root .h3l-tool.on { color:var(--txt); background:linear-gradient(160deg,color-mix(in srgb,var(--a1) 22%,transparent),color-mix(in srgb,var(--a2) 12%,transparent)); border-color:color-mix(in srgb,var(--a1) 55%,transparent); box-shadow:0 6px 18px color-mix(in srgb,var(--a1) 16%,transparent); }
.h3l-root .h3l-logo i, .h3l-root .h3l-play { box-shadow:0 8px 22px color-mix(in srgb,var(--a1) 28%,transparent); }
.h3l-root .h3l-play { color:var(--on-accent); }
.h3l-root .h3l-ph-empty { background:radial-gradient(400px 260px at 30% 30%,var(--glow1),transparent 70%),radial-gradient(400px 260px at 75% 70%,var(--glow2),transparent 70%),var(--bg1); }
.h3l-root .h3l-dyn { background:var(--field); }
.h3l-root .h3l-dyn .ch { background:var(--control); border-color:var(--line); }
.h3l-root .h3l-dyn .lb b { color:var(--txt); }
.h3l-root .h3l-final { color:var(--txt); background:var(--field); }
.h3l-root .h3l-settab.on, .h3l-root .h3l-helptoc .it.on { color:var(--txt); background:color-mix(in srgb,var(--a1) 15%,var(--control)); border-color:color-mix(in srgb,var(--a1) 55%,transparent); }
.h3l-root .h3l-endbox .h3l-btn.on { background:color-mix(in srgb,var(--a1) 15%,var(--control)); border-color:var(--a1); color:var(--txt); }
.h3l-root .h3l-ast-logo { background:var(--grad); box-shadow:0 5px 18px color-mix(in srgb,var(--a1) 24%,transparent); }
.h3l-root .h3l-ast-chat.on, .h3l-root .h3l-ast-presetitem.on, .h3l-root .h3l-ast-stylecat.on, .h3l-root .h3l-ast-styleitem.on { background:color-mix(in srgb,var(--a1) 12%,transparent); border-color:color-mix(in srgb,var(--a1) 38%,transparent); color:var(--txt); }
.h3l-root .h3l-ast-msg.user .h3l-ast-bubble { background:transparent; border:none; color:var(--txt); }
.h3l-root .h3l-ast-inputbox:focus-within { border-color:var(--a1); box-shadow:0 0 0 3px color-mix(in srgb,var(--a1) 10%,transparent); }
.h3l-root .h3l-btn.primary, .h3l-root .h3l-pill.on, .h3l-root .h3l-q.on { color:var(--on-accent); }
.h3l-root :is(.h3l-in,.h3l-ta,.h3l-sel) { background-color:var(--field); }
.h3l-root .h3l-sel option { background:var(--bg1); color:var(--txt); }
.h3l-root .h3l-settab { color:var(--txt); }
.h3l-root .h3l-ast-hd, .h3l-root .h3l-ast-compose { background:var(--panel); }
.h3l-root .h3l-ast-side { background:color-mix(in srgb,var(--bg1) 80%,transparent); }
.h3l-root .h3l-ast-main { background:transparent; border:none; box-shadow:none; }
.h3l-root .h3l-ast-bubble { background:transparent; }
.h3l-root .h3l-ast-chip { background:var(--panel2); }
.h3l-root .h3l-ast-inputbox, .h3l-root .h3l-ast-conn, .h3l-root .h3l-ast-styleitem, .h3l-root .h3l-ast-status { background:var(--field); }
.h3l-root .h3l-ast-setbox { background:var(--bg1); }
.h3l-root .h3l-ast-settab.on, .h3l-root .h3l-ast-stylecat.on { color:var(--txt); }
.h3l-root .h3l-ast-settab.on::after { background:var(--a1); }
.h3l-root .h3l-ast-avatar, .h3l-root .h3l-ast-preseticon { color:var(--a1); }
.h3l-root .h3l-ast-stylechip { color:var(--a1); }
.h3l-root .h3l-ast-status.ok { color:var(--ok); }
.h3l-root .h3l-ast-status.err { color:var(--err); }
.h3l-root .h3l-ast-status.busy .h3l-ast-dot { background:var(--a2); }
.h3l-root .h3l-ast-reasondot { background:var(--a1); }
.h3l-root .h3l-ast-switch input, .h3l-root .h3l-ast-styleitem input { accent-color:var(--a1); }
:root[data-h3l-theme="graphite"] :is(.h3l-root,.h3l-compact) {
  --bg0:#090c11; --bg1:#11161e; --bg2:#1a212c; --panel:rgba(20,25,34,.90); --panel2:rgba(30,38,50,.90);
  --line:rgba(174,188,211,.13); --line2:rgba(174,188,211,.22); --txt:#e8edf5; --mut:#9aa6b8; --mut2:#68778d;
  --a1:#7aa2f7; --a2:#a0a8ff; --a3:#c4b5fd; --field:rgba(7,10,15,.55); --control:rgba(174,188,211,.07);
  --glow1:rgba(122,162,247,.12); --glow2:rgba(160,168,255,.08); --glow3:rgba(122,162,247,.05);
  --grad:linear-gradient(135deg,#6387d8 0%,#7aa2f7 48%,#a0a8ff 100%); --grad2:linear-gradient(135deg,#a0a8ff,#7aa2f7);
}
:root[data-h3l-theme="ocean"] :is(.h3l-root,.h3l-compact) {
  --bg0:#061317; --bg1:#0b2025; --bg2:#103038; --panel:rgba(10,30,35,.90); --panel2:rgba(16,47,52,.90);
  --line:rgba(157,216,218,.13); --line2:rgba(157,216,218,.22); --txt:#e6f6f5; --mut:#91b4b5; --mut2:#5e8589;
  --a1:#2dd4bf; --a2:#38bdf8; --a3:#5eead4; --field:rgba(4,17,21,.55); --control:rgba(157,216,218,.07);
  --glow1:rgba(45,212,191,.16); --glow2:rgba(56,189,248,.12); --glow3:rgba(94,234,212,.07);
  --grad:linear-gradient(135deg,#0d9488 0%,#2dd4bf 48%,#38bdf8 100%); --grad2:linear-gradient(135deg,#38bdf8,#2dd4bf); --on-accent:#062329;
}
:root[data-h3l-theme="porcelain"] :is(.h3l-root,.h3l-compact) {
  --bg0:#e9edf4; --bg1:#f7f9fc; --bg2:#ffffff; --panel:rgba(250,252,255,.94); --panel2:rgba(255,255,255,.94);
  --line:rgba(55,65,95,.14); --line2:rgba(55,65,95,.22); --txt:#222a3b; --mut:#5d6980; --mut2:#7b879d;
  --a1:#5b5bd6; --a2:#0284c7; --a3:#c026d3; --ok:#047857; --warn:#b45309; --err:#be123c;
  --field:rgba(255,255,255,.82); --control:rgba(63,74,112,.06); --glow1:rgba(91,91,214,.09); --glow2:rgba(2,132,199,.07); --glow3:rgba(192,38,211,.04);
  --grad:linear-gradient(135deg,#5b5bd6 0%,#6366c5 48%,#0284c7 100%); --grad2:linear-gradient(135deg,#c026d3,#5b5bd6 55%,#0284c7);
}
:root[data-h3l-theme="porcelain"] .h3l-root .h3l-comp-ph { background-color:var(--bg1); }
:root[data-h3l-theme="porcelain"] .h3l-root .h3l-comp-ph::before { background:linear-gradient(135deg,color-mix(in srgb,var(--c) 12%,transparent),color-mix(in srgb,var(--bg1) 88%,transparent)); backdrop-filter:blur(6px) saturate(.7); }
:root[data-h3l-theme="porcelain"] .h3l-root .h3l-comp-ph.gap::before { background:repeating-linear-gradient(45deg,rgba(55,65,95,.04) 0 12px,rgba(55,65,95,.08) 12px 24px),var(--bg1); }
:root[data-h3l-theme="porcelain"] .h3l-root .h3l-comp-ph .in b { color:var(--txt); }
:root[data-h3l-theme="porcelain"] .h3l-root .h3l-comp-ph .in small { color:var(--mut); }
:root[data-h3l-theme="sunset"] :is(.h3l-root,.h3l-compact) {
  --bg0:#120c0c; --bg1:#1d1212; --bg2:#2a1918; --panel:rgba(37,23,22,.90); --panel2:rgba(49,29,27,.90);
  --line:rgba(244,196,181,.12); --line2:rgba(244,196,181,.21); --txt:#f7ece8; --mut:#b9a29a; --mut2:#806c67;
  --a1:#fb923c; --a2:#d9b48a; --a3:#fbbf24; --field:rgba(17,9,9,.55); --control:rgba(244,196,181,.07);
  --glow1:rgba(251,146,60,.15); --glow2:rgba(217,180,138,.08); --glow3:rgba(251,191,36,.07);
  --grad:linear-gradient(135deg,#ea580c 0%,#fb923c 48%,#e8a25c 100%); --grad2:linear-gradient(135deg,#e8a25c,#fb923c 60%,#fbbf24); --on-accent:#2a1512;
}
/* ---- workspace stage 2: collapsible panels, two-row header, flexible tracks ---- */
.h3l-root { --left-col:min(var(--lw,272px),26vw); --right-col:min(var(--rw,372px),30vw); --left-gap:var(--h3l-gap); --right-gap:var(--h3l-gap);
  grid-template-rows:auto var(--h3l-gap) minmax(0,1fr) var(--h3l-gap) var(--th,282px); }
.h3l-root.h3l-left-collapsed { --left-col:0px; --left-gap:0px; }
.h3l-root.h3l-right-collapsed { --right-col:0px; --right-gap:0px; }
.h3l-root [hidden] { display:none !important; }
.h3l-body { grid-template-columns:60px var(--left-gap) var(--left-col) var(--left-gap) minmax(0,1fr) var(--right-gap) var(--right-col); }
.h3l-head { display:flex; flex-direction:column; align-items:stretch; justify-content:center; gap:4px; min-height:88px; padding:8px 12px; overflow:visible; }
.h3l-head-main, .h3l-head-meta, .h3l-head-group { display:flex; align-items:center; gap:4px; min-width:0; }
.h3l-head-main { min-height:32px; }
.h3l-head-main > .h3l-logo { flex:none; }
.h3l-head-main > .h3l-pname { flex:0 1 auto; width:clamp(96px,14vw,220px); min-width:72px; padding:4px 8px; font-size:13px; }
.h3l-head-actions { margin-left:auto; flex:0 0 auto; }
.h3l-head-meta { gap:8px; min-height:32px; }
.h3l-head-meta > .grow { flex:1 1 auto; }
.h3l-head .h3l-btn { height:32px; padding:0 10px; border-radius:9px; font-size:13px; }
.h3l-head .h3l-btn.icon { width:32px; padding:0; }
.h3l-head .h3l-panel-toggle { color:var(--mut); font-size:15px; }
.h3l-head .h3l-panel-toggle.on { color:var(--txt); background:color-mix(in srgb,var(--a1) 12%,var(--control)); border-color:color-mix(in srgb,var(--a1) 42%,transparent); }
.h3l-head .h3l-chips { flex:0 1 auto; flex-wrap:wrap; gap:4px; overflow:visible; }
.h3l-head .h3l-chip { gap:4px; padding:4px 8px; font-size:12px; }
.h3l-head .h3l-timer { margin:0; font-size:12px; }
.h3l-head .h3l-sysmon, .h3l-head .h3l-sysmon small, .h3l-head .h3l-sysmon b { font-size:12px; }
.h3l-head .h3l-run { min-width:180px; max-width:280px; flex:0 1 260px; }
.h3l-head .h3l-run > span { overflow:hidden; text-overflow:ellipsis; }
.h3l-root .h3l-logo, .h3l-root .h3l-ph h3, .h3l-root .h3l-card-h h4, .h3l-root .h3l-ghead b { font-size:15px; }
.h3l-root :is(.h3l-btn,.h3l-in,.h3l-ta,.h3l-sel,.h3l-pill,.h3l-tool) { font-size:13px; }
.h3l-root .h3l-btn.sm { font-size:12px; }
.h3l-root :is(.h3l-note,.h3l-lbl,.h3l-chip,.h3l-q,.h3l-thead,.h3l-arow,.h3l-endbox,.h3l-zoom,.h3l-gcard .l1,.h3l-gcard .l2,.h3l-gcard .l3,.h3l-gcard .k,.h3l-gcard .cnt) { font-size:12px; }
.h3l-panel .h3l-ph { padding:12px; }

.h3l-panel { min-width:0; }
.h3l-panel > * { min-width:0; max-width:100%; }
.h3l-panel .h3l-scroll,.h3l-panel .h3l-setbody { overflow-x:hidden; min-width:0; width:100%; box-sizing:border-box; }
.h3l-panel .h3l-card,.h3l-panel .h3l-insp-block,.h3l-panel .h3l-det,.h3l-panel .h3l-mdlrow,.h3l-panel .h3l-dlcard { min-width:0; max-width:100%; box-sizing:border-box; }
.h3l-panel .h3l-sel,.h3l-panel .h3l-in,.h3l-panel select,.h3l-panel input:not([type=checkbox]):not([type=radio]):not([type=file]) { max-width:100%; min-width:0; box-sizing:border-box; }
.h3l-panel .h3l-pills { min-width:0; max-width:100%; }
.h3l-panel .h3l-settabs { flex:none; min-width:0; max-width:none; overflow:visible; }
.h3l-setbody > * { flex-shrink:0; }
.h3l-tool span { overflow:hidden; text-overflow:ellipsis; max-width:100%; }

.h3l-panel .h3l-scroll { padding:0 12px 12px; }
.h3l-insp { gap:12px; }
.h3l-insp > .h3l-card { padding:12px; gap:12px; }
/* Segment inspector blocks: same glass card as «Ролик», theme vars, clear gap */
.h3l-insp > .h3l-insp-block { background:var(--panel); border:1px solid var(--line); }
.h3l-insp { gap:var(--h3l-gap, 12px); }
.h3l-tl-bar { flex-wrap:wrap; gap:4px 8px; padding:8px 12px; }
.h3l-tl-main { grid-template-columns:112px minmax(0,1fr); }
.h3l-heads { position:relative; display:block; padding:0; overflow:hidden; }
.h3l-heads-inner { padding-top:30px; will-change:transform; }
.h3l-thead.v { height:calc(var(--video-h,110px) + 8px); }
.h3l-thead.a { height:calc(var(--audio-h,72px) + 8px); padding:0; }
.h3l-tscroll { overflow-x:auto; overflow-y:auto; }
.h3l-tinner { height:100%; min-height:var(--timeline-min,188px); }
.h3l-track.v { top:36px; height:var(--video-h,110px); }
.h3l-track.a { top:var(--audio-top,154px); height:var(--audio-h,72px); }
.h3l-clip .t { font-size:13px; }
.h3l-clip .p, .h3l-clip .t .d, .h3l-clip .bd { font-size:12px; }
.h3l-tl.compact-video .h3l-clip .p, .h3l-tl.compact-video .h3l-clip .rf { display:none; }
.h3l-tl.compact-video .h3l-clip > .c { padding:4px 8px; }
.h3l-lane-toggle { width:28px; color:var(--txt); font-size:12px; font-weight:700; }
.h3l-gal { gap:8px; padding:12px; }
.h3l-ggrid { gap:12px; }
.h3l-gcard { background:var(--panel2); }
.h3l-gcard.stack::before, .h3l-gcard.stack::after { background:var(--panel2); }
.h3l-gcard .cap { gap:4px; padding:8px; }
.h3l-gcard .gtype { color:var(--txt); font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.h3l-gcard.stack .gtype { color:var(--a2); }
@media(max-width:1600px) {
  .h3l-head-actions .h3l-btn:not(.primary) > span { display:none; }
  .h3l-head-actions .h3l-btn:not(.primary) { width:32px; padding:0; }
  .h3l-head-actions .h3l-btn.primary > small { display:none; }
}
@media(max-width:1180px) { .h3l-head-main > .h3l-logo > span { display:none; } .h3l-head-main > .h3l-pname { width:120px; } }
@media(max-width:440px){.h3l-themegrid{grid-template-columns:1fr}}
/* ---- compact one-row header + edge panel toggles ---- */
.h3l-head { flex-direction:row; flex-wrap:nowrap; align-items:center; justify-content:flex-start; gap:8px; min-height:48px; padding:0 12px; overflow:visible; }
.h3l-head > * { flex:none; min-width:0; }
.h3l-head > .h3l-pname { flex:0 1 auto; width:clamp(90px,10vw,180px); min-width:70px; }
.h3l-head > .h3l-chips { flex:0 1 auto; flex-wrap:nowrap; overflow:hidden; gap:4px; }
.h3l-head > .grow { flex:1 1 0; }
.h3l-head .h3l-chip { white-space:nowrap; }
.h3l-head-actions { margin-left:0; }
.h3l-edge { position:relative; grid-row:1; width:0; height:100%; justify-self:center; z-index:8; pointer-events:none; }
.h3l-edge.l { grid-column:4; } .h3l-edge.r { grid-column:6; }
.h3l-edge-btn { position:absolute; top:50%; transform:translateY(-50%); width:20px; height:56px; padding:0; border-radius:10px; border:1px solid var(--line); background:color-mix(in srgb,var(--panel2) 94%,transparent); color:var(--mut); font-size:16px; line-height:1; cursor:pointer; opacity:0; pointer-events:auto; transition:opacity .15s,color .15s,border-color .15s; }
.h3l-edge.l .h3l-edge-btn { left:-24px; } .h3l-edge.r .h3l-edge-btn { left:4px; }
.h3l-left-collapsed .h3l-edge.l .h3l-edge-btn { left:4px; opacity:.55; }
.h3l-right-collapsed .h3l-edge.r .h3l-edge-btn { left:-24px; opacity:.55; }
.h3l-panel:hover ~ .h3l-edge.l .h3l-edge-btn, .h3l-insp:hover + .h3l-edge.r .h3l-edge-btn, .h3l-edge-btn:hover, .h3l-edge-btn:focus-visible { opacity:1; color:var(--txt); border-color:color-mix(in srgb,var(--a1) 50%,transparent); }
@media(max-width:2000px){ .h3l-head .c-steps { display:none; } }
@media(max-width:1850px){ .h3l-head .c-time { display:none; } }
@media(max-width:1800px){ .h3l-head-actions .h3l-btn:not(.primary) > span { display:none; } .h3l-head-actions .h3l-btn:not(.primary) { width:32px; padding:0; } }
@media(max-width:1560px){ .h3l-head .c-seg { display:none; } }
@media(max-width:1500px){ .h3l-head .h3l-sysmon small { display:none; } }
@media(max-width:1420px){ .h3l-head .c-frames { display:none; } }
@media(max-width:1200px){ .h3l-head-actions .h3l-btn.primary > span { display:none; } .h3l-head-actions .h3l-btn.primary { width:32px; padding:0; } .h3l-head .h3l-sysmon .temp, .h3l-head .h3l-sysmon .dot { display:none; } }
@media(max-width:1100px){ .h3l-head .c-res { display:none; } }
@media(max-width:980px){ .h3l-head > .h3l-pname { display:none; } }
/* ---- edge toggles: more noticeable ---- */
.h3l-edge-btn { width:24px; height:68px; font-size:22px; font-weight:700; color:var(--txt); opacity:.9; background:color-mix(in srgb,var(--a1) 24%,var(--panel2)); border-color:color-mix(in srgb,var(--a1) 60%,transparent); box-shadow:0 2px 10px rgba(0,0,0,.35); animation:h3l-edge-pulse 1.8s ease-in-out 3; }
.h3l-edge.l .h3l-edge-btn { left:-28px; } .h3l-edge.r .h3l-edge-btn { left:4px; }
.h3l-left-collapsed .h3l-edge.l .h3l-edge-btn { left:4px; opacity:1; }
.h3l-right-collapsed .h3l-edge.r .h3l-edge-btn { left:-28px; opacity:1; }
.h3l-panel:hover ~ .h3l-edge.l .h3l-edge-btn, .h3l-insp:hover + .h3l-edge.r .h3l-edge-btn, .h3l-edge-btn:hover, .h3l-edge-btn:focus-visible { opacity:1; background:color-mix(in srgb,var(--a1) 45%,var(--panel2)); }
@keyframes h3l-edge-pulse { 0%,100% { box-shadow:0 2px 10px rgba(0,0,0,.35),0 0 0 0 color-mix(in srgb,var(--a1) 60%,transparent); } 50% { box-shadow:0 2px 10px rgba(0,0,0,.35),0 0 0 8px transparent; } }
.h3l-root .h3l-tools .h3l-tool { font-size:11.5px; letter-spacing:0; padding-left:2px; padding-right:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
/* ---- edge toggles live in their own 16px column; wider tool rail ---- */
.h3l-body { grid-template-columns:76px var(--left-gap) var(--left-col) 16px minmax(0,1fr) 16px var(--right-col); }
.h3l-edge { width:100%; justify-self:stretch; }
.h3l-root .h3l-edge .h3l-edge-btn { left:0 !important; width:100% !important; height:64px; border-radius:8px; font-size:16px; }
.h3l-root .h3l-tools .h3l-tool { width:calc(100% - 12px); max-width:none; font-size:11.5px; padding-left:1px; padding-right:1px; }
/* ---- gallery: stacks look like folders ---- */
.h3l-ggrid { row-gap:0; }
.h3l-ggrid > .h3l-gcard { margin-top:18px; margin-bottom:6px; }
.h3l-gcard.stack { border-color:color-mix(in srgb,var(--a2) 55%,var(--line)); background:color-mix(in srgb,var(--a2) 9%,var(--panel2)); }
.h3l-gcard.stack .ftab { position:absolute; left:10px; top:-17px; height:18px; padding:0 10px; display:flex; align-items:center; gap:4px; font-size:11px; font-weight:800; color:#fff; border-radius:8px 8px 0 0; border:1px solid color-mix(in srgb,var(--a2) 65%,var(--line)); border-bottom:none; background:color-mix(in srgb,var(--a2) 55%,var(--panel2)); z-index:3; }

/* Model downloads + welcome */
.h3l-mdl{display:flex;flex-direction:column;gap:12px;padding:4px 0 16px}
.h3l-mdl-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.h3l-mdl-head h4{margin:0;font-size:14px}
.h3l-mdl-count{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);font-size:11px;color:var(--mut)}
.h3l-mdl-group{display:flex;flex-direction:column;gap:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel2)}
.h3l-mdl-gtitle{padding:10px 12px;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg1) 70%,transparent)}
.h3l-mdl-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)}
.h3l-mdl-row:last-child{border-bottom:none}
.h3l-mdl-row.ok{background:color-mix(in srgb,var(--ok) 6%,transparent)}
.h3l-mdl-ico{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:color-mix(in srgb,var(--a1) 12%,transparent);color:var(--a1);font-size:13px}
.h3l-mdl-meta{display:flex;flex-direction:column;gap:3px;min-width:0}
.h3l-mdl-meta b{font-size:12.5px;font-weight:600;line-height:1.35}
.h3l-mdl-meta small{font-size:10.5px;color:var(--mut);word-break:break-all}
.h3l-mdl-act{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.h3l-mdl-badge{font-size:10px;color:var(--mut)}
.h3l-mdl-ok{color:var(--ok);font-weight:700}
.h3l-mdl-bar{position:relative;height:16px;margin-top:6px;border-radius:6px;background:rgba(0,0,0,.25);overflow:hidden;border:1px solid var(--line)}
.h3l-mdl-bar i{display:block;height:100%;background:var(--grad)}
.h3l-mdl-bar span{position:absolute;inset:0;display:grid;place-items:center;font-size:10px;color:var(--txt);text-shadow:0 1px 2px #000}
.h3l-welcome{width:min(480px,92vw);padding:0;overflow:hidden}
.h3l-welcome .hd{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--line)}
.h3l-welcome-body{padding:14px 16px;display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.55}
.h3l-welcome .h3l-row{padding:12px 16px 16px;border-top:1px solid var(--line)}
.h3l-welcome-links{display:flex;gap:8px;padding:0 16px 14px;flex-wrap:wrap}
.h3l-welcome-links .h3l-linkbtn{flex:1 1 150px;min-width:0;height:34px;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;font-size:13px;font-weight:600;white-space:nowrap}
.h3l-welcome-links .h3l-linkbtn svg{flex:none}
.h3l-welcome-links .h3l-linkbtn span{overflow:hidden;text-overflow:ellipsis}
.h3l-welcome-prefs{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--control)}
.h3l-welcome-prefs .h3l-lbl{margin:0;flex:1;min-width:120px;text-transform:none;letter-spacing:0;font-size:12px;font-weight:600;color:var(--mut)}
.h3l-welcome-prefs .h3l-ui-scale,.h3l-welcome .h3l-ui-scale{width:auto;min-width:64px;max-width:88px;height:30px;padding:0 22px 0 10px;flex:none;font-size:12.5px;font-weight:600}

/* Generation params dialog */
.h3l-gm { width:min(560px, 94vw); max-height:min(86vh, 820px); overflow:auto; }
.h3l-gm-body { display:flex; flex-direction:column; gap:10px; }
.h3l-gm-row { display:grid; grid-template-columns:140px 1fr; gap:8px; align-items:start; font-size:12.5px; }
.h3l-gm-k { color:var(--mut); text-transform:uppercase; letter-spacing:.4px; font-size:11px; font-weight:600; padding-top:2px; }
.h3l-gm-v { color:var(--txt); white-space:pre-wrap; word-break:break-word; }
.h3l-gm-refs { display:flex; flex-wrap:wrap; gap:6px; }
.h3l-gm-thumb { width:64px; border-radius:8px; overflow:hidden; border:1px solid var(--line2); background:var(--panel2); text-align:center; font-size:10px; color:var(--mut); }
.h3l-gm-thumb img { width:64px; height:48px; object-fit:cover; display:block; }
.h3l-gm-thumb em { display:block; padding:2px 4px; font-style:normal; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* insp fit: panel scrolls as a whole; section cards never get their own vertical scrollbars.
   Note: overflow-x:hidden alone forces overflow-y:auto (CSS quirk) — that caused per-card scrollbars. */
.h3l-insp { overflow-x: clip; overflow-y: auto; min-width: 0; max-width: 100%; align-content: flex-start; }
.h3l-insp > .h3l-card, .h3l-insp > .h3l-insp-block {
  flex: 0 0 auto; flex-shrink: 0; min-height: auto; max-height: none;
  min-width: 0; max-width: 100%; overflow: visible; box-sizing: border-box;
}
.h3l-insp .h3l-row, .h3l-insp .h3l-grid2, .h3l-insp .h3l-grid3, .h3l-insp .h3l-qs { min-width: 0; max-width: 100%; }
.h3l-insp .h3l-grid2, .h3l-insp .h3l-grid3 { grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); }
.h3l-insp .h3l-sel, .h3l-insp .h3l-in, .h3l-insp .h3l-ta, .h3l-insp .h3l-btn { max-width: 100%; min-width: 0; box-sizing: border-box; }
.h3l-insp .h3l-takes, .h3l-insp .h3l-take-row { max-width: 100%; min-width: 0; }
.h3l-insp .h3l-take-row { overflow-x: auto; overflow-y: hidden; } /* doubles strip: horizontal only */
.h3l-insp .h3l-val { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
.h3l-insp .h3l-card-h { min-width: 0; }
.h3l-insp .h3l-card-h h4 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Prompt preview: few lines, fade/clamp — no inner scrollbar */
.h3l-insp .h3l-final {
  max-height: none; overflow: hidden;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 7;
  line-clamp: 7; mask-image: linear-gradient(180deg, #000 75%, transparent);
}

/* UI scale picker in header — compact, no crowding at 1366 */
.h3l-head .h3l-ui-scale { width:auto; min-width:52px; max-width:68px; height:28px; padding:0 22px 0 8px; flex:none; font-size:12px; font-weight:600; }
.h3l-head .h3l-ui-scale .h3l-dd-lab { overflow:hidden; text-overflow:ellipsis; }
@media (max-width:1400px) {
  .h3l-head .h3l-chips .h3l-chip.c-steps, .h3l-head .h3l-chips .h3l-chip.c-time { display:none; }
}
/* New workspace, deliberately scoped: Classic keeps every original layout rule. */
.h3l-modern-ribbon, .h3l-modern-quick { display:none; }
.h3l-root.h3l-workspace-modern { grid-template-rows:100px minmax(0,1fr) auto; }
.h3l-root.h3l-workspace-modern .h3l-head { flex-wrap:wrap; align-content:center; gap:5px 11px; padding:6px 12px; }
.h3l-root.h3l-workspace-modern .h3l-head > .h3l-chips { display:none; }
.h3l-root.h3l-workspace-modern .h3l-head .h3l-pname { width:clamp(100px, 12vw, 180px); }
.h3l-root.h3l-workspace-modern .h3l-head .h3l-head-actions { min-width:0!important; width:auto!important; margin-left:auto; }
.h3l-root.h3l-workspace-modern .h3l-modern-ribbon { display:flex; order:100; width:100%; min-width:0; height:33px; align-items:center; gap:9px; border-top:1px solid var(--line); padding-top:5px; }
.h3l-root.h3l-workspace-modern .h3l-modern-metric { font-size:11px; color:var(--mut); white-space:nowrap; }
.h3l-root.h3l-workspace-modern .h3l-modern-metric b { color:var(--txt); }
.h3l-root.h3l-workspace-modern .h3l-modern-state { font-size:12px; font-weight:650; color:var(--txt); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-left:auto; }
.h3l-root.h3l-workspace-modern .h3l-modern-progress { position:relative; height:6px; min-width:62px; width:clamp(62px,9vw,150px); border-radius:9px; background:var(--line2); overflow:hidden; flex:none; }
.h3l-root.h3l-workspace-modern .h3l-modern-fill { display:block; height:100%; width:0; background:var(--grad); border-radius:inherit; transition:width .2s ease; }
.h3l-root.h3l-workspace-modern .h3l-modern-ribbon .h3l-btn { white-space:nowrap; height:26px; flex:none; font-size:11px; }
.h3l-root.h3l-workspace-modern .h3l-modern-quick { display:flex; gap:7px; align-items:center; flex:none; flex-wrap:wrap; padding:8px 12px; margin:0 12px 6px; border:1px solid var(--line2); border-radius:var(--r3); background:var(--control); }
.h3l-root.h3l-workspace-modern .h3l-modern-quick b { white-space:nowrap; }
.h3l-root.h3l-workspace-modern .h3l-modern-quick .h3l-btn { height:30px; }
.h3l-root.h3l-workspace-modern .h3l-modern-quality { color:var(--warn); font-size:11px; font-weight:700; margin-right:auto; }
.h3l-root.h3l-workspace-modern .h3l-modern-quality.ready { color:var(--ok); }
.h3l-root.h3l-workspace-modern .h3l-modern-compact .t .nm,
.h3l-root.h3l-workspace-modern .h3l-modern-compact .t .d,
.h3l-root.h3l-workspace-modern .h3l-modern-compact .t .kfb { display:none; }
.h3l-root.h3l-workspace-modern .h3l-modern-compact .rf,
.h3l-root.h3l-workspace-modern .h3l-modern-compact .bd { display:none; }
.h3l-root.h3l-workspace-modern .h3l-comp-ph.h3l-modern-preview-fallback::before { background:linear-gradient(180deg,rgba(6,7,10,.22),rgba(6,7,10,.76)); }
.h3l-root.h3l-workspace-modern .h3l-comp-ph.h3l-modern-preview-fallback .in { padding:12px; border-radius:10px; background:rgba(6,7,10,.45); }
.h3l-root.h3l-workspace-modern .h3l-clip .acts { gap:4px; }
.h3l-root.h3l-workspace-modern .h3l-cb { min-width:29px; height:29px; }
.h3l-root.h3l-workspace-modern .h3l-cb svg { width:16px; height:16px; }
.h3l-workspace-picker { display:flex; flex-direction:column; gap:9px; padding:14px; border:1px solid var(--line2); border-radius:12px; background:var(--control); }
.h3l-workspace-choices { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
.h3l-workspace-choice { display:flex; flex-direction:column; align-items:flex-start; gap:4px; text-align:left; border:1px solid var(--line2); border-radius:10px; background:var(--panel2); padding:12px 14px; color:var(--txt); cursor:pointer; font:inherit; }
.h3l-workspace-choice small { font-size:11px; color:var(--mut); }
.h3l-workspace-choice.on { border-color:var(--a1); box-shadow:0 0 0 1px var(--a1) inset; background:var(--glow1); }
.h3l-workspace-choice:focus-visible, .h3l-root.h3l-workspace-modern .h3l-btn:focus-visible { outline:2px solid var(--a1); outline-offset:2px; }
.h3l-modern-assets { display:flex; gap:6px; padding:8px 0; }
.h3l-modern-assets .h3l-in { min-width:0; flex:1; }
.h3l-modern-assets .h3l-sel { width:auto; max-width:120px; }
.h3l-root.h3l-workspace-modern .h3l-save { max-height:calc(100vh - 45px); overflow-y:auto; }
.h3l-modern-save-path { overflow-wrap:anywhere; font:11px ui-monospace,monospace; color:var(--txt); padding:8px 10px; background:var(--field); border:1px solid var(--line); border-radius:8px; user-select:text; }
.h3l-modern-export-step { display:flex; gap:5px; flex-wrap:wrap; margin:8px 0; }
.h3l-modern-export-step span { font-size:11px; padding:4px 8px; border-radius:7px; background:var(--control); color:var(--mut); }
.h3l-modern-export-step span.on { color:var(--txt); background:var(--glow1); border:1px solid var(--a1); }
.h3l-modern-export-history { max-height:130px; overflow:auto; }
.h3l-modern-export-history button { text-align:left; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
@media (max-width:1350px) {
 .h3l-root.h3l-workspace-modern .h3l-head .h3l-head-group .h3l-btn:not(.primary):not(.danger):not(.is-stop) span { display:none; }
 .h3l-root.h3l-workspace-modern .h3l-modern-metric:nth-child(3) { display:none; }
 .h3l-root.h3l-workspace-modern .h3l-modern-ribbon { gap:6px; }
}
:root[data-h3l-ui-blur="off"] .h3l-root,
:root[data-h3l-ui-blur="off"] .h3l-root *,
:root[data-h3l-ui-blur="off"] .h3l-compact,
:root[data-h3l-ui-blur="off"] .h3l-compact *,
:root[data-h3l-ui-blur="off"] [class^="h3l-"],
:root[data-h3l-ui-blur="off"] [class*=" h3l-"],
:root[data-h3l-ui-blur="off"] .h3l-comp-ph::before {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
`;

export function injectStyle() {
  applyTheme();
  applyUiBlur();
  if (document.getElementById("h3l-style")) return;
  const s = document.createElement("style");
  s.id = "h3l-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}
