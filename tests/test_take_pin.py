"""v6l hotfix: a saved take is always usable (stale-take bug), and a clip's key depends only on what lies under it.

Root cause (user report 11.11.2026): the cache key / editor sig of a clip stored the WHOLE geometry of every
lock-audio clip and ControlNet clip touching it (start, in, full length), so extending / trimming such a clip
outside the clip's time range made every earlier take «Изменён — пересоздастся», and «↺ Восстановить» found no
field to put back («Изменились файлы референсов или ассеты — их не вернуть отсюда»). Same when reference files or
assets changed after a take. Fix: windowed key forms + «pinned» takes (seg.pin) the backend uses as is."""
import json
import os
import pathlib
import shutil
import subprocess
import textwrap

import pytest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, "web", "js")
NODE = shutil.which("node")
need_node = pytest.mark.skipif(NODE is None, reason="node.js не найден")


def _proj():
    """Two extended clips (124 fr each, 1 overlap block), a lock-audio clip under both, a ControlNet clip."""
    return {
        "id": "ptest", "settings": {"seed": 5, "steps": 8, "run_kind": "full"},
        "assets": [{"id": "a1", "file": "song.wav", "category": "audio", "duration": 60},
                   {"id": "a2", "file": "fx.wav", "category": "audio", "duration": 60},
                   {"id": "v1", "file": "dance.mp4", "category": "video"},
                   {"id": "i1", "file": "face.png", "category": "image"}],
        "segments": [{"id": "s1", "prompt": "a", "frames": 124, "refs": ["i1"]}, {"id": "s2", "prompt": "b", "frames": 124, "link": "extend"}],
        "audio": {"clips": [{"id": "c1", "asset": "a1", "lane": 0, "start": 0.0, "in": 0.0, "length": 8.0}]},
        "control": {"row": True, "on": True, "mode": "depth", "strength": 1.0, "clips": [{"id": "k1", "asset": "v1", "start": 0.0, "in": 0.0, "length": 8.0}]},
    }


# ------------------------------------------------------------------------------------------------ backend keys
def _keys(h3s, p):
    core = h3s.h3s_core
    return core.segment_keys(core.normalize_project(p), {})


def test_key_ignores_audio_and_control_outside_the_clip(h3s):
    core = h3s.h3s_core
    p = _proj()
    k0 = _keys(h3s, p)
    t1 = core.plan(core.normalize_project(p))[0]["end"] / core.FPS
    cases = {
        "audio clip made longer (end after clip 1)": lambda q: q["audio"]["clips"][0].update(length=12.0),
        "audio clip trimmed, still past clip 1": lambda q: q["audio"]["clips"][0].update(length=t1 + 0.5),
        "unrelated audio clip moved (after clip 1)": lambda q: q["audio"]["clips"].append({"id": "c2", "asset": "a2", "lane": 1, "start": t1 + 0.3, "in": 0, "length": 2}),
        "control clip made longer": lambda q: q["control"]["clips"][0].update(length=11.0),
        "control clip added after clip 1": lambda q: q["control"]["clips"].append({"id": "k2", "asset": "v1", "start": t1 + 1.0, "in": 3.0, "length": 2.0}),
    }
    for name, fn in cases.items():
        q = json.loads(json.dumps(p)); fn(q)
        assert _keys(h3s, q)[0] == k0[0], name
    # what clip 1 really hears / sees changes its key
    for name, fn in {"audio start moved": lambda q: q["audio"]["clips"][0].update(start=0.5),
                     "audio in moved": lambda q: q["audio"]["clips"][0].update(**{"in": 1.0}),
                     "audio ends inside clip 1": lambda q: q["audio"]["clips"][0].update(length=t1 - 1.0),
                     "fade-out reaching into clip 1": lambda q: q["audio"]["clips"][0].update(fade_out=8.0),
                     "control in moved": lambda q: q["control"]["clips"][0].update(**{"in": 1.0})}.items():
        q = json.loads(json.dumps(p)); fn(q)
        assert _keys(h3s, q)[0] != k0[0], name


