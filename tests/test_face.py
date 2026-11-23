"""v6k «Рефайн лица»: track / smoothing / crop / paste on synthetic frames (no cv2 needed), the parameters,
and the run_project pass (detection stubbed) — a new take with its own key, the original kept."""
import math
import os

import numpy as np
import pytest
import torch
from PIL import Image

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_gen as gen
from h3s import h3s_face as face
from fakes import tiny_patcher, FakeClip, FakeVAE


def test_normalize_fr_bounds():
    assert core.normalize_fr(None) is None and core.normalize_fr({"steps": 3}) is None
    assert core.normalize_fr({"face": {"box": [0.1, 0.1, 0, 0.2]}}) is None
    fr = core.normalize_fr({"face": {"frame": "7", "box": [-1, 0.2, 0.3, 2]}, "steps": 9, "denoise": 0.9, "feather": 0, "crop": 9, "colour": -1, "auto": False})
    assert fr == {"face": {"frame": 7, "box": [0.0, 0.2, 0.3, 1.0]}, "steps": 4, "denoise": 0.2, "feather": 2, "crop": 4.0, "colour": 0.0, "auto": False}
    d = core.normalize_fr({"face": {"box": [0.4, 0.3, 0.1, 0.15]}})
    assert (d["steps"], d["denoise"], d["feather"], d["crop"], d["colour"], d["auto"]) == (3, 0.1, 6, 2.5, 1.0, True)   # FaceRefine defaults
    # project level: run.face only with a picked face; seg.fr kept
    p = core.normalize_project({"segments": [{"frames": 39, "fr": {"face": {"box": [0.4, 0.3, 0.1, 0.1]}}}], "run": {"face": {"steps": 2}}})
    assert "face" not in p["run"] and p["segments"][0]["fr"]["steps"] == 3
    # the face pass never changes the clip's cache key (the refined copy has its own)
    a = core.segment_keys(core.normalize_project({"segments": [{"frames": 39}]}))
    b = core.segment_keys(core.normalize_project({"segments": [{"frames": 39, "fr": {"face": {"box": [0.4, 0.3, 0.1, 0.1]}}}]}))
    assert a == b
    k1 = face.face_refine_key("abc", d, 1)
    assert k1.startswith("abcF") and k1 != face.face_refine_key("abc", dict(d, denoise=0.15), 1) != face.face_refine_key("abc", d, 2)


def test_denoise_scales_with_face_size():
    # FaceRefine per-frame denoise defaults: x1.0 at <= 30 px, x0.35 at >= 120 px; the slider = the large-face value
    assert face.denoise_for(0.1, 200) == 0.1 and face.denoise_for(0.1, 120) == 0.1
    assert face.denoise_for(0.1, 30) == round(0.1 / 0.35, 3) and face.denoise_for(0.1, 10) == face.denoise_for(0.1, 30)
    assert 0.1 < face.denoise_for(0.1, 75) < face.denoise_for(0.1, 40)
    assert face.denoise_for(0.2, 20) == 0.4                                     # capped
    assert face.denoise_for(0.1, 20, auto=False) == 0.1


def test_interp_and_smooth():
    v = np.array([0, 0, 10, 0, 20], float)
    ok = np.array([1, 0, 1, 0, 1], bool)
    assert face.interp_gaps(v, ok).tolist() == [0, 5, 10, 15, 20]
    assert face.interp_gaps(v, np.zeros(5, bool)).tolist() == [0] * 5
    assert face.interp_gaps([0, 7, 0], [0, 1, 0]).tolist() == [7, 7, 7]          # held at the ends
    rng = np.random.default_rng(0)
    line = np.linspace(100, 200, 120)
    noisy = line + rng.normal(0, 4, 120)
    sm = face.smooth(noisy, 15)
    jit = lambda a: float(np.abs(np.diff(a)).mean())
    assert len(sm) == 120 and jit(sm) < jit(noisy) / 4                           # jitter removed
    assert np.abs(sm[10:-10] - line[10:-10]).max() < 4                          # the ramp is kept
    assert np.allclose(face.smooth(np.full(30, 5.0), 15), 5.0)                  # a still face stays put
    assert face.smooth([1, 2], 15).tolist() == [1, 2] and face.smooth(noisy, 1) is not None


