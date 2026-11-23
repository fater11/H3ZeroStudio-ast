// H3ZeroStudio Lab — one shared WebGL background for the whole studio:
// domain-warped graphite silk + blue aurora bands, volumetric light rays, water caustics, cursor light & parallax,
// click ripples, and "liquid glass" drawn *inside the shader* under every panel (frost, rim refraction, specular edge,
// layered drop shadows) — so panels need no backdrop-filter over an animated layer.
// Perf: low-res render target (CSS upscales), DPR cap 1.5, fps cap, pause when hidden / editor closed,
// adaptive governor (EMA of frame time → steps resolution, then quality level), no allocations per frame.
import { FX, PRESET, LEVELS, hexRgb, schedule } from "./fx_core.js";

const MAXR = 14, MAXRIP = 6;

const VS = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
const FS = `
precision highp float;
uniform vec2 R; uniform float T; uniform vec2 M; uniform float OCT; uniform float CAUS; uniform float IN; uniform float BUSY;
uniform vec3 ACC; uniform vec4 RC[${MAXR}]; uniform float NR; uniform float RAD; uniform float PX; uniform vec4 RIP[${MAXRIP}];
uniform float GLASS;

float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), u.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm(vec2 p, float oct){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++){ if (float(i) >= oct) break; v += a*vnoise(p); p = m*p; a *= 0.5; } return v; }
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

vec3 scene(vec2 uv, float oct, float caus){
  float t = T; vec3 steel = mix(ACC, vec3(0.56, 0.62, 0.72), 0.55);
  vec2 par = (M/R - 0.5) * vec2(R.x/R.y, 1.0);
  vec2 p = uv + par*0.035;
  // domain-warped silk
  vec2 q = vec2(fbm(p*1.35 + vec2(0.0, t*0.030), oct), fbm(p*1.35 + vec2(5.2, 1.3) - t*0.024, oct));
  float r = fbm(p*1.7 + 3.2*q + vec2(t*0.018, -t*0.012), oct);
  vec3 g0 = vec3(0.026, 0.030, 0.040), g1 = vec3(0.072, 0.080, 0.098);
  vec3 col = mix(g0, g1, smoothstep(0.30, 0.78, r));
  float band = smoothstep(0.50, 0.76, r) * smoothstep(0.35, 0.7, q.y);
  float au = exp(-pow((p.y - 0.62 - 0.14*sin(p.x*1.7 + t*0.17) - (q.x - 0.5)*0.55) * 3.2, 2.0));
  col += steel * au * (0.05 + 0.07*smoothstep(0.3, 0.8, r));
  col += steel * (band * 0.20 + band * band * 0.14);
  col += vec3(0.62, 0.68, 0.80) * pow(smoothstep(0.55, 0.85, r), 2.0) * 0.09;   // silver sheen on folds
  // volumetric light rays from the top-left
  vec2 o = vec2(-0.15, 1.18) + par*0.06; vec2 d = uv - o; float ang = atan(d.y, d.x);
  float ray = 0.5 + 0.5*sin(ang*17.0 + t*0.21 + vnoise(vec2(ang*5.0, t*0.08))*4.0);
  ray *= 0.55 + 0.45*sin(ang*6.3 - t*0.13);
  ray = pow(ray, 2.2) * exp(-length(d)*1.05);
  float flare = IN * (1.0 - IN) * 4.0;   // intro bloom
  col += vec3(0.62, 0.67, 0.76) * ray * (0.16 + 0.12*BUSY + 0.8*flare);
  // caustics (tileable water pattern)
  if (caus > 0.5){
    vec2 cp = mod(uv*vec2(5.0, 4.0)*6.2831 + par*2.0, 6.2831) - 250.0; vec2 ci = cp; float c = 1.0;
    for (int n = 0; n < 5; n++){ if (float(n) >= caus) break; float tt = t*0.22*(1.0 - (3.5/float(n+1)));
      ci = cp + vec2(cos(tt - ci.x) + sin(tt + ci.y), sin(tt - ci.y) + cos(tt + ci.x));
      c += 1.0/length(vec2(cp.x/(sin(ci.x + tt)/0.005), cp.y/(cos(ci.y + tt)/0.005))); }
    c /= caus; c = 1.17 - pow(c, 1.4); float cs = pow(abs(c), 8.0);
    float mask = smoothstep(0.38, 0.62, fbm(uv*0.9 - vec2(t*0.015, 0.0), 3.0)) * (0.35 + 0.65*smoothstep(1.0, 0.0, uv.y));
    col += vec3(0.55, 0.62, 0.74) * min(cs, 1.0) * mask * 0.07;
  }
  return col;
}

void main(){
  vec3 steel = mix(ACC, vec3(0.56, 0.62, 0.72), 0.55);
  vec2 fc = gl_FragCoord.xy; vec2 fpx = vec2(fc.x, R.y - fc.y);   // top-left px (matches DOM rects)
  // ripples displace + glow
  vec2 off = vec2(0.0); float rg = 0.0;
  for (int i = 0; i < ${MAXRIP}; i++){ vec4 rp = RIP[i]; if (rp.w <= 0.0) continue;
    vec2 dv = fpx - rp.xy; float dist = length(dv) / PX; float a = rp.z;
    float ring = exp(-pow((dist - a*520.0)/26.0, 2.0)) * exp(-a*2.6) * rp.w;
    off += (dv/(length(dv)+1.0)) * ring * 6.0 * PX; rg += ring; }
  // liquid glass under panels
  float dmin = 1e5; vec2 nrm = vec2(0.0); float sh = 0.0;
  for (int i = 0; i < ${MAXR}; i++){ if (float(i) >= NR) break; vec4 rc = RC[i];
    vec2 c = rc.xy + rc.zw*0.5, b = rc.zw*0.5;
    float dd = sdBox(fpx - c, b, RAD);
    if (dd < dmin){ dmin = dd; vec2 e = vec2(1.0, 0.0);
      nrm = normalize(vec2(sdBox(fpx - c + e.xy, b, RAD) - sdBox(fpx - c - e.xy, b, RAD), sdBox(fpx - c + e.yx, b, RAD) - sdBox(fpx - c - e.yx, b, RAD)) + 1e-5); }
    float ds = sdBox(fpx - c - vec2(0.0, 14.0*PX), b, RAD);          // offset drop shadow (two layers)
    sh = max(sh, exp(-max(ds, 0.0)/(26.0*PX)) * 0.55 + exp(-max(dd, 0.0)/(5.0*PX)) * 0.25); }
  float inside = GLASS * (1.0 - smoothstep(-1.0, 1.0, dmin));
  float rim = smoothstep(-34.0*PX, 0.0, dmin) * inside;               // refraction strongest at the rim
  vec2 uvp = fpx + off - nrm * rim * rim * 22.0 * PX;
  vec2 uv = vec2(uvp.x, R.y - uvp.y) / R.y;
  vec3 col = scene(uv, mix(OCT, max(OCT - 2.0, 2.0), inside), mix(CAUS, 0.0, inside));
  // panel body: frosted, darker, faint cool tint; outside: soft layered shadows
  col = mix(col * (1.0 - 0.55*sh*GLASS*(1.0 - inside)), mix(col*0.78, vec3(0.040, 0.045, 0.056), 0.35) + ACC*0.015, inside);
  // specular edge highlight turning toward the cursor
  float edge = (1.0 - smoothstep(0.0, 1.6*PX, abs(dmin + 0.8*PX))) * GLASS;
  vec2 L = normalize(M - fpx + 1e-3); float spec = pow(max(dot(nrm, L), 0.0), 3.0);
  float topLit = smoothstep(0.4, -1.0, nrm.y);
  col += edge * (vec3(0.10, 0.12, 0.15)*(0.5 + topLit) + vec3(0.75, 0.8, 0.88) * spec * 0.45 * exp(-length(M - fpx)/(520.0*PX)));
  // cursor light
  float md = length(fpx - M) / (R.y);
  col += steel * 0.05 * exp(-md*md*6.0) * (1.0 - 0.4*inside) + vec3(0.025) * exp(-md*md*40.0);
  col += steel * rg * 0.35 + vec3(0.2) * rg * rg * 0.15;
  // vignette + intro fade
  vec2 vq = fc / R - 0.5; col *= 1.0 - dot(vq, vq) * 0.7;
  col += (h21(fc + fract(T*7.0)*311.0) - 0.5) * 0.022 * (1.0 - 0.6*inside);   // film grain behind panels only
  col *= smoothstep(0.0, 0.35, IN) * 0.85 + 0.15 + 0.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export class GLBackground {
  constructor() {
    this.cv = null; this.gl = null; this.raf = 0; this.t0 = performance.now(); this.last = 0;
    this.mouse = [0, 0]; this.mt = [0, 0]; this.rects = new Float32Array(MAXR * 4); this.nr = 0; this.rad = 16;
    this.rip = new Float32Array(MAXRIP * 4); this.ripT = new Float64Array(MAXRIP); this.ripI = 0;
    this.intro = 1; this.introT = 0; this.ema = 16.7; this.bad = 0; this.good = 0; this.dyn = 1;
    this.frames = 0; this.fpsT = 0; this.fpsN = 0; this.drawAcc = 0; this.rectFn = null; this.rectsDirty = true;
    this._loop = (t) => this.loop(t); this.on = false;
    this._vis = () => { if (!document.hidden) this.kick(); };
  }

  mount(before) {
    const cv = this.cv = document.createElement("canvas");
    cv.className = "h3l-fx-bg"; cv.setAttribute("aria-hidden", "true");
    (before?.parentNode || document.body).insertBefore(cv, before || null);
    const gl = this.gl = cv.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) { cv.remove(); this.cv = null; return false; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = this.pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(pr, 0, "a"); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one big triangle
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.u = {}; for (const n of ["R", "T", "M", "OCT", "CAUS", "IN", "BUSY", "ACC", "RC", "NR", "RAD", "PX", "RIP", "GLASS"]) this.u[n] = gl.getUniformLocation(pr, n);
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.stop(); });
    cv.addEventListener("webglcontextrestored", () => { try { this.unmount(); } catch {} });
    document.addEventListener("visibilitychange", this._vis);
    this.setAccent();
    this.kick();
    return true;
  }

  unmount() {
    this.stop(); document.removeEventListener("visibilitychange", this._vis);
    try { this.gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch {}
    this.cv?.remove(); this.cv = null; this.gl = null;
  }

  setAccent(css) {
    const v = css || getComputedStyle(document.documentElement).getPropertyValue("--h3l-fx-accent") || "#4f8cff";
    this.acc = hexRgb(v);
  }

  playIntro() { this.introT = performance.now(); this.intro = 0; this.kick(); }
  /** ripple at client px */
  ripple(x, y, strength = 1) { return; const i = this.ripI++ % MAXRIP; this.ripT[i] = performance.now(); this.rip.set([x, y, 0, strength], i * 4); this.kick(); }
  pointer(x, y) { this.mt[0] = x; this.mt[1] = y; }
  markRects() { this.rectsDirty = true; }

  kick() { this._stop = false; if (!this.on && this.gl && !document.hidden && FX.level !== "off") { this.on = true; schedule(this._loop); } }
  stop() { if (this.on) this._stop = true; }

  resize() {
    const p = PRESET[FX.level] || PRESET.max;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const s = Math.max(0.12, p.scale * this.dyn * (FX.busy ? 0.7 : 1)) * dpr;
    const w = Math.max(64, Math.round(innerWidth * s)), h = Math.max(64, Math.round(innerHeight * s));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; this.gl.viewport(0, 0, w, h); this.rectsDirty = true; }
    this.k = w / innerWidth;
  }

  loop(now) {
    if (this._stop || !this.gl || document.hidden || FX.level === "off") { this.on = false; this._stop = false; return false; }
    const p = PRESET[FX.level] || PRESET.max;
    const busyFps = FX.busy ? (FX.cfg.busyFreeze ? 0 : 24) : p.fps;
    if (!busyFps) { this.on = false; return false; }   // frozen during generation: last frame stays on screen
    const minDt = 1000 / busyFps - 1.5;
    const dt = now - this.last;
    if (dt < minDt) return true;
    this.last = now;
    const t0 = performance.now();
    this.resize();
    const gl = this.gl, u = this.u, k = this.k;
    if (this.rectsDirty && this.rectFn) { this.rectsDirty = false; this.nr = this.rectFn(this.rects, k, MAXR); this.rad = (this._radius || 16) * k; }
    // smooth mouse
    this.mouse[0] += (this.mt[0] * k - this.mouse[0]) * 0.12; this.mouse[1] += (this.mt[1] * k - this.mouse[1]) * 0.12;
    if (this.intro < 1) this.intro = Math.min(1, (now - this.introT) / 1900);
    for (let i = 0; i < MAXRIP; i++) { const o = i * 4; if (this.rip[o + 3] > 0) { const a = (now - this.ripT[i]) / 1000; if (a > 1.6) this.rip[o + 3] = 0; else { this.rip[o + 2] = a; } } }
    const rip = this._ripPx || (this._ripPx = new Float32Array(MAXRIP * 4));
    for (let i = 0; i < MAXRIP * 4; i += 4) { rip[i] = this.rip[i] * k; rip[i + 1] = this.rip[i + 1] * k; rip[i + 2] = this.rip[i + 2]; rip[i + 3] = this.rip[i + 3]; }
    gl.uniform2f(u.R, this.cv.width, this.cv.height);
    gl.uniform1f(u.T, (now - this.t0) / 1000 * 0.3);   // calm: slow drift
    gl.uniform2f(u.M, -1e4, -1e4);   // calm: no cursor light
    gl.uniform1f(u.OCT, p.oct); gl.uniform1f(u.CAUS, p.caus); gl.uniform1f(u.IN, this.intro); gl.uniform1f(u.BUSY, FX.busy ? 1 : 0);
    gl.uniform3f(u.ACC, this.acc[0], this.acc[1], this.acc[2]);
    gl.uniform4fv(u.RC, this.rects); gl.uniform1f(u.NR, this.nr); gl.uniform1f(u.RAD, this.rad); gl.uniform1f(u.PX, k);
    gl.uniform4fv(u.RIP, rip); gl.uniform1f(u.GLASS, p.glass);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const cost = performance.now() - t0;
    this.govern(dt, cost, busyFps);
    return true;
  }

  /** EMA governor: drop resolution, then a level when frames run long; climb back after sustained headroom. */
  govern(dt, cost, fps) {
    if (dt > 250) return;    // tab switch / debugger pause
    this.ema += (dt - this.ema) * 0.05;
    this.drawAcc += (cost - this.drawAcc) * 0.05;
    this.fpsN++; const now = performance.now();
    if (now - this.fpsT > 1000) { FX.stats.fps = Math.round(this.fpsN * 1000 / (now - this.fpsT || 1)); this.fpsN = 0; this.fpsT = now; }
    FX.stats.drawMs = +this.drawAcc.toFixed(2); FX.stats.scale = +(this.k || 0).toFixed(3); FX.stats.level = FX.level; FX.stats.frames++;
    if (!FX.cfg.auto || FX.busy) return;
    const budget = 1000 / fps;
    if (this.ema > budget * 1.45) { this.good = 0; if (++this.bad > 90) { this.bad = 0; this.stepDown(); } }
    else if (this.ema < budget * 1.12) { this.bad = Math.max(0, this.bad - 1); if (++this.good > 360) { this.good = 0; this.stepUp(); } }
  }
  stepDown() {
    if (this.dyn > 0.6) { this.dyn = +(this.dyn - 0.15).toFixed(2); FX.stats.auto = "res " + this.dyn; return; }
    const i = LEVELS.indexOf(FX.level);
    if (i < LEVELS.indexOf("low")) { this.dyn = 1; FX.stats.auto = "→ " + LEVELS[i + 1]; FX.setAutoLevel(LEVELS[i + 1]); }
  }
  stepUp() {
    const want = LEVELS.indexOf(FX.chosen), i = LEVELS.indexOf(FX.level);
    if (this.dyn < 1) { this.dyn = Math.min(1, +(this.dyn + 0.15).toFixed(2)); return; }
    if (i > want) { this.dyn = 0.7; FX.stats.auto = "↑ " + LEVELS[i - 1]; FX.setAutoLevel(LEVELS[i - 1]); }
  }
}
