"""Fast editor preview resizing preserves near-Pillow pixels and never changes masters."""
import av
import numpy as np
from PIL import Image
import torch

from h3s import h3s_media as media


def _frames():
    torch.manual_seed(11)
    # Comfy VAE returns a non-contiguous FHWC view over planar FCHW storage.
    x = torch.rand(6, 3, 135, 77).permute(0, 2, 3, 1)
    assert not x.is_contiguous()
    return x


def _check_video(path, width, height, frames=6, has_audio=False):
    with av.open(str(path)) as container:
        st = container.streams.video[0]
        assert (st.width, st.height) == (width, height)
        assert sum(1 for _ in container.decode(video=0)) == frames
        assert bool(container.streams.audio) is has_audio


def test_batch_antialias_matches_pillow_to_one_rgb_level(tmp_path, monkeypatch):
    captured = []
    sizes = []
    original_frame = media.video_frame
    original_uint8 = media.to_uint8

    def capture(arr, pix_fmt="yuv420p"):
        captured.append(arr.copy())
        return original_frame(arr, pix_fmt)

    def sized_uint8(frames, *args, **kw):
        sizes.append(tuple(frames.shape))
        return original_uint8(frames, *args, **kw)

    monkeypatch.setattr(media, "video_frame", capture)
    monkeypatch.setattr(media, "to_uint8", sized_uint8)
    frames = _frames()
    path = tmp_path / "editor_preview.mp4"
    media.write_mp4(str(path), frames, fps=12, max_edge=96, crf=22, preset="superfast")
    assert len(captured) == 6
    assert all(im.shape == (96, 54, 3) for im in captured)
    assert all(s[1:3] == (96, 54) for s in sizes)  # never quantize original 135x77 here
    old_u8 = original_uint8(frames)
    for a, raw in zip(old_u8, captured):
        expected = np.asarray(Image.fromarray(a).resize((54, 96), Image.BILINEAR))
        assert np.abs(raw.astype(np.int16) - expected.astype(np.int16)).max() <= 2
    _check_video(path, 54, 96)


def test_pillow_fallback_when_batch_resize_unavailable(tmp_path, monkeypatch):
    import torch.nn.functional as F
    original_frame = media.video_frame
    captured = []

    def capture(arr, pix_fmt="yuv420p"):
        captured.append(arr.copy())
        return original_frame(arr, pix_fmt)

    def broken(*args, **kw):
        raise RuntimeError("simulated old torch without antialiased resize")

    monkeypatch.setattr(F, "interpolate", broken)
    monkeypatch.setattr(media, "video_frame", capture)
    frames = _frames()
    path = tmp_path / "fallback.mp4"
    media.write_mp4(str(path), frames, fps=12, max_edge=96)
    expected = np.asarray(Image.fromarray(media.to_uint8(frames[:1])[0]).resize((54, 96), Image.BILINEAR))
    assert np.array_equal(captured[0], expected)
    _check_video(path, 54, 96)


def test_master_original_resolution_and_audio(tmp_path):
    path = tmp_path / "master.mp4"
    media.write_mp4(str(path), _frames(), fps=12, waveform=torch.zeros(2, 16000),
                    sample_rate=32000, crf=12, pix_fmt="yuv444p")
    with av.open(str(path)) as container:
        assert container.streams.video[0].format.name == "yuv444p"
    _check_video(path, 76, 134, has_audio=True)


def test_large_preview_respects_float_memory_budget(tmp_path, monkeypatch):
    # Simulate a low-memory machine without allocating real 4K frames.
    monkeypatch.setattr(media, 'PREVIEW_BATCH_BYTES', 260000)
    observed = []
    original = media.to_uint8

    def counted(frames, *args, **kwargs):
        observed.append(int(frames.shape[0]))
        return original(frames, *args, **kwargs)

    monkeypatch.setattr(media, 'to_uint8', counted)
    path = tmp_path / 'memory_limited_preview.mp4'
    media.write_mp4(str(path), _frames(), fps=12, max_edge=96)
    assert observed == [2, 2, 2]
    _check_video(path, 54, 96)
