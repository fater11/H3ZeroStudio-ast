"""Ref splice: script → timeline → spliced reference video → shot plan."""
import numpy as np
import pytest

from h3s import h3s_core as core
from h3s import h3s_media as media
from h3s import h3s_splice as sp

SCRIPT = """# бой
стиль: A realistic live-action scene, real-time speed, no slow motion.
сцена: A side-on medium-wide shot of a wooden fight floor, warm spotlights.
персонаж: <Subject 1> is the fighter in the black sleeveless top.
персонаж: <Subject 2> is the bearded heavyweight in black armour.
движение 1.5-2.0
переход 1.5: <Subject 1> drops onto one knee, then stands back up
движение 0.5-1.0
звук: A loud crowd, thuds of kicks on armour.
музыка: N/A
"""


def test_parse_script_reads_keys_items_and_times():
    parsed = sp.parse_script("style: A realistic scene.\nsubject: <Subject 1> is a dancer.\n"
                             "движение 0:02.5-4\nпереход 1\nclip 4-4.5\nмузыка: N/A\n")
    assert parsed["style"] == "A realistic scene."
    assert parsed["subject"] == ["<Subject 1> is a dancer."]
    assert parsed["music"] == "N/A"
    assert [i["kind"] for i in parsed["items"]] == ["clip", "gap", "clip"]
    assert parsed["items"][0]["a"] == 2.5 and parsed["items"][0]["b"] == 4.0


def test_parse_script_rejects_bad_lines():
    with pytest.raises(sp.SpliceError, match="не понята"):
        sp.parse_script("движение 0-1\nчепуха тут\n")
    with pytest.raises(sp.SpliceError, match="нет ни одного движения"):
        sp.parse_script("style: x\nпереход 1\n")
    with pytest.raises(sp.SpliceError, match="короче 5 кадров"):
        sp.parse_script("движение 1.00-1.05\n")
    with pytest.raises(sp.SpliceError, match="не позже начала"):
        sp.parse_script("движение 2-1\n")


def test_parse_script_notes_words_on_a_move_and_stray_transitions():
    parsed = sp.parse_script("движение 0-1: он бежит\nпереход 1\nпереход 1: он прыгает\nдвижение 2-3\nпереход 1\n")
    assert [i["kind"] for i in parsed["items"]] == ["clip", "gap", "clip"]
    assert any("слова на движении" in n for n in parsed["notes"])
    assert any("два подряд" in n for n in parsed["notes"])
    assert any("в конце пропущен" in n for n in parsed["notes"])


def test_timeline_takes_frames_from_the_source_in_the_written_order():
    tl = sp.build_timeline(sp.parse_script("движение 1.5-2.0\nпереход 0.5\nдвижение 0.5-1.0\n"))
    kinds = [op[0] for op in tl["ops"]]
    assert kinds.count("src") == 24 + 2 * sp.HOLD   # two 0.5 s clips, plus the holds of the dissolve
    assert kinds.count("mix") == int(24 * 0.5) - 2 * sp.HOLD
    assert kinds.count("still") == sp.END_PAD
    src_times = [op[1] for op in tl["ops"] if op[0] == "src"]
    assert src_times[0] == pytest.approx(1.5)     # the first clip is the LATER one of the source
    assert src_times[12 + sp.HOLD] == pytest.approx(0.5)   # then the earlier one: the order is the script's
    assert src_times[-1] == pytest.approx(1.0 - 1 / 24)
    assert len(tl["shots"]) == 1 and tl["shots"][0]["length"] % 17 == 5


def test_a_transition_with_words_becomes_its_own_shot():
    tl = sp.build_timeline(sp.parse_script("движение 0-1\nпереход 1.5: он встаёт\nдвижение 2-3\n"))
    kinds = [s["kind"] for s in tl["shots"]]
    assert kinds == ["video", "text", "video"]
    text, after = tl["shots"][1], tl["shots"][2]
    assert text["overlap"] == sp.CARRY and (text["length"] - 5) % 17 == 0
    assert after["overlap"] == sp.CARRY                        # the new move is carried from the transition
    assert tl["shots"][0]["overlap"] == 0
    assert "он встаёт" in text["text"]


def test_timeline_rejects_a_clip_past_the_end_of_the_source():
    with pytest.raises(sp.SpliceError, match="в видео всего"):
        sp.build_timeline(sp.parse_script("движение 0-5\n"), src_dur=2.0)


def test_shot_prompt_keeps_the_reference_moves_and_our_subjects():
    script = sp.parse_script(SCRIPT)
    tl = sp.build_timeline(script, src_dur=2.0)
    prompt = sp.shot_prompt(script, tl["shots"][0], pictures=2, has_audio=False)
    assert "<Video 1> is the motion and camera reference" in prompt
    assert "partially_preserved" in prompt and "0.00 to 0.50" in prompt
    assert "[0.00s] The people move exactly as in <Video 1>." in prompt
    assert "fully_preserved" in prompt and "<Subject 2>" in prompt
    assert prompt.rstrip().endswith("N/A")
    text_shot = sp.shot_prompt(script, tl["shots"][1], pictures=2)
    assert "motion and camera reference" not in text_shot
    # a subject line pointing at <Video 1> is pointed at the previous shot for a text-only shot
    pointed = sp.parse_script("персонаж: <Subject 1> is the dancer seen in <Video 1>.\n"
                              "движение 0-1\nпереход 1.5: он встаёт\nдвижение 2-3\n")
    tl2 = sp.build_timeline(pointed, src_dur=3.0)
    assert "the shot before" in sp.shot_prompt(pointed, tl2["shots"][1], pictures=1)
    # the words of the transition live in the text shot, timed from its own carried frames
    assert "[1.62s] <Subject 1> drops onto one knee, then stands back up." in text_shot


