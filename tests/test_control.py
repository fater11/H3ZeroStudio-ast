"""v6k ControlNet track: window / frame mapping / cache keys, processed control video, sampling hook."""
import os

import numpy as np
import pytest
import torch
from PIL import Image

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_gen as gen
from h3s import h3s_control as control
from fakes import tiny_patcher, FakeClip, FakeVAE


@pytest.fixture(scope="module")
def patcher():
    return tiny_patcher()


@pytest.fixture()
def dirs(tmp_path):
    out, inp = tmp_path / "out", tmp_path / "in"
    (inp / "h3labstudio").mkdir(parents=True)
    out.mkdir()
    folder_paths.set_output_directory(str(out))
    folder_paths.set_input_directory(str(inp))
    Image.fromarray((np.random.rand(64, 96, 3) * 255).astype("uint8")).save(inp / "h3labstudio" / "hero.png")
    return out, inp


def _video(inp, name="ctl.mp4", n=72, fps=24, w=96, h=64):
    from h3s import h3s_media as media
    fr = torch.zeros(n, h, w, 3)
    for k in range(n):   # a bright bar moving right: frame k has it at column 4k % w
        x = (4 * k) % (w - 8)
        fr[k, :, x:x + 8] = torch.tensor([1.0, 0.5, 0.2])
    media.write_mp4(str(inp / "h3labstudio" / name), fr, fps=fps)
    return {"id": "v1", "file": name, "subfolder": "h3labstudio", "category": "video", "frames": n * 24 // fps, "duration": n / fps}


def project(ctl=None, **kw):
    p = {"id": "c1",
         "settings": {"prompt": "g", "res_mode": "custom", "width": 96, "height": 64, "steps": 2, "cfg": 1.0,
                      "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1},
         "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3labstudio", "category": "character"},
                    {"id": "v1", "file": "ctl.mp4", "subfolder": "h3labstudio", "category": "video", "frames": 72, "duration": 3.0}],
         "segments": [{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a1"]},
                      {"id": "s2", "frames": 39, "prompt": "two", "refs": ["a1"]}]}
    if ctl is not None:
        p["control"] = ctl
    p.update(kw)
    return p


def test_normalize_control_and_window():
    p = core.normalize_project(project({"mode": "pose", "strength": 5, "start": 0.2, "end": 0.1,
                                        "clips": [{"id": "k", "asset": "v1", "start": 1.0, "in": 0.5, "length": 0}]}))
    ct = p["control"]
    assert ct["row"] and ct["on"] and ct["mode"] == "pose" and ct["strength"] == 2.0 and ct["start"] == 0.2 and ct["end"] == 0.2
    assert core.control_clip_span(p, ct["clips"][0]) == (1.0, 3.5)          # to the file end (3 s − 0.5 s in)
    it = core.plan(p)
    w0 = core.control_window(p, it[0])                                       # segment 1: 0..39/24 s
    assert w0["rel"] == 1.0 and w0["in"] == 0.5 and w0["asset"] == "v1"
    # before the clip → its first frame; inside → time-aligned; after it → the last frame held
    assert core.control_frame_index(w0, 0) == 12
    assert core.control_frame_index(w0, 30) == round((0.5 + 30 / 24 - 1.0) * 24)
    assert core.control_frame_index(w0, 10 ** 4) == round((0.5 + 2.5 - 1 / 24) * 24)
    # off / strength 0 / unknown asset → no control
    for bad in ({"on": False, "clips": [{"asset": "v1"}]}, {"strength": 0, "clips": [{"asset": "v1"}]}, {"clips": [{"asset": "zz"}]}):
        q = core.normalize_project(project(bad))
        assert all(core.control_window(q, i) is None for i in core.plan(q))
    assert core.normalize_project(project())["control"] == core.normalize_control(None, set())


def test_control_cache_keys():
    base = core.segment_keys(core.normalize_project(project()))
    ctl = {"mode": "depth", "clips": [{"asset": "v1", "start": 0, "length": 1.0}]}
    k = core.segment_keys(core.normalize_project(project(ctl)))
    assert k[0] != base[0]                                                     # guided segment changes
    assert core.segment_keys(core.normalize_project(project(dict(ctl, on=False)))) == base   # off = old keys
    for ch in ({"strength": 1.5}, {"mode": "canny"}, {"end": 0.5}, {"params": {"depth_model": "base"}},
               {"clips": [{"asset": "v1", "start": 0, "in": 0.25, "length": 1.0}]}):
        assert core.segment_keys(core.normalize_project(project(dict(ctl, **ch))))[0] != k[0], ch
    # params of another mode do not matter
    assert core.segment_keys(core.normalize_project(project(dict(ctl, params={"canny_lo": 0.1}))))[0] == k[0]


def test_preprocess_gray_and_canny():
    fr = torch.rand(3, 32, 48, 3)
    g = control.preprocess(fr, "gray")
    assert g.shape == fr.shape and torch.allclose(g[..., 0], g[..., 2])
    assert control.preprocess(fr, "ready") is fr
    c = control.preprocess(fr, "canny", {"canny_lo": 0.2, "canny_hi": 0.5})
    assert c.shape == fr.shape and set(torch.unique(c).tolist()) <= {0.0, 1.0}


def test_processed_video_cached_per_mode(dirs):
    out, inp = dirs
    a = _video(inp)
    src = gen.asset_path(a)
    seen = []
    p1 = control.build_processed(src, "gray", {}, progress=lambda d, n: seen.append((d, n)))
    assert os.path.isfile(p1) and seen[-1][0] == 72 and seen[-1][1] == 72
    assert os.path.getmtime(p1) and os.path.dirname(p1).endswith(os.path.join("h3labstudio", "_control"))
    t = os.path.getmtime(p1)
    assert control.build_processed(src, "gray", {}) == p1 and os.path.getmtime(p1) == t     # cached
    p2 = control.build_processed(src, "canny", {})
    p3 = control.build_processed(src, "canny", {"canny_lo": 0.1})
    assert len({p1, p2, p3}) == 3
    from h3s import h3s_media as media
    assert media.video_info(p1)["frames"] == 72
    fr = media.load_video_frames(p1, 0, 2, 96, 64)
    assert np.abs(fr[..., 0] - fr[..., 2]).max() < 0.08                      # gray
    # the timeline job: done at once when cached
    j = control.start_job(src, "gray", {})
    assert j["state"] == "done" and j["ref"]["filename"] == os.path.basename(p1)


def _pinfo(name=None, bad=()):
    return lambda: {"name": name, "path": "/x" if name else None, "v1": bool(name and "2.0" not in name),
                    "fallback": bool(name and "2.0" not in name), "bad": [dict(b) for b in bad]}


def test_generation_without_patch_is_blocked_clearly(patcher, dirs, monkeypatch):
    """v6l: no usable patch + a control clip under a segment → the run stops before sampling with a clear message
    (naming the incomplete files, which are never loaded) instead of a silent run without control."""
    out, inp = dirs
    _video(inp)
    monkeypatch.setattr(control, "patch_info", _pinfo(None, [{"file": "minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors", "why": "size"}]))
    sampled, real = [], gen.sample_pass
    monkeypatch.setattr(gen, "sample_pass", lambda *a, **k: sampled.append(1) or real(*a, **k))
    p = project({"mode": "gray", "clips": [{"asset": "v1", "start": 0, "length": 0.5}]})
    with pytest.raises(control.ControlPatchMissing) as e:
        gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert "ControlNet" in str(e.value) and "union_2.0" in str(e.value) and "Настройки → Модели" in str(e.value)
    assert not sampled
    # the track off → no block
    p["control"]["on"] = False
    gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert sampled


def test_v1_fallback_warns_and_keys_differ(patcher, dirs, monkeypatch):
    out, inp = dirs
    _video(inp)
    import comfy_extras.nodes_minimax_h3 as nm

    class FakeApply:
        @staticmethod
        def execute(model, patch, vae, strength, start, end, control_video=None):
            return (model,)
    monkeypatch.setattr(nm, "MiniMaxH3FunControlNetApply", FakeApply)
    v1 = "minimax_h3_fun_controlnet_union_pruned_int8_convrot.safetensors"
    monkeypatch.setattr(control, "patch_info", _pinfo(v1, [{"file": "minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors", "why": "part"}]))
    monkeypatch.setattr(control, "load_patch", lambda: (v1, "PATCH"))
    warns, logs = [], []
    monkeypatch.setattr(gen, "log", lambda m: logs.append(m))
    p = project({"mode": "gray", "clips": [{"asset": "v1", "start": 0, "length": 0.5}]})
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert info["segments"][0]["ctl"]["ok"] and info["segments"][0]["ctl"]["patch"] == v1
    assert sum("запасная модель v1" in m and "недокачан" in m for m in logs) == 1   # once per run
    assert info["keys"][0].endswith("1") and len(info["keys"][0]) == len(info["keys"][1]) + 1


def _st(path, tensors=(("w", 16),), cut=0, header=None):
    import json
    import struct
    hdr, off = {}, 0
    for k, n in tensors:
        hdr[k] = {"dtype": "F32", "shape": [n // 4], "data_offsets": [off, off + n]}
        off += n
    hb = json.dumps(header if header is not None else hdr).encode()
    data = struct.pack("<Q", len(hb)) + hb + b"\0" * off
    with open(path, "wb") as f:
        f.write(data[:len(data) - cut] if cut else data)
    return path


def test_check_patch_rejects_partial_files(tmp_path, monkeypatch):
    monkeypatch.setattr(control, "_catalog_size", lambda n: None)
    ok = _st(str(tmp_path / "ok.safetensors"))
    assert control.check_patch(ok) == ""
    assert control.check_patch(_st(str(tmp_path / "cut.safetensors"), cut=5)) == "header"            # truncated data
    with open(tmp_path / "junk.safetensors", "wb") as f:
        f.write(b"\xff" * 64)
    assert control.check_patch(str(tmp_path / "junk.safetensors")) == "header"                        # not a header
    pp = _st(str(tmp_path / "dl.safetensors"))
    open(pp + ".part", "wb").close()
    assert control.check_patch(pp) == "part"                                                          # still downloading
    big = _st(str(tmp_path / "small.safetensors"))
    monkeypatch.setattr(control, "_catalog_size", lambda n: 10 ** 9)
    assert control.check_patch(big) == "size"                                                         # smaller than the catalog


def test_patch_info_skips_incomplete_and_falls_back(tmp_path, monkeypatch):
    v2, v2b, v1 = control.PATCH_NAMES
    files = {v2: _st(str(tmp_path / v2), cut=3), v1: _st(str(tmp_path / v1))}
    monkeypatch.setattr(control, "_find", lambda folder, n: files.get(n))
    monkeypatch.setattr(control, "_catalog_size", lambda n: None)
    i = control.patch_info()
    assert i["name"] == v1 and i["v1"] and i["fallback"] and i["bad"] == [{"file": v2, "why": "header"}]
    assert control.patch_file() == (v1, files[v1])
    st = control.status()
    assert st["patch"] == v1 and st["patch_fallback"] and st["patch_bad"][0]["file"] == v2
    files[v2] = _st(str(tmp_path / v2))   # download finished
    i = control.patch_info()
    assert i["name"] == v2 and not i["fallback"] and not i["bad"]
    files.clear()
    assert control.patch_info()["name"] is None and control.patch_file() == (None, None)


def test_generation_applies_native_patch_with_aligned_frames(patcher, dirs, monkeypatch):
    out, inp = dirs
    _video(inp)
    calls = []

    class FakeApply:
        @staticmethod
        def execute(model, patch, vae, strength, start, end, control_video=None):
            calls.append((patch, strength, start, end, control_video))
            return (model,)
    import comfy_extras.nodes_minimax_h3 as nm
    monkeypatch.setattr(nm, "MiniMaxH3FunControlNetApply", FakeApply)
    monkeypatch.setattr(control, "load_patch", lambda: ("fake_2.0.safetensors", "PATCH"))
    monkeypatch.setattr(control, "patch_info", _pinfo("fake_2.0.safetensors"))
    p = project({"mode": "gray", "strength": 0.7, "start": 0.1, "end": 0.9,
                 "clips": [{"asset": "v1", "start": 0.125, "in": 1.0, "length": 0.5}]})
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert len(calls) == 1                                                    # only segment 1 lies under the clip
    patch, st, a, b, cv = calls[0]
    assert patch == "PATCH" and st == 0.7 and (a, b) == (0.1, 0.9)
    assert cv.shape[0] == 39 and cv.shape[-1] == 3
    # time-aligned: frames before the clip hold its first frame, after it its last; gray
    assert torch.equal(cv[0], cv[3]) and not torch.equal(cv[3], cv[10])
    assert torch.equal(cv[14], cv[38]) and not torch.equal(cv[13], cv[10])
    assert (cv[..., 0] - cv[..., 2]).abs().max() < 0.08
    assert info["segments"][0]["ctl"] == {"ok": True, "mode": "gray", "strength": 0.7, "patch": "fake_2.0.safetensors"}
    # cached re-run keeps the mark
    _, _, _, info2 = gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert len(calls) == 1 and info2["segments"][0]["ctl"]["ok"] and info2["segments"][0]["cached"]


def test_split_pieces_guide_their_own_time():
    """v6l: a CN clip cut in two (split / trimmed pieces of one file) under one segment: each piece's frames for its
    own time range, its last frame held in the gap; the key changes with the cut, a single clip keeps the old key."""
    whole = {"mode": "depth", "clips": [{"id": "a", "asset": "v1", "start": 0.0, "in": 0.5, "length": 4.0}]}
    p1 = core.normalize_project(project(whole))
    it = core.plan(p1)[0]
    w1 = core.control_window(p1, it)
    assert "parts" not in w1
    cut = {"mode": "depth", "clips": [{"id": "a", "asset": "v1", "start": 0.0, "in": 0.5, "length": 1.0},
                                      {"id": "b", "asset": "v1", "start": 1.25, "in": 2.0, "length": 1.0}]}
    p2 = core.normalize_project(project(cut))
    w2 = core.control_window(p2, core.plan(p2)[0])
    assert w2["parts"] == [[0.0, 0.5, 1.0], [1.25, 2.0, 1.0]]
    f = lambda k: core.control_frame_index(w2, k)
    assert f(0) == 12 and f(12) == 24                                         # piece a: in 0.5 s + t
    assert f(24) == round((0.5 + 1.0 - 1 / 24) * 24) == f(29)                # gap 1.0–1.25 s: a's last frame held
    assert f(30) == 48 and f(36) == round((2.0 + 0.25) * 24)                 # piece b from its own in-point (2.0 s)
    assert f(10 ** 4) == round((2.0 + 1.0 - 1 / 24) * 24)                     # after the last piece: its last frame
    # unsplit = the old behaviour exactly; the cut changes the guided segment's key
    assert [core.control_frame_index(w1, k) for k in range(40)] == [round((0.5 + k / 24) * 24) for k in range(40)]
    assert core.segment_keys(p1)[0] != core.segment_keys(p2)[0]


# ---------------------------------------------------------------- v6l «Звук в H3» on ControlNet clips
def _cn_audio(on=True, lock=None, **clip):
    c = {"id": "k", "asset": "v1", "start": 0.5, "in": 0.75, "length": 4.0, "audio": True}
    c.update(clip)
    p = project({"mode": "pose", "on": on, "clips": [c]})
    p["assets"].append({"id": "m1", "file": "m.mp3", "subfolder": "", "category": "audio", "duration": 30})
    p["audio"] = {"clips": lock or []}
    return core.normalize_project(p)


def test_cn_audio_lock_clips_respect_trim_and_audio_track_wins():
    p = _cn_audio()
    v = [c for c in core.lock_clips(p) if c.get("cn")]
    assert [(c["start"], c["in"], c["length"]) for c in v] == [(0.5, 0.75, 4.0)] and v[0]["lane"] == 0
    # an audio-track lock clip over [1.5, 2.75) wins: the CN sound is cut around it
    p = _cn_audio(lock=[{"id": "x", "asset": "m1", "lane": 0, "start": 1.5, "in": 2, "length": 1.25}])
    v = [c for c in core.lock_clips(p) if c.get("cn")]
    assert [(c["start"], c["in"], c["length"]) for c in v] == [(0.5, 0.75, 1.0), (2.75, 3.0, 1.75)]
    # a music (overlay) clip does not take the place; an open-ended lock clip covers everything after its start
    p = _cn_audio(lock=[{"id": "y", "asset": "m1", "lane": 2, "start": 0, "length": 9}])
    assert len([c for c in core.lock_clips(p) if c.get("cn")]) == 1
    p = _cn_audio(lock=[{"id": "z", "asset": "m1", "lane": 0, "start": 2.0, "in": 0, "length": 0}])
    assert [(c["start"], c["length"]) for c in core.lock_clips(p) if c.get("cn")] == [(0.5, 1.5)]
    # to the file end (length 0) stays open; CN track off / flag off → nothing
    assert [c["length"] for c in core.lock_clips(_cn_audio(length=0)) if c.get("cn")] == [0.0]
    assert not [c for c in core.lock_clips(_cn_audio(on=False)) if c.get("cn")]
    assert not [c for c in core.lock_clips(_cn_audio(audio=False)) if c.get("cn")]


def test_cn_audio_changes_the_keys_of_the_segments_it_covers():
    k_off = core.segment_keys(_cn_audio(audio=False))
    k_on = core.segment_keys(_cn_audio())
    assert k_on[0] != k_off[0]
    k_trim = core.segment_keys(_cn_audio(**{"in": 1.0}))
    assert k_trim[0] != k_on[0]
    assert core.segment_track(_cn_audio(), core.plan(_cn_audio())[0])


def test_cn_audio_is_mixed_at_its_timeline_position():
    import torch as T
    sr = 1000
    wf = T.arange(10 * sr, dtype=T.float32).div(10 * sr).view(1, 1, -1).repeat(1, 2, 1)   # a ramp: value = t / 10
    p = _cn_audio(start=1.0, **{"in": 2.0, "length": 1.5})
    out, cov = gen.timeline_audio({"v1": {"waveform": wf, "sample_rate": sr}}, p, 124)
    w = out["waveform"][0, 0]
    assert w[int(0.9 * sr)] == 0                                   # before the clip: silence
    assert abs(float(w[int(1.0 * sr) + 5]) - (2.0 + 0.005) / 10) < 1e-3   # clip start = file second 2.0
    assert abs(float(w[int(2.4 * sr)]) - 3.4 / 10) < 1e-3
    assert w[int(2.6 * sr)] == 0                                   # trimmed out
    assert cov.sum() > 0


def test_cn_audio_without_sound_is_skipped_with_a_warning(monkeypatch):
    p = _cn_audio()
    warns = []
    monkeypatch.setitem(gen.CTL_RUN, "warn", warns.append)

    def no_audio(ref):
        raise ValueError("в файле нет аудиодорожки: ctl.mp4")
    monkeypatch.setattr(gen, "load_audio_ref", no_audio)
    assert gen.audio_sources(p) == {}
    assert warns and "Звук в H3" in warns[0]
    # a real audio asset without sound still fails loudly
    p["audio"]["clips"] = [{"id": "x", "asset": "m1", "lane": 0, "start": 0, "in": 0, "length": 1}]
    with pytest.raises(ValueError):
        gen.audio_sources(p)
