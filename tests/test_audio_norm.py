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

def _speech_with_floor(noise=0.005, seconds=6.0, rate=48000):
    import torch
    n = int(rate * seconds)
    t = torch.arange(n).float() / rate
    on = (torch.arange(n) // rate % 2 == 0).float()
    torch.manual_seed(1)
    signal = (0.7 * torch.sin(2 * math.pi * 250 * t) * on + noise * torch.randn(n))[None, None]
    return signal.repeat(1, 2, 1), on.bool()


def _rms_db(x):
    return 20 * math.log10(max(float(x.pow(2).mean().sqrt()), 1e-12))


def test_gate_pushes_the_pause_floor_down_and_leaves_speech():
    wave, on = _speech_with_floor()
    out = media.normalize_audio(wave, 48000, "off", gate={"threshold": -40.0, "depth": 20.0}, limiter=True)
    speech_before, speech_after = _rms_db(wave[0, 0][on]), _rms_db(out[0, 0][on])
    floor_before, floor_after = _rms_db(wave[0, 0][~on]), _rms_db(out[0, 0][~on])
    assert abs(speech_after - speech_before) < 1.0        # речь не тронута
    assert floor_before - floor_after > 8.0               # пауза ушла вниз
    assert (speech_after - floor_after) - (speech_before - floor_before) > 8.0


def test_gate_stays_open_on_a_loud_floor():
    wave, on = _speech_with_floor(noise=0.08)
    out = media.normalize_audio(wave, 48000, "off", gate={"threshold": -40.0, "depth": 20.0}, limiter=True)
    assert abs(_rms_db(out[0, 0][on]) - _rms_db(wave[0, 0][on])) < 1.0


def test_limiter_takes_down_only_the_hot_peak():
    import torch
    n = 48000 * 3
    t = torch.arange(n).float() / 48000
    quiet = 0.10 * torch.sin(2 * math.pi * 200 * t)
    quiet[10000:10060] = 1.00                             # один горячий транзиент на всю шкалу
    wave = quiet[None, None].repeat(1, 2, 1)
    limited = media.normalize_audio(wave, 48000, "lufs-14", limiter=True)
    plain = media.normalize_audio(wave, 48000, "lufs-14", limiter=False)
    assert -1.6 < _db(limited) < -0.9                     # пик срезан до потолка (блоки по 2 мс, без клиппинга)
    assert _db(plain) > _db(limited) + 3.0                 # без лимитера он был сильно выше
    body = slice(15000, None)
    assert abs(_rms_db(limited[0, 0][body]) - _rms_db(plain[0, 0][body])) < 0.3   # остальной фильм не понижен


def test_limiter_is_a_no_op_below_the_ceiling():
    wave = _sine(0.25)
    out = media.normalize_audio(wave, 48000, "off", gate=None, limiter=True)
    assert torch.allclose(out, wave, atol=1e-6)

def test_denoise_lifts_the_floor_and_spares_speech():
    wave, on = _speech_with_floor(noise=0.03)
    out = media.audio_denoise(wave, 48000, "medium")
    speech_before, speech_after = _rms_db(wave[0, 0][on]), _rms_db(out[0, 0][on])
    floor_before, floor_after = _rms_db(wave[0, 0][~on]), _rms_db(out[0, 0][~on])
    assert abs(speech_after - speech_before) < 1.0          # речь на месте
    assert floor_before - floor_after > 2.0                 # фон вычтен
    assert (speech_after - floor_after) > (speech_before - floor_before) + 2.0


def test_denoise_modes_are_ordered_and_off_is_a_no_op():
    wave, _on = _speech_with_floor(noise=0.03)
    floors = [_rms_db(media.audio_denoise(wave, 48000, m)[0, 0][~_on]) for m in ("light", "medium", "strong")]
    assert floors[0] > floors[1] > floors[2]            # сильнее режим — ниже фон
    assert torch.equal(media.audio_denoise(wave, 48000, "off"), wave)