def _two_faces(n=40, gaps=()):
    """Face A moves right, face B (bigger) moves left; they cross near the middle. A disappears on `gaps`."""
    dets = []
    for f in range(n):
        a = (20 + 3 * f, 50, 30, 36, 0.9)
        b = (200 - 3 * f, 60, 44, 50, 0.95)
        dets.append(([] if f in gaps else [a]) + [b])
    return dets


def test_link_track_follows_the_picked_face_through_gaps():
    dets = _two_faces(gaps=set(range(12, 18)))
    tr = face.link_track(dets, 5, (35, 50, 30, 36))
    assert tr[5][0] == 35 and all(tr[f] is None for f in range(12, 18))
    assert tr[25] == (95.0, 50.0, 30.0, 36.0) and tr[0][0] == 20                # re-found after the gap, walked backwards
    trb = face.link_track(dets, 30, (110, 60, 44, 50))
    assert all(t is not None and t[2] == 44 for t in trb)                        # B never swaps to A
    assert face.link_track([], 0, (0, 0, 1, 1)) == []
    assert face.link_track([[]] * 3, 1, (0, 0, 10, 10)) == [None] * 3


def test_plan_crops_square_inside_and_fades():
    tr = face.link_track(_two_faces(gaps=set(range(12, 18))), 5, (35, 50, 30, 36))
    pl = face.plan_crops(tr, 256, 160, 2.5, canvas=64)
    assert len(pl["boxes"]) == 40 and pl["canvas"] == 64
    for x, y, bw, bh in pl["boxes"]:
        assert abs(bw - bh) < 1e-6 and x >= 0 and y >= 0 and x + bw <= 256 + 1e-6 and y + bh <= 160 + 1e-6
    w = pl["weights"]
    assert w[2] > 0.95 and w[14] < w[5] and min(w[12:18]) < 0.6               # faded where the face is lost
    fx, fy, fw, fh = pl["face_rect"][3]                                          # face sits mid-canvas
    assert abs(fx + fw / 2 - 32) < 6 and abs(fy + fh / 2 - 32) < 6 and 64 / 2.5 * 0.7 < fh < 64 / 2.5 * 1.3
    assert face.plan_crops([None] * 5, 100, 100) is None
    # box movement is smooth (no frame-to-frame jumps beyond the face speed)
    cx = [b[0] + b[2] / 2 for b in pl["boxes"]]
    assert max(abs(cx[i + 1] - cx[i]) for i in range(39)) < 6


def _frames_with_face(n=24, H=96, W=128):
    """Mid-grey frames with a bright 'face' disc drifting right."""
    fr = torch.full((n, H, W, 3), 0.4)
    yy, xx = torch.meshgrid(torch.arange(H), torch.arange(W), indexing="ij")
    dets = []
    for k in range(n):
        cx, cy, r = 40 + k, 48, 10
        disc = ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r
        fr[k][disc] = torch.tensor([0.9, 0.7, 0.6])
        dets.append([(cx - r, cy - r, 2 * r, 2 * r, 0.9)])
    return fr, dets


def test_affine_crop_centres_the_face_and_identity_stitch():
    fr, dets = _frames_with_face()
    pl = face.plan_crops(face.link_track(dets, 0, dets[0][0][:4]), 128, 96, 2.5, canvas=64, smooth_window=1, size_window=1)
    crops = face.affine_crop(fr, pl["boxes"], 64)
    assert crops.shape == (24, 64, 64, 3)
    assert crops[:, 32, 32, 0].min() > 0.85 and crops[:, 2, 2, 0].max() < 0.5       # face in the middle, background at the edge
    back = face.stitch(fr, crops, pl, feather=4, colour=0.6)
    err = (back - fr).abs()
    assert err.mean() < 0.004 and err.max() < 0.25                                   # pasting the crop unchanged = no change
    assert (err > 0.05).float().mean() < 0.01                                        # (only bilinear resampling at the disc edge)


