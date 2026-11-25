"""Multi-person cast: box linking, numbering, left-to-right order, keyframe moments, package round trip."""
import json
import zipfile

import numpy as np
import pytest

from h3s import h3s_cast as cast


def person(x, y=0.2, w=0.15, h=0.5):
    return (x, y, x + w, y + h)


def test_iou_and_link_tracks_split_and_survive_a_gap():
    frames = [[person(0.10), person(0.60)],
              [person(0.11), person(0.61)],
              [person(0.12)],                      # one person lost for a frame
              [person(0.13), person(0.62)]]
    tracks = cast.link_tracks(frames)
    assert len(tracks) == 2, tracks          # the gap does not create a third number
    assert [len(t["frames"]) for t in tracks] == [4, 3]


def test_number_cast_orders_by_first_appearance_and_ignores_a_glimpse():
    frames = [[person(0.60)]] * 6 + [[person(0.60), person(0.10)]] * 6   # 1 s each at the 6 fps rate
    tracks = cast.link_tracks(frames)
    numbered = cast.number_cast(tracks)
    numbers = {tuple(t["frames"]): t.get("number") for t in numbered}
    assert 1 in numbers.values() and 2 in numbers.values()
    first = min(numbered, key=lambda t: t["frames"][0])
    assert first["number"] == 1                       # appeared first, even though it is on the right
    alone = cast.number_cast(cast.link_tracks([[person(0.3)]]))   # 1 frame @6 fps < min_visible_s
    assert alone[0]["number"] == 0


def test_left_to_right_and_box_helpers():
    boxes = [person(0.60), person(0.10), person(0.35)]
    assert cast.left_to_right(boxes) == [2, 3, 1]     # 1-based, counted from the left edge
    assert cast.box_percent((0.1, 0.2, 0.4, 0.7)) == [10.0, 20.0, 40.0, 70.0]
    assert cast.cut_by_edges((0.0, 0.2, 0.4, 0.7)) and not cast.cut_by_edges((0.1, 0.2, 0.4, 0.7))


def test_assign_face_picks_the_box_holding_the_face():
    boxes = [person(0.10), person(0.55)]
    assert cast.assign_face((0.57, 0.25, 0.65, 0.33), boxes) == 2
    assert cast.assign_face((0.12, 0.24, 0.20, 0.32), boxes) == 1
    assert cast.assign_face((0.90, 0.05, 0.95, 0.10), boxes) == 0     # nobody there


def test_pick_keyframes_spreads_moments_and_avoids_cuts():
    people = [person(0.10), person(0.55)]
    frames = [list(people) for _ in range(120)]       # 20 s at the 6 fps analysis rate
    moments = cast.pick_keyframes(cast.number_cast(cast.link_tracks(frames)), 20.0, count=4,
                                 cuts=(30, 60), sample_fps=6.0)
    assert len(moments) == 4
    times = [m["at_seconds"] for m in moments]
    assert times == sorted(times)
    assert all(t not in (5.0, 10.0) for t in times)   # cut frames lose inside their slot
    assert min(b - a for a, b in zip(times, times[1:])) >= cast.KEYFRAME_MIN_GAP_S * 0.9
    assert all(len(m["people"]) == 2 for m in moments)


def test_analyse_end_to_end_builds_cast_and_moments():
    frames = [[person(0.10)] for _ in range(12)] + [[person(0.10), person(0.60)] for _ in range(24)]
    report = cast.analyse(frames, keyframes=2, sample_fps=6.0)
    assert [c["number"] for c in report["cast"]] == [1, 2]
    assert report["cast"][0]["box_percent"][0] == 10.0
    assert len(report["keyframes"]) == 2
    assert report["duration_s"] == pytest.approx(len(frames) / 6.0, abs=0.01)


def test_package_round_trip(tmp_path):
    frames = {6: np.zeros((16, 24, 3), dtype="uint8"), 18: np.full((16, 24, 3), 200, dtype="uint8")}
    char_path = tmp_path / "new_person.png"
    from PIL import Image
    Image.fromarray(np.full((8, 8, 3), 128, dtype="uint8")).save(char_path)
    keyframes = [{"frame": 6, "at_seconds": 1.0, "keyindex": 1, "people": [(1, person(0.1))],
                  "labels": {1: "picture 1", "keeps": [2]}, "sentence": "two people dance"},
                 {"frame": 18, "at_seconds": 3.0, "keyindex": 2, "people": [(1, person(0.5))],
                  "labels": {1: "stays"}, "sentence": ""}]
    request = cast.build_request("dancers", keyframes, [{"file": "character_picture_1.png",
                                                        "path": str(char_path), "replaces": 1}],
                                 describe={"1": "tall woman, red dress"})
    assert request["keyframes"][0]["pictures"][0]["replaces_person_from_left"] == 1
    assert request["keyframes"][0]["keeps_people_from_left"] == [2]
    assert request["keyframes"][1]["people_in_frame"] == 1
    assert request["characters"][0]["describe_it"] is False
    zip_path = tmp_path / "pkg.zip"
    cast.export_package(zip_path, frames, keyframes, [{"file": "character_picture_1.png",
                                                       "path": str(char_path)}], request)
    with zipfile.ZipFile(zip_path) as z:
        names = set(z.namelist())
    assert {"request.json", "keyframe_1.png", "keyframe_2.png", "character_picture_1.png",
            "README_for_AI.md"} <= names
    assert cast.read_request(zip_path)["package"] == "dancers"
    answer = cast.import_answer(zip_path, {"keyframe_prompts": {"1": "red dress dancers", "2": "wide shot"}})
    assert answer["keyframes"] == 2 and answer["prompts"]["2"] == "wide shot"
    with pytest.raises(ValueError):
        cast.import_answer(zip_path, {"keyframe_prompts": {"1": "only one"}})
    with pytest.raises(ValueError):
        cast.import_answer(zip_path, {"wrong": {}})
    assert cast.answer_file_for(zip_path).endswith("_answer.json")