def test_key_of_a_clip_inside_the_window_is_unchanged(h3s):
    """Old cache keys stay: a lock clip / control clip lying inside the segment keeps the old key form."""
    core = h3s.h3s_core
    p = _proj(); p["audio"]["clips"][0].update(start=0.5, length=2.0); p["control"]["clips"][0].update(start=0.5, length=2.0)
    q = core.normalize_project(p)
    it = core.plan(q)[0]
    tr = core.segment_track(q, it)
    assert tr == [["a1", 0.5, 0.0, 2.0]]
    cw = core.control_window(q, it)
    assert core.ctl_key_window(cw["rel"], cw["in"], cw["length"], (it["end"] - it["start"]) / core.FPS) == [cw["rel"], cw["in"], cw["length"]]


def test_ctl_key_window_picks_same_frames(h3s):
    core = h3s.h3s_core
    for rel, cin, ln in [(-2.0, 1.0, 9.0), (1.0, 0.0, 30.0), (-0.5, 0.25, 3.0), (0.0, 0.0, 5.0)]:
        cw = {"rel": rel, "in": cin, "length": ln}
        r2, i2, l2 = core.ctl_key_window(rel, cin, ln, 124 / core.FPS)
        cw2 = {"rel": r2, "in": i2, "length": l2}
        assert [core.control_frame_index(cw, k) for k in range(124)] == [core.control_frame_index(cw2, k) for k in range(124)]


def test_pin_replaces_the_key_and_chains(h3s):
    core = h3s.h3s_core
    p = _proj()
    k0 = _keys(h3s, p)
    p["segments"][0]["pin"] = {"take": "t1", "key": "abcdef0123456789", "kind": "full", "sig": "x", "at": "y"}
    k1 = _keys(h3s, p)
    assert k1[0] == "abcdef0123456789" and k1[1] != k0[1]   # the next clip chains on the pinned take
    q = core.normalize_project(p)
    assert core.segment_keys(q, {}, pin_ok=lambda k: False)[0] == k0[0]   # its latent is gone: computed key
    assert core.segment_keys(q, {}, kind="draft")[0] != "abcdef0123456789"   # pin of another pass kind: ignored
    bad = json.loads(json.dumps(p)); bad["segments"][0]["pin"]["key"] = "../../x"
    assert core.normalize_project(bad)["segments"][0]["pin"] is None


def test_base_of_resolves_derived_takes(tmp_path, h3s):
    import h3s.h3s_store as st
    for key, rec in {"f" * 16: {"kind": "face_refine", "base": "a" * 16}, "a" * 16: {"kind": "audio_refine", "base": "b" * 16},
                     "b" * 16: {"kind": "full"}}.items():
        d = st.take_dir(str(tmp_path), key, True)
        pathlib.Path(d, "recipe.json").write_text(json.dumps(rec), encoding="utf-8")
    assert st.base_of(str(tmp_path), "f" * 16) == "b" * 16
    assert st.base_of(str(tmp_path), "c" * 16) == "c" * 16


