"""v6h «Кадры»: image-to-video / first+last frame (fl2va) — mode, presets, keys, conditioning branch, full runs."""
import numpy as np
import pytest
import torch
from PIL import Image

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_gen as gen
from fakes import tiny_patcher, FakeClip, FakeVAE


@pytest.fixture(scope="module")
def patcher():
    return tiny_patcher()


@pytest.fixture()
def dirs(tmp_path):
    out, inp = tmp_path / "out", tmp_path / "in"
    (inp / "h3labstudio").mkdir(parents=True)
    out.mkdir()
    folder_paths.set_output_directory(str(out))
    folder_paths.set_input_directory(str(inp))
    for name, (hh, ww) in {"hero.png": (80, 64), "start.png": (64, 96), "end.png": (90, 120)}.items():
        Image.fromarray((np.random.rand(hh, ww, 3) * 255).astype("uint8")).save(inp / "h3labstudio" / name)
    return out, inp


def preset(pid, model):
    return core.normalize_preset({"id": pid, "name": pid, "base": "unet", "model": model, "clip": "te.safetensors"})


def project(kf1=None, kf2=None, **kw):
    p = {
        "id": "kf",
        "settings": {"prompt": "global", "res_mode": "custom", "width": 96, "height": 64, "steps": 2, "cfg": 1.0,
                     "sampler": "euler", "scheduler": "simple", "overlap_blocks": 1},
        "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3labstudio", "category": "character"},
                   {"id": "f1", "file": "start.png", "subfolder": "h3labstudio", "category": "other"},
                   {"id": "f2", "file": "end.png", "subfolder": "h3labstudio", "category": "location"}],
        "segments": [{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a1"], "kf": kf1},
                     {"id": "s2", "frames": 56, "prompt": "two", "refs": ["a1"], "kf": kf2}],
    }
    p.update(kw)
    return core.normalize_project(p)


# ---------------------------------------------------------------- mode / continuation / presets / keys
def test_mode_picks_itself():
    p = project()
    seg = lambda kf: project(kf)["segments"][0]
    assert core.kf_mode(p, seg(None)) == "t2v"
    assert core.kf_mode(p, seg({"on": True})) == "t2v"
    assert core.kf_mode(p, seg({"on": True, "first": "f1"})) == "i2v"
    assert core.kf_mode(p, seg({"on": True, "first": "f1", "last": "f2"})) == "flf"
    assert core.kf_mode(p, seg({"on": True, "last": "f2"})) == "flf"
    assert core.kf_mode(p, seg({"on": False, "first": "f1", "last": "f2"})) == "t2v"   # toggle off keeps the slots
    assert core.kf_mode(p, seg({"on": True, "first": "gone"})) == "t2v"
    assert project({"on": True, "first": "f1"})["segments"][0]["kf"] == {"mode": "flf", "on": True, "first": "f1", "last": ""}
    assert project({})["segments"][0]["kf"] is None


def test_first_frame_replaces_continuation_last_frame_keeps_it():
    long = lambda kf2: project(None, kf2, segments=[{"id": "s1", "frames": 124, "prompt": "one", "refs": ["a1"]},
                                                    {"id": "s2", "frames": 124, "prompt": "two", "refs": ["a1"], "kf": kf2}])
    assert core.plan(long(None))[1]["overlap"] > 0
    p = long({"on": True, "first": "f1"})
    assert core.plan(p)[1]["overlap"] == 0 and not core.uses_continuity(p, 1)
    assert not any("перекрытие не помещается" in w for w in core.estimate(p)["warnings"])
    p = long({"on": True, "last": "f2"})
    assert core.uses_continuity(p, 1) and core.plan(p)[1]["overlap"] > 0
    assert core.continuity_picture(p, 1) == 0   # fl2va: no reference pictures, the tail keyframe carries it
    assert "<Picture" not in core.compose_prompt(p, 1)


