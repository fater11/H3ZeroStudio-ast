"""Self-voice reference unit tests; no model loading or GPU execution."""
import json

import torch
from h3s import h3s_core as core
from h3s import h3s_voice as voice


def _project(enabled=False, mode="luna"):
    return core.normalize_project({
        "settings": {"self_anchor_voice": enabled, "final_mode": mode,
                     "res_mode": "custom", "width": 96, "height": 64,
                     "steps": 8},
        "segments": [{"id": "a", "frames": 124, "prompt": "Speaker talks"},
                     {"id": "b", "frames": 124, "link": "extend", "prompt": "Same speaker continues"},
                     {"id": "c", "frames": 124, "link": "extend", "prompt": "Same speaker again"}],
    })


def test_setting_is_off_by_default_and_strict_boolean():
    assert core.normalize_project({})["settings"]["self_anchor_voice"] is False
    assert _project(True)["settings"]["self_anchor_voice"] is True
    assert _project("true")["settings"]["self_anchor_voice"] is False
    assert core.global_settings({"self_anchor_voice": True}) == {"self_anchor_voice": True}


def test_cache_changes_only_for_following_full_pass():
    normal = _project(False)
    anchored = _project(True)
    a = core.segment_keys(normal, kind="full")
    b = core.segment_keys(anchored, kind="full")
    assert a[0] == b[0]  # first voice is rendered normally
    assert a[1] != b[1] and a[2] != b[2]
    assert core.segment_keys(normal, kind="draft") == core.segment_keys(anchored, kind="draft")
    assert core.segment_keys(normal, kind="refine") != []


def test_carries_first_voice_bounded_and_resets_after_cut():
    original = torch.arange(32 * 2 * 800).float().reshape(1, 32, 2, 800)
    later = torch.zeros_like(original) + 1
    pinned = voice.carry_voice_anchor(None, original, "extend")
    assert pinned.shape == (1, 32, 2, 600)  # at most 15 sec at 40 Hz
    assert pinned.device.type == "cpu"
    assert not pinned.requires_grad
    original.zero_()  # the reference must not alias live sampling latents
    assert pinned[0, 0, 0, 7] == 7
    same = voice.carry_voice_anchor({"a": later, "voice_anchor": pinned}, later, "extend")
    assert torch.equal(same, pinned)
    new = voice.carry_voice_anchor({"a": later, "voice_anchor": pinned}, later, "cut")
    assert not torch.equal(new, pinned)


def test_structured_h3_prompt_stays_json_and_plain_text_is_safe():
    src = json.dumps({"integrated_multimodal_description": "[Shot 1] A woman speaks in Russian.",
                      "overall_soundscape": "Wind on a terrace.",
                      "non_diegetic_music": "N/A"}, ensure_ascii=False)
    out = json.loads(voice.reference_prompt(src))
    assert "<Audio 1>" in out["integrated_multimodal_description"]
    assert "Russian" in out["integrated_multimodal_description"]
    assert out["overall_soundscape"] == "Wind on a terrace."
    plain = voice.reference_prompt("A character speaks.")
    assert plain.startswith("A character speaks.") and "<Audio 1>" in plain


def test_invalid_and_already_pinned_sources():
    assert voice.first_voice_latent(None) is None
    assert voice.first_voice_latent({"a": torch.zeros(1, 32, 3, 50)}) is None
    assert voice.first_voice_latent({"a": torch.zeros(1, 32, 2, 0)}) is None