def test_stitch_changes_only_the_face_and_colour_matches():
    fr, dets = _frames_with_face()
    pl = face.plan_crops(face.link_track(dets, 0, dets[0][0][:4]), 128, 96, 2.5, canvas=64, smooth_window=1, size_window=1)
    crops = face.affine_crop(fr, pl["boxes"], 64)
    tinted = (crops * 0.5).clamp(0, 1)                                                 # a darker «refined» face
    raw = face.stitch(fr, tinted, pl, feather=3, colour=0.0)
    matched = face.stitch(fr, tinted, pl, feather=3, colour=1.0)
    k = 10
    cx = 40 + k
    assert (raw[k, 48, cx] - fr[k, 48, cx]).abs().max() > 0.3                        # face pasted
    assert torch.equal(raw[k, 5:15, 100:120], fr[k, 5:15, 100:120])                  # far background untouched
    assert (matched[k, 48, cx] - fr[k, 48, cx]).abs().max() < (raw[k, 48, cx] - fr[k, 48, cx]).abs().max() / 3   # colour pulled back
    # zero weight frames are left as they are
    pl0 = dict(pl, weights=[0.0] * 24)
    assert torch.equal(face.stitch(fr, tinted, pl0), fr)


def test_group_faces_for_picker():
    s = [(0, [(10, 10, 20, 20, 0.9), (100, 10, 30, 30, 0.8)]), (5, [(14, 10, 20, 20, 0.9), (98, 12, 30, 30, 0.95)]), (10, [(103, 13, 30, 30, 0.9)])]
    g = face.group_faces(s, 11)
    assert len(g) == 2 and g[0]["seen"] == 3 and g[0]["box"][2] == 30 and g[1]["seen"] == 2


@pytest.mark.skipif(not face.have_cv2(), reason="no cv2")
def test_yunet_detector_on_a_real_face(tmp_path):
    p = face.yunet_path(download=False)
    pic = os.path.join(os.path.dirname(__file__), "face_test.jpg")
    if not p or not os.path.isfile(pic):
        pytest.skip("YuNet model or the test picture not present")
    img = np.array(Image.open(pic).convert("RGB"))
    found = face.Detector(p)(img)
    assert found and all(w > 20 and h > 20 for _, _, w, h, _ in found)


@pytest.mark.skipif(not face.have_cv2(), reason="no cv2")
def test_detect_for_picker_on_a_clip(dirs):
    out, inp = dirs
    p = face.yunet_path(download=False)
    pic = os.path.join(os.path.dirname(__file__), "face_test.jpg")
    if not p or not os.path.isfile(pic):
        pytest.skip("YuNet model or the test picture not present")
    from h3s import h3s_media as media
    img = torch.from_numpy(np.array(Image.open(pic).convert("RGB").resize((320, 192)))).float() / 255
    fr = torch.stack([torch.roll(img, 2 * k, dims=1) for k in range(29)])      # a slow pan
    src = str(inp / "h3labstudio" / "clip.mp4")
    media.write_mp4(src, fr, fps=24)
    r = face.detect_for_picker(src)
    assert r["frames"] == 29 and (r["w"], r["h"]) == (320, 192) and r["faces"]
    f0 = r["faces"][0]
    assert f0["seen"] >= 6 and 0 < f0["box"][2] < 0.5
    th = os.path.join(str(out), *f0["thumb"]["subfolder"].split("/"), f0["thumb"]["filename"])
    assert os.path.isfile(th)
    # the whole-clip detection + track follows the same face
    dets = face.detect_frames(fr)
    W, H = 320, 192
    b = f0["box"]
    tr = face.link_track(dets, f0["frame"], (b[0] * W, b[1] * H, b[2] * W, b[3] * H))
    assert sum(t is not None for t in tr) >= 26
    xs = [t[0] for t in tr if t is not None]
    assert xs == sorted(xs) or max(xs) - min(xs) > 30                              # it moves with the pan


