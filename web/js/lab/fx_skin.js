// H3ZeroStudio Lab — the "Lab" skin: floating glass cards, pill toolbar, dock rail, monitor, transport bar,
// steel timeline, one consistent rounded-rect control language (no circular buttons/knobs anywhere).
// Scoped to :root[data-h3l-theme="lab"] so other themes keep the stock look.
const L = `:root[data-h3l-theme="lab"] .h3l-root`;          // studio root
const LP = `:root[data-h3l-theme="lab"]`;                   // root + body portals (menus, tips, pickers)
const A = `:root[data-h3l-theme="lab"][data-h3l-motion="full"]:not([data-h3l-fx="off"]) .h3l-root`;

export const SKIN_CSS = String.raw`
/* ===== layout rhythm: 8px grid, floating cards with gaps so the field shows through ===== */
${L} { --h3l-pad:6px; --h3l-gap:7px; --h3l-r:14px; --r:14px; --r2:10px; --r3:8px; --bg0:#07080b; --bg1:#0c0e12; --bg2:#12151b;
  --panel:rgba(14,16,20,.82); --panel2:rgba(20,23,29,.94); --line:rgba(255,255,255,.065); --line2:rgba(255,255,255,.11);
  --control:rgba(255,255,255,.045); --field:rgba(0,0,0,.32); --txt:#eceff4; --mut:#9aa1ad; --mut2:#666d7a; }
${L} > .h3l-body { min-height:0; overflow:hidden; }
${L} > .h3l-body > * { min-height:0; }
${L} > .h3l-body > .h3l-tools { overflow-y:auto; overflow-x:hidden; scrollbar-width:none; }
${L} .h3l-dyn .st.on { background:rgba(79,140,255,.18); color:#cfe0ff; }
${L} .h3l-glass { border-radius:14px; }
/* single opaque-glass card layer (no shader glass underneath, no backdrop blur over the WebGL canvas) */
${L} .h3l-glass, ${L} .h3l-glass.h3l-lit { background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0) 120px), rgba(13,15,19,.92) !important;
  border:1px solid rgba(255,255,255,.075) !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
${L} .h3l-insp > .h3l-glass { background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0) 80px), rgba(15,17,22,.94) !important; }
${L} > .h3l-head { border-radius:24px; padding:0 8px 0 10px; }
/* depth stack for every floating surface */
${L} :is(.h3l-glass,.h3l-card) { box-shadow:inset 0 1px 0 rgba(255,255,255,.07), inset 0 0 0 1px rgba(255,255,255,.02), 0 1px 1px rgba(0,0,0,.3), 0 10px 24px -12px rgba(0,0,0,.6), 0 30px 64px -30px rgba(0,0,0,.7); }
${L} .h3l-ph h3 { font-size:13px; font-weight:650; letter-spacing:.01em; }
${L} .h3l-lbl { color:#8d95a3; letter-spacing:.07em; font-weight:650; }

/* ===== one control language: rounded rect, steel, crisp 1px edges ===== */
${LP} :is(.h3l-root,.h3l-menu,.h3l-dd,.h3l-lp,.h3l-modal,.h3l-monpop,.h3l-pe-modal) :is(.h3l-btn,.h3l-spk,.h3l-edge-btn) {
  border-radius:9px; background:linear-gradient(180deg,rgba(255,255,255,.065),rgba(255,255,255,.025)); border:1px solid rgba(255,255,255,.09);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 1px 2px rgba(0,0,0,.35); color:#dfe3ea; }
${LP} :is(.h3l-root,.h3l-menu,.h3l-dd,.h3l-lp,.h3l-modal,.h3l-monpop) :is(.h3l-btn,.h3l-spk):hover:not(:disabled) { background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04)); border-color:rgba(255,255,255,.16); color:#fff; }
${LP} :is(.h3l-root,.h3l-menu,.h3l-dd,.h3l-modal) .h3l-btn.sm { border-radius:7px; }
${LP} :is(.h3l-root,.h3l-modal,.h3l-menu) .h3l-btn.primary { background:linear-gradient(180deg,#5a96ff,#3d74e8); border:1px solid rgba(160,195,255,.55); color:#fff;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.35), 0 0 0 1px rgba(20,40,90,.6), 0 8px 22px -8px rgba(79,140,255,.85); }
${LP} :is(.h3l-root,.h3l-modal,.h3l-menu) .h3l-btn.primary:hover:not(:disabled) { background:linear-gradient(180deg,#6aa2ff,#4580f0); border-color:rgba(190,215,255,.7); }
${LP} :is(.h3l-root,.h3l-modal) .h3l-btn.danger:hover:not(:disabled) { background:rgba(244,80,100,.12); border-color:rgba(244,80,100,.45); color:#ffd5dc; }
${L} .h3l-spk { width:24px; height:22px; display:inline-grid; place-items:center; padding:0; font-size:10px; }
${L} .h3l-spk.off { color:#6b7280; }
/* fields */
${LP} :is(.h3l-root,.h3l-modal,.h3l-menu,.h3l-lp,.h3l-pe-modal) :is(.h3l-in,.h3l-sel,textarea,input[type=text],input[type=number],input[type=search]) {
  border-radius:8px; background:rgba(0,0,0,.34); border:1px solid rgba(255,255,255,.08); box-shadow:inset 0 1px 2px rgba(0,0,0,.45); }
/* pills / segmented controls / tabs */
${LP} :is(.h3l-root,.h3l-modal,.h3l-menu) .h3l-pills { border-radius:10px; padding:3px; gap:2px; background:rgba(0,0,0,.36); border:1px solid rgba(255,255,255,.06); box-shadow:inset 0 1px 2px rgba(0,0,0,.5); }
${LP} :is(.h3l-root,.h3l-modal,.h3l-menu) .h3l-pill { border-radius:7px; color:#9aa1ad; }
${LP} :is(.h3l-root,.h3l-modal,.h3l-menu) .h3l-pill:hover:not(.on) { color:#e6e9ee; background:rgba(255,255,255,.05); }
${LP} :is(.h3l-root,.h3l-modal,.h3l-menu) .h3l-pill.on { color:#fff; background:linear-gradient(180deg,rgba(79,140,255,.34),rgba(79,140,255,.20)); box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 0 0 1px rgba(79,140,255,.45); }
${L} .h3l-panel .h3l-pills:has(> .h3l-pill:nth-child(5)) { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }
${L} .h3l-settabs { gap:4px; }
${L} .h3l-settab { border-radius:8px; color:#aab1bd; background:rgba(255,255,255,.03); border-color:rgba(255,255,255,.07); }
${L} .h3l-settab.on { color:#fff; background:linear-gradient(180deg,rgba(79,140,255,.30),rgba(79,140,255,.16)); border-color:rgba(79,140,255,.5); }
/* toggles: rounded-rect track + rect knob (no circles) */
${L} .h3l-tog i { border-radius:7px !important; background:rgba(0,0,0,.45); box-shadow:inset 0 0 0 1px rgba(255,255,255,.10), inset 0 1px 2px rgba(0,0,0,.5); }
${L} .h3l-tog i::after { border-radius:5px !important; background:linear-gradient(180deg,#f4f6fa,#c9cfd9); box-shadow:0 1px 2px rgba(0,0,0,.5); }
${L} .h3l-tog.on i { background:linear-gradient(180deg,#5a96ff,#3d74e8); }
/* sliders: hairline track with glowing progress, pill thumb */
${LP} :is(.h3l-root,.h3l-menu,.h3l-modal) .h3l-range { height:4px; border-radius:3px; background:linear-gradient(90deg,#3d74e8,#7fb0ff var(--p,50%),rgba(255,255,255,.10) var(--p,50%)); }
${LP} :is(.h3l-root,.h3l-menu,.h3l-modal) .h3l-range::-webkit-slider-thumb { width:10px; height:18px; border-radius:4px; background:linear-gradient(180deg,#fff,#d5dbe5);
  box-shadow:0 0 0 1px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.5), 0 0 12px rgba(79,140,255,.35); }
${L} .h3l-range:hover::-webkit-slider-thumb { box-shadow:0 0 0 1px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.5), 0 0 0 4px rgba(79,140,255,.22); }
/* colour swatches: muted rounded squares, aligned with the name field */
${L} .h3l-card-h { align-items:center; gap:8px; }
${L} .h3l-colors { gap:4px; align-items:center; }
${L} .h3l-colors span { width:14px; height:14px; border-radius:4px; filter:saturate(.7); box-shadow:inset 0 0 0 1px rgba(255,255,255,.12); }
${L} .h3l-colors span.on { box-shadow:0 0 0 2px #0c0e12, 0 0 0 3.5px #d9dee7; filter:none; }
${L} .h3l-num { border-radius:6px !important; }

/* ===== header: floating pill toolbar, quiet stats cluster, hero CTA ===== */
${L} > .h3l-head :is(.h3l-chip,.h3l-timer,.h3l-sysmon,.h3l-ui-scale) { height:28px; border-radius:8px; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.06); box-shadow:inset 0 1px 1px rgba(0,0,0,.4); color:#a7aeb9; }
${L} > .h3l-head .h3l-chip { padding:0 10px; } ${L} > .h3l-head .h3l-chip b { color:#e3e7ed; }
${L} > .h3l-head .h3l-timer { padding:0 10px; font:600 12px/1 ui-monospace,"SF Mono",Consolas,monospace; letter-spacing:.02em; }
${L} > .h3l-head .h3l-timer.done { color:#c3cad5; } ${L} > .h3l-head .h3l-timer.done i { color:#7fb0ff; }
${L} > .h3l-head .h3l-timer.running { color:#cfe0ff; border-color:rgba(79,140,255,.45); }
${L} > .h3l-head .h3l-sysmon { gap:12px; padding:0 12px; }
${L} > .h3l-head .h3l-sysmon .dot { background:#7fb0ff; box-shadow:0 0 0 3px rgba(79,140,255,.14); }
${L} > .h3l-head .h3l-sysmon .temp { color:#a7aeb9; }
${L} > .h3l-head .h3l-head-actions .h3l-btn.primary { height:34px; padding:0 18px; border-radius:11px; font-weight:700; letter-spacing:.01em; overflow:hidden; }
${A} > .h3l-head .h3l-head-actions .h3l-btn.primary > span:first-of-type::after, ${A} > .h3l-head .h3l-head-actions .h3l-btn.primary::after { content:none; }
${A} .h3l-btn.primary { background-size:100% 100%; }
${A} .h3l-head-actions .h3l-btn.primary > :is(svg,span) { position:relative; z-index:1; }
${A} .h3l-head-actions .h3l-btn.primary .h3l-fx-shine { position:absolute; inset:0; pointer-events:none; background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.38) 50%,transparent 65%);
  transform:translateX(-120%); animation:h3l-shinesweep 4.8s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes h3l-shinesweep { 0%,62% { transform:translateX(-120%); } 85%,100% { transform:translateX(120%); } }

/* ===== left rail: dock with a sliding active pill ===== */
${L} > .h3l-body > .h3l-tools { position:relative; padding:8px 0; gap:4px; }
${L} .h3l-tool { width:56px; height:50px; border-radius:12px; color:#8d95a3; border:1px solid transparent; position:relative; z-index:1; }
${L} .h3l-tool span { font-size:9.5px; letter-spacing:.01em; }
${L} .h3l-tool.on { color:#fff; background:transparent !important; border-color:transparent !important; box-shadow:none !important; }
${L} .h3l-tool.on svg { color:#9cc2ff; filter:drop-shadow(0 0 6px rgba(79,140,255,.6)); }
.h3l-fx-dock { position:absolute; left:50%; top:0; width:56px; height:50px; margin-left:-28px; border-radius:12px; z-index:0; pointer-events:none;
  background:linear-gradient(180deg,rgba(79,140,255,.26),rgba(79,140,255,.12)); box-shadow:inset 0 1px 0 rgba(255,255,255,.14), 0 0 0 1px rgba(79,140,255,.45), 0 8px 22px -8px rgba(79,140,255,.7);
  transition:transform var(--h3l-sp-bouncy-ms,500ms) var(--h3l-sp-bouncy,cubic-bezier(.2,.8,.2,1)), opacity .2s; }
.h3l-fx-dock::before { content:""; position:absolute; left:-7px; top:14px; bottom:14px; width:3px; border-radius:3px; background:#7fb0ff; box-shadow:0 0 10px rgba(79,140,255,.9); }

/* ===== preview: framed monitor ===== */
${L} .h3l-frame { border-radius:12px; background:#050608; box-shadow:0 0 0 1px rgba(255,255,255,.09), 0 0 0 6px rgba(255,255,255,.025), 0 2px 4px rgba(0,0,0,.5), 0 30px 70px -20px rgba(0,0,0,.85); }
${L} .h3l-frame::after { content:""; position:absolute; inset:0; pointer-events:none; z-index:6; border-radius:inherit;
  background:linear-gradient(165deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,0) 28%), radial-gradient(120% 90% at 50% 50%,transparent 60%,rgba(0,0,0,.45) 100%); }
${L} .h3l-comp-ph::before { background:radial-gradient(90% 80% at 50% 45%,#161a21 0%,#0b0d11 70%,#08090c 100%) !important; }
${L} .h3l-comp-ph::after { content:""; position:absolute; inset:0; pointer-events:none; opacity:.7;
  background:repeating-linear-gradient(180deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px); }
${A} .h3l-comp-ph .in::after { content:""; position:absolute; left:0; right:0; top:0; height:30%; pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(127,176,255,.06),transparent); animation:h3l-scan 4.5s linear infinite; }
@keyframes h3l-scan { from { transform:translateY(-100%); } to { transform:translateY(420%); } }
${L} .h3l-comp-ph .in b { color:#e8ebf0; letter-spacing:.01em; } ${L} .h3l-comp-ph .in small, ${L} .h3l-comp-ph .in i { color:#8a92a0; }

/* ===== transport bar: segmented prev | play | next, timecode chip, scrubber, compact volume ===== */
${L} .h3l-transport { flex-wrap:wrap; row-gap:8px; padding:10px 16px 12px; }
${L} .h3l-transport > button.h3l-btn.icon:first-of-type { border-radius:10px 0 0 10px; width:38px; height:36px; }
${L} .h3l-transport > .h3l-play { width:52px; height:36px; border-radius:0; margin:0 -8px; z-index:1; position:relative;
  background:linear-gradient(180deg,#5a96ff,#3d74e8); border:1px solid rgba(160,195,255,.55); box-shadow:inset 0 1px 0 rgba(255,255,255,.35), 0 8px 20px -8px rgba(79,140,255,.9); }
${L} .h3l-transport > .h3l-play + .h3l-btn.icon { border-radius:0 10px 10px 0; width:38px; height:36px; }
${L} .h3l-transport .h3l-time { margin-left:12px; height:30px; display:inline-flex; align-items:center; gap:6px; padding:0 12px; border-radius:8px; background:rgba(0,0,0,.42);
  border:1px solid rgba(255,255,255,.06); box-shadow:inset 0 1px 2px rgba(0,0,0,.5); font:500 12px/1 ui-monospace,"SF Mono",Consolas,monospace; color:#8d95a3; font-variant-numeric:tabular-nums; }
${L} .h3l-transport .h3l-time b { color:#f1f4f8; font-weight:600; }
${L} .h3l-volume .h3l-range { width:72px; }
.h3l-fx-scrub { flex:1 0 100%; order:-1; height:18px; position:relative; cursor:pointer; touch-action:none; }
.h3l-fx-scrub .tr { position:absolute; left:0; right:0; top:8px; height:3px; border-radius:2px; background:rgba(255,255,255,.08); }
.h3l-fx-scrub .fl { position:absolute; left:0; top:8px; height:3px; width:100%; border-radius:2px; transform-origin:left; transform:scaleX(var(--h3l-sp,0));
  background:linear-gradient(90deg,#3d74e8,#8ab8ff); box-shadow:0 0 10px rgba(79,140,255,.6); }
.h3l-fx-scrub .th { position:absolute; top:3px; left:0; width:4px; height:13px; margin-left:-2px; border-radius:2px; background:#fff; box-shadow:0 0 8px rgba(79,140,255,.9); transform:translateX(var(--h3l-sx,0px)); }
.h3l-fx-scrub .hv { position:absolute; top:3px; left:0; width:1px; height:13px; background:rgba(255,255,255,.35); opacity:0; transform:translateX(var(--h3l-hx,0px)); transition:opacity .15s; }
.h3l-fx-scrub .tip { position:absolute; bottom:20px; left:0; padding:3px 7px; border-radius:6px; background:#0d0f13; border:1px solid rgba(255,255,255,.1); font:600 10.5px/1 ui-monospace,Consolas,monospace; color:#e6e9ee;
  white-space:nowrap; opacity:0; transform:translateX(calc(var(--h3l-hx,0px) - 50%)) translateY(3px); transition:opacity .15s, transform .15s; pointer-events:none; }
.h3l-fx-scrub:hover .hv, .h3l-fx-scrub:hover .tip { opacity:1; } .h3l-fx-scrub:hover .tip { transform:translateX(calc(var(--h3l-hx,0px) - 50%)); }

/* ===== sampling dynamics: proper empty state ===== */
${L} .h3l-dyn { border-radius:12px; background:rgba(0,0,0,.30); border-color:rgba(255,255,255,.06); }
${L} .h3l-dyn .st { border-radius:6px; background:rgba(255,255,255,.05); color:#8d95a3; }
${L} .h3l-dyn .ch { position:relative; border-radius:8px; background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px); background-size:100% 16px; }
${L} .h3l-dyn:has(.st:not(.on)) .ch::after { content:var(--h3l-t-dyn,"—"); position:absolute; inset:22px 0 0; display:grid; place-items:center; font-size:11px; color:#5f6672; pointer-events:none; }

/* ===== timeline: glass lanes, steel clips, quiet ruler, neutral end flag ===== */
${L} .h3l-tl-main { grid-template-columns:132px minmax(0,1fr); }
${L} .h3l-thead { color:#9aa1ad; font-weight:600; }
${L} .h3l-lane-bg { border-radius:10px; background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.01)); border:1px solid rgba(255,255,255,.05); box-shadow:inset 0 1px 0 rgba(255,255,255,.03); }
${L} .h3l-tick { border-left-color:rgba(255,255,255,.10); } ${L} .h3l-tick.minor { border-left-color:rgba(255,255,255,.05); }
${L} .h3l-tick span { font:500 10px/1 ui-monospace,"SF Mono",Consolas,monospace; color:#6f7682; letter-spacing:.02em; }
${L} .h3l-clip { border-radius:10px; background:linear-gradient(180deg,#2b3039 0%,#21252c 55%,#1c1f25 100%) !important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.09), inset 0 0 0 1px rgba(255,255,255,.06), 0 8px 18px -8px rgba(0,0,0,.7); }
${L} .h3l-clip::after { content:""; position:absolute; left:0; right:0; top:0; height:3px; background:linear-gradient(90deg,var(--c1),var(--c2)); opacity:.9; z-index:2; pointer-events:none; }
${L} .h3l-clip.sel { box-shadow:inset 0 1px 0 rgba(255,255,255,.1), 0 0 0 1.5px #7fb0ff, 0 0 0 5px rgba(79,140,255,.18), 0 0 26px -2px rgba(79,140,255,.55), 0 10px 22px -8px rgba(0,0,0,.7) !important; }
${L} .h3l-clip .t .n, ${L} .h3l-clip .t .d, ${L} .h3l-clip .bd { border-radius:5px; background:rgba(0,0,0,.35); }
${L} .h3l-clip .p { color:#b9c0cb; opacity:1; }
${L} .h3l-vend span { border-radius:0 6px 6px 0; background:#e9edf3 !important; color:#0b0d11 !important; border:none !important; box-shadow:0 2px 8px rgba(0,0,0,.5) !important; font-weight:700; }
${L} .h3l-vend:not(.set) span { background:rgba(233,237,243,.75) !important; }
${L} .h3l-beyond { background:repeating-linear-gradient(135deg,rgba(255,255,255,.02) 0 8px,transparent 8px 16px), rgba(0,0,0,.35) !important; }

/* ===== menus, dropdowns, pickers, tooltips, toasts, modals: same surface ===== */
${LP} :is(.h3l-menu,.h3l-dd,.h3l-lp,.h3l-monpop) { border-radius:12px !important; background:rgba(16,18,23,.97) !important; border:1px solid rgba(255,255,255,.09) !important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 18px 44px -10px rgba(0,0,0,.8), 0 2px 6px rgba(0,0,0,.4) !important; backdrop-filter:none !important; }
${LP} .h3l-menu .it { border-radius:7px; } ${LP} .h3l-menu .it:hover { background:rgba(255,255,255,.06); }
${LP} .h3l-tip { border-radius:7px; background:#0f1115; border:1px solid rgba(255,255,255,.1); color:#eceff4; box-shadow:0 10px 24px -6px rgba(0,0,0,.7); font-weight:600; }
${L} .h3l-toast { border-radius:12px; background:rgba(18,20,25,.97); border:1px solid rgba(255,255,255,.1); }
${LP} .h3l-modal > :is(.h3l-glass,div) { border-radius:16px; background:linear-gradient(180deg,rgba(24,27,33,.98),rgba(15,17,21,.98)); border:1px solid rgba(255,255,255,.09); }

/* ===== welcome: one hero, close in the corner, even rhythm ===== */
${L} .h3l-fx-welcome .h3l-welcome { width:min(520px,92vw); }
${L} .h3l-fx-welcome .hd { position:absolute; top:12px; right:12px; padding:0; border:none; z-index:3; }
${L} .h3l-fx-welcome .hd > b, ${L} .h3l-fx-welcome .hd > .grow { display:none; }
${L} .h3l-fx-welcome .hd .h3l-btn { width:28px; height:28px; }
${L} .h3l-fx-welcome .h3l-fx-hero { padding:36px 24px 20px; border-bottom:1px solid rgba(255,255,255,.06); margin:0; }
${L} .h3l-fx-welcome .h3l-fx-hero small { color:#8e9bb0; font-size:11px; }
${L} .h3l-fx-welcome .h3l-welcome-body { padding:20px 24px 8px; gap:12px; font-size:14px; line-height:1.55; color:#d5dae2; }
${L} .h3l-fx-welcome .h3l-welcome-body p { margin:0; }
${L} .h3l-fx-welcome .h3l-welcome-body .h3l-note { font-size:13px; color:#9aa1ad; }
${L} .h3l-fx-welcome .h3l-welcome-prefs { margin-top:4px; padding:8px 8px 8px 14px; border-radius:10px; background:rgba(0,0,0,.28); border-color:rgba(255,255,255,.06); }
${L} .h3l-fx-welcome .h3l-welcome-prefs .h3l-lbl { display:flex; align-items:center; font-size:13px; color:#c3c9d3; letter-spacing:0; text-transform:none; }
${L} .h3l-fx-welcome .h3l-row { padding:16px 24px 20px; gap:8px; border-top:1px solid rgba(255,255,255,.06); }
${L} .h3l-fx-welcome .h3l-row .h3l-btn { height:34px; padding:0 14px; border-radius:9px; font-size:13px; }
${L} .h3l-fx-welcome .h3l-row .h3l-btn:first-child { background:transparent; border-color:rgba(255,255,255,.09); box-shadow:none; color:#aab1bd; padding:0 14px; }
${L} .h3l-fx-welcome .h3l-row .h3l-btn:first-child:hover { color:#e6e9ee; background:rgba(255,255,255,.05); }
${L} .h3l-beyond { border-left:1.5px solid rgba(233,237,243,.55) !important; }
${L} .h3l-alane { border-radius:10px; border:1px dashed rgba(255,255,255,.07); background:rgba(255,255,255,.02); }
${L} .h3l-alane.music { background:rgba(127,176,255,.035); border-color:rgba(127,176,255,.18); }
${L} .h3l-alane > span { color:#6f7682; }
${L} .h3l-audio.clip.music { background:linear-gradient(180deg,#2a3546,#212a38) !important; border-color:rgba(127,176,255,.45) !important; }
${L} .h3l-arow .nm.music { color:#9cc2ff; }
${L} .h3l-clip .bd.out { background:rgba(233,237,243,.9); color:#0b0d11; }
${L} .h3l-track.a.dropover .h3l-alane { background:rgba(79,140,255,.10); border-color:rgba(79,140,255,.55); }
${L} .h3l-tl-bar .h3l-btn :is(b,svg,i) { color:#aab1bd !important; }
${L} .h3l-tl-bar .h3l-btn:is(.on,.act,[aria-pressed="true"]) { background:linear-gradient(180deg,rgba(79,140,255,.26),rgba(79,140,255,.12)); border-color:rgba(79,140,255,.5); color:#fff; }
${L} .h3l-tl-bar .h3l-btn:is(.on,.act,[aria-pressed="true"]) :is(b,svg,i) { color:#9cc2ff !important; }
/* short panels (small windows / 125% scale): keep the chat history readable — the composer caps lower */
${L} .h3l-panel.h3l-short .h3l-ast-compose .h3l-ast-input { max-height:88px !important; }
${L} .h3l-panel.h3l-tiny .h3l-ast-compose .h3l-ast-input { max-height:52px !important; min-height:36px !important; }
${L} .h3l-panel.h3l-tiny .h3l-ast-compose { gap:4px !important; padding:6px !important; }
${L} .h3l-panel.h3l-tiny .h3l-ast-panel > .h3l-scroll { min-height:24px; }
/* welcome: project links — GitHub neutral steel */
${L} .h3l-fx-welcome .h3l-welcome-links { padding:4px 24px 20px; gap:8px; }
${L} .h3l-fx-welcome .h3l-linkbtn { height:38px; border-radius:10px; font-size:13px; color:#e6e9ee; 
  transition:translate .35s var(--h3l-sp-snappy,cubic-bezier(.2,.8,.2,1)), scale .12s, border-color .2s, box-shadow .25s, background .2s; }
${L} .h3l-fx-welcome .h3l-linkbtn:hover { border-color:rgba(255,255,255,.22); box-shadow:inset 0 1px 0 rgba(255,255,255,.09), 0 0 0 1px rgba(255,255,255,.05), 0 10px 24px -10px rgba(0,0,0,.8); }
${L} .h3l-fx-welcome .h3l-linkbtn.gh svg { color:#f1f4f8; }
${L} .h3l-fx-welcome .h3l-linkbtn.tg { background:linear-gradient(180deg,rgba(79,140,255,.16),rgba(79,140,255,.07)); border-color:rgba(127,176,255,.26); color:#dbe7ff; }
${L} .h3l-fx-welcome .h3l-linkbtn.tg svg { color:#8ab8ff; }
${L} .h3l-fx-welcome .h3l-linkbtn.tg:hover { border-color:rgba(127,176,255,.55); box-shadow:inset 0 1px 0 rgba(255,255,255,.10), 0 0 0 1px rgba(79,140,255,.18), 0 10px 26px -10px rgba(79,140,255,.55); }
/* ===== unified control glow (one system for every button-like control) =====
   ::before = 1px border light (mask exclude -> uniform thickness, exactly on the border, radius inherited)
   ::after  = soft fill spotlight under the label (z-index:-1 inside an isolated box)
   Both sit at inset:-border-width = the border box, so they can never bleed past the radius, onto neighbours or
   get cut by a parent's overflow. Pointer position is --h3l-lx/--h3l-ly (% of the border box, zoom-safe). */
:where(:root[data-h3l-theme="lab"]) :where(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab) { position:relative; isolation:isolate; --h3l-bw:1px; }
:where(:root[data-h3l-theme="lab"]) :where(.h3l-pill) { --h3l-bw:0px; }
${LP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab)::before,
${LP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab)::after {
  content:""; position:absolute; inset:calc(-1 * var(--h3l-bw)); border-radius:inherit; pointer-events:none; opacity:0;
  transition:opacity .28s cubic-bezier(.2,.8,.2,1); }
${LP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab)::before {
  z-index:1; padding:1px;
  background:radial-gradient(90px circle at var(--h3l-lx,50%) var(--h3l-ly,50%), rgba(178,206,255,.95), rgba(178,206,255,.28) 55%, rgba(255,255,255,.14) 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
${LP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab)::after {
  z-index:-1; background:radial-gradient(80px circle at var(--h3l-lx,50%) var(--h3l-ly,50%), rgba(255,255,255,.10), rgba(255,255,255,.03) 60%, transparent 100%); }
${LP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab):is(.h3l-lit:hover,.h3l-down):not(:disabled)::before { opacity:.85; }
${LP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab):is(.h3l-lit:hover,.h3l-down):not(:disabled)::after { opacity:1; }
${LP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab).h3l-down:not(:disabled)::after {
  background:radial-gradient(70px circle at var(--h3l-lx,50%) var(--h3l-ly,50%), rgba(255,255,255,.16), rgba(255,255,255,.05) 60%, transparent 100%); transition-duration:.08s; }
/* primary / play (blue fill): white-ish ring + brighter fill; animated sweep only while a run is active */
${LP} :is(.h3l-btn.primary,.h3l-play)::before { background:radial-gradient(90px circle at var(--h3l-lx,50%) var(--h3l-ly,50%), rgba(255,255,255,.95), rgba(255,255,255,.35) 55%, rgba(255,255,255,.18) 100%); }
${LP} :is(.h3l-btn.primary,.h3l-play)::after { background:radial-gradient(80px circle at var(--h3l-lx,50%) var(--h3l-ly,50%), rgba(255,255,255,.16), rgba(255,255,255,.03) 60%, transparent 100%); }
:root[data-h3l-theme="lab"][data-h3l-busy="1"][data-h3l-motion="full"] .h3l-head-actions .h3l-btn.primary::before { opacity:1;
  background:conic-gradient(from var(--h3l-ang), rgba(255,255,255,.12) 0 70%, rgba(255,255,255,.7) 84%, rgba(255,255,255,.95) 86%, rgba(255,255,255,.12) 96%); animation:h3l-ang 1.6s linear infinite; }
/* tools: the dock pill already marks the active item; keep only the soft fill there */
${L} .h3l-tool.on::before { display:none; }
/* hover lift for standalone buttons only (segmented groups / pills / timeline bar stay aligned) */
${A} :is(.h3l-btn,.h3l-spk):hover:not(:disabled):not(:active) { translate:0 -1px; }
${A} :is(.h3l-transport,.h3l-pills,.h3l-volume,.h3l-tl-bar,.h3l-menu) :is(.h3l-btn,.h3l-spk):hover { translate:none; }
/* drop shadow on hover follows the radius (box-shadow), no square halos */
${LP} :is(.h3l-root,.h3l-modal,.h3l-menu) .h3l-btn:hover:not(:disabled):not(.primary) { box-shadow:inset 0 1px 0 rgba(255,255,255,.07), 0 1px 2px rgba(0,0,0,.4), 0 8px 18px -10px rgba(0,0,0,.85); }
/* focus-visible: one ring, same radius, outside the border (box-shadow follows border-radius) */
${LP} :is(.h3l-btn,.h3l-spk,.h3l-edge-btn,.h3l-play,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab,.h3l-linkbtn):focus-visible { outline:none !important;
  box-shadow:0 0 0 2px #0b0d11, 0 0 0 3.5px rgba(127,176,255,.95) !important; }
/* the old pointer-following background-image spotlight is replaced by the pseudo layers above */
${LP} .h3l-btn.h3l-lit:hover { background-image:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04)); }
${LP} .h3l-btn.primary.h3l-lit:hover { background-image:linear-gradient(180deg,#6aa2ff,#4580f0); }
/* header resource cluster: compaction ladder set by JS (fitHead) so it never leaves the header */
${L} > .h3l-head { overflow:hidden; min-width:0; }
${L} > .h3l-head .h3l-sysmon { flex:none; }
${L} > .h3l-head[data-h3l-mon="1"] .h3l-sysmon .temp,
${L} > .h3l-head:is([data-h3l-mon="2"],[data-h3l-mon="3"],[data-h3l-mon="4"],[data-h3l-mon="5"]) .h3l-sysmon :is(.temp,.gpuload) { display:none; }
${L} > .h3l-head:is([data-h3l-mon="3"],[data-h3l-mon="4"],[data-h3l-mon="5"]) .h3l-sysmon > .m:nth-child(3) { display:none; }
${L} > .h3l-head:is([data-h3l-mon="4"],[data-h3l-mon="5"]) .h3l-sysmon > .m:nth-child(2) { display:none; }
${L} > .h3l-head[data-h3l-mon="5"] .h3l-sysmon > .m { display:none; }
${L} > .h3l-head[data-h3l-mon="5"] .h3l-sysmon { width:28px; padding:0; justify-content:center; }
/* slider thumbs: unmistakable pill with a grip line (all ranges: duration, megapixels, volume, zoom, settings) */
${LP} :is(.h3l-root,.h3l-menu,.h3l-modal) .h3l-range::-webkit-slider-thumb { width:12px !important; height:20px !important; border-radius:6px !important;
  background:linear-gradient(90deg,transparent 5px,rgba(60,70,90,.55) 5px 7px,transparent 7px), linear-gradient(180deg,#fff,#d3d9e3) !important; }
${LP} :is(.h3l-root,.h3l-menu,.h3l-modal) .h3l-range::-moz-range-thumb { width:12px; height:20px; border-radius:6px; border:none; background:linear-gradient(180deg,#fff,#d3d9e3); }
/* segment colour swatches: breathing room from the name field and the delete button */
${L} .h3l-insp .h3l-colors { gap:6px; margin:0 6px 0 4px; }
${L} .h3l-insp .h3l-colors span { width:15px; height:15px; border-radius:5px; }
/* long prompt text inside a fixed-height card: soft fade instead of a hard cut (removed while editing) */
${L} .h3l-insp .h3l-ta.lg:not(:focus) { -webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 26px),transparent); mask-image:linear-gradient(180deg,#000 calc(100% - 26px),transparent); }
/* header stats: one capsule, hairline dividers, small-caps labels, mono values */
${L} > .h3l-head .h3l-sysmon { gap:0; padding:0 4px 0 10px; }
${L} > .h3l-head .h3l-sysmon > .m { padding:0 10px; border-left:1px solid rgba(255,255,255,.07); height:22px; align-items:flex-start; padding-top:2px; box-sizing:border-box; }
${L} > .h3l-head .h3l-sysmon > .dot + .m { border-left:none; padding-left:8px; }
${L} > .h3l-head .h3l-sysmon small { font-size:9.5px; letter-spacing:.08em; color:#7d8592; font-weight:650; }
${L} > .h3l-head .h3l-sysmon b { font:600 11.5px/1 ui-monospace,"SF Mono",Consolas,monospace; color:#e3e7ed; min-width:0; }
${L} > .h3l-head { background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.01)), rgba(14,16,21,.94) !important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08), 0 1px 0 rgba(0,0,0,.5), 0 14px 32px -18px rgba(0,0,0,.9) !important; }
${L} > .h3l-body > .h3l-insp { -webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 18px),transparent); mask-image:linear-gradient(180deg,#000 calc(100% - 18px),transparent); padding-bottom:14px; }
/* ---- v5: header meters — a 2px bar under each value, inset inside the capsule (never on its border) */
${L} > .h3l-head .h3l-sysmon { height:32px; }
${L} > .h3l-head .h3l-sysmon b { position:relative; display:inline-block; min-width:30px; text-align:right; }
${L} > .h3l-head .h3l-sysmon .temp b { min-width:24px; }
${L} > .h3l-head .h3l-sysmon .m b::before, ${L} > .h3l-head .h3l-sysmon .m b::after { content:""; position:absolute; left:0; right:0; top:calc(100% + 4px); height:2px; border-radius:2px; pointer-events:none; }
${L} > .h3l-head .h3l-sysmon .m b::before { background:rgba(255,255,255,.09); }
${L} > .h3l-head .h3l-sysmon .m b::after { transform-origin:left; transform:scaleX(var(--h3l-v,0)); background:linear-gradient(90deg,#3d74e8,#86b6ff); transition:transform .6s cubic-bezier(.2,.8,.2,1); }
${L} > .h3l-head .h3l-sysmon .m.hot b::after { background:linear-gradient(90deg,#b08a3e,#e0b35a); }
${L} > .h3l-head .h3l-sysmon .temp b::before, ${L} > .h3l-head .h3l-sysmon .temp b::after { display:none; }
${L} > .h3l-head .h3l-sysmon small { line-height:12px; } ${L} > .h3l-head .h3l-sysmon b { line-height:12px; }

/* ---- v5: timeline = floating card like the panels above (toolbar inside, inset lanes) */
${L} > .h3l-tl { padding:6px 8px 8px; box-sizing:border-box; overflow:hidden; }
${L} > .h3l-tl > .h3l-tl-bar { padding:0 0 6px; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,.06); }
${L} > .h3l-tl .h3l-tl-main { border-radius:10px; background:rgba(0,0,0,.22); box-shadow:inset 0 0 0 1px rgba(255,255,255,.04); overflow:hidden; }

/* ---- v5: collapse tabs live INSIDE the panel edge (never across the gap), fade in on hover */
${L} .h3l-edge-btn { width:12px !important; height:44px !important; padding:0 !important; font-size:12px !important; font-weight:700; color:#aab1bd !important;
  background:rgba(255,255,255,.05) !important; border:1px solid rgba(255,255,255,.08) !important; box-shadow:none !important; opacity:.35 !important; transition:opacity .2s, background .2s, color .2s !important; }
${L} .h3l-edge.l .h3l-edge-btn { left:calc(-1 * var(--h3l-gap) / 2 - 14px) !important; border-radius:6px 0 0 6px !important; border-right:none !important; }
${L} .h3l-edge.r .h3l-edge-btn { left:calc(var(--h3l-gap) / 2 + 2px) !important; border-radius:0 6px 6px 0 !important; border-left:none !important; }
${L} .h3l-body:hover .h3l-edge-btn { opacity:.75 !important; }
${L} .h3l-edge-btn:hover { opacity:1 !important; color:#fff !important; background:rgba(79,140,255,.22) !important; }
${L} .h3l-edge-btn::before, ${L} .h3l-edge-btn::after { display:none !important; }

/* ---- v5: timeline legibility */
${L} .h3l-tick span { font-size:11px !important; color:#8d95a3 !important; }
${L} .h3l-tick.minor span { color:#6f7682 !important; }
${L} .h3l-clip .t { font-size:13px; color:#f1f4f8; } ${L} .h3l-clip .p { font-size:12.5px !important; color:#c7cdd6 !important; line-height:1.4; }
${L} .h3l-alane > span { font-size:12px !important; color:#8a919d !important; }
${L} .h3l-thead { font-size:12.5px; color:#b3bac5; }

/* ---- v5: inspector ends cleanly — no panel mask; long prompts scroll inside their own card with an inner fade */
${L} > .h3l-body > .h3l-insp { -webkit-mask-image:none !important; mask-image:none !important; padding-bottom:0; }
${L} .h3l-insp .h3l-ta.lg { max-height:150px; }
${L} .h3l-insp > .h3l-card { padding-bottom:12px; }

/* ---- v5: muted swatches / support button */
${L} .h3l-themegrid > .h3l-theme:not(:first-child) .swatches i { filter:saturate(.35) brightness(.9); }
${L} .h3l-support { background:rgba(255,255,255,.04) !important; border-color:rgba(255,255,255,.10) !important; color:#d6dbe3 !important; }
${L} .h3l-support svg { color:#c48f9b !important; }
${L} .h3l-support:hover { background:rgba(255,255,255,.08) !important; border-color:rgba(255,255,255,.18) !important; }
`;
