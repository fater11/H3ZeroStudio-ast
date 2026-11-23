"""Saving from cached takes must not require duplicate MP4 previews; video encoding reports progress."""
import os
import torch

from h3s import h3s_media as media
from h3s import h3s_gen as gen


def test_final_mp4_reports_encoded_frame_progress(tmp_path):
    frames = torch.zeros(22, 48, 64, 3)
    frames[:, :, :, 0] = torch.linspace(0, 1, 22)[:, None, None]
    path = tmp_path / "final.mp4"
    updates = []
    media.write_mp4(str(path), frames, fps=24, progress=lambda done, total: updates.append((done, total)))
    assert path.is_file()
    assert updates and updates[-1] == (22, 22)
    assert media.video_info(str(path))["frames"] == 22


def test_progress_callback_failure_never_breaks_export(tmp_path):
    frames = torch.zeros(22, 48, 64, 3)
    path = tmp_path / "safe.mp4"
    def broken(_done, _total):
        raise RuntimeError("UI listener went away")
    media.write_mp4(str(path), frames, progress=broken)
    assert path.is_file()


def test_assembly_skips_editor_mp4_when_existing_preview_can_be_reused(tmp_path):
    frames = torch.zeros(22, 48, 64, 3)
    fake_project = {"settings": {}}
    result = gen.segment_media(str(tmp_path), "demo", "assembled", frames, None, None, None,
                               fake_project, {"frames": 22}, 24, skip_mp4=True)
    assert not os.path.isfile(tmp_path / "seg_assembled.mp4")
    assert os.path.isfile(tmp_path / "seg_assembled_tiles.jpg")
    assert os.path.isfile(tmp_path / "seg_assembled_poster.jpg")
    assert result["video"]["filename"] == "seg_assembled.mp4"


def test_nvenc_ffmpeg_h264_is_usable_on_this_machine(tmp_path):
    """Opt-in GPU encoder: do not enable the UI unless it produces a playable MP4."""
    frames = torch.zeros(22, 360, 640, 3)
    frames[..., 1] = torch.linspace(0, 1, 22)[:, None, None]
    path = tmp_path / "nvenc.mp4"
    seen = []
    media.write_mp4(str(path), frames, fps=24, encoder="nvenc", crf=16,
                    progress=lambda done, total: seen.append((done, total)))
    assert seen and seen[-1] == (22, 22)
    assert path.is_file()
    info = media.video_info(str(path))
    assert info["frames"] == 22 and (info["width"], info["height"]) == (640, 360)


def test_ffmpeg_concat_joins_hard_cut_masters_without_video_reencode(tmp_path):
    """FFmpeg concat is independent of NVENC and keeps the final mixed sound."""
    import av

    a = torch.zeros(12, 48, 64, 3)
    b = torch.ones(10, 48, 64, 3) * 0.3
    first, second, target = (str(tmp_path / n) for n in ("first.mp4", "second.mp4", "joined.mp4"))
    media.write_mp4(first, a, fps=24, pix_fmt="yuv444p", preset="fast", crf=12)
    media.write_mp4(second, b, fps=24, pix_fmt="yuv444p", preset="fast", crf=12)
    sound = torch.zeros(2, round(22 / 24 * 48000))
    updates = []
    media.ffmpeg_concat_masters([first, second], target, 24, 22, sound, 48000,
                                encoder="cpu", progress=lambda done, total: updates.append((done, total)))
    assert os.path.isfile(target)
    info = media.video_info(target)
    assert info["frames"] == 22 and info["has_audio"]
    assert updates and updates[-1] == (22, 22)
    with av.open(target) as container:
        assert sum(1 for _ in container.decode(video=0)) == 22


def test_ffmpeg_concat_and_nvenc_can_be_enabled_together(tmp_path):
    """FFmpeg joins the streams while NVENC independently re-encodes the output."""
    a = torch.zeros(7, 360, 640, 3)
    b = torch.ones(7, 360, 640, 3) * 0.4
    first, second, target = (str(tmp_path / n) for n in ("nv_first.mp4", "nv_second.mp4", "nv_joined.mp4"))
    media.write_mp4(first, a, fps=24, pix_fmt="yuv444p", preset="fast", crf=12)
    media.write_mp4(second, b, fps=24, pix_fmt="yuv444p", preset="fast", crf=12)
    media.ffmpeg_concat_masters([first, second], target, 24, 14, encoder="nvenc")
    assert media.video_info(target)["frames"] == 14


def test_ffmpeg_concat_rejects_inexact_master_lengths(tmp_path):
    frames = torch.zeros(12, 48, 64, 3)
    first = str(tmp_path / "one.mp4")
    media.write_mp4(first, frames, fps=24, pix_fmt="yuv444p", preset="fast", crf=12)
    try:
        media.ffmpeg_concat_masters([first], str(tmp_path / "wrong.mp4"), 24, 20)
    except ValueError as error:
        assert "frames" in str(error)
    else:
        raise AssertionError("non-frame-exact concat was not rejected")
