"""Regression checks for independent generation, Studio colour and assembly."""
from pathlib import Path

import pytest

from test_gen import dirs, patcher, project
from fakes import FakeClip, FakeVAE, FakeAudioVAE
from h3s import h3s_gen as gen


def test_fast_generation_does_not_read_old_rgb(patcher, dirs, monkeypatch):
    from h3s import h3s_store as store

    p = project(id="split_gen")
    p["settings"]["continuation_method"] = "h3studio"
    vae = FakeVAE()
    gen.run_project(patcher, FakeClip(), vae, p, FakeAudioVAE())
    p["segments"].append({"id": "s3", "frames": 39, "prompt": "three", "refs": ["a1"]})
    p["run"] = {"operation": "generate"}
    original = store.load_master
    reads = []

    def watched(d, key, *args, **kw):
        reads.append(key)
        return original(d, key, *args, **kw)

    monkeypatch.setattr(store, "load_master", watched)
    clip = FakeClip()
    frames, audio, latent, info = gen.run_project(patcher, clip, vae, p, FakeAudioVAE())
    assert info["operation"] == "generate"
    assert info["full"] is None
    assert [r["index"] for r in info["segments"]] == [2]
    assert len(clip.calls) == 1
    assert frames.shape[0] == 1
    assert reads == [], "Existing studio clips must not be decoded to continue"
    assert latent["samples"].unbind()[0].shape[2] > 0
    assert audio["waveform"].shape[0] == 1


def test_colour_then_assemble_without_sampling(patcher, dirs, monkeypatch):
    p = project(id="split_colour")
    p["settings"]["continuation_method"] = "h3studio"
    vae = FakeVAE()
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), vae, p, FakeAudioVAE())

    def no_sample(*args, **kwargs):
        raise AssertionError("Post-production attempted diffusion sampling")

    monkeypatch.setattr(gen, "sample_segment", no_sample)
    p["run"] = {"operation": "colour"}
    colour_frames, _, _, colour_info = gen.run_project(patcher, FakeClip(), vae, p, FakeAudioVAE())
    assert colour_info["operation"] == "colour"
    assert colour_info["full"] is None
    assert colour_frames.shape[0] == 1
    output_dir, _ = dirs
    colour_cache = Path(output_dir) / "h3labstudio" / p["id"] / "cache" / "studio_rgb8"
    assert len(list(colour_cache.glob("*.zip"))) == 2

    p["run"] = {"operation": "assemble"}
    assembled, _, _, info = gen.run_project(patcher, FakeClip(), vae, p, FakeAudioVAE())
    assert assembled.shape[0] > 1
    assert info["full"] is not None and info["full"]["partial"] is False
    assert info["operation"] == "assemble", "Save needs the completion operation to trigger export"
    assert all(x["cached"] for x in info["segments"])


def test_export_colour_switch_works_outside_studio_without_sampling(patcher, dirs, monkeypatch):
    """Save-time Lab colour is opt-in in every mode; original take latents are untouched."""
    from h3s import h3s_core as core

    p = project(id="split_export_colour")
    p["settings"]["continuation_method"] = "overlap"
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())

    def no_sample(*args, **kwargs):
        raise AssertionError("Saving video must not invoke diffusion")

    monkeypatch.setattr(gen, "sample_segment", no_sample)
    p["run"] = {"operation": "colour", "export_colour": True}
    assert core.normalize_project(p)["run"]["export_colour"] is True
    _, _, _, prepared = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert prepared["operation"] == "colour"
    assert prepared["full"] is None
    assert p["settings"]["continuation_method"] == "overlap"

    p["run"] = {"operation": "assemble", "export_colour": True}
    _, _, _, graded = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert graded["full"]["export_colour"] is True
    assert graded["full"]["partial"] is False

    p["run"] = {"operation": "assemble", "export_colour": False}
    assert core.normalize_project(p)["run"]["export_colour"] is False
    _, _, _, raw = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert raw["full"]["export_colour"] is False
    assert raw["full"]["key"] != graded["full"]["key"]
    assert raw["full"]["video"]["filename"] != graded["full"]["video"]["filename"]


