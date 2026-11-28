"""Experimental ffmpeg pipe export: frame-exact overlaps, audio and no frame spool."""
import os
import torch

from h3s import h3s_media as media
from h3s import h3s_stream_export as pipe
from test_gen import dirs, patcher, project


def test_stream_export_direct_pipe_preserves_overlap_and_audio(tmp_path):
    first = torch.zeros(16, 64, 96, 3)
    second = torch.ones(16, 64, 96, 3) * 0.3
    path_a = str(tmp_path / "a.mp4")
    path_b = str(tmp_path / "b.mp4")
    target = str(tmp_path / "stream.mp4")
    media.write_mp4(path_a, first, fps=24)
    media.write_mp4(path_b, second, fps=24)
    plan = {"project_dir": str(tmp_path), "sources": [
        {"path": path_a, "frames": 16, "overlap": 0, "link": "start", "colour_key": None},
        {"path": path_b, "frames": 16, "overlap": 4, "link": "extend", "colour_key": None},
    ], "width": 96, "height": 64, "fps": 24, "frames": 28, "studio": False}
    audio = {"waveform": torch.zeros(1, 2, 56000), "sample_rate": 48000}
    seen = []
    preview = pipe.render(plan, target, audio, encoder="cpu",
                          progress=lambda done, total: seen.append((done, total)))
    assert os.path.isfile(target)
    info = media.video_info(target)
    assert info["frames"] == 28
    assert info["has_audio"]
    assert preview.shape == (1, 64, 96, 3)
    assert seen[-1] == (28, 28)
    assert not list(tmp_path.glob(".h3zs_pipe_export_*"))
    assert not list(tmp_path.rglob("h3zs_stitch_frames_*"))


def test_studio_pipe_encodes_the_prepared_colour_cache(tmp_path):
    """С цветокоррекцией поток берёт готовый RGB8-слой отрезка, а не мастер."""
    from h3s import h3s_studio_cache as studio_cache

    master = torch.zeros(8, 64, 96, 3)
    graded = torch.zeros(8, 64, 96, 3)
    graded[..., 0] = 0.85          # warm grade: clearly different from the black master
    graded[..., 1] = 0.10
    graded[..., 2] = 0.10
    path = str(tmp_path / "master.mp4")
    media.write_mp4(path, master, fps=24)
    studio_cache.save(str(tmp_path), "colour-key", graded)
    assert studio_cache.path_for(str(tmp_path), "colour-key")
    plan = {"project_dir": str(tmp_path), "sources": [
        {"path": path, "frames": 8, "overlap": 0, "link": "start", "colour_key": "colour-key"}],
        "width": 96, "height": 64, "fps": 24, "frames": 8, "studio": True}
    target = str(tmp_path / "studio.mp4")
    preview = pipe.render(plan, target, {"waveform": torch.zeros(1, 2, 16000), "sample_rate": 48000},
                          encoder="cpu")
    assert os.path.isfile(target) and media.video_info(target)["frames"] == 8
    assert float(preview[..., 0].mean()) > 0.5      # the graded red, not the master's black
    assert float(preview[..., 1].mean()) < 0.3


def test_pipe_respects_end_marker_without_loading_later_scene(tmp_path, monkeypatch):
    first = torch.zeros(24, 64, 96, 3)
    second = torch.ones(24, 64, 96, 3)
    a, b = str(tmp_path / "head.mp4"), str(tmp_path / "tail.mp4")
    media.write_mp4(a, first, fps=24)
    media.write_mp4(b, second, fps=24)
    plan = {"project_dir": str(tmp_path), "sources": [
        {"path": a, "frames": 24, "overlap": 0, "link": "start", "colour_key": None},
        {"path": b, "frames": 24, "overlap": 0, "link": "start", "colour_key": None},
    ], "width": 96, "height": 64, "fps": 24, "frames": 18, "studio": False}

    real_read = media.read_frames
    def no_second_scene(path, *args, **kwargs):
        assert str(path) != b, "end marker should prevent opening later scenes"
        return real_read(path, *args, **kwargs)
    monkeypatch.setattr(media, "read_frames", no_second_scene)
    audio = {"waveform": torch.zeros(1, 2, 36000), "sample_rate": 48000}
    destination = str(tmp_path / "cut.mp4")
    pipe.render(plan, destination, audio)
    assert media.video_info(destination)["frames"] == 18


def test_stream_export_nvenc_on_real_gpu(tmp_path):
    first = torch.zeros(8, 360, 640, 3)
    path = str(tmp_path / "gpu_source.mp4")
    target = str(tmp_path / "gpu_pipe.mp4")
    media.write_mp4(path, first, fps=24)
    plan = {"project_dir": str(tmp_path), "sources": [
        {"path": path, "frames": 8, "overlap": 0, "link": "start", "colour_key": None},
    ], "width": 640, "height": 360, "fps": 24, "frames": 8, "studio": False}
    audio = {"waveform": torch.zeros(1, 1, 16000), "sample_rate": 48000}
    pipe.render(plan, target, audio, encoder="nvenc")
    assert media.video_info(target)["frames"] == 8


def test_pipe_preflight_rejects_complex_processing_without_losing_modules(tmp_path):
    from h3s import h3s_core as core

    for field, value in (
        ("fr", {"enabled": True}),
        ("ar", {"enabled": True}),
        ("upscale", {"method": "learned"}),
        ("source", {"denoise": 0, "file": "footage.mp4"}),
        ("freeze", {"key": "held_take"}),
    ):
        p = core.normalize_project(project(id="pipe_preflight_" + field))
        p["segments"][0][field] = value
        items = core.plan(p)
        plan, reason = pipe.prepare(str(tmp_path), p, ["a", "b"], items, 96, 64, 24)
        assert plan is None, f"{field} must use H3's compatible assembly path"
        assert reason


def test_pipe_export_falls_back_when_take_master_is_missing(patcher, dirs, monkeypatch):
    from fakes import FakeClip, FakeVAE, FakeAudioVAE
    from pathlib import Path
    from h3s import h3s_gen as gen, h3s_store as store

    p = project(id="pipe_missing_master")
    p["run"] = {"operation": "generate"}
    _, _, _, generated = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    out, _ = dirs
    project_dir = Path(out) / "h3labstudio" / p["id"]
    store_master = Path(store.master_path(str(project_dir), generated["keys"][0], 96, 64))
    assert store_master.is_file()
    store_master.unlink()  # only fixture-generated file, never a user's cache

    def no_sample(*args, **kwargs):
        raise AssertionError("A cached Save must not regenerate diffusion latents")

    monkeypatch.setattr(gen, "sample_segment", no_sample)
    p["run"] = {"operation": "assemble", "export_pipe": True}
    _, _, _, result = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert result["full"]["export_pipe"] is True
    assert result["full"]["export_pipe_used"] is False
    ref = result["full"]["video"]
    assert (Path(out) / ref["subfolder"] / ref["filename"]).is_file()
