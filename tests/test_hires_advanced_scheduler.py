"""HiRes Advanced: Comfy BasicScheduler parity, safe cache separation and sampler dispatch."""
from unittest.mock import Mock

import pytest
import torch

from h3s import h3s_core as core
from h3s import h3s_gen as gen


def _project(settings):
    return core.normalize_project({
        "id": "basic_scheduler_test",
        "settings": {"res_mode": "custom", "width": 96, "height": 64,
                     "quality": "final", "final_mode": "refine", **settings},
        "segments": [{"id": "s1", "frames": 39, "prompt": "A stable wall inscription."}],
    })


def test_basic_schedule_matches_comfyui_basic_scheduler(monkeypatch):
    model = Mock()
    sampling = object()
    model.get_model_object.return_value = sampling
    calls = []

    def calculate(model_sampling, scheduler, steps):
        calls.append((model_sampling, scheduler, steps))
        return torch.linspace(1, 0, steps + 1)

    monkeypatch.setattr(gen.comfy.samplers, "calculate_sigmas", calculate)
    out = gen.basic_refine_sigmas(model, 3, "simple", 0.30)
    assert calls == [(sampling, "simple", 10)]
    assert torch.equal(out, torch.tensor([0.3, 0.2, 0.1, 0.0], dtype=out.dtype))
    assert out.numel() == 4


@pytest.mark.parametrize("denoise", [0, -0.1, 1.1])
def test_invalid_basic_denoise_rejected(denoise):
    with pytest.raises(ValueError):
        gen.basic_refine_sigmas(Mock(), 3, "simple", denoise)


def test_normalization_and_key_separation():
    legacy = _project({"refine_sigma": 0.30})
    advanced = _project({"refine_sigma": 0.30, "refine_schedule_mode": "basic", "refine_denoise": 0.30})
    assert core.pass_params(legacy, 0, "refine")["schedule_mode"] == "sigma"
    assert core.pass_params(advanced, 0, "refine")["schedule_mode"] == "basic"
    assert core.pass_params(advanced, 0, "refine")["schedule_denoise"] == 0.30
    assert core.segment_keys(legacy, [], "", kind="refine") != core.segment_keys(advanced, [], "", kind="refine")


def test_advanced_route_uses_custom_sampling(monkeypatch):
    sampler = object()
    sample_result = object()
    monkeypatch.setattr(gen.comfy.samplers, "sampler_object", lambda name: sampler)
    monkeypatch.setattr(gen.comfy.sample, "sample_custom", Mock(return_value=sample_result))
    monkeypatch.setattr(gen.comfy.sample, "sample", Mock(side_effect=AssertionError("legacy sampler used")))
    model = Mock()
    z = torch.zeros(2, 2)
    result = gen._sample_pass(model, z, 3, 1.0, "er_sde", "simple",
                              [], [], z, 1.0, None, 42,
                              sigmas=torch.tensor([0.9, 0.4, 0.1, 0.0]),
                              second=True, advanced=True)
    assert result is sample_result
    gen.comfy.sample.sample_custom.assert_called_once()
    assert gen.comfy.sample.sample_custom.call_args.args[3] is sampler


@pytest.mark.parametrize("second", [False, True])
def test_stage_sampler_overrides_shared_wire_in_advanced_mode(monkeypatch, second):
    shared = object()
    chosen = object()
    monkeypatch.setitem(gen.CUSTOM, "sampler", shared)
    monkeypatch.setitem(gen.CUSTOM, "sampler_pass2", None)
    monkeypatch.setitem(gen.CUSTOM, "sigmas", None)
    monkeypatch.setitem(gen.CUSTOM, "sigmas_pass2", None)
    monkeypatch.setattr(gen.comfy.samplers, "sampler_object", lambda name: chosen)
    call = Mock(return_value=object())
    monkeypatch.setattr(gen.comfy.sample, "sample_custom", call)
    z = torch.zeros(2, 2)
    gen._sample_pass(Mock(), z, 3, 1, "euler", "simple", [], [], z,
                     1.0, None, 2, sigmas=torch.tensor([1, 0.7, 0.1, 0]),
                     second=second, advanced=True, prefer_stage_sampler=True)
    assert call.call_args.args[3] is chosen


def test_dedicated_pass2_wire_still_wins(monkeypatch):
    shared = object()
    dedicated = object()
    monkeypatch.setitem(gen.CUSTOM, "sampler", shared)
    monkeypatch.setitem(gen.CUSTOM, "sampler_pass2", dedicated)
    monkeypatch.setitem(gen.CUSTOM, "sigmas_pass2", None)
    monkeypatch.setattr(gen.comfy.sample, "sample_custom", Mock(return_value=object()))
    z = torch.zeros(2, 2)
    gen._sample_pass(Mock(), z, 3, 1, "euler", "simple", [], [], z,
                     1.0, None, 2, sigmas=torch.tensor([1, 0.7, 0.1, 0]),
                     second=True, advanced=True, prefer_stage_sampler=True)
    assert gen.comfy.sample.sample_custom.call_args.args[3] is dedicated


