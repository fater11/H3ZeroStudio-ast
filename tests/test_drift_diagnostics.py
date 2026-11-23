"""Read-only drift monitoring: no ComfyUI model or GPU required."""
import torch
from h3s import h3s_diagnostics as diag


def _frames(n=32, h=64, w=64):
    y = torch.linspace(0.1, 0.8, w)[None, None, :, None]
    return y.repeat(n, h, 1, 3).clone()


def test_identical_clips_have_no_relative_drift():
    clip = _frames()
    a = diag.clip_signature(clip)
    b = diag.clip_signature(clip, skip=5)
    change = diag.compare_signatures(a, b)
    assert change["luma_delta"] == 0
    assert change["contrast_ratio"] == 1.0
    assert change["detail_ratio"] == 1.0
    assert change["rgb_delta"] == [0.0] * 3


def test_brightness_shift_is_measured_not_corrected():
    original = _frames()
    modified = (original + 0.07).clamp(0, 1)
    before = original.clone()
    a = diag.clip_signature(original)
    b = diag.clip_signature(modified)
    change = diag.compare_signatures(a, b)
    assert 0.065 < change["luma_delta"] < 0.075
    assert change["contrast_ratio"] == 1.0
    assert torch.equal(before, original)


def test_overlap_is_excluded_from_signature():
    base = _frames()
    shifted = base.clone()
    shifted[:8] += 0.18
    assert diag.clip_signature(base)["luma"] == diag.clip_signature(shifted, skip=8)["luma"]
    assert diag.clip_signature(base)["luma"] != diag.clip_signature(shifted)["luma"]


def test_invalid_and_flat_cases_have_no_misleading_ratios():
    assert diag.clip_signature(torch.zeros(2, 2)) is None
    flat = diag.clip_signature(torch.ones(8, 16, 16, 3) * 0.5)
    diff = diag.compare_signatures(flat, flat)
    assert diff["contrast_ratio"] is None and diff["detail_ratio"] is None
    assert diag.compare_signatures(None, flat) is None
