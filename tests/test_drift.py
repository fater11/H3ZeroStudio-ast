"""Whole-film drift: trend-only vs per-scene levelling, measured on synthetic videos."""
import numpy as np
import pytest

from h3s import h3s_drift as D
from h3s import h3s_media as media

W, H = 96, 64


def _flat(level, n=24):
    return np.full((n, H, W, 3), float(level), dtype="float32")


def _ramp(start, step, n):
    """n кадров, яркость растёт на step с каждым кадром: gets the slow drift into a test clip."""
    return np.stack([np.full((H, W, 3), float(start + step * k), dtype="float32") for k in range(n)])


def test_measure_and_scene_bounds():
    frames = np.concatenate([_flat(0.2), _flat(0.5), _flat(0.8)])
    m = D.measure(frames)
    assert m["luma"][0] == pytest.approx(0.2, abs=0.01) and m["luma"][-1] == pytest.approx(0.8, abs=0.01)
    assert D.scene_bounds([24, 48], 72) == [(0, 24), (24, 48), (48, 72)]
    assert D.scene_bounds([2], 72) == [(0, 72)]        # too close to the start to be a cut
    assert D.scene_bounds([], 30) == [(0, 30)]


def test_trend_mode_flattens_a_ramp_but_keeps_a_flash():
    ramp = _ramp(0.4, 0.002, 80)
    flash = ramp.copy()
    flash[40:44] = 0.95                               # an intentional burst in the middle
    metrics = D.measure(flash)
    plan = D.offsets(metrics, mode="trend", bounds=[(0, len(flash))], trend_window=31)
    plan["p995"] = metrics["p995"]
    fixed = D.measure(D.apply_offsets(flash, plan))
    luma = np.asarray(fixed["luma"], dtype="float32")
    head = luma[5:35].mean()
    tail = luma[50:80].mean()
    assert abs(tail - head) < 0.03, (head, tail)            # the slow ramp is gone
    assert luma[41] - luma[20] > 0.3                        # the flash survives


def test_scenes_mode_levels_two_scenes_to_one_target():
    a, b = _ramp(0.45, 0.0005, 40), _ramp(0.62, 0.0005, 40)
    frames = np.concatenate([a, b])
    metrics = D.measure(frames)
    cut = len(a)
    for mode in ("scenes", "color"):
        plan = D.offsets(metrics, mode=mode, bounds=[(0, cut), (cut, len(frames))], trend_window=21)
        plan["p995"] = metrics["p995"]
        fixed = D.measure(D.apply_offsets(frames, plan))["luma"]
        first, second = np.mean(fixed[:cut]), np.mean(fixed[cut:])
        assert abs(first - second) < 0.04, (mode, first, second)
        assert abs(first - metrics["luma"][0]) < 0.35      # lifted, not crushed


def test_a_huge_gap_is_reported_not_forced():
    """Двукратная разница не вытягивается в один шаг: коэффициенты упираются в предел, остаток виден в отчёте."""
    frames = np.concatenate([_ramp(0.30, 0.001, 40), _ramp(0.75, 0.001, 40)])
    metrics = D.measure(frames)
    plan = D.offsets(metrics, mode="scenes", bounds=[(0, 40), (40, 80)], strength=1.0)
    gains = np.asarray(plan["gain"], dtype="float32")
    assert gains.min() <= D.DRIFT_LIMIT[0] + 1e-6 or gains.max() >= D.DRIFT_LIMIT[1] - 1e-6
    plan["p995"] = metrics["p995"]
    luma = np.asarray(D.measure(D.apply_offsets(frames, plan))["luma"], dtype="float32")
    assert abs(np.mean(luma[:40]) - np.mean(luma[40:])) > 0.05      # честный остаток, а не «исправлено»
    assert abs(np.mean(luma[:40]) - np.mean(luma[40:])) < abs(np.mean(metrics["luma"][:40]) - np.mean(metrics["luma"][40:]))


