"""Swap mask guards: hole filling must not swallow the frame, and the temporal union must
reset on a camera cut (h3s_swap_mask.shape_mask / composite)."""
import numpy as np
import pytest
import torch

from h3s import h3s_swap_mask as sm


def _canvas(h=64, w=64):
    return np.zeros((h, w), np.float32)


def test_fill_holes_keeps_a_silhouette_that_covers_the_corner():
    """A person in the top-left corner used to turn a 64 px mask into a fully filled frame:
    the flood seed (0, 0) sat inside the person, so every real background pixel counted as a hole."""
    m = _canvas()
    m[0:8, 0:8] = 1.0
    assert int(m.sum()) == 64
    out = sm.shape_mask(m, {"fill_holes": True})
    assert int((out > .5).sum()) == 64, "the frame must not be filled by the hole pass"


def test_fill_holes_keeps_background_touching_any_border():
    m = _canvas()
    m[10:50, 10:50] = 1.0          # a person in the middle, background reaches all four borders
    out = sm.shape_mask(m, {"fill_holes": True})
    assert int((out > .5).sum()) == 40 * 40


def test_fill_holes_closes_a_real_interior_hole():
    m = _canvas()
    m[10:50, 10:50] = 1.0
    m[25:30, 25:30] = 0.0          # glasses / gap between the arms: enclosed by the silhouette
    out = sm.shape_mask(m, {"fill_holes": True})
    assert out[27, 27] > .5
    assert int((out > .5).sum()) == 40 * 40
    kept = sm.shape_mask(m, {"fill_holes": False})
    assert kept[27, 27] < .5


def test_full_frame_silhouette_stays_full():
    m = np.ones((64, 64), np.float32)
    assert int((sm.shape_mask(m, {"fill_holes": True}) > .5).sum()) == 64 * 64


def _run_composite(monkeypatch, masks, cuts, n=4, h=16, w=16):
    """composite over fake frames: source = 0, generated = 1, so 1 means "this pixel was pasted"."""
    monkeypatch.setattr(sm, "detect_shot_cuts", lambda path, frames: tuple(c for c in cuts if c < frames))
    monkeypatch.setattr(sm, "prepare", lambda *a, **k: ("project/cache/swap_sam3/fake", (w, h)))
    monkeypatch.setattr(sm, "_block_path", lambda folder, block: "block_%d" % block)
    monkeypatch.setattr(sm, "_load_block", lambda path: masks)

    from h3s import h3s_media
    frames = [np.zeros((h, w, 3), np.uint8) for _ in range(n)]
    monkeypatch.setattr(h3s_media, "load_video_frames",
                        lambda path, start, count, ww, hh, mode="crop": frames[start:start + count])
    generated = torch.ones((n, h, w, 3), dtype=torch.float32)
    cfg = {"point": [.5, .5], "at": 0, "shots": [], "guard": False,
           "cfg": {"fill_holes": False, "expand": 0, "feather": 0, "temporal_expand": 1}}
    out, info = sm.composite("guide.mp4", 0, generated, cfg, "project")
    return out, info


def test_temporal_union_is_reset_at_a_shot_cut(monkeypatch):
    """The old shot's silhouette filled the right half; from frame 2 the tracked person is in the
    left half. Without the reset the union kept the right half pasted for one more frame."""
    masks = np.zeros((64, 16, 16), np.float32)
    masks[0, 4:12, 8:16] = 1.0     # shot 1: person on the right
    masks[1, 4:12, 8:16] = 1.0
    masks[2, 4:12, 0:8] = 1.0      # shot 2 (cut at frame 2): person on the left
    masks[3, 4:12, 0:8] = 1.0
    out, info = _run_composite(monkeypatch, masks, cuts=(2,))
    assert info["active"] == 4
    assert float(out[2, 4:12, 0:8].min()) > .5, "new shot's person must be pasted"
    assert float(out[2, 4:12, 8:16].max()) < .5, "the previous shot's silhouette must not leak"


def test_temporal_union_still_works_inside_one_shot(monkeypatch):
    """No cut: a pixel the person covered on the previous frame stays pasted (fast motion)."""
    masks = np.zeros((64, 16, 16), np.float32)
    masks[0, 4:12, 8:16] = 1.0
    masks[1, 4:12, 0:8] = 1.0      # moved quickly to the left inside the same shot
    masks[2, 4:12, 0:8] = 1.0
    masks[3, 4:12, 0:8] = 1.0
    out, _ = _run_composite(monkeypatch, masks, cuts=())
    assert float(out[1, 4:12, 8:16].max()) > .5, "union of the neighbouring masks is the point of temporal_expand"