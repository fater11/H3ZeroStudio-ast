"""v6n: the console says which references a segment really passes ('[H3ZS] refs: …'); frames mode lists the frames."""
import torch

from h3s import h3s_core as core
from h3s import h3s_gen as gen

ASSETS = [{"id": "a1", "file": "a.png", "category": "character", "name": "A"},
          {"id": "a2", "file": "b.png", "category": "location", "name": "B"},
          {"id": "v2", "file": "walk.mp4", "category": "video", "name": "Walk", "duration": 10}]


def _p(refs, kf=None):
    seg = {"id": "s1", "frames": 121, "refs": list(refs)}
    if kf:
        seg["kf"] = kf
    return core.normalize_project({"id": "t", "assets": ASSETS, "segments": [seg]})


def test_refs_line():
    img, vid = [torch.zeros(1, 8, 8, 3)], [torch.zeros(22, 8, 8, 3)]
    assert gen.refs_line(_p(["a1", "v2"]), 0, "t2v", img, vid, None, {}, False) == "refs: 1 images (A), 1 videos («Walk» 22 fr)"
    assert gen.refs_line(_p(["a1"]), 0, "t2v", img, None, None, {}, False) == "refs: 1 images (A), 0 videos"
    p = _p(["a1"], {"mode": "flf", "first": "a1", "last": "a2"})
    kmode = core.kf_mode(p, p["segments"][0])
    assert kmode != "t2v"
    assert gen.refs_line(p, 0, kmode, [], None, None, {}, False) == f"refs: 0 images (A), 0 videos, FLF/keyframes mode {kmode}"
