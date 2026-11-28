"""Settings → звук → «Громкость фильма»: нормализация итогового микса (peak / LUFS)."""
import math

import pytest
import torch

from h3s import h3s_media as media


def _sine(peak, seconds=3.0, rate=48000):
    t = torch.arange(int(rate * seconds)).float() / rate
    mono = (peak * torch.sin(2 * math.pi * 220 * t))[None, None]
    return mono.repeat(1, 2, 1)


def _db(x):
    return 20 * math.log10(max(float(x.abs().max()), 1e-12))


def test_off_returns_the_same_waveform():
    wave = _sine(0.05)
    assert media.normalize_audio(wave, 48000, "off") is wave or torch.equal(
        media.normalize_audio(wave, 48000, "off"), wave)


def test_peak_lifts_the_loudest_sample_to_the_ceiling():
    out = media.normalize_audio(_sine(0.05), 48000, "peak")
    assert -1.05 < _db(out) < -0.95


def test_peak_leaves_silence_alone():
    silence = torch.zeros(1, 2, 48000)
    assert float(media.normalize_audio(silence, 48000, "peak").abs().max()) == 0.0


@pytest.mark.parametrize("mode,target", [("lufs-14", -14.0), ("lufs-16", -16.0)])
def test_lufs_modes_hit_their_integrated_target(mode, target):
    out = media.normalize_audio(_sine(0.05), 48000, mode)
    measured = media._integrated_lufs(out, 48000)
    assert measured is not None and abs(measured - target) < 1.0
    assert _db(out) <= -0.9          # and the top stays under the ceiling


def test_loud_source_is_turned_down_without_clipping():
    out = media.normalize_audio(_sine(0.95), 48000, "lufs-14")
    assert _db(out) <= -0.9
    assert abs(media._integrated_lufs(out, 48000) + 14.0) < 1.0


def test_unknown_mode_is_a_no_op():
    wave = _sine(0.05)
    assert torch.equal(media.normalize_audio(wave, 48000, "weird"), wave)