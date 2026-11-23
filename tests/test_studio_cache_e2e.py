"""Integration test: cached Studio RGB must skip the expensive Lab path."""
import os
from pathlib import Path

import torch

from test_gen import dirs, patcher, project
from fakes import FakeClip, FakeVAE, FakeAudioVAE
from h3s import h3s_gen as gen


def test_studio_cached_colour_matches_first_render(patcher, dirs, monkeypatch):
    output_dir, _ = dirs
    p = project(id="studio_colour_cache_test")
    p["settings"]["continuation_method"] = "h3studio"
    vae = FakeVAE()
    first_frames, _audio, _latent, first = gen.run_project(patcher, FakeClip(), vae, p, FakeAudioVAE())
    cache_dir = Path(output_dir) / "h3labstudio" / p["id"] / "cache" / "studio_rgb8"
    assert len(list(cache_dir.glob("*.zip"))) == 2

    from h3s import h3s_studio_color as studio

    def forbid_lab(*_args, **_kwargs):
        raise AssertionError("Warm Studio cache reran Lab processing")

    monkeypatch.setattr(studio, "stats", forbid_lab)
    monkeypatch.setattr(studio, "pull", forbid_lab)
    monkeypatch.setattr(studio, "tone_shift", forbid_lab)
    warm_frames, _audio, _latent, second = gen.run_project(patcher, FakeClip(), vae, p, FakeAudioVAE())
    assert torch.equal(first_frames, warm_frames)
    assert all(x["cached"] for x in second["segments"])
