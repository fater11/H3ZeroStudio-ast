// H3ZeroStudio Lab — "Pro" layer (macOS-native premium). Loaded after FX_CSS + SKIN_CSS and wins over them.
// Neutral dark surfaces (#1C1C1E / #2C2C2E), one accent (#0A84FF) reserved for the main action and focus,
// hairline dividers instead of nested outlines, soft shadows for depth, one selected-state pattern,
// 13px body / ≥11px captions with ≥4.5:1 contrast, 8px grid, nested radii 16/12/8, no glow or scanlines.
const LP = ':root[data-h3l-theme="lab"]';
const L = LP + " .h3l-root";
const POP = `${LP} :is(.h3l-root,.h3l-menu,.h3l-dd,.h3l-lp,.h3l-modal,.h3l-monpop,.h3l-pe-modal,.h3l-tip)`;
const SURF = `${LP} :is(.h3l-root,.h3l-menu,.h3l-dd,.h3l-lp,.h3l-modal,.h3l-monpop,.h3l-pe-modal)`;

export const PRO_CSS = `
${LP} {
  --p-bg:#141416; --p-s1:#1c1c1e; --p-s2:#242426; --p-s3:#2c2c2e; --p-s4:#3a3a3c;
  --p-line:rgba(255,255,255,.08); --p-line2:rgba(255,255,255,.12);
  --p-txt:#f5f5f7; --p-txt2:#aeaeb2; --p-txt3:#98989f;
  --p-acc:#0a84ff; --p-acc-h:#2b95ff; --p-acc-soft:rgba(10,132,255,.16);
  --p-ok:#30d158; --p-warn:#ff9f0a; --p-err:#ff453a;
  --p-font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
  --p-mono:"SF Mono",ui-monospace,"JetBrains Mono",Consolas,monospace;
  --p-ease:cubic-bezier(.2,.8,.2,1);
}
${SURF} {
  --bg0:var(--p-bg); --bg1:var(--p-s1); --bg2:var(--p-s3); --panel:var(--p-s1); --panel2:var(--p-s2);
  --line:var(--p-line); --line2:var(--p-line2); --txt:var(--p-txt); --mut:var(--p-txt2); --mut2:var(--p-txt3);
  --a1:var(--p-acc); --a2:#64aaff; --a3:var(--p-acc); --ok:var(--p-ok); --warn:var(--p-warn); --err:var(--p-err);
  --field:#1a1a1c; --control:var(--p-s3); --glow1:transparent; --glow2:transparent; --glow3:transparent;
  --grad:var(--p-acc); --grad2:var(--p-acc);
  font-family:var(--p-font); font-size:13px; color:var(--p-txt); -webkit-font-smoothing:antialiased;
}
${L} { --h3l-pad:8px; --h3l-gap:8px; --h3l-r:12px; background:var(--p-bg); }
${LP} .h3l-fx-bg { background:radial-gradient(120% 80% at 50% -10%,#1d1d20 0%,#141416 60%) !important; }
${LP} .h3l-fx-bg canvas { opacity:.35 !important; }

/* ===== kill sci-fi: glow rings, spotlights, shine, scanlines, sweeps, sparks ===== */
${POP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab,.h3l-glass,.h3l-card,.h3l-theme,.h3l-gcard,.h3l-asset,.h3l-char,.h3l-chcard,.h3l-sel,.h3l-in)::before,
${POP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab)::after { content:none !important; display:none !important; }
${LP} .h3l-fx-shine, ${LP} .h3l-fx-sparks, ${L} .h3l-comp-ph::after, ${L} .h3l-comp-ph .in::after, ${L} .h3l-frame::after { display:none !important; content:none !important; }
${L} *, ${POP} * { text-shadow:none !important; }
${L} .h3l-lit { box-shadow:none; }

/* ===== surfaces: one tone per level, soft shadow, no stroke ===== */
${L} .h3l-glass, ${L} .h3l-glass.h3l-lit { background:var(--p-s1) !important; border:none !important; border-radius:12px !important;
  box-shadow:0 0 0 .5px rgba(0,0,0,.6), 0 1px 2px rgba(0,0,0,.25), 0 8px 24px -12px rgba(0,0,0,.5) !important; }
${L} > .h3l-head { border-radius:12px !important; padding:0 8px 0 12px; gap:8px; }
${L} .h3l-insp > .h3l-glass { background:var(--p-s1) !important; }
${L} .h3l-card, ${L} .h3l-glass .h3l-glass { background:var(--p-s2) !important; border:none !important; box-shadow:none !important; border-radius:8px !important; }
${L} .h3l-insp > .h3l-glass .h3l-card { background:transparent !important; padding-left:0; padding-right:0; }
${L} .h3l-ph h3 { font:600 13px/1.3 var(--p-font); letter-spacing:0; text-transform:none; color:var(--p-txt); }
${L} .h3l-lbl, ${POP} .h3l-lbl { font:600 13px/1.35 var(--p-font) !important; letter-spacing:0 !important; text-transform:none !important; color:var(--p-txt) !important; }
${L} .h3l-lbl em, ${POP} .h3l-lbl em { font:400 11.5px/1.35 var(--p-font) !important; color:var(--p-txt3) !important; font-style:normal !important; letter-spacing:0 !important; }
${L} .h3l-note, ${POP} .h3l-note { font-size:12px; line-height:1.45; color:var(--p-txt2); }
${L} small, ${L} .h3l-val { color:var(--p-txt3); }
${L} :is(.mono,[class*="time"],.h3l-val,.h3l-chip b) { font-variant-numeric:tabular-nums; }

/* ===== controls ===== */
${SURF} :is(.h3l-btn,.h3l-spk) { min-height:28px; border-radius:8px !important; border:none !important; background:var(--p-s3) !important; color:var(--p-txt) !important;
  box-shadow:0 .5px 0 rgba(255,255,255,.06) inset, 0 0 0 .5px rgba(0,0,0,.5), 0 1px 1.5px rgba(0,0,0,.25) !important; font:500 13px/1 var(--p-font); letter-spacing:0;
  transition:background-color .18s var(--p-ease), color .18s var(--p-ease), opacity .18s var(--p-ease) !important; transform:none !important; white-space:nowrap; }
${SURF} .h3l-btn.sm { min-height:28px; font-size:12.5px; padding:0 10px; }
${SURF} .h3l-btn.icon { min-width:28px; }
${SURF} :is(.h3l-btn,.h3l-spk):hover:not(:disabled):not(.dis) { background:var(--p-s4) !important; }
${SURF} .h3l-btn:active:not(:disabled) { background:#48484a !important; }
${SURF} .h3l-btn:disabled, ${SURF} .h3l-btn.dis { opacity:.4 !important; }
${SURF} .h3l-btn.primary { background:var(--p-acc) !important; color:#fff !important; font-weight:600 !important; box-shadow:0 0 0 .5px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.3) !important; }
${SURF} .h3l-btn.primary:hover:not(:disabled) { background:var(--p-acc-h) !important; }
${SURF} .h3l-btn.primary small.q { background:rgba(255,255,255,.2) !important; color:#fff !important; }
${SURF} .h3l-btn.danger { color:#ff6961 !important; }
${SURF} .h3l-btn.danger:hover:not(:disabled) { background:rgba(255,69,58,.16) !important; }
${SURF} :is(.h3l-in,.h3l-sel,.h3l-ta) { background:#18181a !important; border:none !important; border-radius:8px !important; color:var(--p-txt) !important; font:400 13px/1.45 var(--p-font);
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.1), inset 0 1px 2px rgba(0,0,0,.25) !important; }
${SURF} :is(.h3l-in,.h3l-sel) { min-height:28px; }
${L} .h3l-insp .h3l-ta.lg { min-height:132px; }
${SURF} :is(.h3l-in,.h3l-sel,.h3l-ta)::placeholder { color:var(--p-txt3); }
${SURF} :is(.h3l-btn,.h3l-spk,.h3l-in,.h3l-sel,.h3l-ta,.h3l-pill,.h3l-tool,.h3l-settab,.h3l-tog,.h3l-edge-btn,a):focus-visible { outline:none !important; box-shadow:0 0 0 3px rgba(10,132,255,.55) !important; }

/* ONE selected-state pattern: segmented control (track #2C2C2E, selected = raised lighter segment, white text) */
${SURF} :is(.h3l-pills,.h3l-qs) { display:inline-flex; flex-wrap:wrap; gap:2px; padding:2px; border-radius:8px; background:#232325 !important; border:none !important; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.06) !important; }
${SURF} :is(.h3l-pill,.h3l-q) { min-height:24px; border-radius:6px !important; border:none !important; background:transparent !important; color:var(--p-txt2) !important; box-shadow:none !important;
  font:500 12.5px/1 var(--p-font) !important; letter-spacing:0 !important; transition:background-color .18s var(--p-ease), color .18s var(--p-ease) !important; transform:none !important; }
${SURF} :is(.h3l-pill,.h3l-q):hover:not(.on):not(.dis) { background:rgba(255,255,255,.06) !important; color:var(--p-txt) !important; }
${SURF} :is(.h3l-pill,.h3l-q).on { background:#5a5a5e !important; color:#fff !important; box-shadow:0 1px 2px rgba(0,0,0,.35), inset 0 .5px 0 rgba(255,255,255,.12) !important; }
${SURF} .h3l-pill.dis, ${SURF} .h3l-pills.is-dis .h3l-pill { opacity:1 !important; color:#636366 !important; background:transparent !important; box-shadow:none !important; cursor:not-allowed; }
${SURF} .h3l-pills.is-dis { background:repeating-linear-gradient(135deg,transparent 0 6px,rgba(255,255,255,.025) 6px 12px), #1f1f21 !important; cursor:not-allowed; }
/* toggles: macOS switch, the only boolean control */
${SURF} .h3l-tog { min-height:28px; gap:8px; }
${SURF} .h3l-tog > span { font-size:13px; color:var(--p-txt); }
${SURF} .h3l-tog > i { width:32px !important; height:18px !important; border-radius:9px !important; background:#48484a !important; border:none !important; box-shadow:none !important; flex:none; position:relative; transition:background-color .2s var(--p-ease) !important; }
${SURF} .h3l-tog > i::after { content:"" !important; display:block !important; position:absolute; top:2px !important; left:2px !important; width:14px !important; height:14px !important; border-radius:50% !important; background:#fff !important; box-shadow:0 1px 2px rgba(0,0,0,.35) !important; transition:transform .2s var(--p-ease) !important; transform:none; }
${SURF} .h3l-tog.on > i { background:var(--p-acc) !important; }
${SURF} .h3l-tog.on > i::after { transform:translateX(14px) !important; }
${SURF} .h3l-tog > i::before { content:none !important; }
/* custom checkbox (welcome) */
${SURF} .h3l-check { display:inline-flex; align-items:center; gap:8px; min-height:28px; cursor:pointer; font-size:12.5px; color:var(--p-txt2); user-select:none; }
${SURF} .h3l-check input { position:absolute; opacity:0; width:1px; height:1px; pointer-events:none; }
${SURF} .h3l-check .box { width:16px; height:16px; border-radius:4px; background:#2c2c2e; box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); display:grid; place-items:center; transition:background-color .15s var(--p-ease); }
${SURF} .h3l-check input:checked + .box { background:var(--p-acc); box-shadow:none; }
${SURF} .h3l-check input:checked + .box::after { content:""; width:8px; height:4px; border:2px solid #fff; border-top:0; border-right:0; transform:translateY(-1px) rotate(-45deg); }
${SURF} .h3l-check input:focus-visible + .box { box-shadow:0 0 0 3px rgba(10,132,255,.55); }
/* one slider style (scrubber, volume, every range): 4px track, 14px white knob */
${SURF} input[type=range].h3l-range, ${L} .h3l-vol input[type=range], ${L} input[type=range] { -webkit-appearance:none; appearance:none; height:20px; background:transparent !important; accent-color:var(--p-acc); }
${SURF} input[type=range]::-webkit-slider-runnable-track { height:4px !important; border-radius:2px !important; border:none !important; box-shadow:none !important;
  background:linear-gradient(90deg,#d1d1d6 0 var(--h3l-fill,0%),#48484a var(--h3l-fill,0%) 100%) !important; }
${SURF} input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px !important; height:14px !important; margin-top:-5px !important; border-radius:50% !important; border:none !important;
  background:#fff !important; box-shadow:0 0 0 .5px rgba(0,0,0,.3), 0 1px 3px rgba(0,0,0,.4) !important; }
${SURF} input[type=range]::-moz-range-track { height:4px; border-radius:2px; background:#48484a; border:none; }
${SURF} input[type=range]::-moz-range-progress { height:4px; border-radius:2px; background:#d1d1d6; }
${SURF} input[type=range]::-moz-range-thumb { width:14px; height:14px; border-radius:50%; border:none; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.4); }
${L} .h3l-fx-scrub { height:20px !important; }
${L} .h3l-fx-scrub > :is(.tr,.track,i,b,span):not(.tip):not(.h3l-fx-scrub-tip) { height:4px !important; border-radius:2px !important; box-shadow:none !important; filter:none !important; }

/* ===== header ===== */
${L} > .h3l-head .h3l-logo i::after { content:none !important; display:none !important; }
${L} > .h3l-head .h3l-chip { background:transparent !important; border:none !important; box-shadow:none !important; color:var(--p-txt3); font-size:12px; padding:0 4px; }
${L} > .h3l-head .h3l-chip b { color:var(--p-txt); font-weight:600; font-variant-numeric:tabular-nums; }
${L} > .h3l-head .h3l-chips { gap:4px; }
${L} > .h3l-head .h3l-chips .h3l-chip + .h3l-chip { border-left:1px solid var(--p-line) !important; border-radius:0; padding-left:8px; }
${L} > .h3l-head .h3l-pname { font:600 13px/1 var(--p-font); color:var(--p-txt); background:transparent !important; box-shadow:none !important; }
${L} > .h3l-head .h3l-head-group { gap:4px; background:transparent !important; border:none !important; box-shadow:none !important; padding:0; }
${L} > .h3l-head .h3l-head-actions { justify-content:flex-end; flex:none; }
${L} > .h3l-head .h3l-head-actions.h3l-act-run .h3l-run { flex:1 1 auto; min-width:0; }
${L} > .h3l-head .h3l-run { background:var(--p-s3) !important; border:none !important; border-radius:8px !important; box-shadow:none !important; height:28px; overflow:hidden; }
${L} > .h3l-head .h3l-run > span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
${L} > .h3l-head .h3l-run > i { background:rgba(10,132,255,.35) !important; }
/* resources → one icon button (popover on click) */
${L} > .h3l-head .h3l-sysmon { height:28px !important; width:auto; padding:0 8px !important; gap:6px !important; border-radius:8px !important; background:transparent !important; border:none !important; box-shadow:none !important; color:var(--p-txt2); }
${L} > .h3l-head .h3l-sysmon:hover { background:var(--p-s3) !important; color:var(--p-txt); }
${L} > .h3l-head .h3l-sysmon > .m { display:none !important; }
${L} > .h3l-head .h3l-sysmon .h3l-mon-ic { display:inline-flex; width:16px; height:16px; }
${L} > .h3l-head .h3l-sysmon .dot { width:6px !important; height:6px !important; box-shadow:none !important; order:2; background:var(--p-ok) !important; }
${L} > .h3l-head .h3l-sysmon.is-hot .dot { background:var(--p-warn) !important; }
${L} > .h3l-head .h3l-sysmon.off .dot { background:#636366 !important; }
${L} > .h3l-head .h3l-sysmon.err .dot { background:var(--p-err) !important; }

/* ===== left rail ===== */
${L} > .h3l-body > .h3l-tools { gap:2px; padding:8px 4px; }
${L} .h3l-tool { min-height:48px; border-radius:8px !important; background:transparent !important; border:none !important; box-shadow:none !important; color:var(--p-txt2) !important; transition:background-color .18s var(--p-ease), color .18s var(--p-ease) !important; }
${L} .h3l-tool span { font:500 11px/1.2 var(--p-font) !important; letter-spacing:0 !important; color:inherit !important; }
${L} .h3l-tool:hover { background:rgba(255,255,255,.06) !important; color:var(--p-txt) !important; }
${L} .h3l-tool.on { background:rgba(255,255,255,.1) !important; color:#fff !important; }
${L} .h3l-tool.on svg { color:var(--p-acc) !important; }
${L} .h3l-fx-dock { display:none !important; }
${L} .h3l-support { background:transparent !important; border:none !important; box-shadow:none !important; color:var(--p-txt3) !important; font-size:11px; min-height:28px; }
${L} .h3l-support svg { color:#8e8e93 !important; fill:currentColor; }
${L} .h3l-support:hover { color:var(--p-txt) !important; background:rgba(255,255,255,.06) !important; }
${L} .h3l-about-links { padding:12px 0 0; display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--p-line); margin-top:8px; }
${L} .h3l-about-links .h3l-row { flex-wrap:wrap; gap:8px; }
${L} .h3l-linkbtn svg { width:14px; height:14px; margin-right:6px; }

/* ===== edge collapse tabs: quiet, inside the panel edge ===== */
${L} .h3l-edge-btn { background:var(--p-s3) !important; box-shadow:none !important; border:none !important; opacity:0 !important; transition:opacity .2s var(--p-ease) !important; }
${L} > .h3l-body:hover .h3l-edge-btn { opacity:.6 !important; } ${L} .h3l-edge-btn:hover, ${L} .h3l-edge-btn:focus-visible { opacity:1 !important; }

/* ===== preview ===== */
${L} .h3l-frame { background:#000 !important; border-radius:8px !important; box-shadow:0 0 0 .5px rgba(255,255,255,.06), 0 8px 24px -12px rgba(0,0,0,.6) !important; }
${L} .h3l-comp-ph::before { background:linear-gradient(180deg,#1a1a1c,#121214) !important; }
${L} .h3l-comp-ph .in { gap:12px; }
${L} .h3l-comp-ph .in b { font:600 15px/1.3 var(--p-font) !important; color:var(--p-txt) !important; letter-spacing:0 !important; }
${L} .h3l-comp-ph .in span:empty { display:none; }
${L} .h3l-comp-ph .h3l-ph-gen { min-height:32px; padding:0 16px; }
${L} .h3l-badge-live { background:rgba(0,0,0,.55) !important; border:none !important; box-shadow:none !important; color:var(--p-txt2) !important; font:500 11px/1 var(--p-font) !important; letter-spacing:0 !important; text-transform:none !important; border-radius:6px !important; }
${L} .h3l-pv-tabs .h3l-pill, ${L} .h3l-center .h3l-pills .h3l-pill { min-height:24px; }
${L} .h3l-center :is(.h3l-pvinfo,.h3l-pv-info,.info) { color:var(--p-txt3); font-size:12px; }
${L} .h3l-ph-empty .tag { color:var(--p-txt3) !important; background:var(--p-s3) !important; border:none !important; }
/* transport: plain, no segmented glass */
${L} .h3l-transport, ${L} .h3l-trans { background:transparent !important; border:none !important; box-shadow:none !important; }
${L} .h3l-play { border-radius:8px !important; margin:0 !important; background:var(--p-s3) !important; color:#fff !important; box-shadow:none !important; }
${L} .h3l-timecode, ${L} [class*="tcode"] { font:500 12px/1 var(--p-mono) !important; font-variant-numeric:tabular-nums; color:var(--p-txt) !important; background:transparent !important; border:none !important; box-shadow:none !important; }
/* sampling dynamics: hidden until a run produces data */
${L} .h3l-dyn.is-empty { display:none !important; }
${L} .h3l-dyn { background:var(--p-s2) !important; border:none !important; box-shadow:none !important; border-radius:8px !important; }
${L} .h3l-dyn .hd b { font:600 12.5px/1 var(--p-font); color:var(--p-txt); letter-spacing:0; text-transform:none; }
${L} .h3l-dyn :is(.st,.lb,.nf) { color:var(--p-txt2) !important; font-size:11.5px; }
${L} .h3l-dyn .st.on { background:var(--p-acc-soft) !important; color:#9ccaff !important; }

/* ===== inspector ===== */
${L} .h3l-insp > .h3l-glass { padding:12px !important; }
${L} .h3l-insp > .h3l-glass + .h3l-glass { margin-top:0; }
${L} .h3l-insp .h3l-colors { gap:6px; margin-left:4px; margin-right:8px; }
${L} .h3l-insp .h3l-colors span { width:18px !important; height:18px !important; border-radius:50% !important; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.2) !important; cursor:pointer; }
${L} .h3l-insp .h3l-colors span.on { box-shadow:0 0 0 2px var(--p-s1), 0 0 0 3.5px #d1d1d6 !important; }
${L} .h3l-insp .h3l-card-h { gap:8px; }
${L} .h3l-insp .h3l-card-h > .h3l-btn.danger { margin-left:auto; border-left:1px solid var(--p-line); }
${L} .h3l-insp .h3l-num, ${L} .h3l-clip .n { border-radius:6px !important; box-shadow:none !important; }
${L} > .h3l-body > .h3l-insp { -webkit-mask-image:none !important; mask-image:none !important; padding-bottom:0 !important; }
${L} .h3l-insp .h3l-ta.lg { max-height:180px; }
${L} .h3l-insp .h3l-ta.lg:not(:focus) { -webkit-mask-image:none !important; mask-image:none !important; }
${L} :is(.h3l-insp,.h3l-panel,.h3l-scroll,.h3l-setbody) { scrollbar-width:thin; scrollbar-color:#48484a transparent; }
${L} .h3l-scroll::-webkit-scrollbar, ${L} .h3l-insp::-webkit-scrollbar { width:8px; }
${L} .h3l-scroll::-webkit-scrollbar-thumb, ${L} .h3l-insp::-webkit-scrollbar-thumb { background:#48484a; border-radius:4px; border:2px solid var(--p-s1); }

/* ===== timeline: card like the panels, compact clips, equal lanes ===== */
${L} > .h3l-tl { padding:0 !important; overflow:hidden; }
${L} > .h3l-tl .h3l-tl-bar { padding:6px 8px !important; gap:6px; border-bottom:1px solid var(--p-line) !important; background:transparent !important; }
${L} > .h3l-tl .h3l-tl-main { border-radius:0 0 12px 12px !important; background:transparent !important; box-shadow:none !important; border:none !important; }
${L} .h3l-thead { font:500 12.5px/1 var(--p-font) !important; color:var(--p-txt2) !important; }
${L} .h3l-thead svg { color:var(--p-txt3); }
${L} .h3l-tick span, ${L} .h3l-ruler span { font:500 11px/1 var(--p-mono) !important; color:#a1a1a6 !important; font-variant-numeric:tabular-nums; }
${L} .h3l-clip { border-radius:8px !important; background:#2c2c2e !important; border:none !important; box-shadow:inset 0 0 0 .5px rgba(255,255,255,.1) !important; }
${L} .h3l-clip::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; border-radius:8px 0 0 8px; background:var(--c1); opacity:.9; display:block !important; }
${L} .h3l-clip.sel { box-shadow:inset 0 0 0 2px var(--p-acc) !important; }
${L} .h3l-clip .t { font:600 13px/1.2 var(--p-font) !important; color:var(--p-txt) !important; }
${L} .h3l-clip .t .d { color:var(--p-txt2) !important; font-weight:500; font-variant-numeric:tabular-nums; }
${L} .h3l-clip .p { font:400 12px/1.35 var(--p-font) !important; color:var(--p-txt2) !important; display:block !important; white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; -webkit-line-clamp:unset !important; max-height:1.4em; }
${L} .h3l-clip .acts { gap:4px; }
${L} .h3l-clip .h3l-cb { width:28px !important; height:28px !important; min-width:28px; border-radius:6px !important; background:rgba(0,0,0,.45) !important; border:none !important; box-shadow:none !important; color:#fff !important; }
${L} .h3l-clip .h3l-cb:hover:not(.dis) { background:rgba(0,0,0,.7) !important; }
${L} .h3l-clip .h3l-cb svg { width:15px; height:15px; }
${L} .h3l-clip .bd { font:500 11px/1 var(--p-font) !important; letter-spacing:0 !important; text-transform:none !important; }
${L} .h3l-alane, ${L} .h3l-mlane { border-radius:6px !important; background:#1f1f21 !important; border:1px dashed rgba(255,255,255,.14) !important; box-shadow:none !important; }
${L} :is(.h3l-alane,.h3l-mlane) > span { font:400 12px/1 var(--p-font) !important; color:#a1a1a6 !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${L} .h3l-thead.m, ${L} .h3l-thead.music, ${L} .h3l-thead[class*="mus"] { color:var(--p-txt2) !important; }
${L} .h3l-thead.m svg, ${L} .h3l-thead[class*="mus"] svg { color:var(--p-txt3) !important; }
${L} .h3l-ext { border-radius:8px !important; border:1px dashed rgba(255,255,255,.18) !important; background:transparent !important; color:var(--p-txt2) !important; box-shadow:none !important; }
${L} .h3l-playhead, ${L} .h3l-ph-line { background:#fff !important; box-shadow:none !important; }
${L} .h3l-end, ${L} .h3l-endflag { background:var(--p-s4) !important; color:var(--p-txt) !important; box-shadow:none !important; }

/* ===== left panel cards & assets ===== */
${L} .h3l-panel .h3l-drop, ${L} .h3l-drop { border:1px dashed rgba(255,255,255,.16) !important; background:transparent !important; border-radius:8px !important; color:var(--p-txt2) !important; box-shadow:none !important; }
${L} :is(.h3l-asset,.h3l-gcard,.h3l-char,.h3l-chcard) { background:var(--p-s2) !important; border:none !important; box-shadow:none !important; border-radius:8px !important; }
${L} :is(.h3l-asset,.h3l-gcard,.h3l-char,.h3l-chcard):hover { background:var(--p-s3) !important; }

/* ===== menus, tooltips, toasts, modals ===== */
${LP} :is(.h3l-menu,.h3l-dd,.h3l-lp,.h3l-monpop,.h3l-pop) { background:rgba(40,40,42,.98) !important; border:none !important; border-radius:10px !important; backdrop-filter:none !important;
  box-shadow:0 0 0 .5px rgba(0,0,0,.6), inset 0 .5px 0 rgba(255,255,255,.08), 0 12px 32px rgba(0,0,0,.45) !important; }
${LP} .h3l-tip { background:rgba(44,44,46,.98) !important; color:var(--p-txt) !important; border:none !important; border-radius:6px !important; font:400 12px/1.35 var(--p-font) !important; box-shadow:0 0 0 .5px rgba(0,0,0,.6), 0 6px 18px rgba(0,0,0,.4) !important; }
${L} .h3l-toast { top:72px !important; bottom:auto !important; right:16px !important; left:auto !important; transform:none !important; max-width:min(420px,calc(100% - 32px));
  background:rgba(44,44,46,.98) !important; color:var(--p-txt) !important; border:none !important; border-radius:10px !important; font:500 12.5px/1.4 var(--p-font) !important; box-shadow:0 0 0 .5px rgba(0,0,0,.6), 0 12px 32px rgba(0,0,0,.45) !important; }
${L} .h3l-toast.err { box-shadow:inset 3px 0 0 var(--p-err), 0 0 0 .5px rgba(0,0,0,.6), 0 12px 32px rgba(0,0,0,.45) !important; }
${LP} .h3l-modal { background:rgba(0,0,0,.45) !important; backdrop-filter:none !important; }

/* ===== welcome ===== */
${LP} .h3l-welcome { background:var(--p-s1) !important; border:none !important; border-radius:16px !important; box-shadow:0 0 0 .5px rgba(0,0,0,.7), inset 0 .5px 0 rgba(255,255,255,.08), 0 24px 64px rgba(0,0,0,.55) !important; }
${LP} .h3l-welcome .h3l-welcome-links .h3l-linkbtn, ${LP} .h3l-welcome .h3l-linkbtn.tg, ${LP} .h3l-welcome .h3l-linkbtn.gh { background:var(--p-s3) !important; color:var(--p-txt) !important; border:none !important; box-shadow:0 0 0 .5px rgba(0,0,0,.5) !important; }
${LP} .h3l-welcome .h3l-linkbtn svg { color:var(--p-txt2) !important; }
${LP} .h3l-welcome .h3l-note.ok { color:#9fe0b0; } ${LP} .h3l-welcome .h3l-note.warn { color:#ffc46b; }
${LP} .h3l-welcome .h3l-row { gap:8px; align-items:center; }
${LP} .h3l-welcome :is(small,.sub,[class*="tag"]) { letter-spacing:.02em !important; color:var(--p-txt3) !important; }

/* ===== settings window (System Settings) ===== */
${LP} .h3l-setmodal { display:flex; align-items:center; justify-content:center; padding:24px; }
${LP} .h3l-setwin { width:min(920px,100%); height:min(680px,100%); display:flex; flex-direction:column; overflow:hidden; background:var(--p-s1) !important; border-radius:16px !important; border:none !important;
  box-shadow:0 0 0 .5px rgba(0,0,0,.7), inset 0 .5px 0 rgba(255,255,255,.08), 0 24px 64px rgba(0,0,0,.55) !important; }
${LP} .h3l-setwin-hd { display:flex; align-items:center; gap:8px; height:48px; padding:0 12px 0 20px; border-bottom:1px solid var(--p-line); flex:none; }
${LP} .h3l-setwin-hd b { font:600 13px/1 var(--p-font); color:var(--p-txt); }
${LP} .h3l-setwin-hd .grow { flex:1; }
${LP} .h3l-setcols { flex:1; min-height:0; display:grid; grid-template-columns:220px minmax(0,1fr); }
${LP} .h3l-setside { background:#19191b; border-right:1px solid var(--p-line); padding:12px 8px; overflow:auto; }
${LP} .h3l-setside .h3l-settabs { display:flex !important; flex-direction:column !important; gap:2px !important; background:transparent !important; border:none !important; box-shadow:none !important; padding:0 !important; flex-wrap:nowrap !important; }
${LP} .h3l-setside .h3l-settab { display:flex; align-items:center; min-height:30px; padding:0 10px !important; border-radius:6px !important; background:transparent !important; border:none !important; box-shadow:none !important;
  color:var(--p-txt) !important; font:500 13px/1.2 var(--p-font) !important; letter-spacing:0 !important; text-transform:none !important; justify-content:flex-start !important; text-align:left; cursor:pointer; transition:background-color .15s var(--p-ease) !important; }
${LP} .h3l-setside .h3l-settab:hover:not(.on) { background:rgba(255,255,255,.06) !important; }
${LP} .h3l-setside .h3l-settab.on { background:var(--p-acc) !important; color:#fff !important; }
${LP} .h3l-setwin .h3l-setbody { padding:16px 24px 24px !important; overflow:auto; display:flex; flex-direction:column; gap:16px; min-height:0; }
${LP} .h3l-setwin .h3l-setbody > * { flex:none !important; }
${LP} .h3l-settitle { font:700 20px/1.2 var(--p-font); color:var(--p-txt); margin:0; letter-spacing:-.01em; }
${LP} .h3l-setwin .h3l-setscope { display:flex; flex-direction:row !important; flex-wrap:wrap; align-items:center; gap:8px 12px; padding:12px; border-radius:12px; background:var(--p-s2); }
${LP} .h3l-setwin .h3l-setscope .h3l-note { flex:1 1 260px; margin:0; }
${LP} .h3l-setwin :is(.h3l-det,.h3l-langrow,.h3l-themerow,.h3l-fx-settings,.h3l-tog) { background:transparent; }
${LP} .h3l-setwin .h3l-det { background:var(--p-s2) !important; border:none !important; box-shadow:none !important; border-radius:12px !important; padding:4px 12px 12px; }
${LP} .h3l-setwin .h3l-det > summary { font:600 13px/1.3 var(--p-font) !important; color:var(--p-txt) !important; letter-spacing:0 !important; text-transform:none !important; padding:10px 0 !important; }
${LP} .h3l-setwin .h3l-det > .in { display:flex; flex-direction:column; gap:10px; }
${LP} .h3l-setwin .h3l-det .h3l-tog { border-top:1px solid var(--p-line); padding-top:8px; }
${LP} .h3l-setwin :is(.h3l-langrow,.h3l-themerow,.h3l-fx-settings) { display:flex; flex-direction:column; gap:8px; padding:12px; border-radius:12px; background:var(--p-s2); }
${LP} .h3l-setwin .h3l-langrow { flex-direction:row; flex-wrap:wrap; align-items:center; }
${LP} .h3l-setwin .h3l-langrow .h3l-lbl { flex:1 1 100%; }
${LP} .h3l-setwin .h3l-themegrid { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)) !important; gap:8px !important; }
${LP} .h3l-setwin .h3l-theme { background:var(--p-s3) !important; border:none !important; box-shadow:none !important; border-radius:8px !important; min-height:48px; color:var(--p-txt) !important; font-size:12.5px; }
${LP} .h3l-setwin .h3l-theme.on { box-shadow:0 0 0 2px var(--p-acc) !important; }
${LP} .h3l-setwin .h3l-setreset { align-self:flex-start; }
${LP} .h3l-setwin .h3l-fx-chks { display:flex; flex-direction:column; gap:4px; }
${LP} .h3l-setwin .h3l-fx-stat { color:var(--p-txt3); font:400 11.5px/1.3 var(--p-mono); }

/* ===== assistant ===== */
${L} .h3l-ast-reason { border-left:2px solid #3a3a3c !important; padding:4px 0 4px 10px !important; color:var(--p-txt3) !important; font-size:12px !important; margin:0 0 8px !important; }
${L} .h3l-ast-reason summary { color:var(--p-txt2); font-size:12px; min-height:24px; }
${L} .h3l-ast-reason summary::after { content:"›"; margin-left:6px; transition:transform .18s var(--p-ease); display:inline-block; }
${L} .h3l-ast-reason[open] summary::after { transform:rotate(90deg); }
${L} .h3l-ast-reasondot { background:#8e8e93 !important; animation:none !important; }
${L} .h3l-ast-reason.live .h3l-ast-reasondot { background:var(--p-acc) !important; }
${L} .h3l-ast-reasonbody { color:var(--p-txt3); font-size:12px; line-height:1.5; }
${L} .h3l-ast-bubble { font-size:13px !important; line-height:1.55 !important; }
${L} .h3l-ast-bubble + .h3l-row, ${L} .h3l-ast-msg .h3l-row { flex-wrap:wrap; gap:6px; }
${L} .h3l-ast-msg .h3l-row .h3l-btn { white-space:nowrap !important; flex:none; }
${L} .h3l-ast-status, ${L} .h3l-ast-status.ok { color:var(--p-txt) !important; background:var(--p-s3) !important; border:none !important; box-shadow:none !important; }
${L} .h3l-ast-status.ok .h3l-ast-dot { background:var(--p-ok) !important; }
${L} .h3l-ast-input { min-height:36px !important; max-height:160px; }
${L} .h3l-ast-settab { border-radius:6px !important; font:500 12.5px/1 var(--p-font) !important; letter-spacing:0 !important; text-transform:none !important; }
${L} .h3l-ast-settab.on { background:#5a5a5e !important; color:#fff !important; }

${L} .h3l-thead .nm.music { color:var(--p-txt2) !important; }
${L} .h3l-alane.music { background:#1f1f21 !important; }
${L} .h3l-lane-toggle { font:600 11px/1 var(--p-font) !important; min-width:28px; }
${L} .h3l-tool { padding-left:2px !important; padding-right:2px !important; }
${L} .h3l-tool span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; letter-spacing:-.01em !important; }
${SURF} .h3l-qs { gap:2px !important; }
${SURF} .h3l-q { padding:0 8px; display:inline-flex; align-items:center; }
`;
