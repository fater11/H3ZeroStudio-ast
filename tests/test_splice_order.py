"""Splice → AI TV order: every shot gets its own cut of the spliced reference as a normal video asset."""
import os

import numpy as np
import pytest

folder_paths = pytest.importorskip("folder_paths")

from h3s import h3s_media as media
from h3s import h3s_splice as sp
from h3s import h3s_tv as tv

W, H = 160, 64
SCRIPT = """стиль: A realistic live-action scene, real-time speed, no slow motion.
сцена: A wide shot of a wooden floor.
персонаж: <Subject 1> is the dancer in the grey coat.
движение 0.0-1.0
переход 1.5: он опускается на одно колено, потом встаёт
движение 1.0-2.0
звук: A quiet room.
музыка: N/A
"""


def _source(tmp_path, seconds=2.0):
    frames = []
    for k in range(int(seconds * 24)):
        a = np.zeros((H, W, 3), dtype="float32")
        x = int(4 + k * 3)
        a[H // 3:2 * H // 3, x:x + 20] = 1.0
        frames.append(a)
    import torch
    path = str(tmp_path / "src.mp4")
    media.write_mp4(path, torch.from_numpy(np.stack(frames)), fps=24)
    return path


@pytest.fixture()
def brand():
    made = tv.brand_save({"name": "splice test", "render": {"model": "m.safetensors", "clip": "c.safetensors",
                                                           "vae": "v.safetensors", "width": 160, "height": 64}})
    yield made
    tv.brand_delete(made["id"])


def test_plan_records_where_each_shot_sits_in_the_splice(tmp_path):
    src = _source(tmp_path)
    script = sp.parse_script(SCRIPT)
    tl = sp.build_timeline(script, src_dur=2.0)
    plan = sp.plan_shots(script, tl, "test", src, w=W, h=H)
    starts = [s["src_start"] for s in plan["segments"]]
    assert starts[0] == 0 and starts == sorted(starts) and len(set(starts)) == len(starts)
    assert starts[1] == plan["segments"][0]["frames"]         # the next shot starts where the first ends
    second = plan["segments"][1]
    assert starts[2] == starts[1] + second["frames"] - second["overlap"]
    assert [s["kind"] for s in plan["segments"]] == [s["kind"] for s in tl["shots"]]


def test_to_order_cuts_a_reference_clip_per_shot(tmp_path, brand):
    src = _source(tmp_path)
    ref = str(tmp_path / "ref.mp4")
    out = sp.write_splice(SCRIPT, src, str(tmp_path), name="test", w=W, h=H)
    plan = out["plan"]
    os.replace(out["reference"]["path"], ref)
    plan = sp.plan_shots(sp.parse_script(SCRIPT), sp.build_timeline(sp.parse_script(SCRIPT), src_dur=2.0),
                         "test", ref, w=W, h=H)
    order = sp.to_order(plan, ref, "test", brand["id"])
    assert order["kind"] == "splice" and len(order["scenes"]) == len(plan["segments"])
    assert order["source"] == ref and order["frames_total"] > 0
    inp = os.path.abspath(folder_paths.get_input_directory())
    motion = [s for s in order["scenes"] if s["refs"]]
    assert motion, "a video shot must carry its motion reference"
    for scene in motion:
        for rid in scene["refs"]:
            asset = next(a for a in order["assets"] if a["id"] == rid)
            assert asset["category"] == "video" and os.path.isfile(os.path.join(inp, asset["file"]))
        assert scene["prompt"].startswith("subject_definitions")
    text_scene = next(s for s in order["scenes"] if s["kind"] == "text")
    assert text_scene["refs"] == [] and "колено" in text_scene["prompt"]   # the words are kept as written


def test_order_scene_becomes_a_normal_project(tmp_path, brand):
    src = _source(tmp_path)
    out = sp.write_splice(SCRIPT, src, str(tmp_path), name="test", w=W, h=H)
    order = sp.to_order(out["plan"], out["reference"]["path"], "test", brand["id"])
    scene = order["scenes"][0]
    project = tv._project_for_scene(order, tv.brand_get(brand["id"]), scene)
    assert [a["id"] for a in project["assets"]] == [a["id"] for a in order["assets"]]
    seg = project["segments"][0]
    assert seg["frames"] == scene["frames"] and seg["refs"] == scene["refs"]
    want = tv.normalize_render(tv.brand_get(brand["id"])["render"])
    assert project["settings"]["width"] == want["width"] and project["settings"]["height"] == want["height"]
    # the scene's own cut is a real file the pipeline can read
    asset = next(a for a in project["assets"] if a["id"] == seg["refs"][0])
    path = os.path.join(os.path.abspath(folder_paths.get_input_directory()), asset["file"])
    info = media.video_info(path)
    assert info["frames"] >= scene["frames"] - 2 and abs(info["duration"] - scene["frames"] / 24) < 0.3