# ---------------------------------------------------------------- run_project integration (detection stubbed)
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


def _proj(**kw):
    p = {"id": "f1",
         "settings": {"prompt": "g", "res_mode": "custom", "width": 96, "height": 64, "steps": 2, "cfg": 1.0,
                      "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1},
         "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3labstudio", "category": "character"}],
         "segments": [{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a1"]}]}
    p.update(kw)
    return p


def test_run_face_refine_makes_a_new_take_with_refs(patcher, dirs, monkeypatch):
    monkeypatch.setattr(face, "CANVAS", 32)
    monkeypatch.setattr(face, "detect_frames", lambda frames, **k: [[(30.0, 16.0, 16.0, 20.0, 0.9)] for _ in range(frames.shape[0])])
    _, _, _, base = gen.run_project(patcher, FakeClip(), FakeVAE(), _proj())
    k0 = base["keys"][0]
    with pytest.raises(ValueError):   # a clip without a ready result cannot be refined
        gen.run_project(patcher, FakeClip(), FakeVAE(), _proj(segments=[{"id": "s1", "frames": 39, "prompt": "other"}],
                                                               run={"only": 0, "face": {"face": {"box": [0.3, 0.25, 0.17, 0.3]}}}))
    clip = FakeClip()
    fr = {"face": {"frame": 3, "box": [0.31, 0.25, 0.17, 0.31]}, "steps": 2, "denoise": 0.1}
    calls = []
    real = face.refine_clip
    monkeypatch.setattr(face, "refine_clip", lambda *a, **k: calls.append(a) or real(*a, **k))
    _, _, _, info = gen.run_project(patcher, clip, FakeVAE(), _proj(run={"only": 0, "face": fr}))
    r = info["segments"][0]
    nf = core.normalize_fr(fr)
    assert r["fr"] == nf and r["key"] == face.face_refine_key(k0, nf, r["seed"]) and r["key"] != k0
    assert len(calls) == 1 and len(calls[0][8]) == 1                             # the character reference was fed
    assert any(t[1] and "image" in t[1] for t in clip.calls)                     # ref2va conditioning with the picture
    # the original take is kept next to the refined one; a later run with seg.fr reuses the cached copy
    _, _, _, again = gen.run_project(patcher, FakeClip(), FakeVAE(), _proj(segments=[{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a1"], "fr": fr}]))
    assert again["segments"][0]["key"] == r["key"] and len(calls) == 1 and again["segments"][0]["cached"]
    _, _, _, plain = gen.run_project(patcher, FakeClip(), FakeVAE(), _proj())
    assert plain["segments"][0]["key"] == k0 and "fr" not in plain["segments"][0]


def test_kept_face_pass_is_dropped_on_resample_and_never_fails_a_run(patcher, dirs, monkeypatch):
    monkeypatch.setattr(face, "CANVAS", 32)
    fr = {"face": {"frame": 0, "box": [0.31, 0.25, 0.17, 0.31]}}
    seg = {"id": "s1", "frames": 39, "prompt": "one", "refs": ["a1"], "fr": fr}
    calls = []
    monkeypatch.setattr(face, "detect_frames", lambda frames, **k: calls.append(1) or [[] for _ in range(frames.shape[0])])
    # the clip is sampled now (nothing cached): the kept pass of an older take does not apply
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), _proj(segments=[dict(seg)]))
    assert "fr" not in info["segments"][0] and not calls
    # cached clip + a kept pass whose face is gone: a warning, the base take, no crash
    _, _, _, info2 = gen.run_project(patcher, FakeClip(), FakeVAE(), _proj(segments=[dict(seg)]))
    assert calls and "fr" not in info2["segments"][0] and info2["segments"][0]["key"] == info["segments"][0]["key"]
    # the same failure on an explicit request is an error
    with pytest.raises(ValueError):
        gen.run_project(patcher, FakeClip(), FakeVAE(), _proj(run={"only": 0, "face": fr}))


def test_face_pass_sends_live_previews_and_stages(patcher, dirs, monkeypatch):
    """v6l: the face pass had no live preview (its sampler callback only counted steps). Now every step's x0 of the
    768² crop goes out as a "live" sprite (square), with sigmas for the dynamics panel and the stages
    detect (frames done) → refine → paste as "phase" events, in that order."""
    monkeypatch.setattr(face, "CANVAS", 32)
    monkeypatch.setattr(gen, "LIVE_MIN_INTERVAL", 0.0)

    def det(frames, progress=None, **k):
        n = frames.shape[0]
        for i in range(n):
            if progress and ((i + 1) % 8 == 0 or i + 1 == n):
                progress(i + 1, n)
        return [[(30.0, 16.0, 16.0, 20.0, 0.9)] for _ in range(n)]
    monkeypatch.setattr(face, "detect_frames", det)
    gen.run_project(patcher, FakeClip(), FakeVAE(), _proj())
    ev = []
    real = gen.Notifier.__call__
    monkeypatch.setattr(gen.Notifier, "__call__", lambda self, event, **d: ev.append((event, d)) or real(self, event, **d))
    fr = {"face": {"frame": 3, "box": [0.31, 0.25, 0.17, 0.31]}, "steps": 2, "denoise": 0.1}
    gen.run_project(patcher, FakeClip(), FakeVAE(), _proj(run={"only": 0, "face": fr}))
    ph = [d["phase"] for e, d in ev if e == "phase" and d["phase"].startswith("face_")]
    assert ph[0] == "face_refine"                       # the stage of the clip (kept for older editors)
    assert "face_detect" in ph and ph.index("face_detect") < ph.index("face_paste")
    order = [x for i, x in enumerate(ph) if x in ("face_detect", "face_paste") or (x == "face_refine" and i > 0)]
    assert order[0] == "face_detect" and order[-1] == "face_paste" and "face_refine" in order
    det_ev = [d for e, d in ev if e == "phase" and d["phase"] == "face_detect"]
    assert det_ev[-1]["fd"] == det_ev[-1]["fn"] > 0     # the last detect update says all frames are done
    ref_ev = [d for e, d in ev if e == "phase" and d["phase"] == "face_refine" and "steps" in d]
    assert ref_ev and ref_ev[0]["steps"] == 2 and ref_ev[0]["canvas"] == 32
    live = [d for e, d in ev if e == "live"]
    i_ref = next(i for i, (e, d) in enumerate(ev) if e == "phase" and d.get("phase") == "face_refine" and "steps" in d)
    i_paste = next(i for i, (e, d) in enumerate(ev) if e == "phase" and d.get("phase") == "face_paste")
    live_face = [d for i, (e, d) in enumerate(ev) if e == "live" and i_ref < i < i_paste]
    assert live and len(live_face) == 2 and all(d["seg"] == 0 and d["steps"] == 2 for d in live_face)
    assert live_face[-1]["tw"] == live_face[-1]["th"]  # the square face crop, not the clip frame
    assert any(e == "sigmas" and i_ref - 3 <= i < i_paste for i, (e, _d) in enumerate(ev))
    steps = [d for i, (e, d) in enumerate(ev) if e == "step" and i_ref < i < i_paste]
    assert [d["step"] for d in steps] == [1, 2] and all("ms" in d for d in steps)   # dynamics with the steps