def test_colour_partial_clip_export_needs_only_ready_prefix(patcher, dirs, monkeypatch):
    """Saving clip 1 with Lab colour must not require or generate later clips."""
    p = project(id="split_export_clip")
    p["run"] = {"operation": "generate", "upto": 0}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())

    def no_sample(*args, **kwargs):
        raise AssertionError("Clip export attempted diffusion")

    monkeypatch.setattr(gen, "sample_segment", no_sample)
    p["run"] = {"operation": "colour", "export_colour": True, "upto": 0}
    _, _, _, prepared = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert prepared["operation"] == "colour"
    assert len(prepared["segments"]) == 1

    p["run"] = {"operation": "assemble", "export_colour": True, "upto": 0}
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert info["full"]["export_colour"] is True
    assert info["full"]["partial"] is True
    assert len(info["segments"]) == 1


def test_studio_export_without_colour_skips_rgb_processing(patcher, dirs, monkeypatch):
    p = project(id="split_export_raw")
    p["settings"]["continuation_method"] = "h3studio"
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())

    def no_sample(*args, **kwargs):
        raise AssertionError("Raw export must not invoke diffusion")

    monkeypatch.setattr(gen, "sample_segment", no_sample)
    p["run"] = {"operation": "assemble", "export_colour": False}
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert info["full"]["export_colour"] is False
    assert info["operation"] == "assemble"


def test_assemble_refuses_missing_av(patcher, dirs):
    p = project(id="split_missing")
    p["run"] = {"operation": "assemble"}
    with pytest.raises(ValueError, match="AV-кэша"):
        gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())


def test_fast_overlap_uses_only_last_anchor(patcher, dirs, monkeypatch):
    import torch
    from h3s import h3s_store as store

    p = project(id="split_overlap")
    p["settings"]["continuation_method"] = "overlap"
    vae = FakeVAE()
    _, _, _, initial = gen.run_project(patcher, FakeClip(), vae, p, FakeAudioVAE())
    p["segments"].append({"id": "s3", "frames": 39, "prompt": "three", "refs": ["a1"]})
    p["run"] = {"operation": "generate"}
    reads = []
    original = store.load_master

    def watched(d, key, *args, **kwargs):
        reads.append(key)
        return original(d, key, *args, **kwargs)

    monkeypatch.setattr(store, "load_master", watched)
    clip = FakeClip()
    _, _, latent, info = gen.run_project(patcher, clip, vae, p, FakeAudioVAE())
    assert [r["index"] for r in info["segments"]] == [2]
    assert len(clip.calls) == 1
    assert reads == [initial["keys"][-1]]
    assert not any(k in reads for k in initial["keys"][:-1])
    out, _ = dirs
    cached = torch.load(Path(out) / "h3labstudio" / p["id"] / "cache" / ("seg_" + initial["keys"][-1] + ".pt"), weights_only=True)
    new_video = latent["samples"].unbind()[0]
    assert torch.allclose(new_video[:, :, :7], cached["v"][:, :, -7:], atol=1e-4)