def test_trend_mode_keeps_the_scene_difference():
    a, b = _flat(0.35, 40), _flat(0.7, 40)
    frames = np.concatenate([a, b])
    metrics = D.measure(frames)
    plan = D.offsets(metrics, mode="trend", bounds=[(0, 40), (40, 80)], trend_window=21)
    plan["p995"] = metrics["p995"]
    luma = np.asarray(D.measure(D.apply_offsets(frames, plan))["luma"], dtype="float32")
    assert luma[40:].mean() - luma[:40].mean() > 0.15, luma[:5].mean()


def test_both_mode_removes_the_ramp_inside_a_scene():
    frames = np.concatenate([_ramp(0.44, 0.003, 40), _ramp(0.60, 0.003, 40)])
    metrics = D.measure(frames)
    plan = D.offsets(metrics, mode="both", bounds=[(0, 40), (40, 80)], trend_window=11)
    plan["p995"] = metrics["p995"]
    luma = np.asarray(D.measure(D.apply_offsets(frames, plan))["luma"], dtype="float32")
    assert abs(luma[:40].mean() - luma[40:].mean()) < 0.04          # scenes levelled
    assert abs(luma[35] - luma[5]) < 0.03                           # and the ramp inside the scene is gone
    assert abs(luma[:40].mean() - np.mean(metrics["luma"][:40])) > 0.02   # but it really was corrected


def test_gains_stay_inside_the_limit_and_near_clip_is_not_pushed():
    bright = np.concatenate([_flat(0.2, 20), _flat(0.99, 20)])
    metrics = D.measure(bright)
    plan = D.offsets(metrics, mode="scenes", bounds=[(0, 40)], strength=2.0)
    gains = D._soft_limit(plan["gain"], metrics["p995"], D.DRIFT_LIMIT)
    assert max(gains) <= D.DRIFT_LIMIT[1] + 1e-6 and min(gains) >= D.DRIFT_LIMIT[0] - 1e-6
    assert all(0.99 * g <= 1.0 + 1e-6 for g in gains[20:])


def test_strength_zero_changes_nothing():
    frames = np.concatenate([_flat(0.3, 20), _flat(0.8, 20)])
    assert len(frames) == 40
    metrics = D.measure(frames)
    plan = D.offsets(metrics, mode="scenes", bounds=[(0, 40)], strength=0.0)
    assert all(abs(g - 1.0) < 1e-9 for g in plan["gain"])


def _video(tmp_path, frames, name="clip.mp4"):
    import torch
    path = str(tmp_path / name)
    media.write_mp4(path, torch.from_numpy(np.asarray(frames, dtype="float32")), fps=24)
    return path


def test_analyze_video_reports_before_and_after(tmp_path):
    frames = np.concatenate([_ramp(0.28, 0.002, 30), _ramp(0.75, 0.002, 30)])
    src = _video(tmp_path, frames)
    got = D.analyze_video(src, side=64, cuts=[30], mode="scenes")
    assert got["sample"]["frames"] == 60 and len(got["gains"]) == 60
    rep = got["report"]
    assert rep["luma_spread_before"] > 0.45
    assert rep["luma_spread_after"] < rep["luma_spread_before"] * 0.45      # разброс падает вдвое
    assert D.DRIFT_LIMIT[0] - 1e-6 <= rep["gain_min"] <= rep["gain_max"] <= D.DRIFT_LIMIT[1] + 1e-6
    assert D.state_of(src)["frames"] == 60


def test_correct_video_writes_a_levelled_file(tmp_path):
    frames = np.concatenate([_ramp(0.42, 0.001, 30), _ramp(0.60, 0.001, 30)])
    src = _video(tmp_path, frames)
    dst = str(tmp_path / "fixed.mp4")
    res = D.correct_video(src, dst, mode="scenes", cuts=[30])
    assert res["frames"] == 60 and res["corrected_frames"] == 60
    after = media.load_video_frames(dst, 0, 60, W, H)
    luma = D.measure(after)["luma"]
    first, second = np.mean(luma[:30]), np.mean(luma[30:])
    assert abs(first - second) < 0.05, (first, second)               # одному уровню после правки
    before = D.measure(frames)["luma"]
    assert abs(first - np.mean(before[:30])) < 0.2


def test_correct_video_refuses_a_broken_source(tmp_path):
    bad = tmp_path / "nothing.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(Exception):
        D.correct_video(str(bad), str(tmp_path / "out.mp4"))
