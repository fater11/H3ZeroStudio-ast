// H3ZeroStudio Lab v6 — timeline tracks: several video tracks (V1…V8), A1/A2 + music, overlap bands,
// the track context menu and drops from the left dock.
//
// Model (no change to the generation layer): the timeline is still ONE ordered list of segments. A segment's
// `track` (persisted on the segment, not part of any cache key) only chooses the row it is drawn on. An
// overlap window is the engine's own overlap of an «extend» segment: its first frames are generated again over
// the tail of the clip before it. The two clips intersect in time by exactly that window, whatever rows they
// are on. Window state: the later clip is new / changed → a generation window; both ready → plain layering.
// Two new clips → time order: the earlier is generated first and its tail is the context of the later one.
// Track count, A2 and names live in p.settings.timeline_tracks (kept by both normalizers' merge, in no cache key).
import { T } from "../h3s_i18n.js";
import { I, setTip, popover, closePopover, menuList, checkbox, seg, btn } from "./kit.js";
import { CTLH } from "./control.js";

const ROWG = 4, MAXV = 8;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function installTracks(Studio, { C, h }) {
  const P = Studio.prototype;
  Object.assign(P, {
    trkLayout() {
      const L = this.p.settings?.timeline_tracks || {}, used = this.p.segments.reduce((m, s) => Math.max(m, s.track | 0), 0);
      return { nv: clamp(Math.max(L.vtracks | 0, used + 1), 1, MAXV), names: L.names && typeof L.names === "object" ? L.names : {} };
    },
    trkOf(i) { return clamp(this.p.segments[i]?.track | 0, 0, MAXV - 1); },
    trkDefault(key) { return T("Видео") + " " + key.slice(1); },
    trkName(key) { return (this.trkLayout().names[key] || "").trim() || this.trkDefault(key); },
    relayoutTracks() { if (!(JSON.parse(localStorage.getItem("h3ls.v6.layout") || "{}") || {}).tl) requestAnimationFrame(() => { if (!this.root) return; this.applyLayout(); this.renderTimeline(); }); },
    trkSet(fn, opt) { this.relayoutTracks(); this.mutate((p) => { const L = p.settings.timeline_tracks = { vtracks: 1, names: {}, ...(p.settings.timeline_tracks || {}) }; if (!L.names || typeof L.names !== "object") L.names = {}; else L.names = { ...L.names }; fn(L, p); }, opt); },
    /** Row index (0 = top) of video track k. V1 is the bottom row, next to the sound (as in NLEs). */
    trkRow(k, nv = this.trkLayout().nv) { return nv - 1 - k; },
    /** Overlap of segment i with the clip before it: null, or { frames, sec, state, a, b } (a/b: 0-based indices). */
    ovInfo(i, its = this.items(), sigs = this.sigs()) {
      const it = its[i]; if (!it || i < 1 || !it.overlap) return null;
      const ready = (k) => { const s = this.p.segments[k]; return !!(s?.result && (!s.result.sig || s.result.sig === sigs[k]) || s?.freeze); };
      const ra = ready(i - 1), rb = ready(i);
      const state = rb && ra ? "layer" : ra ? "window" : "both";
      return { frames: it.overlap, sec: it.overlap / C.FPS, state, a: i - 1, b: i, cross: this.trkOf(i) !== this.trkOf(i - 1) };
    },
    ovText(o) {
      const n = (k) => k + 1;
      if (o.state === "layer") return T("Отрезки {0} и {1} готовы — просто наложение, генерации нет", n(o.a), n(o.b));
      if (o.state === "window") return T("Отрезок {0} заново создаст {1} с поверх готового хвоста отрезка {2}", n(o.b), o.sec.toFixed(2), n(o.a));
      return T("Оба отрезка новые: сначала создаётся {0}, затем {1} продолжит его хвост ({2} с)", n(o.a), n(o.b), o.sec.toFixed(2));
    },

    /** Row heights: one video track keeps the engine sizing; several share the room (52–88 px each). */
    syncTimelineMetrics() {
      const $ = this.$, na = this.atrkState().list.length;
      const audioH = na * 34 + Math.max(0, na - 1) * 4;
      const nv = this.trkLayout().nv, available = Math.max(0, $.tscroll?.clientHeight || 180);
      const ctl = !!this.ctlRowOn?.(), ctlH = ctl ? CTLH + ROWG : 0;   // v6k: the ControlNet row under V1
      const free = available - 36 - 8 - audioH - 8 - ctlH;
      const rowH = nv === 1 ? clamp(free, 56, 110) : clamp(Math.floor((free - (nv - 1) * ROWG) / nv), this._shortVp ? 46 : 52, 88);
      const videoH = nv * rowH + (nv - 1) * ROWG + ctlH, audioTop = 36 + videoH + 8;
      this.timelineVideoHeight = rowH; this._rowH = rowH; this._nv = nv; this._ctlRow = ctl;
      $.tl.style.setProperty("--video-h", videoH + "px"); $.tl.style.setProperty("--audio-h", audioH + "px");
      $.tl.style.setProperty("--audio-top", audioTop + "px"); $.tl.style.setProperty("--timeline-min", audioTop + audioH + 8 + "px");
      $.tl.style.setProperty("--row-h", rowH + "px");
      $.tl.classList.toggle("compact-video", rowH < 88);
      $.tl.classList.toggle("v6-multi", nv > 1);
      $.tl.classList.toggle("v6-has-ctl", ctl);
    },

    /** After the engine drew one video lane: rows, overlap bands, track heads, tooltips. */
    tracksPost() {
      const $ = this.$, vt = $.tinner?.querySelector(".h3l-track.v"); if (!vt) return;
      const { nv } = this.trkLayout(), rowH = this._rowH || 96, ppf = this.ppf, its = this.items(), sigs = this.sigs();
      const ctl = !!this.ctlRowOn?.(), rows = nv > 1 || ctl;   // v6k: with the ControlNet row V1 no longer fills the whole lane
      const top = (k) => this.trkRow(k, nv) * (rowH + ROWG);
      const place = (el, k) => { if (!el) return; el.style.top = top(k) + "px"; el.style.height = rowH + "px"; el.style.bottom = "auto"; };
      vt.classList.add("v6-vt");
      // rows (background lanes, the drop targets of each track)
      for (let k = 0; k < nv; k++) {
        const lane = h("div", { class: "v6-vlane", dataset: { track: k }, style: { top: top(k) + "px", height: rowH + "px" } });
        vt.prepend(lane);
      }
      // clips
      its.forEach((it, i) => {
        const el = $.clips?.[i]; if (!el) return;
        const k = this.trkOf(i);
        if (rows) place(el, k);
        el.dataset.track = k;
        const nm = el.querySelector(".t .nm"), full = this.p.segments[i].name?.trim() || nm?.textContent || "";
        if (nm) { el._nm = nm; el._full = full; }
      });
      // «↺ Восстановить» is drawn on the track (not inside the clip) so that the overlap band cannot
      // bury it — keep it in the row of its own clip
      for (const s of vt.querySelectorAll(":scope > .h3l-rsb")) {
        const i = +s.dataset.clip; if (!(i >= 0)) continue;
        s.style.top = (top(this.trkOf(i)) + rowH / 2) + "px";
      }
      // engine overlays that belong to one clip's row
      if (rows) {
        const near = (x, list) => { let best = -1, d = 3; list.forEach((v, k) => { const dd = Math.abs(v - x); if (dd < d) { d = dd; best = k; } }); return best; };
        const seamX = its.map((it) => it.end * ppf), qX = its.map((it) => (it.start + it.overlap) * ppf), cutX = its.map((it) => it.start * ppf);
        for (const s of vt.querySelectorAll(":scope > .h3l-seam")) { const i = near(parseFloat(s.style.left), seamX); if (i < 0 || i + 1 >= its.length) continue; if (this.trkOf(i) !== this.trkOf(i + 1)) s.hidden = true; else place(s, this.trkOf(i)); }
        for (const s of vt.querySelectorAll(":scope > .h3l-seamq")) { const i = near(parseFloat(s.style.left), qX); if (i >= 0) place(s, this.trkOf(i)); }
        for (const s of vt.querySelectorAll(":scope > .h3l-cutmark")) { const i = near(parseFloat(s.style.left), cutX); if (i >= 0) place(s, this.trkOf(i)); }
        for (const s of vt.querySelectorAll(":scope > .h3l-gap, :scope > .h3l-ext, :scope > .h3l-gapsel, :scope > .h3l-gapx")) place(s, 0);
      }
      // overlap bands: one element per window, spanning the rows of both clips, with its duration
      for (const o of vt.querySelectorAll(":scope > .h3l-ovl")) o.hidden = true;
      its.forEach((it, i) => {
        const o = this.ovInfo(i, its, sigs); if (!o) return;
        const ka = this.trkOf(i - 1), kb = this.trkOf(i);
        const r0 = Math.min(this.trkRow(ka, nv), this.trkRow(kb, nv)), r1 = Math.max(this.trkRow(ka, nv), this.trkRow(kb, nv));
        const x = it.start * ppf, w = Math.max(3, it.overlap * ppf);
        const band = h("div", { class: "v6-ovb is-" + o.state + (o.cross ? " is-cross" : "") + (i === this.sel ? " is-sel" : ""),
          style: { left: x + 1 + "px", width: w - 1 + "px", top: (rows ? r0 * (rowH + ROWG) : 0) + "px", height: (rows ? (r1 - r0) * (rowH + ROWG) + rowH : rowH) + "px" } },
          w >= 34 ? h("span", { class: "v6-ovb-t" }, T("{0} с", o.sec.toFixed(o.sec < 10 ? 2 : 1))) : null);
        setTip(band, this.ovText(o));
        // the band lies over the tail of the previous clip: move that clip's title / status out from under it
        const pe = $.clips?.[i - 1];
        if (pe) { const pl = parseFloat(pe.style.left) || 0, pw = parseFloat(pe.style.width) || 0, ins = Math.min(Math.max(0, pl + pw - x), Math.max(0, pw - 48)); if (ins > 0) { pe.style.setProperty("--ovr", ins + "px"); pe.classList.add("v6-has-ovr"); } }
        band.addEventListener("pointerdown", (e) => { if (e.button === 0) { e.stopPropagation(); this.browseRunPreview(); this.sel = i; this.selAudio = null; this.pvMode = "segment"; this.renderAll(); } });
        band.addEventListener("contextmenu", (e) => this.clipMenu?.(e, i));
        vt.append(band);
      });
      // vertical drag of a clip to another track
      vt.addEventListener("pointerdown", (e) => { if (e.button === 2) e.stopPropagation(); }, true);   // right click opens the menu, it does not scrub
      if (!vt._v6drag) { vt._v6drag = true; vt.addEventListener("pointerdown", (e) => { if (this.selTrack && e.target.closest?.(".h3l-clip")) this.selTrack = null; this.trkDragStart(e); }, true); }
      try { this.ctlPost?.(vt, nv, rowH); } catch (e) { console.error("[H3 Lab v6] control row", e); }
      try { this.faceMarks?.(); } catch (e) { console.error("[H3 Lab v6] face marks", e); }
      this.trkInstallDrop();
      this.trkHeads();
      this.atrkPost();
      // long clip names: tooltip with the full name only when it is cut
      requestAnimationFrame(() => { for (const el of $.clips || []) { const nm = el?._nm; if (!nm || !nm.isConnected) continue; if (nm.scrollWidth > nm.clientWidth + 1) setTip(nm, el._full); else delete nm.dataset.tip; } });
    },

    trkDragStart(e) {
      if (e.button !== 0 || this._nv < 2 && !e.altKey) return;
      const clip = e.target.closest?.(".h3l-clip"); if (!clip || e.target.closest(".hr, .h3l-cb, .tk, .bd")) return;
      const i = (this.$.clips || []).indexOf(clip); if (i < 0) return;
      const id = this.p.segments[i].id, y0 = e.clientY, k0 = this.trkOf(i);
      let tgt = k0, hint = null;
      const lanes = () => [...(this.$.tinner?.querySelectorAll(".v6-vlane") || [])];
      const move = (ev) => {
        if (Math.abs(ev.clientY - y0) < 8) { tgt = k0; hint?.classList.remove("on"); return; }
        const ln = lanes().find((l) => { const r = l.getBoundingClientRect(); return ev.clientY >= r.top - ROWG && ev.clientY <= r.bottom + ROWG; });
        tgt = ln ? Number(ln.dataset.track) : k0;
        for (const l of lanes()) l.classList.toggle("is-drop", Number(l.dataset.track) === tgt && tgt !== k0);
      };
      const up = () => {
        window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true);
        for (const l of lanes()) l.classList.remove("is-drop");
        if (tgt === k0) return;
        this.mutate((p) => { const s = p.segments.find((x) => x.id === id); if (s) s.track = tgt; });
        this.toast(T("Отрезок на дорожке {0}", "V" + (tgt + 1)));
      };
      window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);
    },
    setSegTrack(i, k) {
      const { nv } = this.trkLayout(); if (i < 0 || k < 0) return;
      if (k >= nv) { if (k >= MAXV) return; this.trkSet((L) => { L.vtracks = k + 1; }, { render: "none" }); }
      this.mutate((p) => { p.segments[i].track = k; });
    },

    /** Left column: one head per video row, then the engine's audio heads. Heads are focusable; the menu key opens the track menu. */
    trkHeads() {
      const $ = this.$, hv = $.headsInner?.querySelector(".h3l-thead.v"); if (!hv) return;
      const { nv } = this.trkLayout(), rowH = this._rowH || 96;
      hv.innerHTML = ""; hv.classList.add("v6-vheads");
      for (let r = 0; r < nv; r++) {
        const k = nv - 1 - r, key = "v" + (k + 1), n = this.p.segments.filter((s) => (s.track | 0) === k).length;
        const row = h("div", { class: "v6-vhead", tabindex: "0", role: "button", "aria-haspopup": "menu", dataset: { track: k }, style: { height: rowH + "px", marginTop: r ? ROWG + "px" : 0 } },
          h("b", { class: "v6-vhead-k" }, "V" + (k + 1)), h("span", { class: "v6-vhead-n" }, this.trkName(key)));
        setTip(row, T("{0}: {1} отрезк. · правый клик — меню дорожки", "V" + (k + 1), n), "Shift+F10");
        this.trkKeys(row);
        hv.append(row);
      }
      this.ctlHead?.(hv);
    },
    // ---------------------------------------------------------------- audio tracks
    // Every audio track is the same kind of track with one flag, «Закрепить в H3». Engine mapping (unchanged
    // generation code): a clip on a locked track is a lock clip (lane 0/1: all of them are mixed into the one H3
    // audio input); a clip on an unlocked track is an overlay clip (lane 2: plays on top in the player and in
    // «Сохранить видео», never sent to H3). The clip → track map and the tracks live in settings.timeline_tracks.
    atrkState() {
      const S = this.p.settings?.timeline_tracks || {}, clips = this.p.audio.clips || [];
      let list = Array.isArray(S.audio) ? S.audio.filter((t) => t && typeof t.id === "string").map((t) => ({ id: t.id, lock: !!t.lock, name: String(t.name || ""), mute: !!t.mute })) : null;
      if (!list || !list.length) {   // projects before v6c: lock lanes 1–2 → locked tracks, the music lane → an ordinary track
        list = [{ id: "a1", lock: true, name: "" }];
        if (S.a2 || this.audioLane2 || clips.some((c) => c.lane === 1)) list.push({ id: "a2", lock: true, name: "" });
        if (clips.some((c) => c.lane >= 2)) list.push({ id: "a" + (list.length + 1), lock: false, name: "" });
      }
      const byId = new Map(list.map((t) => [t.id, t])), m0 = S.aclip && typeof S.aclip === "object" ? S.aclip : {}, map = {};
      const sorted = [...clips].sort((a, b) => a.start - b.start);
      const end = (c) => { const sp = this.clipSpan(c); return sp.end; };
      for (const c of sorted) {
        const want = (c.lane | 0) < 2;
        let tid = m0[c.id];
        if (!(tid && byId.get(tid)?.lock === want)) {
          // a clip the engine added (split, duplicate, assistant): next to its sibling, else by its old lane
          const sib = sorted.find((x) => x !== c && map[x.id] && x.asset === c.asset && ((x.lane | 0) < 2) === want && Math.abs(end(x) - c.start) < 0.06);
          const same = list.filter((t) => t.lock === want);
          tid = sib ? map[sib.id] : want ? (c.lane === 1 && same[1] ? same[1].id : same[0]?.id) : same[0]?.id;
          if (!tid) { const t = { id: this.atrkNewId(list), lock: want, name: "" }; list.push(t); byId.set(t.id, t); tid = t.id; }
        }
        map[c.id] = tid;
      }
      return { list, map };
    },
    atrkNewId(list) { let n = list.length + 1; while (list.some((t) => t.id === "a" + n)) n++; return "a" + n; },
    atrkLabel(st, id) { return "A" + (st.list.findIndex((t) => t.id === id) + 1); },
    atrkName(st, id) { const t = st.list.find((x) => x.id === id); return (t?.name || "").trim() || T("Звук {0}", st.list.indexOf(t) + 1); },
    laneFor(t, c) { const l = c ? c.lane | 0 : 0; return t.lock ? (l < 2 ? l : 0) : 2; },
    /** One undoable change of the audio tracks: fn(list, map, p) edits copies; the full layout is written back. */
    atrkEdit(fn, opt) {
      this.relayoutTracks();
      this.mutate((p) => {
        const st = this.atrkState();
        fn(st.list, st.map, p);
        const ids = new Set(st.list.map((t) => t.id));
        for (const c of p.audio.clips) { const t = st.list.find((x) => x.id === st.map[c.id]); if (t) c.lane = this.laneFor(t, c); }
        const aclip = {}; for (const c of p.audio.clips) if (ids.has(st.map[c.id])) aclip[c.id] = st.map[c.id];
        p.settings.timeline_tracks = { vtracks: 1, names: {}, ...(p.settings.timeline_tracks || {}), audio: st.list.map((t) => ({ id: t.id, lock: t.lock, name: t.name || "", ...(t.mute ? { mute: true } : {}) })), aclip };
        delete p.settings.timeline_tracks.a2;
      }, opt);
    },
    atrkAdd() {
      let lbl = "";
      this.atrkEdit((list) => { list.push({ id: this.atrkNewId(list), lock: false, name: "" }); lbl = "A" + list.length; });
      this.toast(T("Добавлена дорожка {0}. Отметьте «Закрепить в H3», чтобы её звук шёл в генерацию", lbl));
    },
    atrkDel(id) {
      const st = this.atrkState();
      if (st.list.length < 2) return this.toast(T("Это последняя аудиодорожка"), true);
      if (Object.values(st.map).includes(id)) return this.toast(T("На дорожке есть клипы — сначала переместите или удалите их"), true);
      if (this.selTrack === id) this.selTrack = null;
      this.atrkEdit((list) => { list.splice(list.findIndex((t) => t.id === id), 1); });
      this.toast(T("Дорожка удалена"));
    },
    atrkLock(id, v) {
      this.atrkEdit((list) => { const t = list.find((x) => x.id === id); if (t) t.lock = !!v; });
      const st = this.atrkState(), n = st.list.filter((t) => t.lock).length;
      this.toast(v ? (n > 1 ? T("Закреплено дорожек: {0} — их звук сводится в один вход H3", n) : T("Звук дорожки закреплён в H3: видео создаётся под него")) : T("Дорожка играет поверх видео и в генерацию не идёт"));
    },
    /** Per-track listen switch (player only: export and H3 are not affected). */
    atrkMute(id, v) {
      this.atrkEdit((list) => { const t = list.find((x) => x.id === id); if (t) t.mute = !!v; }, { coalesce: "amute" + id });
      const st = this.atrkState(); this.toast(v ? T("{0} не слышно при просмотре — в сохранение и H3 идёт как прежде", this.atrkLabel(st, id)) : T("{0} снова слышно", this.atrkLabel(st, id)));
    },
    audioTick(t, musicOnly = false) {
      const base = Object.getPrototypeOf(Studio.prototype).audioTick, all = this.p.audio.clips, st = this.atrkState();
      const muted = new Set(st.list.filter((x) => x.mute).map((x) => x.id));
      const am = this.audioMonitor, mm = this.musicMonitor;
      this.audioMonitor = true; this.musicMonitor = true;   // the old global switches have no UI in v6: per-track mute replaces them
      this.p.audio.clips = muted.size ? all.filter((c) => !muted.has(st.map[c.id])) : all;
      try { return base.call(this, t, musicOnly); } finally { this.p.audio.clips = all; this.audioMonitor = am; this.musicMonitor = mm; }
    },
    atrkMoveClip(cid, tid, extra = null) {
      this.atrkEdit((list, map, p) => { map[cid] = tid; const c = p.audio.clips.find((x) => x.id === cid); if (c && extra) Object.assign(c, extra); }, extra ? { coalesce: "amove" + cid, render: "none" } : undefined);
    },
    atrkRename(id, pt) {
      const st = this.atrkState(), lbl = this.atrkLabel(st, id);
      const inp = h("input", { class: "v6-in", value: this.atrkName(st, id), spellcheck: "false", "aria-label": T("Название дорожки") });
      const done = () => { const v = inp.value.trim(); this.atrkEdit((list) => { const t = list.find((x) => x.id === id); if (t) t.name = v === T("Звук {0}", list.indexOf(t) + 1) ? "" : v.slice(0, 40); }); closePopover(); };
      inp.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); done(); } else if (ev.key === "Escape") { ev.preventDefault(); closePopover(); } });
      this.trkPop({ x: pt.clientX ?? pt.x, y: pt.clientY ?? pt.y }, h("div", { class: "v6-pop-pad" }, h("label", { class: "v6-lbl" }, T("Название дорожки {0}", lbl)), inp), { focus: "input" });
      requestAnimationFrame(() => inp.select());
    },
    lockTip() { return T("Закрепить в H3: звук дорожки идёт в генерацию — видео создаётся под него (ритм, липсинк). Без отметки дорожка просто играет поверх видео при просмотре и сохранении"); },
    lockBox(id, on, withLabel) {
      return checkbox(on, (v) => this.atrkLock(id, v), { label: withLabel ? T("Закрепить в H3") : "H3", tip: withLabel ? "" : this.lockTip(), aria: T("Закрепить в H3"), cls: withLabel ? "" : "is-mini" });
    },

    /** Audio rows after the engine drew its lanes: one row per track, clips moved onto their track's row. */
    atrkPost() {
      const $ = this.$, at = $.tinner?.querySelector(".h3l-track.a"); if (!at) return;
      const st = this.atrkState(), RH = 34, G = 4, row = (id) => Math.max(0, st.list.findIndex((t) => t.id === id)) * (RH + G);
      at.classList.add("v6-at");
      for (const l of at.querySelectorAll(":scope > .h3l-alane, :scope > .h3l-audio.none")) l.remove();
      st.list.forEach((t, r) => {
        const lane = h("div", { class: "v6-alane" + (t.lock ? " is-lock" : ""), dataset: { atrack: t.id }, style: { top: r * (RH + G) + "px", height: RH + "px" } });
        if (!this.p.audio.clips.length && r === 0) lane.append(h("span", { class: "v6-alane-h" }, T("Перетащите сюда аудио из медиа")));
        at.prepend(lane);
      });
      const els = [...at.querySelectorAll(":scope > .h3l-audio.clip")];
      this.p.audio.clips.forEach((c, k) => {
        const el = els[k]; if (!el) return;
        const t = st.list.find((x) => x.id === st.map[c.id]);
        el.style.top = row(st.map[c.id]) + "px"; el.dataset.atrack = st.map[c.id];
        el.classList.toggle("is-lock", !!t?.lock); el.classList.toggle("is-mute", !!t?.mute); el.classList.remove("music", "locked");
        const lb = el.querySelector(".lbl"); const tn = lb?.firstChild;
        if (tn && tn.nodeType === 3) tn.textContent = tn.textContent.replace(/^[♫⊠]\s*/, "");
        if (lb) setTip(lb, (this.audioAsset(c.asset)?.name || c.asset) + "\n" + (t?.lock ? T("Закреплено в H3") : T("Играет поверх видео")));
      });
      this.atrkHead(st);
      if (!at._v6) { at._v6 = true; this.atrkInstall(at); }
    },
    atrkHead(st = this.atrkState()) {
      const H = this.$.aHead; if (!H) return;
      H.innerHTML = ""; H.removeAttribute("title"); H.classList.add("v6-aheads");
      st.list.forEach((t, r) => {
        const n = Object.values(st.map).filter((x) => x === t.id).length;
        const rowEl = h("div", { class: "v6-vhead v6-ahead" + (this.selTrack === t.id ? " is-sel" : ""), tabindex: "0", role: "button", "aria-haspopup": "menu", dataset: { atrack: t.id }, style: { height: "34px", marginTop: r ? "4px" : 0 } },
          h("b", { class: "v6-vhead-k" }, "A" + (r + 1)), h("span", { class: "v6-vhead-n" }, this.atrkName(st, t.id)), this.muteBtn(t), this.lockBox(t.id, t.lock, false));
        if (t.mute) rowEl.classList.add("is-mute");
        setTip(rowEl.querySelector(".v6-vhead-n"), T("{0}: {1} клип. · клик — параметры дорожки, правый клик — меню", "A" + (r + 1), n), "Shift+F10");
        rowEl.addEventListener("click", (e) => { if (e.target.closest(".v6-chk, .v6-amute")) return; this.selTrack = t.id; this.selAudio = null; this.inspTab = "seg"; this.renderInspector(); this.atrkHead(); });
        this.trkKeys(rowEl);
        H.append(rowEl);
      });
    },
    muteBtn(t) {
      const b = h("button", { type: "button", class: "v6-amute" + (t.mute ? " is-off" : ""), "aria-pressed": String(!t.mute), "aria-label": T("Слышать дорожку") }, h("i", { class: "v6-ic", html: t.mute ? I.mute : I.vol }));
      setTip(b, t.mute ? T("Дорожку не слышно при просмотре — нажмите, чтобы включить") : T("Слышать дорожку при просмотре (на сохранение и H3 не влияет)"));
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", (e) => { e.stopPropagation(); this.atrkMute(t.id, !t.mute); });
      return b;
    },
    /** Track under a client point (audio rows). */
    atrkAt(ev) { const l = [...(this.$.tinner?.querySelectorAll(".v6-alane") || [])].find((x) => { const b = x.getBoundingClientRect(); return ev.clientY >= b.top - 2 && ev.clientY <= b.bottom + 2; }); return l?.dataset.atrack || null; },
    atrkInstall(at) {
      // drops: any audio file onto any track, at the cursor time (no «generation» vs «music» kind of file)
      const isA = (e) => [...(e.dataTransfer?.types || [])].includes("application/x-h3s-audio");
      at.addEventListener("dragover", (e) => {
        if (!isA(e)) return; e.preventDefault(); e.stopPropagation();
        const tid = this.atrkAt(e) || this.atrkState().list[0].id;
        for (const l of at.querySelectorAll(".v6-alane")) l.classList.toggle("is-drop", l.dataset.atrack === tid);
      }, true);
      at.addEventListener("dragleave", (e) => { if (!at.contains(e.relatedTarget)) for (const l of at.querySelectorAll(".v6-alane")) l.classList.remove("is-drop"); });
      at.addEventListener("drop", (e) => {
        if (!isA(e)) return;
        e.preventDefault(); e.stopPropagation();
        for (const l of at.querySelectorAll(".v6-alane")) l.classList.remove("is-drop");
        const aid = e.dataTransfer.getData("application/x-h3s-audio"); if (!aid) return;
        const st = this.atrkState(), tid = this.atrkAt(e) || st.list[0].id, t = st.list.find((x) => x.id === tid);
        const id = C.newId("ac"), start = Math.max(0, Math.round(this.frameAt(e.clientX)) / C.FPS);
        this.atrkEdit((list, map, p) => { p.audio.clips.push({ id, asset: aid, lane: this.laneFor(t), start, in: 0, length: 0, volume: 1, fade_in: 0, fade_out: 0 }); p.audio.clips.sort((a, b) => a.start - b.start || a.lane - b.lane); map[id] = tid; });
        this.selAudio = id; this.selTrack = null; this.renderInspector();
        this.toast(t.lock ? T("Клип на {0}: звук закреплён в H3 — видео создаётся под него", this.atrkLabel(st, tid)) : T("Клип на {0}: играет поверх видео, в генерацию не идёт", this.atrkLabel(st, tid)));
      }, true);
      // vertical move of a clip between tracks (the engine keeps time / trims)
      at.addEventListener("pointerdown", (e) => {
        const el = e.target.closest(".h3l-audio.clip"); if (!el || e.button !== 0 || e.target.closest(".th")) return;
        const k = [...at.querySelectorAll(":scope > .h3l-audio.clip")].indexOf(el), c = this.p.audio.clips[k]; if (!c) return;
        const cid = c.id, y0 = e.clientY, st0 = this.atrkState(), t0 = st0.map[cid];
        let tgt = t0;
        const move = (ev) => {
          if (Math.abs(ev.clientY - y0) < 10) { tgt = t0; } else tgt = this.atrkAt(ev) || t0;
          for (const l of this.$.tinner.querySelectorAll(".v6-alane")) l.classList.toggle("is-drop", l.dataset.atrack === tgt && tgt !== t0);
        };
        const up = () => {
          window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true);
          for (const l of this.$.tinner?.querySelectorAll(".v6-alane") || []) l.classList.remove("is-drop");
          if (tgt !== t0) { this.atrkMoveClip(cid, tgt); this.selAudio = cid; this.renderAll(); }
        };
        window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true);
      }, true);
    },
    /** The engine's clip drag also moves clips between its own lanes: keep the lane, our rows decide the track. */
    audioDrag(e, id, kind) {
      const c = this.audioClipById(id), lane = c?.lane;
      const base = Object.getPrototypeOf(Studio.prototype).audioDrag;
      if (e.button !== 0) return base.call(this, e, id, kind);
      this.audioLanes = () => [lane | 0];   // a one-lane view while dragging: the engine never changes the lane
      const off = () => { delete this.audioLanes; window.removeEventListener("pointerup", off, true); };
      window.addEventListener("pointerup", off, true);
      base.call(this, e, id, kind);
    },
    audioMenu(e, id) {
      const base = Object.getPrototypeOf(Studio.prototype).audioMenu, om = this.openMenu, st = this.atrkState();
      this.openMenu = (ev, title, items) => {
        this.openMenu = om;
        const t = st.list.find((x) => x.id === st.map[id]);
        items = items.map((it) => {
          if (it && it.label === T("Дорожка") && it.sub) return { label: T("Дорожка"), sub: st.list.map((x, r) => ({ label: `A${r + 1} · ${this.atrkName(st, x.id)}` + (x.lock ? " · H3" : ""), on: x.id === t?.id, fn: () => this.atrkMoveClip(id, x.id) })) };
          if (it && it.why) return t?.lock ? { why: T("Дорожка закреплена в H3: громкость и фейды меняют звук генерации (отрезки под клипом перегенерируются)") } : null;
          return it;
        }).filter((x) => x !== null);
        return om.call(this, ev, String(title).replace(/^[♫⊠]\s*/, ""), items);
      };
      try { base.call(this, e, id); } finally { this.openMenu = om; }
    },
    /** «Сохранить видео»: the export mix wording follows the track model (no «music» lane any more). */
    saveDialog(opt) {
      const r = Object.getPrototypeOf(Studio.prototype).saveDialog.call(this, opt);
      const M = this.$.saveModal; if (!M) return r;
      const o1 = T("Микс: музыка + звук видео "), n1 = T("Микс: дорожки поверх + звук видео "), o2 = T("Дорожка «Музыка» и громкость звука видео применяются к файлу");
      const w = document.createTreeWalker(M, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.includes(o1)) n.textContent = n.textContent.replace(o1, n1);
      for (const el of M.querySelectorAll("[title]")) if (el.title === o2) { el.removeAttribute("title"); setTip(el, T("Незакреплённые дорожки и громкость звука видео сводятся в файл")); }
      return r;
    },
    /** Inspector of an audio clip: the engine card, its lane pills replaced by the track picker + the lock flag. */
    audioClipCard() {
      const card = Object.getPrototypeOf(Studio.prototype).audioClipCard.call(this); if (!card) return card;
      const c = this.audioClipById(this.selAudio), st = this.atrkState(), t = st.list.find((x) => x.id === st.map[c.id]);
      const h4 = card.querySelector(".h3l-card-h h4"); if (h4) h4.textContent = h4.textContent.replace(/^[♫⊠]\s*/, "");
      const sm = card.querySelector(".h3l-afile small"); if (sm) sm.textContent = sm.textContent.replace(/^[^·]*·\s*/, `${this.atrkLabel(st, t.id)} · `);
      const pills = card.querySelector(".h3l-arows .h3l-field .h3l-pills");
      if (pills) {
        const fld = pills.closest(".h3l-field");
        const pick = seg(st.list.map((x, r) => ({ value: x.id, label: "A" + (r + 1), tip: this.atrkName(st, x.id) + (x.lock ? " · " + T("Закреплено в H3") : "") })), t.id, (v) => this.atrkMoveClip(c.id, v), { size: "sm", full: true, label: T("Дорожка") });
        fld.replaceWith(h("div", { class: "v6-atrk-pick" }, h("span", { class: "v6-lbl" }, T("Дорожка")), pick, this.atrkLockRow(t.id, t.lock)));
      }
      // actions: v6 buttons, hotkeys in tooltips (not in the label)
      const del0 = [...card.querySelectorAll(".h3l-row > .h3l-btn.danger")].pop(), row = del0?.parentElement;
      if (row) {
        const a = this.audioAsset?.(c.asset);
        row.replaceWith(h("div", { class: "v6-aacts" },
          btn({ icon: I.cut, label: T("Разрезать"), size: "sm", tip: T("Разрезать клип по плейхеду"), key: "S", onclick: () => this.splitAudio() }),
          a && !a.virtual ? btn({ icon: I.pencil, label: T("Файл…"), size: "sm", tip: T("Открыть файл в редакторе ассета"), onclick: () => this.openAssetEditor?.(a.id) }) : null,
          h("i", { class: "v6-grow" }),
          btn({ icon: I.trash, label: T("Удалить"), size: "sm", kind: "danger", tip: T("Удалить клип"), key: "Del", onclick: () => this.deleteAudio() })));
      }
      for (const l of card.querySelectorAll(".h3l-lbl")) {   // «music» wording → tracks that play on top
        const tn = l.firstChild; if (tn?.nodeType === 3 && tn.textContent.trim() === T("Звук видео под музыкой")) { tn.textContent = T("Звук видео под дорожками поверх"); l.removeAttribute("title"); setTip(l, T("Громкость сгенерированного звука под незакреплёнными дорожками — в плеере и при сохранении")); }
      }
      return card;
    },
    atrkLockRow(id, on) {
      return h("div", { class: "v6-lockrow" }, this.lockBox(id, on, true),
        h("p", { class: "v6-note" }, on ? T("Звук этой дорожки идёт в H3 как звук генерации: видео создаётся под него. Все закреплённые дорожки сводятся в один вход") : T("Обычная дорожка: играет поверх видео при просмотре и сохранении, в генерацию не идёт")));
    },
    selectAudio(id) { this.selTrack = null; return Object.getPrototypeOf(Studio.prototype).selectAudio.call(this, id); },
    /** Inspector of a selected audio track (click on its head). */
    atrkCard(id) {
      const st = this.atrkState(), t = st.list.find((x) => x.id === id); if (!t) return null;
      const n = Object.values(st.map).filter((x) => x === id).length, nl = st.list.filter((x) => x.lock).length;
      return h("div", { class: "v6-atrk" },
        h("div", { class: "v6-shead" }, h("b", { class: "v6-vhead-k" }, this.atrkLabel(st, id)), h("span", { class: "v6-atrk-n" }, this.atrkName(st, id)), h("span", { class: "v6-cnt" }, T("{0} клип.", n))),
        this.atrkLockRow(id, t.lock),
        h("p", { class: "v6-note" }, nl ? T("Сейчас в H3 идут: {0}", st.list.filter((x) => x.lock).map((x) => this.atrkLabel(st, x.id)).join(", ")) : T("Ни одна дорожка не закреплена — H3 создаёт звук сам")));
    },

    /** Track menu (right click on a head or on the empty part of a lane; Shift+F10 / the menu key on a head). */
    trkMenu(e, at = null) {
      const t = e.target;
      if (t.closest?.(".h3l-clip, .h3l-audio.clip, .v6-ovb, .h3l-gap, .h3l-ext, .h3l-ruler, .h3l-mk, .h3l-marker, .h3l-region, .v6-chk")) return false;
      if (t.closest?.(".v6-ctl-clip")) return false;   // the clip has its own menu
      if (t.closest?.(".v6-ctl-lane, .v6-ctl-head") || (t.closest?.(".h3l-tscroll") && this.ctlHit?.(e))) { this.ctlMenu(e, null); return true; }
      const vh = t.closest?.(".v6-vhead:not(.v6-ahead), .v6-vlane"), ah = t.closest?.(".v6-ahead, .v6-alane");
      let kind = null, k = 0, aid = null;
      if (vh) { kind = "v"; k = Number(vh.dataset.track) || 0; }
      else if (ah) { kind = "a"; aid = ah.dataset.atrack; }
      else if (t.closest?.(".h3l-thead.v")) { kind = "v"; k = 0; }
      else if (t.closest?.(".h3l-thead.a")) { kind = "a"; aid = this.atrkState().list[0].id; }
      else if (t.closest?.(".h3l-tscroll")) {   // anywhere else in the lanes area (end zone, gaps): by the row under the pointer
        const vt = this.$.tinner?.querySelector(".h3l-track.v")?.getBoundingClientRect(), at2 = this.$.tinner?.querySelector(".h3l-track.a")?.getBoundingClientRect();
        if (vt && e.clientY >= vt.top - 4 && e.clientY <= vt.bottom + 4) { kind = "v"; const ln = [...this.$.tinner.querySelectorAll(".v6-vlane")].find((l) => { const r = l.getBoundingClientRect(); return e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2; }); k = ln ? Number(ln.dataset.track) : 0; }
        else if (at2 && e.clientY >= at2.top - 4) { kind = "a"; aid = this.atrkAt(e) || this.atrkState().list[0].id; }
        else return false;
      }
      else return false;
      e.preventDefault(); e.stopPropagation();
      const { nv } = this.trkLayout(), st = this.atrkState(), pt = at || { x: e.clientX, y: e.clientY };
      const add = [
        { icon: I.film, label: T("Добавить видеодорожку"), dis: nv >= MAXV, tip: nv >= MAXV ? T("Не больше {0} видеодорожек", MAXV) : "", fn: () => this.trkAddVideo() },
        { icon: I.wave, label: T("Добавить аудиодорожку"), dis: st.list.length >= 8, fn: () => this.atrkAdd() },
        { icon: I.sliders, label: T("Добавить дорожку ControlNet"), dis: !!this.ctlRowOn?.(), tip: this.ctlRowOn?.() ? T("Дорожка ControlNet уже есть") : T("Видео на ней управляет движением, позой или глубиной отрезков над ним"), fn: () => this.ctlAddRow() },
      ];
      let items;
      if (kind === "v") {
        const key = "v" + (k + 1), label = "V" + (k + 1);
        items = [{ head: T("Дорожка {0}", label) }, ...add, "sep",
          { icon: I.pencil, label: T("Переименовать…"), fn: () => this.trkRename(key, label, pt) },
          nv > 1 ? { icon: I.trash, label: T("Удалить дорожку"), danger: true, fn: () => this.trkDelVideo(k) } : { icon: I.trash, label: T("Удалить дорожку"), dis: true, tip: T("Нельзя удалить единственную видеодорожку") }];
      } else {
        const tr = st.list.find((x) => x.id === aid) || st.list[0], label = this.atrkLabel(st, tr.id);
        items = [{ head: T("Дорожка {0}", label) }, ...add, "sep",
          { icon: I.lock, label: T("Закрепить в H3"), on: tr.lock, tip: this.lockTip(), fn: () => this.atrkLock(tr.id, !tr.lock) },
          { icon: I.vol, label: T("Слышать дорожку"), on: !tr.mute, tip: T("Только при просмотре: на сохранение и H3 не влияет"), fn: () => this.atrkMute(tr.id, !tr.mute) },
          { icon: I.pencil, label: T("Переименовать…"), fn: () => this.atrkRename(tr.id, pt) },
          (() => { const nc = Object.values(st.map).filter((x) => x === tr.id).length, why = st.list.length < 2 ? T("Это последняя аудиодорожка") : nc ? T("На дорожке есть клипы — сначала переместите или удалите их") : "";
            return why ? { icon: I.trash, label: T("Удалить дорожку"), dis: true, tip: why } : { icon: I.trash, label: T("Удалить дорожку"), danger: true, fn: () => this.atrkDel(tr.id) }; })()];
      }
      this.trkPop(pt, menuList(items));
      return true;
    },
    /** Shift+F10 / the menu key on a focused head opens its menu; Enter on an audio head selects it. */
    trkKeys(el) {
      el.addEventListener("keydown", (e) => {
        if ((e.shiftKey && e.key === "F10") || e.key === "ContextMenu") {
          e.preventDefault(); e.stopPropagation();
          const r = el.getBoundingClientRect();
          this.trkMenu({ target: el, clientX: r.left + 24, clientY: r.bottom, preventDefault() {}, stopPropagation() {} }, { x: r.left + 24, y: r.bottom });
        } else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); el.click(); }
      });
    },
    trkPop(pt, content, opts = {}) {
      this._trkAnchor?.remove();
      const r = this.root.getBoundingClientRect(), s = (this.uiS || 1);
      const a = this._trkAnchor = h("i", { class: "v6-anchor", style: { left: (pt.x - r.left) / s + "px", top: (pt.y - r.top) / s + "px" } });
      this.root.append(a);
      const pop = popover(this.root, a, content, { gap: 2, width: 260, cls: "v6-ctxmenu", onClose: () => { a.remove(); opts.onClose?.(); } });
      // keyboard: arrows move between items, Home/End, focus the first one
      const its = () => [...pop.querySelectorAll(".v6-menu-it:not([aria-disabled=true])")];
      pop.addEventListener("keydown", (ev) => {
        const l = its(), c = l.indexOf(document.activeElement);
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); ev.stopPropagation(); const n = ev.key === "ArrowDown" ? (c + 1) % l.length : (c - 1 + l.length) % l.length; l[n]?.focus(); }
        else if (ev.key === "Home" || ev.key === "End") { ev.preventDefault(); ev.stopPropagation(); (ev.key === "Home" ? l[0] : l[l.length - 1])?.focus(); }
        else if (ev.key !== "Escape" && ev.key !== "Tab") ev.stopPropagation();
      });
      requestAnimationFrame(() => (opts.focus ? pop.querySelector(opts.focus) : its()[0])?.focus());
      return pop;
    },
    trkAddVideo() {
      const { nv } = this.trkLayout(); if (nv >= MAXV) return;
      this.trkSet((L) => { L.vtracks = nv + 1; });
      this.toast(T("Добавлена дорожка {0}. Перетащите на неё отрезок — пересечение с соседним станет окном перекрытия", "V" + (nv + 1)));
    },
    trkDelVideo(k) {
      // any video track can go while another one is left; the tracks above move down, so the lowest left is V1 (main)
      const { nv } = this.trkLayout(); if (nv < 2 || k < 0 || k >= nv) return;
      const n = this.p.segments.filter((s) => (s.track | 0) === k).length;
      this.trkSet((L, p) => {
        for (const s of p.segments) { const t = s.track | 0; if (t === k) s.track = Math.max(0, k - 1); else if (t > k) s.track = t - 1; }
        const names = {}; for (const [key, v] of Object.entries(L.names)) { const m = /^v(\d+)$/.exec(key); if (!m) { names[key] = v; continue; } const j = +m[1] - 1; if (j < k) names[key] = v; else if (j > k) names["v" + j] = v; }
        L.names = names; L.vtracks = nv - 1;
        for (const s of p.segments) if (!s.track) delete s.track;
      });
      if (k === 0) this.toast(n ? T("Дорожка V1 удалена, её отрезки перенесены на бывшую V2 — теперь это основная V1") : T("Дорожка V1 удалена — бывшая V2 теперь основная V1"));
      else this.toast(n ? T("Дорожка удалена, её отрезки перенесены на {0}", "V" + k) : T("Дорожка удалена"));
    },
    trkRename(key, label, pt) {
      const inp = h("input", { class: "v6-in", value: this.trkName(key), spellcheck: "false", "aria-label": T("Название дорожки") });
      const done = (ok) => { if (ok) { const v = inp.value.trim(); this.trkSet((L) => { if (v && v !== this.trkDefault(key)) L.names[key] = v.slice(0, 40); else delete L.names[key]; }); } closePopover(); };
      inp.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); done(true); } else if (ev.key === "Escape") { ev.preventDefault(); closePopover(); } });
      const body = h("div", { class: "v6-pop-pad" }, h("label", { class: "v6-lbl" }, T("Название дорожки {0}", label)), inp);
      this.trkPop({ x: pt.clientX ?? pt.x, y: pt.clientY ?? pt.y }, body, { focus: "input" });
      requestAnimationFrame(() => inp.select());
    },

    /** Drops from the dock / library onto the video rows: insert at the cursor's place, on that row. */
    trkDropTarget(ev) {
      const vt = this.$.tinner?.querySelector(".h3l-track.v"); if (!vt) return null;
      const r = vt.getBoundingClientRect(), s = this.uiS || 1, x = (ev.clientX - r.left) / s, f = x / this.ppf;
      const its = this.items();
      let at = its.length; for (let k = 0; k < its.length; k++) { const mid = (its[k].start + (k ? its[k].overlap : 0) + its[k].end) / 2; if (f < mid) { at = k; break; } }
      const ln = [...vt.querySelectorAll(".v6-vlane")].find((l) => { const b = l.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY <= b.bottom; });
      const track = ln ? Number(ln.dataset.track) : 0;
      const xAt = at < its.length ? (its[at].start + (at ? its[at].overlap : 0)) : its.length ? its[its.length - 1].end : 0;
      return { at, track, x: xAt * this.ppf, lane: ln };
    },
    trkInstallDrop() {
      const vt = this.$.tinner?.querySelector(".h3l-track.v"); if (!vt) return;
      const kinds = (e) => [...(e.dataTransfer?.types || [])];
      const ours = (e) => { const ty = kinds(e); return ty.includes("application/x-h3s-video") || ty.includes("application/x-h3s-gal") || ty.includes("application/x-h3s-dock"); };
      const ind = () => { let el = vt.querySelector(":scope > .v6-dropind"); if (!el) { el = h("div", { class: "v6-dropind" }); vt.append(el); } return el; };
      const clear = () => { vt.querySelector(":scope > .v6-dropind")?.remove(); for (const l of vt.querySelectorAll(".v6-vlane.is-drop")) l.classList.remove("is-drop"); };
      const galOn = (e) => kinds(e).includes("application/x-h3s-gal") && e.target.closest(".h3l-clip");
      vt.addEventListener("dragover", (e) => {
        if (this.ctlHit?.(e)) { clear(); return; }   // v6k: the ControlNet row takes its own drops
        if (galOn(e)) { e.preventDefault(); clear(); e.target.closest(".h3l-clip").classList.add("dropover"); return; }
        if (!ours(e) || e.target.closest(".h3l-clip")) { clear(); return; }
        e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy";
        const d = this.trkDropTarget(e); if (!d) return;
        const el = ind(), rowH = this._rowH || 96, nv = this._nv || 1;
        el.style.left = d.x + "px"; el.style.top = (nv > 1 ? this.trkRow(d.track, nv) * (rowH + ROWG) : 0) + "px"; el.style.height = rowH + "px";
        for (const l of vt.querySelectorAll(".v6-vlane")) l.classList.toggle("is-drop", l === d.lane && nv > 1);
      }, true);
      vt.addEventListener("dragleave", (e) => { if (!vt.contains(e.relatedTarget)) clear(); });
      vt.addEventListener("drop", (e) => {
        clear();
        if (this.ctlHit?.(e)) return;
        if (galOn(e)) {   // a gallery video onto a clip: a <Video> reference of that clip
          const cl = e.target.closest(".h3l-clip"), i = (this.$.clips || []).indexOf(cl); cl.classList.remove("dropover");
          e.preventDefault(); e.stopPropagation();
          const g = (this._gal?.items || []).find((x) => x.id + x.pid === e.dataTransfer.getData("application/x-h3s-gal"));
          const id = g && this.galAsset(g); if (id && i >= 0) { this.sel = i; this.addRef(i, id); }
          return;
        }
        if (!ours(e) || e.target.closest(".h3l-clip")) return;
        e.preventDefault(); e.stopPropagation();
        const d = this.trkDropTarget(e); if (!d) return;
        let id = e.dataTransfer.getData("application/x-h3s-video");
        const gk = e.dataTransfer.getData("application/x-h3s-gal");
        if (!id && gk) { const g = (this._gal?.items || []).find((x) => x.id + x.pid === gk); if (g) id = this.galAsset(g); }
        const img = e.dataTransfer.getData("application/x-h3s-dock");
        const before = this.p.segments.length;
        if (id) this.addFootage(id, d.at - 1);
        else if (img) {
          const a = this.p.assets.find((x) => x.id === img); if (!a || a.category === "audio") return;
          const s = this.newSegment(d.at > 0 ? this.p.segments[d.at - 1] : null); s.refs = [img]; s.prompt = s.prompt || "";
          this.mutate((p) => { p.segments.splice(d.at, 0, s); }, { render: "none" });
          this.sel = d.at; this.pvMode = "segment"; const it = this.items()[d.at]; if (it) this.playhead = it.start + (d.at ? it.overlap : 0); this.renderAll();
          this.toast(T("Новый отрезок {0} с референсом «{1}»", d.at + 1, a.name));
        } else return;
        if (this.p.segments.length > before && d.track) this.setSegTrack(d.at, d.track);
      }, true);
    },
  });
}