def test_both_passes_have_independent_sampler_and_scheduler():
    p = _project({
        "refine_schedule_mode": "basic",
        "draft_sampler": "euler", "draft_scheduler": "beta57",
        "refine_sampler": "er_sde", "refine_scheduler": "simple",
    })
    draft = core.pass_params(p, 0, "draft")
    refiner = core.pass_params(p, 0, "refine")
    assert (draft["sampler"], draft["scheduler"]) == ("euler", "beta57")
    assert (refiner["sampler"], refiner["scheduler"]) == ("er_sde", "simple")


def test_first_pass_full_denoise_uses_native_basic_scheduler(monkeypatch):
    model = Mock()
    steps_seen = []
    monkeypatch.setattr(gen.comfy.samplers, "calculate_sigmas",
                        lambda _ms, scheduler, n: (steps_seen.append((scheduler, n))
                                                    or torch.linspace(1, 0, n + 1)))
    sigmas = gen.basic_refine_sigmas(model, 8, "sgm_uniform", 1.0)
    assert steps_seen == [("sgm_uniform", 8)]
    assert sigmas.numel() == 9 and float(sigmas[0]) == 1 and float(sigmas[-1]) == 0


def test_stage2_photo_stack_becomes_single_picture_and_keeps_voice(monkeypatch):
    from h3s import h3s_chars as chars

    latent = torch.arange(1 * 2 * 4 * 2 * 2, dtype=torch.float32).reshape(1, 2, 4, 2, 2)
    frames = torch.ones(4, 32, 32, 3, dtype=torch.float32)
    visual = {"meta": {"kind": "video", "source": "stack"}, "latent": latent}
    voice = {"latent": torch.ones(1, 4, 2, 8)}
    monkeypatch.setattr(chars, "load", lambda _cid: {"visual": visual, "audio": voice})
    monkeypatch.setattr(chars, "encoder_view", lambda _vis, _vae: (frames, [0.0, 1.0, 2.0, 3.0]))
    project = {"cards": {"heroine": {"vkind": "video", "audio": True}}}
    entries = [{"id": "heroine", "on": True, "look": True, "voice": True, "w": 1.0}]

    draft = chars.card_parts(project, entries, None, kind="full")
    legacy = chars.card_parts(project, entries, None, kind="refine")
    identity = chars.card_parts(project, entries, None, kind="refine_identity")

    assert len(draft["video"]) == 1 and len(draft["audio"]) == 1
    assert not legacy["video"] and not legacy["image"] and len(legacy["audio"]) == 1
    assert not identity["video"] and len(identity["image"]) == 1 and len(identity["audio"]) == 1
    image_item, image_block, cid = identity["image"][0]
    assert cid == "heroine" and image_item["type"] == "image"
    assert image_item["data"].shape[0] == 1
    assert image_block["kind"] == "image" and image_block["latent"].shape[2] == 1
    assert torch.equal(image_block["latent"], latent[:, :, :1])


def test_stage2_prompt_remaps_explicit_card_video_tag_to_picture():
    p = _project({"refine_identity_images": True})
    p["cards"] = {"heroine": {"vkind": "video", "audio": True,
                                "subject_name": "Anastasia", "concept": "identity"}}
    p["segments"][0]["cards"] = [{"id": "heroine", "on": True, "look": True, "voice": True, "w": 1.0}]
    p["segments"][0]["prompt"] = "Anastasia looks exactly like <Video 1>; she says <Audio 1>."
    normal = core.compose_prompt(p, 0, video=False)
    identity = core.compose_prompt(p, 0, video=False, identity_image_ids={"heroine"})
    assert "<Video 1>" not in normal and "<Picture 1>" not in normal
    assert "<Picture 1>" in identity and "<Video 1>" not in identity
    assert "<Audio 1>" in identity


def test_stage2_identity_photo_has_separate_cache_key():
    existing = _project({"refine_schedule_mode": "basic", "refine_denoise": 0.30})
    photos = _project({"refine_schedule_mode": "basic", "refine_denoise": 0.30,
                       "refine_identity_images": True})
    assert existing["settings"]["refine_identity_images"] is False
    assert photos["settings"]["refine_identity_images"] is True
    assert core.segment_keys(existing, [], "", kind="refine") != core.segment_keys(photos, [], "", kind="refine")