def test_frames_preset_is_used_for_frame_clips_only():
    p = project({"on": True, "first": "f1"}, None,
                model_presets={"ref": preset("ref", "ref2va.safetensors"), "fl": preset("fl", "fl2va.safetensors")})
    p["settings"]["model_preset"], p["settings"]["kf_preset"] = "ref", "fl"
    p = core.normalize_project(p)
    assert p["settings"]["kf_preset"] == "fl"
    assert core.segment_preset(p, 0)["id"] == "fl" and core.segment_preset(p, 1)["id"] == "ref"
    p["segments"][0]["model_preset"] = "ref"   # the clip's own preset still wins
    assert core.segment_preset(p, 0)["id"] == "ref"
    p["segments"][0]["model_preset"] = ""
    p["settings"]["kf_preset"] = ""
    assert core.segment_preset(p, 0)["id"] == "ref"


def test_keys_include_mode_and_frames_and_leave_t2v_clips_alone():
    base = core.segment_keys(project())
    assert core.segment_keys(project({"on": False, "first": "f1"})) == base   # off = unchanged keys
    i2v = core.segment_keys(project({"on": True, "first": "f1"}))
    flf = core.segment_keys(project({"on": True, "first": "f1", "last": "f2"}))
    assert i2v[0] != base[0] and flf[0] != i2v[0]
    assert i2v[1] != base[1]   # chained: the next clip continues another result
    sig1 = core.segment_keys(project({"on": True, "first": "f1"}), ref_sigs={"f1": "A"})
    sig2 = core.segment_keys(project({"on": True, "first": "f1"}), ref_sigs={"f1": "B"})
    assert sig1[0] != sig2[0]   # the frame file content is in the key


def test_estimate_warns_about_ignored_refs_and_missing_frames_model():
    w = core.estimate(project({"on": True, "first": "f1"}))["warnings"]
    assert any("референсы" in x and "не используются" in x for x in w)
    assert any("модель для кадров" in x for x in w)


# ---------------------------------------------------------------- the fl2va conditioning branch
class RecClip(FakeClip):
    def tokenize(self, text, minimax_ref_items=None, images=None, **kw):
        self.calls.append((text, [i["type"] for i in (minimax_ref_items or [])], [tuple(x.shape) for x in (images or [])]))
        return {"text": text}


def test_encode_cond_kf_matches_native_image_to_video():
    clip, vae = RecClip(), FakeVAE()
    first, last = torch.rand(1, 64, 96, 3), torch.rand(1, 90, 120, 3)
    cond, kfs = gen.encode_cond_kf(clip, vae, "go", first, last, 96, 64, 56)
    assert clip.calls[-1][2] == [(1, 64, 96, 3), (1, 64, 96, 3)]   # both pictures, on the canvas, as plain images
    assert clip.calls[-1][1] == []                                 # no reference items
    assert [k["resolved_frame_index"] for k in kfs] == [0, 55]
    assert all(tuple(k["latent"].shape[-2:]) == (4, 6) for k in kfs)
    cond, kfs = gen.encode_cond_kf(clip, vae, "go", first, None, 96, 64, 56)
    assert [k["resolved_frame_index"] for k in kfs] == [0] and len(clip.calls[-1][2]) == 1
    cond, kfs = gen.encode_cond_kf(clip, vae, "go", None, last, 96, 64, 56)
    assert [k["resolved_frame_index"] for k in kfs] == [55]
    # first: plain stretch (no crop); last: cover crop — a 120x90 picture loses its sides
    st = gen.kf_resize(last, 96, 64, "disabled")
    cr = gen.kf_resize(last, 96, 64, "center")
    assert st.shape == cr.shape == (1, 64, 96, 3) and not torch.allclose(st, cr)


