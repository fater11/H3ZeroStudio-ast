"""v6h audio fixes: «Улучшить звук» sticks to the clip (later runs / upscale keep the enhanced sound) and an
upscaled take reuses the exact wave of the take it was made from."""
import copy

import numpy as np
import pytest
import torch
from PIL import Image

import folder_paths
from h3s import h3s_core as core
from h3s import h3s_gen as gen
from h3s import h3s_store as store
from fakes import tiny_patcher, FakeClip, FakeVAE, FakeAudioVAE

AR = {"steps": 2, "denoise": 0.5, "video_denoise": 0}


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
    Image.fromarray((np.random.rand(64, 96, 3) * 255).astype("uint8")).save(inp / "h3labstudio" / "hero.png")
    return out, inp


BASE = {"id": "ark", "settings": {"res_mode": "custom", "width": 96, "height": 64, "steps": 2, "cfg": 1.0,
                                  "sampler": "euler", "scheduler": "simple"},
        "assets": [{"id": "a1", "file": "hero.png", "subfolder": "h3labstudio", "category": "character"}],
        "segments": [{"id": "s1", "frames": 39, "prompt": "one", "refs": ["a1"]}]}


def run(patcher, p):
    return gen.run_project(patcher, FakeClip(), FakeVAE(), copy.deepcopy(p), FakeAudioVAE())


def test_enhanced_sound_survives_later_runs(patcher, dirs, capsys):
    r1 = run(patcher, BASE)[3]["segments"][0]
    p2 = copy.deepcopy(BASE)
    p2["run"] = {"only": 0, "audio": AR}
    _, au2, lat2, info2 = run(patcher, p2)
    r2 = info2["segments"][0]
    assert r2["key"].startswith(r1["key"] + "A") and r2["ar"] == core.normalize_ar(AR)
    # before v6h a later ordinary run fell back to the base key (and its original sound); now seg.ar keeps it
    p3 = copy.deepcopy(BASE)
    p3["segments"][0]["ar"] = r2["ar"]
    capsys.readouterr()
    _, au3, lat3, info3 = run(patcher, p3)
    assert info3["segments"][0]["key"] == r2["key"] and "audio refine from cache" in capsys.readouterr().out
    assert torch.equal(lat3["samples"].unbind()[1], lat2["samples"].unbind()[1])
    # the base take (no seg.ar) still plays its own sound
    assert run(patcher, BASE)[3]["segments"][0]["key"] == r1["key"]


def test_upscaled_enhanced_take_keeps_the_same_wave(patcher, dirs):
    run(patcher, BASE)
    p2 = copy.deepcopy(BASE)
    p2["run"] = {"only": 0, "audio": AR}
    _, _, lat2, info2 = run(patcher, p2)
    r2 = info2["segments"][0]
    p3 = copy.deepcopy(BASE)
    p3["segments"][0]["ar"] = r2["ar"]
    p3["segments"][0]["upscale"] = {"method": "latent", "scale": 2}
    _, _, lat3, info3 = run(patcher, p3)
    r3 = info3["segments"][0]
    assert r3["key"] != r2["key"] and r3["key"].endswith(r2["key"][len(r2["key"].split("A")[0]):])   # + the audio-refine suffix
    assert torch.equal(lat3["samples"].unbind()[1], lat2["samples"].unbind()[1]), "upscale keeps the enhanced latent sound"
    d = gen.project_dir(core.normalize_project(copy.deepcopy(BASE)))[0]
    w2, w3 = store.load_wave(d, r2["key"]), store.load_wave(d, r3["key"])
    assert w2 is not None and w3 is not None and torch.equal(w2[0], w3[0]) and w2[1] == w3[1], "bit-identical wave"
