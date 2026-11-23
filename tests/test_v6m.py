"""v6m: FLF model in presets, «Вписать кадр», «Своё соотношение» / «Как у изображения», region key windowing."""
import json
import os
import shutil
import subprocess
import textwrap

import pytest
import torch

from h3s import h3s_core as core
from h3s import h3s_gen as gen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which("node")
need_node = pytest.mark.skipif(NODE is None, reason="node.js не найден")


def _js(expr_cases, tmp_path):
    js = "file://" + os.path.join(ROOT, "web", "js").replace("\\", "/")
    drv = tmp_path / "d.mjs"
    drv.write_text(textwrap.dedent(f"""
        import * as C from "{js}/h3s_core.js";
        const cases = JSON.parse(process.argv[2]);
        console.log(JSON.stringify(cases.map(([fn, args]) => C[fn](...args))));
    """), encoding="utf-8")
    r = subprocess.run([NODE, str(drv), json.dumps(expr_cases)], capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


# ------------------------------------------------------------------------------------------ custom aspect
RATIOS = ["2.39:1", "5:4", "1.85", "16x9", "4:5", "1:4", "4:1", "5:1", "1:5", "abc", "", "0:1", "1:0", "2,35:1", 1.5]


def test_parse_ratio():
    assert core.parse_ratio("2.39:1") == pytest.approx(2.39)
    assert core.parse_ratio("5:4") == 1.25 and core.parse_ratio("1.85") == 1.85 and core.parse_ratio("2,35:1") == 2.35
    for bad in ("5:1", "1:5", "abc", "", "0:1", "1:0"):
        assert core.parse_ratio(bad) is None, bad
    assert core.parse_ratio("1:4") == 0.25 and core.parse_ratio("4:1") == 4.0


def test_ratio_resolution_snapped():
    w, h = core.resolution({"res_mode": "ratio", "ratio": "2.39:1", "megapixels": 0.5})
    assert w % 32 == 0 and h % 32 == 0 and abs(w / h - 2.39) < 0.15 and abs(w * h - 0.5 * 2 ** 20) / (0.5 * 2 ** 20) < 0.1
    assert core.resolution({"res_mode": "ratio", "ratio": "nonsense", "megapixels": 0.5}) == core.resolution({"aspect": "16:9", "megapixels": 0.5})
    # «Как у изображения»: the stored W/H of the frame
    w, h = core.resolution({"aspect": "image", "image_ratio": 0.75, "megapixels": 0.5})
    assert abs(w / h - 0.75) < 0.05
    assert core.resolution({"aspect": "image", "image_ratio": 0, "megapixels": 0.5}) == (960, 544)


@need_node
def test_ratio_js_parity(tmp_path):
    js = _js([["parseRatio", [r]] for r in RATIOS], tmp_path)
    for r, j in zip(RATIOS, js):
        p = core.parse_ratio(r)
        assert (p is None and j is None) or abs(p - j) < 1e-9, (r, p, j)
    sets = [{"res_mode": "ratio", "ratio": r, "megapixels": mp} for r in ("2.39:1", "5:4", "1.85", "4:5", "x") for mp in (0.3, 0.5, 0.98)] + \
           [{"aspect": "image", "image_ratio": ir, "megapixels": 0.5} for ir in (0.75, 1.5, 2.2, 0)]
    js = _js([["resolution", [s]] for s in sets], tmp_path)
    assert [list(core.resolution(s)) for s in sets] == js


def test_settings_normalized():
    st = core.normalize_project({"settings": {"res_mode": "bogus", "aspect": "7:3", "kf_fit": "x", "image_ratio": 9}})["settings"]
    assert st["res_mode"] == "mp" and st["aspect"] == "16:9" and st["kf_fit"] == "crop" and st["image_ratio"] == 0.0
    st = core.normalize_project({"settings": {"res_mode": "ratio", "ratio": "2.39:1", "aspect": "image", "image_ratio": 0.5625}})["settings"]
    assert st["res_mode"] == "ratio" and st["ratio"] == "2.39:1" and st["aspect"] == "image" and st["image_ratio"] == 0.5625


# ------------------------------------------------------------------------------------------ «Вписать кадр»
def _flf_proj(**st):
    return {"id": "f", "settings": dict(st), "assets": [{"id": "i1", "file": "a.png", "category": "other"}],
            "segments": [{"id": "s1", "prompt": "p", "frames": 121, "kf": {"mode": "flf", "first": "i1"}}]}


def test_old_frame_projects_keep_their_fit_and_keys():
    old = core.normalize_project(_flf_proj())            # saved before v6m: no kf_fit
    assert old["settings"]["kf_fit"] == "legacy" and core.kf_fit_key(old) == []
    new = core.normalize_project(_flf_proj(kf_fit="crop"))
    assert core.kf_fit_key(new) == [["fit", "crop"]]
    assert core.normalize_project({"segments": [{"frames": 121}]})["settings"]["kf_fit"] == "crop"   # no frame clips: new default
    k_old, k_crop = core.segment_keys(old, {})[0], core.segment_keys(new, {})[0]
    k_pad = core.segment_keys(core.normalize_project(_flf_proj(kf_fit="pad", kf_pad="black")), {})[0]
    k_blur = core.segment_keys(core.normalize_project(_flf_proj(kf_fit="pad")), {})[0]
    assert len({k_old, k_crop, k_pad, k_blur}) == 4   # the fit is in the key
    assert core.segment_keys(core.normalize_project(_flf_proj(kf_fit="crop", kf_pad="black")), {})[0] == k_crop   # pad only matters for "pad"


def test_kf_resize_modes():
    img = torch.zeros(1, 40, 80, 3); img[..., 1] = 1.0   # 2:1 green picture onto a 1:1 canvas
    crop = gen.kf_resize(img, 64, 64, "center"); stretch = gen.kf_resize(img, 64, 64, "disabled")
    black = gen.kf_resize(img, 64, 64, "pad_black"); blur = gen.kf_resize(img, 64, 64, "pad_blur")
    for t in (crop, stretch, black, blur):
        assert tuple(t.shape) == (1, 64, 64, 3)
    assert float(crop[0, 0, 0, 1]) > 0.9 and float(stretch[0, 0, 0, 1]) > 0.9
    assert float(black[0, 0, 32].sum()) == 0.0 and float(black[0, 32, 32, 1]) > 0.9      # bars top/bottom, picture in the middle
    assert 0.0 < float(blur[0, 0, 32, 1]) < 0.9                                          # blurred, darkened bar
    assert gen.kf_crops("legacy") == ("disabled", "center") and gen.kf_crops("crop") == ("center", "center")
    assert gen.kf_crops("pad", "black") == ("pad_black", "pad_black") and gen.kf_crops("stretch") == ("disabled", "disabled")


# ------------------------------------------------------------------------------------------ FLF model of a preset
PR = {"id": "p1", "name": "REF", "base": "unet", "model": "minimax_h3_ref2va_bf16.safetensors", "dtype": "default", "clip": "c.safetensors", "loras": []}


def _seg_preset(preset, auto=None, monkeypatch=None):
    monkeypatch.setattr(core, "FLF_AUTO", (lambda: auto))
    p = core.normalize_project({"settings": {"model_preset": "p1"}, "model_presets": {"p1": preset},
                                "assets": [{"id": "i1", "file": "a.png", "category": "other"}],
                                "segments": [{"frames": 121}, {"frames": 121, "kf": {"mode": "flf", "first": "i1"}}]})
    return core.segment_preset(p, 0), core.segment_preset(p, 1)


def test_flf_model_of_the_preset(monkeypatch):
    ref, flf = _seg_preset(dict(PR, flf_model="minimax_h3_fl2va_fp8.safetensors", flf_dtype="fp8_e4m3fn"), monkeypatch=monkeypatch)
    assert ref["model"] == PR["model"] and flf["model"] == "minimax_h3_fl2va_fp8.safetensors" and flf["dtype"] == "fp8_e4m3fn"
    assert flf["clip"] == PR["clip"]   # encoders shared
    assert core.preset_fingerprint(ref) != core.preset_fingerprint(flf)
    _, flf = _seg_preset(dict(PR), auto="minimax_h3_fl2va_bf16.safetensors", monkeypatch=monkeypatch)
    assert flf["model"] == "minimax_h3_fl2va_bf16.safetensors" and not flf.get("flf_missing")
    _, flf = _seg_preset(dict(PR, model="minimax_h3_fl2va_bf16.safetensors"), monkeypatch=monkeypatch)
    assert flf["model"] == "minimax_h3_fl2va_bf16.safetensors"
    _, flf = _seg_preset(dict(PR), auto=None, monkeypatch=monkeypatch)
    assert flf.get("flf_missing")


def test_missing_fl2va_stops_clearly(monkeypatch):
    from h3s import h3s_models as hm
    monkeypatch.setattr(core, "FLF_AUTO", lambda: None)
    p = core.normalize_project({"settings": {"model_preset": "p1"}, "model_presets": {"p1": dict(PR)},
                                "assets": [{"id": "i1", "file": "a.png", "category": "other"}],
                                "segments": [{"frames": 121, "kf": {"mode": "flf", "first": "i1"}}]})
    monkeypatch.setattr(hm, "full_path", lambda kind, name: "/x/" + name)
    mr = hm.Resolver(p, model=None, clip=None, vae=object(), audio_vae=object())
    with pytest.raises(Exception) as e:
        mr.check()
    assert "fl2va" in str(e.value) and "Модель для FLF" in str(e.value)


# ------------------------------------------------------------------------------------------ «Участок» key tail
def _rproj(audio_len):
    return {"id": "r", "settings": {"seed": 1},
            "assets": [{"id": "a1", "file": "song.wav", "category": "audio", "duration": 60}],
            "segments": [{"id": "s1", "prompt": "a", "frames": 124}, {"id": "s2", "prompt": "b", "frames": 124, "link": "extend"},
                         {"id": "s3", "prompt": "c", "frames": 124, "link": "extend"}],
            "audio": {"clips": [{"id": "c1", "asset": "a1", "lane": 0, "start": 0.0, "in": 0.0, "length": audio_len}]},
            "regions": [{"id": "r1", "start": 30, "end": 90, "prompt": "x"}]}


def _rkey(p):
    p = core.normalize_project(p)
    win = core.region_window(p, p["regions"][0])
    return core.region_key(p, p["regions"][0], win, core.segment_keys(p, {})), win


def test_region_key_ignores_audio_changes_outside_the_region():
    k1, win = _rkey(_rproj(14.0))
    assert win["we"] / core.FPS < 14.0   # the clip runs well past the region window
    k2, _ = _rkey(_rproj(14.5))          # extended outside the window
    assert k1 == k2
    p = _rproj(14.0); p["audio"]["clips"][0]["in"] = 0.5   # what is heard inside changes
    assert _rkey(p)[0] != k1


def test_region_track_old_form_when_inside():
    p = core.normalize_project(_rproj(1.0))
    p["audio"]["clips"][0]["start"] = 2.0
    win = dict(core.region_window(p, p["regions"][0]), ws=0, we=24 * 10)
    assert core.region_track(p, win) == list(core.lock_clips(p))


def test_ref_and_flf_models_are_released_when_a_run_does_not_need_them(monkeypatch):
    """Memory policy: the resolver releases cached preset base models no clip of the run uses — the FLF model is
    dropped for a REF-only project and the REF model for an FLF-only one; a mixed project keeps both."""
    from h3s import h3s_models as hm
    monkeypatch.setattr(core, "FLF_AUTO", lambda: None)
    pr = dict(PR, flf_model="minimax_h3_fl2va_fp8.safetensors", flf_dtype="default")
    ref_k = ("unet", PR["model"], "default", "x"); flf_k = ("unet", "minimax_h3_fl2va_fp8.safetensors", "default", "x")
    evicted = []
    monkeypatch.setattr(hm, "_evict", lambda store, keep, what: evicted.append((what, sorted(set(store) - set(keep)))))

    def run(kinds):
        evicted.clear()
        monkeypatch.setattr(hm.CACHE, "base", {ref_k: object(), flf_k: object()})
        monkeypatch.setattr(hm.CACHE, "clip", {}); monkeypatch.setattr(hm.CACHE, "vae", {}); monkeypatch.setattr(hm.CACHE, "lora", {})
        segs = [{"frames": 121, "kf": {"mode": "flf", "first": "i1"}} if k == "flf" else {"frames": 121} for k in kinds]
        p = core.normalize_project({"settings": {"model_preset": "p1"}, "model_presets": {"p1": pr},
                                    "assets": [{"id": "i1", "file": "a.png", "category": "other"}], "segments": segs})
        hm.Resolver(p)
        return [x for w, xs in evicted if w == "base model" for x in xs]
    assert run(["ref", "ref"]) == [flf_k]
    assert run(["flf"]) == [ref_k]
    assert run(["ref", "flf"]) == []