def test_opt_in_ffmpeg_pipe_assembles_without_rgb_disk_chain(patcher, dirs, monkeypatch):
    from h3s import h3s_core as core
    from h3s.h3s_disk_chain import DiskTensorList
    p = project(id="split_pipe_direct")
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    original_append = DiskTensorList.append

    def guard(self, tensor):
        if Path(self._tmp.name).name.startswith("h3zs_decoded_frames_"):
            raise AssertionError("FFmpeg pipe unexpectedly wrote full RGB scratch")
        return original_append(self, tensor)

    monkeypatch.setattr(DiskTensorList, "append", guard)
    p["run"] = {"operation": "assemble", "export_colour": False, "export_pipe": True}
    assert core.normalize_project(p)["run"]["export_pipe"] is True
    frames, sound, latent, result = gen.run_project(
        patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert frames.shape[0] == 1
    assert result["full"]["export_pipe_used"] is True
    # Downstream ComfyUI consumers still receive the full stitched AV latents.
    monkeypatch.setattr(DiskTensorList, "append", original_append)
    p["run"] = {"operation": "assemble", "export_colour": False, "export_pipe": False}
    _, classic_sound, classic_latent, _ = gen.run_project(
        patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    pipe_v, pipe_a = latent["samples"].unbind()
    classic_v, classic_a = classic_latent["samples"].unbind()
    assert pipe_v.shape == classic_v.shape
    assert pipe_a.shape == classic_a.shape
    assert sound["waveform"].shape == classic_sound["waveform"].shape
    assert result["full"]["frames"] > 1 and sound["waveform"].shape[0] == 1
    out, _ = dirs
    video = result["full"]["video"]
    assert (Path(out) / video["subfolder"] / video["filename"]).is_file()
    chosen = Path(out) / "user_selected_folder"
    exported = gen.export_video({
        "source": video, "folder": str(chosen),
        "name": "pipe_full_video", "project": p["id"],
    })
    assert Path(exported["path"]).parent == chosen
    assert Path(exported["path"]).is_file()
    assert exported["frames"] == result["full"]["frames"]


def test_pipe_nvenc_error_retries_cpu_without_classic_spool(patcher, dirs, monkeypatch):
    from h3s import h3s_stream_export as pipe
    from h3s.h3s_disk_chain import DiskTensorList

    p = project(id="split_pipe_gpu_fallback")
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    monkeypatch.setattr(pipe, "select_encoder", lambda: "nvenc")
    real_render = pipe.render
    tried = []

    def gpu_then_cpu(plan, destination, sound, encoder="cpu", progress=None):
        tried.append(encoder)
        if encoder == "nvenc":
            raise RuntimeError("simulated GPU encoder failure")
        return real_render(plan, destination, sound, encoder=encoder, progress=progress)

    monkeypatch.setattr(pipe, "render", gpu_then_cpu)
    original_append = DiskTensorList.append

    def no_rgb_spool(self, tensor):
        assert not Path(self._tmp.name).name.startswith("h3zs_decoded_frames_")
        return original_append(self, tensor)

    monkeypatch.setattr(DiskTensorList, "append", no_rgb_spool)
    p["run"] = {"operation": "assemble", "export_pipe": True}
    _, _, _, result = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert tried == ["nvenc", "cpu"]
    assert result["full"]["export_pipe_used"] is True
    assert result["full"]["export_encoder"] == "cpu"


def test_opt_in_ffmpeg_pipe_uses_studio_colour_cache(patcher, dirs):
    p = project(id="split_pipe_studio")
    p["settings"]["continuation_method"] = "h3studio"
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    p["run"] = {"operation": "colour", "export_colour": True}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    p["run"] = {"operation": "assemble", "export_colour": True, "export_pipe": True}
    frames, _, _, result = gen.run_project(
        patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert frames.shape[0] == 1
    assert result["full"]["export_pipe_used"] is True
    assert result["full"]["export_colour"] is True


def test_assembly_streams_full_mp4_without_full_image(patcher, dirs, monkeypatch):
    p = project(id="split_stream")
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())

    def no_sample(*args, **kwargs):
        raise AssertionError("Streaming assembly attempted sampling")

    monkeypatch.setattr(gen, "sample_segment", no_sample)
    p["run"] = {"operation": "assemble"}
    frames, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), stream_output=True)
    assert frames.shape[0] == 1
    assert info["full"] and info["full"]["frames"] > 1
    assert info["operation"] == "assemble"
    out, _ = dirs
    ref = info["full"]["video"]
    assert (Path(out) / ref["subfolder"] / ref["filename"]).is_file()


def test_export_stream_dialog_overrides_legacy_node_mode(patcher, dirs, monkeypatch):
    """Save Video streaming switch controls assembly independently of old node values."""
    from h3s import h3s_core as core

    p = project(id="split_export_stream")
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())

    def no_sample(*args, **kwargs):
        raise AssertionError("Export assembly must not invoke diffusion")

    monkeypatch.setattr(gen, "sample_segment", no_sample)
    p["run"] = {"operation": "assemble", "export_stream": True}
    assert core.normalize_project(p)["run"]["export_stream"] is True
    frames, _, _, streamed = gen.run_project(
        patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), stream_output=False
    )
    assert frames.shape[0] == 1
    assert streamed["full"]["frames"] > 1
    out, _ = dirs
    ref = streamed["full"]["video"]
    assert (Path(out) / ref["subfolder"] / ref["filename"]).is_file()
    # The Save Video endpoint must copy the assembled master to the selected
    # absolute folder, even when streaming left only one IMAGE output frame.
    selected_folder = Path(out) / "chosen_export_folder"
    exported = gen.export_video({
        "source": ref, "folder": str(selected_folder),
        "name": "selected_destination", "project": p["id"],
    })
    assert Path(exported["path"]).parent == selected_folder
    assert Path(exported["path"]).is_file()
    assert exported["frames"] == streamed["full"]["frames"]

    p["run"] = {"operation": "assemble", "export_stream": False}
    assert core.normalize_project(p)["run"]["export_stream"] is False
    frames, _, _, normal = gen.run_project(
        patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE(), stream_output=True
    )
    assert frames.shape[0] > 1
    assert normal["full"]["frames"] == streamed["full"]["frames"]


