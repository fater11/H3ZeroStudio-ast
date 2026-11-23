// H3ZeroStudio Lab v6 — brand: the monogram (an «H» whose right stem is also a «3»: one continuous stroke,
// the shared crossbar in the accent) and the welcome wordmark that assembles from particles once, calmly
// (in the spirit of reactbits «Particle Text»: no glow, no loop; it settles and stops; a soft repel on hover).

const ACC = "#0A84FF", INK = "#F5F5F7";

/** The monogram as inline SVG. size in CSS px. */
export function monogram(size = 28, { title = "" } = {}) {
  const s = size;
  const svg = `<svg class="v6-mono" width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"${title ? ` role="img" aria-label="${title}"` : ` aria-hidden="true"`}>
  <path class="m-st" d="M5.75 5.75V26.25"/>
  <path class="m-st" d="M15.5 5.75H26.25V26.25H15.5"/>
  <path class="m-st m-acc" d="M5.75 16H26.25"/>
</svg>`;
  const el = document.createElement("span"); el.className = "v6-monow"; el.innerHTML = svg; return el;
}

/** Particle wordmark on a canvas: «H3» (accent) + «ZeroStudio» (ink). Returns the element (a wrapper). */
export function particleWordmark({ width = 360, height = 64, font = 600, acc = ACC } = {}) {
  const wrap = document.createElement("div"); wrap.className = "v6-pword"; wrap.style.width = width + "px"; wrap.style.height = height + "px";
  wrap.setAttribute("role", "img"); wrap.setAttribute("aria-label", "H3ZeroStudio");
  const cv = document.createElement("canvas"); wrap.append(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr); cv.style.width = width + "px"; cv.style.height = height + "px";
  const ctx = cv.getContext("2d"); if (!ctx) return wrap;
  // 1. sample the text
  const off = document.createElement("canvas"); off.width = cv.width; off.height = cv.height;
  const o = off.getContext("2d", { willReadFrequently: true });
  const fam = `-apple-system, "SF Pro Display", "Inter", "Segoe UI", system-ui, sans-serif`;
  let fs = Math.round(height * 0.74 * dpr);
  const fit = () => { o.font = `${font} ${fs}px ${fam}`; return o.measureText("H3").width + o.measureText("ZeroStudio").width; };
  while (fit() > cv.width * 0.96 && fs > 10) fs -= 2;
  const wA = o.measureText("H3").width, wB = o.measureText("ZeroStudio").width, x0 = (cv.width - wA - wB) / 2, yb = cv.height * 0.5;
  o.textBaseline = "middle";
  o.fillStyle = "#f00"; o.fillText("H3", x0, yb);
  o.fillStyle = "#0f0"; o.fillText("ZeroStudio", x0 + wA, yb);
  const img = o.getImageData(0, 0, off.width, off.height).data;
  const step = Math.max(2, Math.round(1.7 * dpr)), P = [];
  for (let y = 0; y < off.height; y += step) for (let x = 0; x < off.width; x += step) {
    const k = (y * off.width + x) * 4, a = img[k + 3]; if (a < 128) continue;
    const acc = img[k] > img[k + 1];
    const ang = Math.random() * Math.PI * 2, r = (0.35 + Math.random() * 0.65) * Math.max(cv.width, cv.height) * 0.55;
    P.push({ tx: x, ty: y, x: cv.width / 2 + Math.cos(ang) * r, y: cv.height / 2 + Math.sin(ang) * r * 0.5, vx: 0, vy: 0, acc, d: Math.random() * 0.35 });
  }
  const rad = step * 0.58;
  const reduce = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || document.documentElement.dataset.v6Motion === "reduce";
  // crisp: the real text (a settled wordmark is vector-sharp); particles fade out under it
  let crisp = 0;
  const text = (a) => { if (a <= 0) return; ctx.globalAlpha = a; ctx.font = `${font} ${fs}px ${fam}`; ctx.textBaseline = "middle"; ctx.fillStyle = acc; ctx.fillText("H3", x0, yb); ctx.fillStyle = INK; ctx.fillText("ZeroStudio", x0 + wA, yb); };
  const draw = (alpha = 1) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    const pa = alpha * (1 - crisp);
    if (pa > 0.01) for (const pass of [false, true]) {
      ctx.fillStyle = pass ? acc : INK; ctx.globalAlpha = pa; ctx.beginPath();
      for (const p of P) if (p.acc === pass) { ctx.moveTo(p.x + rad, p.y); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); }
      ctx.fill();
    }
    text(crisp);
    ctx.globalAlpha = 1;
  };
  let fq = 0;
  const fadeTo = (v) => { cancelAnimationFrame(fq); const c0 = crisp, t0 = performance.now(); const f = (n) => { const u = Math.min(1, (n - t0) / 380); crisp = c0 + (v - c0) * u; draw(); if (u < 1) fq = requestAnimationFrame(f); }; fq = requestAnimationFrame(f); };
  if (reduce) { for (const p of P) { p.x = p.tx; p.y = p.ty; } crisp = 1; draw(); return wrap; }
  // 2. assemble once (ease-out per particle with a small stagger), then stop
  const T0 = performance.now(), DUR = 1300;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const sx = P.map((p) => p.x), sy = P.map((p) => p.y);
  let raf = 0, mouse = null, live = false;
  const assemble = (now) => {
    const t = (now - T0) / DUR; let done = true;
    P.forEach((p, i) => { const u = Math.min(1, Math.max(0, (t - p.d) / (1 - 0.35))); if (u < 1) done = false; const e = ease(u); p.x = sx[i] + (p.tx - sx[i]) * e; p.y = sy[i] + (p.ty - sy[i]) * e; });
    draw(Math.min(1, 0.25 + t));
    if (!done && wrap.isConnected !== false) raf = requestAnimationFrame(assemble); else { raf = 0; live = true; fadeTo(1); }
  };
  requestAnimationFrame((n) => { raf = requestAnimationFrame(assemble); void n; });
  // 3. a soft repel under the pointer; the loop runs only while something moves
  const R = 26 * dpr;
  const physics = () => {
    let moving = false;
    for (const p of P) {
      if (mouse) { const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy; if (d2 < R * R) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 1.6; p.vx += dx / d * f; p.vy += dy / d * f; } }
      p.vx += (p.tx - p.x) * 0.08; p.vy += (p.ty - p.y) * 0.08; p.vx *= 0.78; p.vy *= 0.78; p.x += p.vx; p.y += p.vy;
      if (Math.abs(p.vx) + Math.abs(p.vy) > 0.02 || Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) > 0.2) moving = true;
    }
    draw();
    if (moving || mouse) raf = requestAnimationFrame(physics); else { raf = 0; for (const p of P) { p.x = p.tx; p.y = p.ty; } fadeTo(1); }
  };
  cv.addEventListener("pointermove", (e) => { if (!live) return; const r = cv.getBoundingClientRect(); mouse = { x: (e.clientX - r.left) / r.width * cv.width, y: (e.clientY - r.top) / r.height * cv.height }; if (crisp > 0) { cancelAnimationFrame(fq); crisp = 0; } if (!raf) raf = requestAnimationFrame(physics); });
  cv.addEventListener("pointerleave", () => { mouse = null; if (live && !raf) raf = requestAnimationFrame(physics); });
  wrap._stop = () => { if (raf) cancelAnimationFrame(raf); cancelAnimationFrame(fq); raf = 0; };
  return wrap;
}