# ------------------------------------------------------------------------------------------------ editor (node)
DRIVER = r"""
import { H3Editor } from %(ed)s;
import * as C from %(core)s;
const P = %(proj)s;
const clone = (o) => JSON.parse(JSON.stringify(o));
function editor(p) {
  const ed = Object.create(H3Editor.prototype);
  ed.p = C.normalizeProject(clone(p)); ed.$ = {}; ed.root = null; ed.undoStack = []; ed.redoStack = [];
  ed.mutate = function (fn) { fn(this.p); this.p = C.normalizeProject(this.p); };
  ed.renderAll = ed.renderInspector = ed.renderTimeline = ed.renderPreview = () => {};
  ed.toasts = []; ed.toast = function (m, e) { this.toasts.push([m, !!e]); };
  ed.host = { url: (x) => x };
  return ed;
}
const out = {};
const K = (c) => c.repeat(16);
const take = (ed, i, res) => { ed.pendingSigs = C.segmentSigs(ed.p); ed.recordTake(i, { kind: "full", ...res }, ed.pendingSigs[i]); ed.pendingSigs = null; ed.p = C.normalizeProject(ed.p); };

// 1) base take -> derived takes (face, audio, upscale, ControlNet changed after) -> select base: never «изменён»
for (const [name, res, edit] of [
  ["face", { key: K("b"), seg_key: K("a"), fr: { face: { frame: 1, box: [0.2, 0.2, 0.3, 0.3] }, steps: 8, denoise: 0.4 } }, null],
  ["audio", { key: K("c"), seg_key: K("a"), ar: { steps: 8, denoise: 0.3, video_denoise: 0 } }, null],
  ["upscale", { key: K("d"), seg_key: K("a"), base_key: K("a"), upscale: { method: "latent", mp: 2 } }, (p) => { p.segments[0].upscale = { method: "latent", mp: 2 }; }],
  ["cn", { key: K("e"), seg_key: K("e") }, (p) => { p.control.strength = 0.5; }],
]) {
  const ed = editor(P);
  take(ed, 0, { key: K("a"), seg_key: K("a") });
  const base = ed.p.segments[0].takes[0].id;
  if (edit) edit(ed.p);
  ed.p = C.normalizeProject(ed.p);
  take(ed, 0, res);
  ed.selectTake(0, base, true);
  out[name] = { stale: ed.isStale(0), active: ed.p.segments[0].active_take === base, pin: ed.p.segments[0].pin?.key || null };
}

// 2) the audio clip made longer: the take stays ready (no pin needed)
{ const ed = editor(P); take(ed, 0, { key: K("a") });
  ed.mutate((p) => { p.audio.clips[0].length = 14; });
  out.audioLonger = { stale: ed.isStale(0), pin: !!ed.p.segments[0].pin };
  ed.mutate((p) => { p.control.clips[0].length = 12; p.control.clips.push({ id: "k9", asset: "v1", start: 7, in: 0, length: 2 }); });
  out.ctlOutside = { stale: ed.isStale(0) }; }

// 3) a reference file changed after the take: «↺ Восстановить» uses the take as is (no «не вернуть отсюда»)
{ const ed = editor(P); take(ed, 0, { key: K("a"), seg_key: K("a") });
  ed.mutate((p) => { p.assets.find((a) => a.id === "i1").kf = ["face_v2.png", ""]; });
  const before = ed.isStale(0);
  ed.restoreAll(0);
  out.restore = { before, after: ed.isStale(0), pin: ed.p.segments[0].pin?.key || null, toast: ed.toasts.at(-1) };
  // the next clip chains on the pinned take; an edit of the clip drops the pin -> «изменён» again
  ed.mutate((p) => { p.segments[0].prompt = "other"; });
  out.editDrops = { pin: !!ed.p.segments[0].pin, stale: ed.isStale(0) }; }

// 4) old projects: a take made with the whole-clip key form stays ready (migrated to a pin)
{ const p = clone(P); p.audio.clips[0].length = 14;
  const q = C.normalizeProject(p);
  const old = C.legacySegmentSigs(q), now = C.segmentSigs(q);
  q.segments[0].takes = [{ id: "t1", key: K("a"), sig: old[0], snap: {}, result: { key: K("a"), kind: "full" } }];
  q.segments[0].active_take = "t1"; q.segments[0].result = { key: K("a"), kind: "full", sig: old[0] };
  const ed = editor(q);
  out.legacy = { differ: old[0] !== now[0], stale: ed.isStale(0), pin: ed.p.segments[0].pin?.key || null }; }

console.log(JSON.stringify(out));
"""


@need_node
def test_editor_takes_never_stale_after_derived_and_outside_edits(tmp_path):
    drv = tmp_path / "take_pin.mjs"
    drv.write_text(DRIVER % {"ed": json.dumps(pathlib.Path(JS, "h3s_editor.js").as_uri()),
                             "core": json.dumps(pathlib.Path(JS, "h3s_core.js").as_uri()), "proj": json.dumps(_proj())}, encoding="utf-8")
    r = subprocess.run([NODE, str(drv)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    print(json.dumps(out, ensure_ascii=False))
    for name in ("face", "audio", "upscale", "cn"):
        assert out[name]["active"] and out[name]["stale"] is False, (name, out[name])
    assert out["cn"]["pin"] == "a" * 16   # control changed after the base take: pinned, used as is
    assert out["audioLonger"] == {"stale": False, "pin": False}
    assert out["ctlOutside"]["stale"] is False
    assert out["restore"]["before"] is True and out["restore"]["after"] is False and out["restore"]["pin"] == "a" * 16, out["restore"]
    assert "не вернуть" not in out["restore"]["toast"][0] and out["restore"]["toast"][1] is False
    assert out["editDrops"] == {"pin": False, "stale": True}
    assert out["legacy"]["differ"] and out["legacy"]["stale"] is False and out["legacy"]["pin"] == "a" * 16, out["legacy"]
