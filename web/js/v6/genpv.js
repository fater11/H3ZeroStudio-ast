// H3ZeroStudio Lab v6g — generation preview in its own small window instead of over the player.
// While a run is active the live preview sits at the bottom of the left Media/Gallery dock (or, with the dock
// hidden, as a small floating card in the bottom-left corner of the player). The player and the timeline stay
// fully usable. A click on the mini window expands it over the player; «Свернуть» (or Esc) returns it.
// The tiled-upscale tile frame is part of this window's state: it is kept for the whole upscale stage of a
// segment (also between chunks / while decoding), updated only when a new tile event arrives, and cleared when
// the segment's upscale ends (next segment, segment done, run done / stopped).
import { T } from "../h3s_i18n.js";
import { I, btn, setTip } from "./kit.js";
import { SpritePlayer } from "../h3s_polish.js";

const UP_PHASES = ["upscale", "up_input", "decode"];

export function installGenPv(Studio, { C, h }) {
  const P = Studio.prototype;
  const base = { renderDock: P.renderDock, toggleDock: P.toggleDock, applyLayout: P.applyLayout, layoutStage: P.layoutStage, updateRunUI: P.updateRunUI,
    applyProgress: P.applyProgress, applyExecuted: P.applyExecuted, onRunEnded: P.onRunEnded, onKey: P.onKey, setPage: P.setPage };

  Object.assign(P, {
    /** The window element (built once per open studio). */
    gpEnsure() {
      const $ = this.$;
      if ($.gp) return $.gp;
      const cv = h("canvas", { "aria-hidden": "true" });
      $.gpCur = h("div", { class: "cur" });
      $.gpTiles = h("div", { class: "v6-gp-tiles", hidden: true }, $.gpCur, $.gpTl = h("span", { class: "v6-gp-tl" }));
      $.gpWait = h("div", { class: "v6-gp-wait" }, h("i", { class: "v6-spin" }), h("span", null, T("Ждём первый кадр…")));
      $.gpM = h("div", { class: "v6-gp-m" }, cv, $.gpTiles, $.gpWait);
      $.gpT = h("span", { class: "v6-gp-t" });
      $.gpBtn = btn({ icon: I.expand || I.fs, size: "sm", cls: "v6-gp-tg", onclick: (e) => { e.stopPropagation(); this.gpSetBig(!this._gpBig); } });
      $.gpBar = h("i");
      $.gp = h("section", { class: "v6-gp", role: "region", "aria-label": T("Предпросмотр генерации") },
        h("div", { class: "v6-gp-h" }, h("span", { class: "v6-gp-dot", "aria-hidden": "true" }), $.gpT, $.gpBtn),
        $.gpM, h("div", { class: "v6-gp-pg", "aria-hidden": "true" }, $.gpBar));
      $.gpM.addEventListener("click", () => { if (!this._gpBig) this.gpSetBig(true); });
      $.gp.addEventListener("pointerdown", (e) => e.stopPropagation());
      $.gp.addEventListener("dblclick", (e) => e.stopPropagation());   // not the player's «Просмотр»
      this.livePlayer?.stop();
      this.livePlayer = new SpritePlayer(cv);
      this._gpBig = false;
      return $.gp;
    },
    /** Put the window where it belongs: big → over the player; mini → bottom of the dock, or floating in the player. */
    gpMount() {
      const $ = this.$, gp = $.gp; if (!gp || !this.root) return;
      const dockOn = this.page === "edit" && $.dock && !this.root.classList.contains("v6-dock-off") && $.dock.isConnected && $.dock.offsetWidth > 0;
      const mode = this._gpBig ? "big" : dockOn ? "dock" : "float";
      const host = mode === "dock" ? $.dock : $.stage;
      if (gp.parentElement !== host || (mode === "dock" && host.lastElementChild !== gp)) host.append(gp);
      gp.dataset.mode = mode;
      const big = mode === "big";
      $.gpBtn.innerHTML = `<i class="v6-ic">${big ? (I.collapse || I.close) : (I.expand || I.fs)}</i>`;
      setTip($.gpBtn, big ? T("Свернуть в мини-окно") : T("Развернуть над плеером"), big ? "Esc" : "");
      setTip($.gpM, big ? "" : T("Нажмите, чтобы развернуть над плеером"));
      this.root.classList.toggle("v6-gp-big", big);
      this.gpLayout();
      if (this.livePlayer?.d) this.livePlayer.loop();   // a detach (dock re-render) stops the sprite clock: resume it
    },
    /** Size the picture box to the frame aspect (contain), so the tile frame (in %) lands exactly on the picture. */
    gpLayout() {
      const $ = this.$, gp = $.gp; if (!gp || !gp.isConnected) return;
      const d = this.livePlayer?.d, [pw, ph] = C.resolution(this.p.settings);
      const ar = d?.tw && d?.th ? d.tw / d.th : pw / ph;
      const mode = gp.dataset.mode;
      let W, H;
      if (mode === "big") { W = $.stage.clientWidth - 48; H = $.stage.clientHeight - 24 - 40; }
      else if (mode === "dock") { W = $.dock.clientWidth - 24; H = Math.min(200, Math.max(90, $.dock.clientHeight * 0.32)); }
      else { W = 240; H = 150; }
      if (W <= 0 || H <= 0) return;
      const sc = Math.min(W / ar, H);
      $.gpM.style.width = Math.floor(sc * ar) + "px"; $.gpM.style.height = Math.floor(sc) + "px";
    },
    gpSetBig(on) {
      this._gpBig = !!on;
      if (on && this.playing) this.stopPlayback?.();   // the player is covered: do not keep it running unseen
      this.gpMount();
      if (on) this.$.gpBtn?.focus({ preventScroll: true });
    },
    /** Status text / progress from the toolbar activity (the same phrase the run pill shows). */
    gpSync() {
      const $ = this.$, r = this.run;
      if (!r?.active || r.queued) return;
      if (this._gpEndT) { clearTimeout(this._gpEndT); this._gpEndT = 0; }
      const gp = this.gpEnsure(); gp.classList.remove("is-end", "is-out");
      if (!gp.isConnected) this.gpMount();
      const t1 = $.act?.querySelector(".v6-act-1")?.textContent || T("Подготовка…");
      const fc = String(r.phase || "").startsWith("face_") && !this._gpBig && this.faceRunShort;
      $.gpT.textContent = fc ? this.faceRunShort(r) : t1; gp.title = fc ? t1 : "";
      const u = r.phase === "upscale" && r.up && r.up.seg === r.seg ? r.up : null;
      const frac = r.total ? Math.min(1, ((r.done || 0) + (u && u.tile ? u.tile / u.tiles : 0)) / r.total) : 0;
      $.gpBar.style.transform = `scaleX(${frac.toFixed(4)})`;
      gp.classList.toggle("is-up", UP_PHASES.includes(r.phase));
      const face = String(r.phase || "").startsWith("face_");
      gp.classList.toggle("is-face", face);
      const w = $.gpWait?.querySelector("span");
      if (w) w.textContent = r.phase === "face_detect" ? T("Ищем лицо в клипе…") : face ? T("Перерисовка лица — ждём первый шаг…") : T("Ждём первый кадр…");
    },
    /** Tile frame: the state lives in this._gpTile; painting is idempotent and survives any re-render. */
    gpTiles() {
      const $ = this.$, d = this._gpTile; if (!$.gpTiles) return;
      if (!d) { $.gpTiles.hidden = true; return; }
      $.gpTiles.hidden = false;
      const pc = (a, n) => (a / n * 100).toFixed(3) + "%";
      const [y0, y1, x0, x1] = d.rect;
      Object.assign($.gpCur.style, { top: pc(y0, d.lh), height: pc(y1 - y0, d.lh), left: pc(x0, d.lw), width: pc(x1 - x0, d.lw) });
      $.gpTl.textContent = (d.chunks > 1 ? T("кусок {0}/{1} · ", d.chunk, d.chunks) : "") + T("тайл {0}/{1} · сетка {2}×{3}", d.tile, d.tiles, d.cols, d.rows);
    },
    /** Engine hook. d = a tile event → keep + paint; null = the engine thinks the tile stage may be over. */
    tileOverlay(d) {
      if (d) { if ((d.tiles || 0) >= 2 && Array.isArray(d.rect)) this._gpTile = d; }
      else if (!this._gpTileHold) this._gpTile = null;
      if (this.root && (this._gpTile || this.$.gp)) { if (this._gpTile) this.gpSync(); this.gpTiles(); }
    },
    /** Engine hook: live sprite of the running step → the mini window (never over the player, never moves the selection). */
    onLiveFrames(d) {
      if (!this.run?.active) return;
      this.lastLive = d;
      if (!this.root) return;
      this.gpSync();
      // a new picture shape (the square face crop after the clip's own frames) → size the box again
      const old = this.livePlayer?.d, fresh = !old || (old.tw && old.th && d.tw && d.th && Math.abs(old.tw / old.th - d.tw / d.th) > 0.01);
      d.audio = null;   // live preview is silent
      this.livePlayer.setVolume(0, true);
      this.livePlayer.set(d);
      this.$.gpWait.hidden = true;
      this.$.gp?.classList.toggle("is-face", String(this.run?.phase || "").startsWith("face_"));
      if (fresh) { const im = new Image(); im.onload = () => this.gpLayout(); im.src = d.img; }   // aspect of the sprite tile once known
    },
    /** Engine hook: the segment's live preview ends (segment done, run done/stopped). The window stays while the
     *  run goes on (it shows the last frame until the next segment's frames arrive); the tile frame ends here. */
    hideLive() {
      this._gpTile = null; this.gpTiles();
      if (this.run?.active) { if (this.$.gpWait && !this.livePlayer?.d) this.$.gpWait.hidden = false; return; }
      this.gpEnd();
    },
    /** v6l: a face pass begins — the window shows «Ищем лицо…» until the 768² crop's first live step arrives. */
    gpFaceStart() {
      const gp = this.gpEnsure(), $ = this.$;
      if (!gp.isConnected) this.gpMount();
      if (this.livePlayer?.d) { this.livePlayer.stop(); this.livePlayer = new SpritePlayer($.gpM.querySelector("canvas")); }
      this.lastLive = null;
      gp.classList.add("is-face");
      $.gpWait.hidden = false;
      const g = $.gpM.querySelector("canvas"); g.getContext("2d")?.clearRect(0, 0, g.width, g.height);
      this.gpSync();
    },
    /** Run over: say so for a moment, then fade out (an expanded window gives the player back first). */
    gpEnd(msg) {
      const $ = this.$, gp = $.gp; this._gpTile = null;
      if (!gp) { this.livePlayer?.stop(); this.livePlayer = null; return; }
      if (this._gpEndT) return;
      if (this._gpBig) { this._gpBig = false; this.gpMount(); }
      gp.classList.add("is-end"); this.gpTiles();
      $.gpT.textContent = msg || T("Генерация завершена");
      $.gpBar.style.transform = "scaleX(1)";
      this._gpEndT = setTimeout(() => {
        gp.classList.add("is-out");
        this._gpEndT = setTimeout(() => { this._gpEndT = 0; if (this.run?.active) return; this.livePlayer?.stop(); this.livePlayer = null; gp.remove(); for (const k of ["gp", "gpM", "gpT", "gpBtn", "gpBar", "gpTiles", "gpCur", "gpTl", "gpWait"]) this.$[k] = null; this.root?.classList.remove("v6-gp-big"); }, 220);
      }, 1600);
    },

    // ---- wrappers: keep the window in place and in sync
    renderDock() { base.renderDock.call(this); if (this.$.gp && !this._gpBig) this.gpMount(); },
    toggleDock(v) { base.toggleDock.call(this, v); if (this.$.gp) this.gpMount(); },
    applyLayout() { base.applyLayout.call(this); if (this.$?.gp) this.gpMount(); },
    layoutStage() { base.layoutStage.call(this); if (this.$?.gp) this.gpLayout(); },
    setPage(...a) { const r = base.setPage.apply(this, a); if (this.$?.gp) this.gpMount(); return r; },
    updateRunUI() { base.updateRunUI.call(this); if (this.run?.active && !this.run.queued && this.root) { this.gpSync(); this.gpTiles(); } },
    applyProgress(d) {
      // between chunks of one segment's upscale (next chunk's input / decode) the tile frame stays
      const keep = d?.event === "phase" && UP_PHASES.includes(d.phase) && this._gpTile && d.seg === this._gpTile.seg;
      this._gpTileHold = keep;
      try { base.applyProgress.call(this, d); } finally { this._gpTileHold = false; }
      if (d?.event === "seg_start" || (d?.event === "phase" && !UP_PHASES.includes(d.phase))) { this._gpTile = null; this.gpTiles(); }
      // v6l «Рефайн лица»: the face pass starts → drop the clip's last frames, wait for the crop's first step
      if (d?.event === "phase" && d.phase === "face_detect" && !d.fd && this.root && this.run?.active) this.gpFaceStart();
      if (this.root && !this.run?.active && this.$.gp && ["done", "error", "interrupted"].includes(d?.event)) this.gpEnd(d.event === "done" ? T("Генерация завершена") : T("Генерация остановлена"));
    },
    applyExecuted(info) { base.applyExecuted.call(this, info); if (this.$?.gp && !this.run?.active) this.gpEnd(); },
    onRunEnded(reason) { base.onRunEnded.call(this, reason); if (this.$?.gp) this.gpEnd(T("Генерация остановлена")); },
    onKey(e) {
      if (this._gpBig && !this._tour && e.key === "Escape" && this.root && !this._prefs && !document.querySelector(".v6-pop.on, .v6-scrim") && !(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") && !e.target.classList?.contains("h3l-sink"))) {
        e.preventDefault(); e.stopPropagation(); this.gpSetBig(false); return;
      }
      return base.onKey.call(this, e);
    },
  });
}