def test_targeted_generation_fills_missing_predecessors_without_full_export(patcher, dirs, monkeypatch):
    """Generate the missing chain without a full export or transient decoded-frame copies."""
    from h3s.h3s_disk_chain import DiskTensorList
    original_append = DiskTensorList.append

    def append_without_decoded_frames(self, tensor):
        assert not Path(self._tmp.name).name.startswith("h3zs_decoded_frames_"), (
            "Generate must not spill gigabytes of RGB frames; only Save Video needs the full frame chain"
        )
        return original_append(self, tensor)

    monkeypatch.setattr(DiskTensorList, "append", append_without_decoded_frames)
    p = project(id="split_targeted")
    p["segments"].append({"id": "s3", "frames": 39, "prompt": "three", "refs": ["a1"]})
    p["run"] = {"operation": "generate", "upto": 2, "only": 2}
    vae = FakeVAE()
    clip = FakeClip()
    frames, _, _, info = gen.run_project(patcher, clip, vae, p, FakeAudioVAE())
    assert info["operation"] == "generate"
    assert info["full"] is None
    assert [r["index"] for r in info["segments"]] == [0, 1, 2]
    assert len(clip.calls) == 3
    assert frames.shape[0] == 1
    out, _ = dirs
    assert not list((Path(out) / "h3labstudio" / p["id"]).rglob("full_*.mp4"))

    # The first take remains cached; invalidating clip 2 must regenerate
    # the missing chain 2 -> 3 while never exporting an MP4.
    p["segments"][1]["prompt"] = "two changed"
    clip2 = FakeClip()
    _, _, _, updated = gen.run_project(patcher, clip2, vae, p, FakeAudioVAE())
    assert updated["full"] is None
    assert [r["index"] for r in updated["segments"] if not r["cached"]] == [1, 2]
    assert len(clip2.calls) == 2
    assert not list((Path(out) / "h3labstudio" / p["id"]).rglob("full_*.mp4"))


def test_targeted_generation_stops_at_requested_clip(patcher, dirs):
    p = project(id="split_upto")
    p["segments"].append({"id": "s3", "frames": 39, "prompt": "three", "refs": ["a1"]})
    p["run"] = {"operation": "generate", "upto": 1, "only": 1}
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert info["full"] is None
    assert [r["index"] for r in info["segments"]] == [0, 1]


def test_explicit_save_full_is_not_truncated_by_legacy_resume(patcher, dirs):
    from h3s import h3s_core as core

    p = project(id="split_explicit_save")
    p["settings"]["resume_only"] = True
    p["run"] = {"operation": "generate"}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    p["segments"][1]["prompt"] = "revised second clip"
    p["run"] = {"operation": "full", "export_full": True}
    assert core.normalize_project(p)["run"]["export_full"] is True
    _, _, _, info = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert info["resume_only"] is False
    assert info["full"] and info["full"]["partial"] is False
    assert info["operation"] == "full"


def test_save_reuses_existing_editor_previews_in_colour_and_assembly(patcher, dirs, monkeypatch):
    """Preparing a 26-clip export must not regenerate MP4 previews of cached clips."""
    from h3s import h3s_media as media

    p = project(id="split_export_reuse")
    p["run"] = {"operation": "generate"}
    _, _, _, generated = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    for r in generated["segments"]:
        p["segments"][r["index"]]["result"] = r  # what the editor persists after generation

    original = media.write_mp4
    written = []

    def spy(path, *args, **kwargs):
        written.append(Path(path).name)
        return original(path, *args, **kwargs)

    monkeypatch.setattr(media, "write_mp4", spy)
    p["run"] = {"operation": "colour", "export_colour": True}
    gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert not any(x.startswith("seg_") for x in written), written

    p["run"] = {"operation": "assemble", "export_colour": True}
    _, _, _, assembled = gen.run_project(patcher, FakeClip(), FakeVAE(), p, FakeAudioVAE())
    assert assembled["full"]["export_colour"] is True
    assert not any(x.startswith("seg_") for x in written), written
    assert any(x.startswith("full_") for x in written), "Only final movie should be encoded"
