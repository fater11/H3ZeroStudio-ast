// H3ZeroStudio Lab — FX stylesheet. Three scopes:
//   S = static polish (any level but "off"), A = motion (full motion + level not off), G = glass over the WebGL layer.
const S = `:root:not([data-h3l-fx="off"]) .h3l-lab`;
const A = `:root[data-h3l-motion="full"]:not([data-h3l-fx="off"]) .h3l-lab`;
const AM = `:root[data-h3l-motion="full"]:is([data-h3l-fx="max"],[data-h3l-fx="high"]) .h3l-lab`;
const G = `:root[data-h3l-gl="on"]:not([data-h3l-fx="off"]):not([data-h3l-frozen="1"]) .h3l-lab`;
const ACC = "var(--h3l-fx-accent)";
const PRESS = `:is(.h3l-btn,.h3l-tool,.h3l-pill,.h3l-settab,.h3l-ast-settab,.h3l-theme,.h3l-chip.warn,.h3l-sel,.h3l-social-link,.h3l-support,.h3l-edge-btn,.h3l-tog,.h3l-take,.h3l-timer,.h3l-sysmon,summary)`;

export const FX_CSS = String.raw`
@property --h3l-ang { syntax:"<angle>"; inherits:false; initial-value:0deg; }
:root { --h3l-fx-accent:#4f8cff; --h3l-fx-acc-rgb:79,140,255; }
.h3l-fx-bg { position:fixed; left:0; top:0; width:100vw; height:100vh; z-index:99999; pointer-events:none; display:block; background:#07080b; }
.h3l-fx-top { position:fixed; left:0; top:0; width:100vw; height:100vh; z-index:100050; pointer-events:none; }
:root[data-h3l-fx="off"] .h3l-fx-top { display:none; }
.h3l-fx-glide { position:fixed; z-index:100003; pointer-events:none; transform-origin:0 0;
  background:rgba(var(--h3l-fx-acc-rgb),.22); box-shadow:0 0 0 1px rgba(var(--h3l-fx-acc-rgb),.55); }

/* ---------- Lab theme: graphite greys + one blue accent */
:root[data-h3l-theme="lab"] :is(.h3l-root,.h3l-compact) {
  --bg0:#090b0e; --bg1:#101318; --bg2:#171b22; --panel:rgba(19,22,28,.88); --panel2:rgba(27,31,39,.92);
  --line:rgba(190,200,222,.10); --line2:rgba(190,200,222,.18); --txt:#eaedf3; --mut:#939cab; --mut2:#636c7b;
  --a1:#4f8cff; --a2:#7fb0ff; --a3:#a9c8ff; --field:rgba(6,8,11,.6); --control:rgba(190,200,222,.06); --on-accent:#fff;
  --glow1:rgba(79,140,255,.10); --glow2:rgba(127,176,255,.06); --glow3:rgba(79,140,255,.04);
  --grad:linear-gradient(135deg,#3567e0 0%,#4f8cff 52%,#86b6ff 100%); --grad2:linear-gradient(135deg,#86b6ff,#4f8cff);
}
:root[data-h3l-theme="lab"] :is(.h3l-root,.h3l-compact) { --r:12px; --r2:10px; --r3:8px; }
:root[data-h3l-theme="lab"] .h3l-root :is(.h3l-btn,.h3l-sel,.h3l-in,.h3l-run,.h3l-pname) { border-radius:8px; }
:root[data-h3l-theme="lab"] .h3l-root :is(.h3l-btn.sm,.h3l-sel.sm,.h3l-pill,.h3l-settab) { border-radius:6px; }
:root[data-h3l-theme="lab"] .h3l-root :is(.h3l-pills,.h3l-tool,.h3l-theme) { border-radius:8px; }
:root[data-h3l-theme="lab"] .h3l-root :is(.h3l-clip,.h3l-lane-bg,.h3l-frame) { border-radius:8px; }
:root[data-h3l-theme="lab"] .h3l-root .h3l-tool.on { background:linear-gradient(160deg,rgba(79,140,255,.30),rgba(79,140,255,.08)); border-color:rgba(79,140,255,.5); box-shadow:0 8px 22px -6px rgba(79,140,255,.55), inset 0 1px 0 rgba(255,255,255,.08); }
:root[data-h3l-theme="lab"] .h3l-root .h3l-range::-webkit-slider-thumb { box-shadow:0 0 0 4px rgba(79,140,255,.30); }
:root[data-h3l-theme="lab"] .h3l-root .h3l-clip.sel { box-shadow:0 0 0 2px #fff, 0 0 0 5px rgba(79,140,255,.6), 0 14px 32px rgba(0,0,0,.55); }

/* ---------- glass over the shader (the shader paints frost, rim refraction, specular edge and the drop shadows) */
${G} { background:transparent !important; }
${G} > .h3l-glass, ${G} > .h3l-body > .h3l-glass, ${G} > .h3l-body > .h3l-insp > .h3l-glass {
  backdrop-filter:none !important; -webkit-backdrop-filter:none !important;
  background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0) 40%), rgba(14,17,22,.40);
  border-color:rgba(210,220,240,.075);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07), inset 0 0 0 1px rgba(255,255,255,.015), 0 1px 1px rgba(0,0,0,.25), 0 8px 18px -8px rgba(0,0,0,.45), 0 28px 60px -24px rgba(0,0,0,.6); }
${G} > .h3l-glass.h3l-lit, ${G} > .h3l-body > .h3l-glass.h3l-lit, ${G} > .h3l-body > .h3l-insp > .h3l-glass.h3l-lit {
  background:radial-gradient(560px circle at var(--h3l-lx,50%) var(--h3l-ly,50%),rgba(220,228,240,.035),transparent 42%),
             linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0) 40%), rgba(14,17,22,.40); }
/* low / no WebGL: classic frosted panels */
:root[data-h3l-fx="low"] .h3l-lab .h3l-glass { backdrop-filter:none; }

/* ---------- cursor spotlight + edge light on cards and controls */
${S} :is(.h3l-card,.h3l-theme,.h3l-gcard).h3l-lit:hover { background-image:radial-gradient(180px circle at var(--h3l-lx,50%) var(--h3l-ly,50%),rgba(255,255,255,.07),transparent 60%); }
${S} .h3l-btn:hover:not(:disabled):not(.primary) { border-color:rgba(220,228,240,.24); box-shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 6px 16px -10px rgba(0,0,0,.8); }
${S} .h3l-tool:hover:not(.on) { background:rgba(220,228,240,.05); box-shadow:inset 0 0 0 1px rgba(220,228,240,.08); }
${S} .h3l-pill.on, ${S} .h3l-settab.on { box-shadow:0 0 0 1px rgba(var(--h3l-fx-acc-rgb),.35), 0 4px 12px -6px rgba(var(--h3l-fx-acc-rgb),.6); }
${S} .h3l-theme.on { box-shadow:0 0 0 1px rgba(var(--h3l-fx-acc-rgb),.55); }
${S} :is(.h3l-btn,button):disabled { filter:saturate(.25) brightness(.9); }
${S} ::-webkit-scrollbar-thumb:hover { background:rgba(var(--h3l-fx-acc-rgb),.45); }

/* ---------- focus: animated ring; fields glow */
${S} :is(button,.h3l-tool,.h3l-pill,.h3l-settab,summary,a,[tabindex]:not(.h3l-root):not(.h3l-sink)):focus-visible { outline:none;
  box-shadow:0 0 0 2px var(--bg0), 0 0 0 4px ${ACC}; }
${A} :is(button,.h3l-tool,.h3l-pill,.h3l-settab,summary,a):focus-visible { animation:h3l-ring .55s var(--h3l-sp-bouncy) both; }
@keyframes h3l-ring { from { box-shadow:0 0 0 10px rgba(var(--h3l-fx-acc-rgb),0), 0 0 0 12px rgba(var(--h3l-fx-acc-rgb),0); } }
${S} :is(.h3l-in,.h3l-sel,textarea,input[type=text],input[type=number],input[type=search],.h3l-pname):focus { outline:none; border-color:rgba(var(--h3l-fx-acc-rgb),.75) !important;
  box-shadow:0 0 0 3px rgba(var(--h3l-fx-acc-rgb),.16); transition:box-shadow .3s, border-color .2s; }

/* ---------- press / hover physics (individual transform props compose with existing transforms; no layout) */
${A} ${PRESS} { transition:scale var(--h3l-sp-snappy-ms) var(--h3l-sp-snappy), translate var(--h3l-sp-soft-ms) var(--h3l-sp-soft), rotate .3s,
  background-color .2s, background-image .2s, border-color .2s, color .2s, box-shadow .28s, filter .2s, opacity .2s; }
${A} .h3l-down { scale:var(--h3l-sq,.97) !important; filter:brightness(.92) saturate(1.1); transition:scale 70ms ease-out, filter 70ms !important; }
${A} .h3l-mag { translate:var(--h3l-mx,0) var(--h3l-my,0); }
${A} .h3l-mag.h3l-down { translate:var(--h3l-mx,0) var(--h3l-my,0); }
${A} .h3l-tilt { transform:perspective(700px) rotateX(var(--h3l-rx,0deg)) rotateY(var(--h3l-ry,0deg)) translateZ(0); transition:transform .14s linear, box-shadow .3s; box-shadow:0 18px 34px -16px rgba(0,0,0,.7); }
${A} .h3l-tool svg, ${A} .h3l-btn svg { transition:scale var(--h3l-sp-bouncy-ms) var(--h3l-sp-bouncy), rotate .35s; }
${A} .h3l-tool:hover svg { scale:1.14; } ${A} .h3l-tool.on svg { scale:1.06; }
${A} .h3l-btn.icon:hover:not(:disabled) svg { scale:1.12; }
/* toggles: spring knob, squash on press */
${A} .h3l-tog i::after { transition:left var(--h3l-sp-bouncy-ms) var(--h3l-sp-bouncy), width .18s ease, background .2s; }
${A} .h3l-tog.h3l-down i::after { width:18px; }

/* sliders */
${S} .h3l-range::-webkit-slider-thumb { transition:scale var(--h3l-sp-bouncy-ms) var(--h3l-sp-bouncy), box-shadow .25s; }
${S} .h3l-range:hover::-webkit-slider-thumb { scale:1.12; box-shadow:0 0 0 5px rgba(var(--h3l-fx-acc-rgb),.25); }
${S} .h3l-range:active::-webkit-slider-thumb, ${S} .h3l-range.h3l-val::-webkit-slider-thumb { scale:1.22; box-shadow:0 0 0 7px rgba(var(--h3l-fx-acc-rgb),.22), 0 0 14px rgba(var(--h3l-fx-acc-rgb),.55); }
${S} .h3l-range { background:linear-gradient(90deg,#3567e0,${ACC} var(--p,50%),rgba(190,200,222,.12) var(--p,50%)); }

/* ---------- animated borders: Generate + welcome card */
@keyframes h3l-ang { to { --h3l-ang:360deg; } }

/* ---------- text */
${S} .h3l-logo span:not(.h3l-ptext-on) b { background:linear-gradient(100deg,#3567e0,#7fb0ff 40%,#fff 50%,#7fb0ff 60%,#3567e0); background-size:250% 100%; -webkit-background-clip:text; background-clip:text; color:transparent; }
${A} .h3l-logo span:not(.h3l-ptext-on) b { animation:h3l-shine 5s ease-in-out infinite; }
@keyframes h3l-shine { 0%,60% { background-position:100% 0; } 100% { background-position:-150% 0; } }
.h3l-ptext-host { position:relative; }
.h3l-ptext { position:absolute; pointer-events:none; display:none; }
.h3l-ptext-on > .h3l-ptext { display:block; filter:drop-shadow(0 0 5px rgba(var(--h3l-fx-acc-rgb),var(--h3l-pt-glow,.25))); }
.h3l-ptext-on, .h3l-ptext-on b { color:transparent !important; -webkit-text-fill-color:transparent; background:none !important; text-shadow:none !important; }
.h3l-logo i { position:relative; }
${S} .h3l-logo i::after { content:"LAB"; position:absolute; right:-8px; bottom:-4px; font:700 7px/1 Inter,system-ui,sans-serif; letter-spacing:.08em; padding:2px 3px; border-radius:4px; color:#cfd6e2; background:#1c2027; border:1px solid rgba(220,228,240,.18); }
${S} .h3l-logo i { background:linear-gradient(180deg,#2a2f38,#1b1f26); box-shadow:inset 0 0 0 1px rgba(220,228,240,.12), inset 0 1px 0 rgba(255,255,255,.08), 0 4px 10px -4px rgba(0,0,0,.6); }
${S} .h3l-ph h3 { background:linear-gradient(180deg,#f4f6fa,#c2c9d6); -webkit-background-clip:text; background-clip:text; color:transparent; }
.h3l-ch { display:inline-block; }
${A} .h3l-ch { animation:h3l-blurin .62s cubic-bezier(.2,.8,.2,1) both; animation-delay:calc(var(--i) * 26ms); }
@keyframes h3l-blurin { from { opacity:0; filter:blur(8px); translate:0 .35em; } }

/* ---------- cinematic intro (first open per page load) */
${A}.h3l-fx-intro > .h3l-head { animation:h3l-i-drop .95s var(--h3l-sp-soft) both; }
${A}.h3l-fx-intro > .h3l-body > * { animation:h3l-i-rise 1s var(--h3l-sp-soft) both; }
${A}.h3l-fx-intro > .h3l-body > :nth-child(1) { animation-name:h3l-i-left; animation-delay:.10s; }
${A}.h3l-fx-intro > .h3l-body > :nth-child(2) { animation-delay:.16s; }
${A}.h3l-fx-intro > .h3l-body > :nth-child(n+3) { animation-delay:.24s; }
${A}.h3l-fx-intro > .h3l-body > :last-child { animation-name:h3l-i-right; animation-delay:.30s; }
${A}.h3l-fx-intro > .h3l-tl { animation:h3l-i-rise 1.05s var(--h3l-sp-soft) .36s both; }
${A}.h3l-fx-intro .h3l-tools > .h3l-tool { animation:h3l-i-pop .7s var(--h3l-sp-bouncy) both; animation-delay:calc(.25s + var(--h3l-n,0) * 40ms); }
@keyframes h3l-i-drop { from { opacity:0; translate:0 -18px; filter:blur(6px); } }
@keyframes h3l-i-rise { from { opacity:0; translate:0 26px; scale:.985; filter:blur(8px); } }
@keyframes h3l-i-left { from { opacity:0; translate:-24px 0; filter:blur(6px); } }
@keyframes h3l-i-right { from { opacity:0; translate:24px 0; filter:blur(6px); } }
@keyframes h3l-i-pop { from { opacity:0; scale:.6; } }

/* ---------- modals, welcome, toasts */
${S} .h3l-modal { background:radial-gradient(1200px 700px at 50% 35%,rgba(30,34,42,.45),rgba(4,5,7,.8)); backdrop-filter:blur(8px); }
${S} .h3l-modal > .h3l-glass, ${S} .h3l-modal > div { box-shadow:0 0 0 1px rgba(210,220,240,.08), 0 2px 4px rgba(0,0,0,.3), 0 24px 60px -12px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.07); }
${S} .h3l-fx-welcome { background:radial-gradient(900px 520px at 50% 30%,rgba(40,48,62,.45),rgba(3,4,6,.85)); }
${S} .h3l-fx-welcome .h3l-welcome { position:relative; isolation:isolate; overflow:visible; }
${AM} .h3l-fx-welcome .h3l-welcome::before { content:""; position:absolute; inset:-1px; border-radius:inherit; padding:1px; pointer-events:none; z-index:1;
  background:conic-gradient(from var(--h3l-ang), transparent 0 72%, rgba(255,255,255,.28) 84%, rgba(255,255,255,.5) 86%, transparent 96%);
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; animation:h3l-ang 5s linear infinite; }
.h3l-fx-hero { display:flex; flex-direction:column; align-items:center; gap:6px; padding:22px 0 10px; margin:-4px 0 6px; position:relative; }
.h3l-fx-word { font:900 56px/1.08 Inter,"Segoe UI Variable","Segoe UI",system-ui,sans-serif; letter-spacing:-.025em; color:#e6e9ef; white-space:nowrap; }
.h3l-fx-word b { color:${ACC}; }
.h3l-fx-hero small { font-size:10.5px; font-weight:800; letter-spacing:.42em; color:#8fa3c4; text-indent:.42em; }
${A} .h3l-fx-hero small { animation:h3l-blurin .9s .6s cubic-bezier(.2,.8,.2,1) both; }
${S} .h3l-toast { overflow:hidden; box-shadow:0 0 0 1px rgba(210,220,240,.08), 0 18px 40px -10px rgba(0,0,0,.7); }
${A} .h3l-toast::after { content:""; position:absolute; left:10px; right:10px; bottom:3px; height:2px; border-radius:2px; background:linear-gradient(90deg,#3567e0,#9cc2ff); transform-origin:left; animation:h3l-fuse 2.2s linear forwards; opacity:.85; }
${A} .h3l-toast.err::after { animation-duration:4.5s; background:linear-gradient(90deg,#f43f5e,#fda4af); } ${A} .h3l-toast.act::after { animation-duration:6s; }
@keyframes h3l-fuse { to { transform:scaleX(0); } }
${S} .h3l-menu, ${S}~.h3l-menu { box-shadow:0 0 0 1px rgba(210,220,240,.08), 0 22px 50px -12px rgba(0,0,0,.75); }

/* ---------- timeline polish (no transforms on hit areas) */
${S} .h3l-phead::before { background:linear-gradient(180deg,#fff,#a9c8ff); box-shadow:0 0 8px rgba(var(--h3l-fx-acc-rgb),.8), -14px 0 18px -6px rgba(var(--h3l-fx-acc-rgb),.4), -40px 0 36px -14px rgba(var(--h3l-fx-acc-rgb),.18); }
${S} .h3l-phead::after { filter:drop-shadow(0 0 6px rgba(var(--h3l-fx-acc-rgb),.95)); }
${S} .h3l-clip:hover { filter:brightness(1.07) saturate(1.08); }
${S} .h3l-clip.sel { box-shadow:0 0 0 2px #fff, 0 0 0 4px rgba(var(--h3l-fx-acc-rgb),.55), 0 14px 32px rgba(0,0,0,.55); }
${S} .h3l-clip.dragging { box-shadow:0 0 0 2px rgba(255,255,255,.85), 0 26px 48px -10px rgba(0,0,0,.8) !important; filter:brightness(1.08); }
${A} .h3l-clip.running .pg::after { content:""; position:absolute; inset:0; background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.26) 50%,transparent 70%); animation:h3l-sheen 1.5s ease-in-out infinite; }
@keyframes h3l-sheen { from { transform:translateX(-100%); } to { transform:translateX(100%); } }
${S} .h3l-clip.running { animation:h3l-runglow 1.6s ease-in-out infinite; }
@keyframes h3l-runglow { 0%,100% { box-shadow:0 0 0 2px rgba(255,255,255,.7), 0 0 18px rgba(var(--h3l-fx-acc-rgb),.5); } 50% { box-shadow:0 0 0 2px #fff, 0 0 24px rgba(var(--h3l-fx-acc-rgb),.7); } }
${S} .h3l-clip.has-strip:hover .strip { filter:saturate(1.2) brightness(1.08); }
${S} .h3l-seam::before { box-shadow:0 0 14px rgba(var(--h3l-fx-acc-rgb),.95); }
${S} .h3l-split:hover::after, ${S} .h3l-split.on::after { background:${ACC}; box-shadow:0 0 12px rgba(var(--h3l-fx-acc-rgb),.9); }
${S} .h3l-ruler:hover { background:linear-gradient(180deg,rgba(var(--h3l-fx-acc-rgb),.08),transparent); }
${S} .h3l-run { border-color:rgba(var(--h3l-fx-acc-rgb),.5); background:rgba(var(--h3l-fx-acc-rgb),.10); }
${A} .h3l-run > i { background:linear-gradient(90deg,#3567e0,#7fb0ff,#3567e0); background-size:200% 100%; animation:h3l-flow 1.6s linear infinite; }
@keyframes h3l-flow { to { background-position:-200% 0; } }

/* ---------- layout fixes found by the resolution matrix (Lab only): on short windows the tool rail's min-content
   height pushed the studio body under the timeline. The rail now scrolls inside its own row. */
.h3l-lab > .h3l-body > .h3l-tools { min-height:0; overflow-y:auto; overflow-x:hidden; scrollbar-width:none; }
.h3l-lab > .h3l-body > .h3l-tools::-webkit-scrollbar { display:none; }
.h3l-lab > .h3l-body > .h3l-tools > * { flex-shrink:0; }

/* ---------- FX settings block */
.h3l-fx-settings { display:flex; flex-direction:column; gap:8px; padding:10px 0 4px; }
.h3l-fx-stat { font:600 11px/1.3 ui-monospace,Consolas,monospace; color:var(--mut); }
.h3l-fx-chks { display:flex; flex-direction:column; gap:4px; }
.h3l-fx-chk { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--mut); cursor:pointer; }
.h3l-fx-chk input { accent-color:${ACC}; }
`;