@pytest.mark.parametrize("kf,expect", [
    (None, None),
    ({"on": True, "first": "f1"}, [0]),
    ({"on": True, "first": "f1", "last": "f2"}, [0, 38]),
])
def test_run_project_builds_the_right_branch(patcher, dirs, monkeypatch, kf, expect):
    seen = {"kf": [], "ref": 0, "keys": []}
    real_kf, real_ref, real_add = gen.encode_cond_kf, gen.encode_cond, gen.add_keyframes

    def spy_kf(*a, **k):
        r = real_kf(*a, **k)
        seen["kf"].append([x["resolved_frame_index"] for x in r[1]])
        return r

    def spy_ref(*a, **k):
        seen["ref"] += 1
        return real_ref(*a, **k)

    def spy_add(c, k):
        seen["keys"].append([x["resolved_frame_index"] for x in k])
        return real_add(c, k)
    monkeypatch.setattr(gen, "encode_cond_kf", spy_kf)
    monkeypatch.setattr(gen, "encode_cond", spy_ref)
    monkeypatch.setattr(gen, "add_keyframes", spy_add)
    clip = RecClip()
    p = project(kf, None)
    if expect is not None:
        # FLF and ordinary REF inputs are deliberately mutually exclusive.
        p["segments"][0]["refs"] = []
    images, audio, latent, info = gen.run_project(patcher, clip, FakeVAE(), p)
    assert images.shape[0] > 0
    if expect is None:
        assert seen["kf"] == [] and seen["ref"] >= 2
        assert clip.calls[0][1] == ["image"]   # t2v / references path: the hero as a reference item
    else:
        assert seen["kf"][0] == expect and seen["ref"] >= 1   # clip 2 (no frames) stays on the reference path
        assert seen["keys"][0][:len(expect)] == expect        # frame keyframes reach the conditioning of clip 1
        assert clip.calls[0][1] == [] and len(clip.calls[0][2]) == len(expect)
    assert [r["index"] for r in info["segments"]] == [0, 1]
    # v6i: each take records the mode it was generated with (timeline badge)
    assert [r.get("gen") for r in info["segments"]] == [{0: "ref", 1: "i2v", 2: "flf"}[len(expect or [])], "ref"]


# ---------------------------------------------------------------- v6i: REF | FLF selector, gen mode
def test_v6h_on_migrates_to_mode_and_keys_stay():
    old = project({"on": True, "first": "f1"})
    new = project({"mode": "flf", "first": "f1"})
    assert old["segments"][0]["kf"]["mode"] == "flf" and new["segments"][0]["kf"]["on"] is True
    assert core.segment_keys(old) == core.segment_keys(new)
    # REF keeps the slots but they take no part: same keys as a clip that never had frames
    kept = project({"mode": "ref", "first": "f1", "last": "f2"})
    assert kept["segments"][0]["kf"] == {"mode": "ref", "on": False, "first": "f1", "last": "f2"}
    assert core.kf_mode(kept, kept["segments"][0]) == "t2v"
    assert core.segment_keys(kept) == core.segment_keys(project())
    assert core.normalize_kf({"mode": "ref"}) is None and core.normalize_kf({"on": False}) is None
    # an explicit mode wins over a stale "on"
    assert core.normalize_kf({"mode": "ref", "on": True, "first": "f1"})["on"] is False


def test_gen_mode():
    p = project()
    s = lambda **kw: {**p["segments"][0], **kw}
    assert core.gen_mode(p, s()) == "ref"
    assert core.gen_mode(p, s(refs=[])) == "t2v"
    assert core.gen_mode(p, s(kf={"mode": "flf", "on": True, "first": "f1", "last": ""})) == "i2v"
    assert core.gen_mode(p, s(kf={"mode": "flf", "on": True, "first": "f1", "last": "f2"})) == "flf"
    assert core.gen_mode(p, s(kf={"mode": "flf", "on": True, "first": "", "last": "f2"})) == "l2v"
    assert core.gen_mode(p, s(kf={"mode": "flf", "on": True, "first": "", "last": ""})) == "ref"   # FLF without frames
    assert core.gen_mode(p, s(source={"asset": "v", "in": 0, "denoise": 0.0})) is None             # footage as is
    assert core.gen_mode(p, s(source={"asset": "v", "in": 0, "denoise": 0.5})) == "v2v"
