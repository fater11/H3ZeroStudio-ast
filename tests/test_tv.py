"""AI TV Studio: script planning on the H3 grid, brand storage, duplicate hashing, overlay command."""
import json
import os
import shutil
import subprocess

import pytest

from h3s import h3s_tv as tv


def test_plan_keeps_h3_grid_and_exact_total(tmp_path, monkeypatch):
    monkeypatch.setattr(tv, "root", lambda: str(tmp_path))
    for minutes in (3, 5, 10):
        scenes = tv.plan(minutes, "medium", "")
        frames = [s["frames"] for s in scenes]
        want = minutes * 60 * tv.FPS
        assert sum(tv.exported_frames(scenes, want)) == want   # the tail scene is cut at the frame budget
        assert sum(frames) >= want and sum(frames) - want < tv.TRAINED[0]
        assert all((f - 5) % tv.GRID == 0 for f in frames), frames
        assert all(tv.TRAINED[0] <= f <= tv.TRAINED[1] for f in frames), frames
        assert scenes[0]["link"] == "cut" and all(s["link"] == "extend" for s in scenes[1:])


def test_plan_inserts_cta_slots_and_pace_bounds(tmp_path, monkeypatch):
    monkeypatch.setattr(tv, "root", lambda: str(tmp_path))
    scenes = tv.plan(3, "calm", "Заходите к нам")
    assert any(s["kind"] == "cta" for s in scenes)
    assert all(s["text"] == "Заходите к нам" for s in scenes if s["kind"] == "cta")
    calm = tv.plan(3, "calm", "")
    fast = tv.plan(3, "fast", "")
    assert min(s["frames"] for s in fast) <= min(s["frames"] for s in calm)
    assert len(fast) >= len(calm)   # faster pace = more, shorter scenes


def test_brand_roundtrip_and_normalization(tmp_path, monkeypatch):
    monkeypatch.setattr(tv, "root", lambda: str(tmp_path))
    saved = tv.brand_save({"name": "Кофейня на углу", "accent": "#ff8800", "cta_seconds": 999,
                           "logo_pos": "xx", "render": {"model": "m.safetensors", "piflow_steps": 7}})
    assert saved["id"] == "кофейня-на-углу" and saved["logo_pos"] == "br" and saved["cta_seconds"] == 60.0
    assert saved["render"]["piflow_steps"] == 0 and saved["render"]["no_audio"] is False
    assert [b["id"] for b in tv.brands()] == [saved["id"]]
    assert tv.brand_get(saved["id"])["name"] == "Кофейня на углу"
    tv.brand_delete(saved["id"])
    assert tv.brands() == []
    with pytest.raises(ValueError):
        tv.brand_save({"name": "  "})


def test_order_create_uses_brand_and_writes_scene_projects(tmp_path, monkeypatch):
    monkeypatch.setattr(tv, "root", lambda: str(tmp_path))
    tv.brand_save({"name": "Bar", "cta_text": "Скидка", "style_prefix": "тёплый свет,",
                   "render": {"model": "video\\H3\\x.safetensors", "clip": "clip.safetensors",
                              "width": 1344, "height": 768, "piflow_steps": 2, "no_audio": True}})
    order = tv.order_create("Вечер", "bar", 3, "medium", ["cast-a"])
    assert order["minutes"] == 3 and order["status"] == "draft"
    assert tv.order_get(order["id"])["scenes"][0]["cast"] == ["cast-a"]
    brand = tv.brand_get("bar")
    project = tv._project_for_scene(order, brand, order["scenes"][0])
    assert project["run"]["no_audio"] is True and project["audio"]["video_volume"] == 0.0
    assert project["settings"]["piflow_steps"] == 2
    assert project["settings"]["width"] == 1344 and project["settings"]["height"] == 768
    assert project["id"] == tv.scene_project_id(order["id"], 0)
    assert project["model_presets"]["tv"]["model"].endswith("x.safetensors")
    assert not tv.status(order)["scenes"][0]["ready"]


def test_order_run_rejects_incomplete_brand(tmp_path, monkeypatch):
    monkeypatch.setattr(tv, "root", lambda: str(tmp_path))
    tv.brand_save({"name": "NoRender"})
    order = tv.order_create("Пустой", "norender", 3)
    with pytest.raises(ValueError):
        tv.order_run(order["id"])


def test_hamming_and_dupes_grouping():
    a, b = "0" * 64, "0" * 64
    assert tv.hamming(a, b) == 0
    assert tv.hamming(a, "1" * 64) == 64


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg не найден")
def test_dhash_separates_different_clips(tmp_path, monkeypatch):
    def clip(name, color):
        path = tmp_path / name
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                        f"color=c={color}:s=160x96:d=1:r=12", "-pix_fmt", "yuv420p", str(path)], check=True)
        return str(path)
    bright, bright2, dark = clip("a.mp4", "white"), clip("b.mp4", "yellow"), clip("c.mp4", "black")
    ha, hb, hc = tv.dhash(bright), tv.dhash(bright2), tv.dhash(dark)
    assert len(ha) == 72 and tv.hamming(ha, hb) < tv.hamming(ha, hc)
    assert not tv.dupes([bright, dark], threshold=6)["groups"]
    assert tv.dupes([bright, bright], threshold=6)["groups"]


def test_overlay_cmd_places_logo_and_text(tmp_path):
    cmd = tv.overlay_cmd("in.mp4", tmp_path / "out.mp4",
                         {"name": "B", "logo_pos": "tl", "logo_margin": 20, "logo_opacity": 0.5,
                          "cta_text": "Скидка 10%", "cta_seconds": 6}, logo=None, seconds=(1, 4))
    joined = " ".join(cmd)
    assert "drawtext" in joined and "between(t,1.000,4.000)" in joined
    assert str(tmp_path / "out.mp4") in cmd


def test_scene_project_has_no_audio_flag_in_export(tmp_path, monkeypatch):
    """run.no_audio travels into the project so the pack can skip the audio track."""
    monkeypatch.setattr(tv, "root", lambda: str(tmp_path))
    tv.brand_save({"name": "Mute", "render": {"model": "m", "clip": "c", "no_audio": True}})
    order = tv.order_create("Тихий", "mute", 3)
    project = tv._project_for_scene(order, tv.brand_get("mute"), order["scenes"][0])
    assert project["run"]["no_audio"] is True
    assert project["audio"]["video_volume"] == 0.0
    assert project["settings"]["cache"] is True
    json.dumps(project)   # must stay serialisable for the node's project widget
    assert os.path.isdir(str(tmp_path))
