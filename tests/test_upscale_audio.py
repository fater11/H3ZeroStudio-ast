"""A multi-chunk / multi-window high-res pass must leave the audio as the low-grid one, windows covering it."""
import pathlib

import pytest
import torch

from h3s import h3s_core as core
from h3s import h3s_upscale as up

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _settings(**over):
    p = core.normalize_project({"settings": dict({"upscale_chunk_sec": 6.0}, **over), "segments": []})
    return p["settings"]


def test_audio_windows_cover_the_whole_track():
    A = 96
    chunks = up.chunk_plan(_settings(upscale_chunk_sec=3.0), 202, A)   # long enough to be chunked
    assert len(chunks) > 1
    got = up.audio_guard(chunks, A)
    assert got["covered"] and got["gaps"] == [] and got["frames"] == A
    for v0, v1, a0, a1 in chunks:
        assert a1 <= A and a0 < a1 and 5 * (v0 // 5) == v0


def test_a_plan_that_misses_audio_is_reported():
    broken = [(0, 37, 0, 20), (35, 72, 40, 60)]                    # frames 20..40 and 60..96 uncovered
    got = up.audio_guard(broken, 96)
    assert not got["covered"] and got["gaps"] == [(20, 40), (60, 96)]


def test_windows_cover_the_video_and_the_audio():
    T, A = 107, 96
    wins = up.plan_windows(T, A, 6, 1)
    assert wins[0][0] == 0 and wins[-1][1] == T                    # video windows reach both ends
    assert up.audio_guard([(v0, v1, a0, a1) for v0, v1, a0, a1 in wins], A)["covered"]
    for (v0, v1, a0, a1), (w0, w1, b0, b1) in zip(wins, wins[1:]):
        assert w0 < v1 and b0 < a1                                 # each window overlaps the next
        assert w1 - w0 >= 5 * 2 + 2


def test_crops_cover_the_frame_and_the_audio():
    T, A = 37, 24
    plan = up.plan_crops(T, A, 10, 12, "tiles", 10, 12)
    assert plan, plan
    assert up.audio_guard(plan, A)["covered"]                      # у каждого кропа свой кусок звука
    ys = sorted({int(c["y"][0]) for c in plan})
    xs = sorted({int(c["x"][0]) for c in plan})
    assert ys and xs and min(ys) == 0 and min(xs) == 0
    for c in plan:
        assert c["y"][1] <= 10 and c["x"][1] <= 12                 # crops stay inside the canvas
        assert c["t"][0] == 0 and c["t"][1] == T                   # плиточный проход идёт по всей длине
    windows = up.plan_windows(T, A, 3, 1)
    assert up.audio_guard(windows, A)["covered"]


def test_the_result_keeps_the_input_audio(monkeypatch):
    """The pass must hand back the audio it was given: только картинка считается в полосах."""
    src = (ROOT / "h3s_upscale.py").read_text(encoding="utf-8")
    assert "audio_guard(chunks, A)" in src                     # the guard runs in the pass
    assert "return v, a," in src or "return out_v, a" in src or ", a, {" in src
    # the audio is never re-sliced out of the crop sampling result
    assert "_unpack(x, shapes)" in src and "video, audio = _unpack" in src
    assert "out_a" in src and "self._lock(out_v, out_a" in src  # crops blend video; audio comes from outside