def test_plan_shots_carries_tokens_budget_and_notes():
    script = sp.parse_script(SCRIPT)
    tl = sp.build_timeline(script, src_dur=2.0)
    plan = sp.plan_shots(script, tl, "бой", "ref.mp4", characters=["hero.png", "villain.png"],
                         w=1344, h=768, budget=1)
    assert plan["shots"] == len(tl["shots"]) and plan["source"] == "ref.mp4"
    assert all(s["characters"] == ["hero.png", "villain.png"] for s in plan["segments"])
    assert all(s["video"] == ["ref.mp4"] for s in plan["segments"] if s["kind"] == "video")
    assert all(not s["video"] for s in plan["segments"] if s["kind"] == "text")
    assert plan["notes"] == tl["notes"]


def test_script_to_text_round_trip():
    script = sp.parse_script(SCRIPT)
    again = sp.parse_script(sp.script_to_text(script))
    assert again["style"] == script["style"] and again["subject"] == script["subject"]
    assert [(i["kind"], round(i.get("a", i.get("sec")), 3)) for i in again["items"]] == \
           [(i["kind"], round(i.get("a", i.get("sec")), 3)) for i in script["items"]]


def tl_frames(tl):
    return max(sp.total_src_frames(tl["ops"]), 2)


W, H = 200, 64          # a wide canvas: the bar never leaves, so its place is a reliable fingerprint


def _source(tmp_path, seconds=2.0, w=W, h=H):
    """A bar walking to the right: the few pixels that change are enough to prove a reorder."""
    frames = []
    for k in range(int(seconds * 24)):
        a = np.zeros((h, w, 3), dtype="float32")
        x = int(5 + k * 4)
        a[h // 3:2 * h // 3, x:x + 24] = 1.0   # write_mp4 takes 0..1
        frames.append(a)
    import torch
    path = str(tmp_path / "src.mp4")
    media.write_mp4(path, torch.from_numpy(np.stack(frames)), fps=24)
    return path


def _bar(arr):
    """Where the bright bar sits: weighted centre of the column sums."""
    cols = np.asarray(arr, dtype="float32")[..., 0].sum(axis=0)
    total = cols.sum()
    return float((cols * np.arange(len(cols))).sum() / total) if total > 0 else -1.0


def test_render_writes_the_spliced_reference_video(tmp_path):
    src = _source(tmp_path)
    script = sp.parse_script("движение 1.5-2.0\nпереход 0.5\nдвижение 0.5-1.0\n")
    tl = sp.build_timeline(script, src_dur=2.0)
    out = str(tmp_path / "ref.mp4")
    res = sp.render(tl["ops"], src, out, w=W, h=H, audio=tl["audio"])
    assert res["frames"] == len(tl["ops"]) and res["width"] == W and res["height"] == H
    got = np.asarray(media.load_video_frames(out, 0, res["frames"], W, H), dtype="float32")
    assert len(got) == res["frames"]
    source = np.asarray(media.load_video_frames(src, 0, tl_frames(tl), W, H), dtype="float32")
    # frame 0 is the source at 1.5 s and the frame after the dissolve is the source at 0.5 s ...
    assert _bar(got[0]) == pytest.approx(_bar(source[36]), abs=8)
    assert _bar(got[24]) == pytest.approx(_bar(source[12]), abs=8)
    # ... while the source's own first frame sat far to the left: the order really changed
    assert _bar(got[0]) - _bar(source[0]) > 60
    assert res["duration"] == pytest.approx(res["frames"] / 24, abs=0.05)
    assert media.video_info(out)["has_audio"] is False      # у синтетического исходника звука нет


def test_draft_script_splits_on_cuts(tmp_path):
    src = _source(tmp_path, 2.0)
    text = sp.draft_script(src, duration=2.0, cuts=[0.8], max_clips=2, min_clip=0.5)
    assert "переход 1" in text
    parsed = sp.parse_script(text)
    edges = [(i["a"], i["b"]) for i in parsed["items"] if i["kind"] == "clip"]
    assert edges[0][0] == 0.0 and edges[-1][1] == pytest.approx(2.0)
    assert any(b == pytest.approx(0.79, abs=0.02) for _a, b in edges)   # 0.8 s snaps to frame 19


def test_write_splice_runs_the_whole_pipeline(tmp_path):
    src = _source(tmp_path)
    out = sp.write_splice(SCRIPT, src, str(tmp_path / "out"), name="бой", w=W, h=H, budget=10_000)
    assert out["reference"]["frames"] > 0
    import os
    assert os.path.exists(out["reference"]["path"])
    assert out["plan"]["shots"] == len(out["timeline"]["shots"]) >= 3
    assert out["plan"]["reference"]["path"] == out["reference"]["path"]
