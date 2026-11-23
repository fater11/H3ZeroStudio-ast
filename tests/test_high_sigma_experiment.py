"""Offline, GPU-free validation of the experimental MiniMax H3 pass-2 sigma curve.

Run: H:/ComfyUI-Easy-Install/python_embeded/python.exe -m pytest tests/test_high_sigma_experiment.py -q
"""
import importlib.util
from pathlib import Path

import pytest
import torch


PATH = Path(__file__).resolve().parents[1] / "h3s_luna" / "high_sigma_experiment.py"
SPEC = importlib.util.spec_from_file_location("h3s_high_sigma_experiment", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
reshape = MODULE.frontload_high_sigmas


def test_three_steps_preserve_budget_and_denoise():
    original = torch.tensor([0.30946, 0.1719, 0.0569, 0.0], dtype=torch.float32)
    copy = original.clone()
    result = reshape(original)
    assert torch.equal(original, copy)
    assert result.dtype == original.dtype
    assert result.shape == original.shape
    assert result[0] == original[0]
    assert result[-2] == original[-2]
    assert result[-1] == original[-1]
    assert 0.125 < float(result[1]) < 0.155
    assert result[1] < original[1]
    assert bool(torch.all(result[1:] < result[:-1]))


def test_short_schedules_are_unchanged():
    for values in ([0.3, 0.0], [0.3, 0.08, 0.0]):
        original = torch.tensor(values)
        result = reshape(original)
        assert result.data_ptr() != original.data_ptr()
        assert torch.equal(result, original)


def test_long_schedule_monotonic():
    original = torch.tensor([0.5, 0.37, 0.26, 0.16, 0.07, 0.0])
    result = reshape(original)
    assert result[0] == original[0] and result[-2] == original[-2]
    assert bool(torch.all(result[1:] < result[:-1]))


@pytest.mark.parametrize("values", [
    [0.3, 0.3, 0.0], [0.3, 0.5, 0.0], [0.3, 0.1, 0.04],
    [0.3, 0.1, -0.01], [float("nan"), 0.1, 0.0],
])
def test_reject_invalid_schedules(values):
    with pytest.raises(ValueError):
        reshape(torch.tensor(values))


@pytest.mark.parametrize("rho", [0, -1, 101, float("nan")])
def test_reject_bad_rho(rho):
    with pytest.raises(ValueError):
        reshape(torch.tensor([0.3, 0.1, 0.0]), rho=rho)


def test_ab_cache_is_separate_and_default_unchanged():
    from h3s import h3s_core as core
    from test_control import project
    sample = core.normalize_project(project())
    sample["settings"]["final_mode"] = "luna"
    sample["settings"]["lowhigh_denoise"] = 0.4
    normal = core.segment_keys(sample, env_sig="same-model", kind="full")
    sample["settings"]["_ab_high_sigmas"] = "karras7"
    experimental = core.segment_keys(sample, env_sig="same-model", kind="full")
    assert normal != experimental
    assert len(normal) == len(experimental)
    sample["settings"].pop("_ab_high_sigmas")
    assert core.segment_keys(sample, env_sig="same-model", kind="full") == normal


def test_public_karras_setting_is_opt_in_and_cache_isolated():
    from h3s import h3s_core as core
    from test_control import project
    sample = core.normalize_project(project())
    sample["settings"]["final_mode"] = "luna"
    assert sample["settings"]["high_sigma_schedule"] == "default"
    normal = core.segment_keys(sample, env_sig="same-model", kind="full")
    sample["settings"]["high_sigma_schedule"] = "karras7"
    enhanced = core.normalize_project(sample)
    assert enhanced["settings"]["high_sigma_schedule"] == "karras7"
    assert core.segment_keys(enhanced, env_sig="same-model", kind="full") != normal
    enhanced["settings"]["high_sigma_schedule"] = "default"
    assert core.segment_keys(enhanced, env_sig="same-model", kind="full") == normal
