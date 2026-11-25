"""Token budget: does a shot fit the GPU, and how to split it when it does not."""
import pytest

from h3s import h3s_budget as B
from h3s import h3s_core as core


def test_canvas_and_reference_tokens():
    assert B.canvas_tokens(1344, 768, core.latent_t(362)) == (1344 // 32) * (768 // 32) * core.latent_t(362)
    assert B.tokens_per_frame(1344, 768) == 42 * 24
    # a reference image costs one canvas frame, ten of them ten times as much
    assert B.image_tokens(1344, 768, 10) == 10 * B.canvas_tokens(1344, 768, 1)
    assert B.card_tokens([{"tokens": 1200}, {"tokens": 300}, {}]) == 1500


def test_budget_scales_with_vram_and_reserves():
    big = B.budget_tokens(vram_total_gb=32.0)
    small = B.budget_tokens(vram_total_gb=12.0)
    assert small < big
    assert big == pytest.approx(B.CALIBRATION_TOKENS * ((32.0 - 0.68 - 2.0) / B.CALIBRATION_VRAM_GB) * 0.85,
                                rel=0.01)
    assert B.budget_tokens(vram_total_gb=32.0, extra_gb=4.0) < big
    assert B.budget_tokens(vram_total_gb=32.0, safety=1.0) > big


def test_segment_tokens_adds_canvas_refs_and_cards():
    segment = {"frames": 362}
    base = B.segment_tokens(segment, 1344, 768)
    with_refs = B.segment_tokens(segment, 1344, 768, ref_images=2, ref_video_frames=124,
                                 ref_video_w=768, ref_video_h=432, cards=[{"tokens": 2000}])
    assert with_refs > base + 2 * B.canvas_tokens(1344, 768, 1)
    assert B.fits(base, B.budget_tokens(vram_total_gb=32.0))
    assert not B.fits(base * 4, B.budget_tokens(vram_total_gb=12.0))


def test_parts_for_a_shot_that_fits_is_one_part():
    parts = B.parts_for(243, 50_000, 215_000)      # 243 = 5+17*14: already on the H3 grid
    assert len(parts) == 1 and parts[0]["frames"] == 243 and parts[0]["overlap"] == 0
    assert (parts[0]["frames"] - 5) % 17 == 0


def test_parts_tile_the_shot_and_stay_inside_the_budget():
    frames, tokens, budget = 957, 900_000, 215_000
    parts = B.parts_for(frames, tokens, budget, overlap=22)
    assert len(parts) > 1
    covered = sum(p["new"] for p in parts)
    assert covered == frames, (covered, frames, parts)
    assert all((p["frames"] - 5) % 17 == 0 for p in parts), parts
    assert all(p["frames"] <= core.TRAINED_MAX_FRAMES for p in parts), parts
    for p in parts[1:]:
        assert p["overlap"] == 22 and p["start"] + p["overlap"] == parts[p["index"] - 1]["start"] + parts[p["index"] - 1]["frames"]

    per_frame = tokens / frames
    for p in parts:
        assert B.fits(per_frame * p["frames"], budget * 1.35), (p, per_frame * p["frames"])


def test_parts_split_a_big_canvas_into_more_pieces():
    frames = 600
    light = B.parts_for(frames, 300_000, 215_000)
    heavy = B.parts_for(frames, 900_000, 215_000)
    assert len(heavy) > len(light)


def test_retime_prompt_keeps_only_the_actions_of_this_part():
    prompt = "A woman walks in. [4s] she turns to the window. At 00:07.5 she smiles. [12s] she leaves."
    part = B.retime_prompt(prompt, 3.0, 8.0)
    assert "[1.0s]" in part and "[4.5s]" in part          # re-timed from the part's own start
    assert "12s" not in part and "leaves" not in part    # outside this part: dropped
    assert B.retime_prompt(prompt, 20.0, 24.0).startswith("No new action")
    assert B.retime_prompt("plain text, no marks", 0.0, 5.0) == "plain text, no marks"


def test_plan_parts_uses_the_segment_and_the_budget():
    project = {"segments": [{"frames": 244, "prompt": "a"}], "settings": {}}
    plan = B.plan_parts(project, 0, 1344, 768, B.budget_tokens(vram_total_gb=32.0))
    assert plan["tokens"] == B.segment_tokens(project["segments"][0], 1344, 768)
    assert len(plan["parts"]) == 1
