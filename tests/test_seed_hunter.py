"""Seed Hunter and independent Stage 2 seed: cache isolation and safe defaults."""
from h3s import h3s_core as core


def make_project(settings=None, overrides=None):
    return core.normalize_project({
        "id": "seed_hunter_test",
        "settings": {"res_mode": "custom", "width": 96, "height": 64,
                     "final_mode": "refine", "quality": "final", "seed": 100,
                     **(settings or {})},
        "segments": [{"id": "s1", "frames": 39, "prompt": "A woman's face and wall text",
                      "overrides": overrides or {}}],
    })


def test_separate_seed_keeps_draft_and_changes_only_refine_key():
    original = make_project()
    independent = make_project({"refine_seed": 34567})
    assert core.pass_params(original, 0, "draft")["seed"] == 100
    assert core.pass_params(original, 0, "refine")["seed"] == 100
    assert core.pass_params(independent, 0, "draft")["seed"] == 100
    assert core.pass_params(independent, 0, "refine")["seed"] == 34567
    assert core.segment_keys(original, kind="draft") == core.segment_keys(independent, kind="draft")
    assert core.segment_keys(original, kind="refine") != core.segment_keys(independent, kind="refine")


def test_segment_refine_seed_wins_without_draft_resampling():
    common = make_project({"refine_seed": 777})
    selected = make_project({"refine_seed": 777}, {"refine_seed": 999})
    assert core.pass_params(selected, 0, "refine")["seed"] == 999
    assert core.pass_params(selected, 0, "draft")["seed"] == 100
    assert core.segment_keys(common, kind="draft") == core.segment_keys(selected, kind="draft")
    assert core.segment_keys(common, kind="refine") != core.segment_keys(selected, kind="refine")


def test_seed_hunter_choices_change_draft_keys():
    keys = []
    for seed in [234, 1234, 2234]:
        p = make_project(overrides={"seed": seed})
        keys.append(core.segment_keys(p, kind="draft")[0])
        assert core.pass_params(p, 0, "draft")["seed"] == seed
    assert len(set(keys)) == 3


def test_legacy_project_uses_original_seed_and_cache_signature():
    legacy = make_project()
    inherited = make_project({"refine_seed": -1})
    assert legacy["settings"]["refine_seed"] == -1
    assert core.segment_keys(legacy, kind="refine") == core.segment_keys(inherited, kind="refine")
