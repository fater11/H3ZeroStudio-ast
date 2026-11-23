"""Swap video source limits: never silently hold EOF on generated frames."""
from h3s import h3s_core as core


def project():
    return core.normalize_project({
        "id": "swap-overrun",
        "assets": [{"id": "v", "category": "video", "file": "guide.mp4",
                    "frames": 273, "duration": 273 / 24}],
        "settings": {"overlap_blocks": 2},
        "segments": [
            {"id": "a", "frames": 141, "link": "cut",
             "source": {"asset": "v", "in": 0, "swap": True}},
            {"id": "b", "frames": 175, "link": "extend",
             "source": {"asset": "v", "in": 226, "swap": True}},
        ],
    })


def test_swap_out_of_bounds_detects_frozen_tail():
    p = project()
    bad = core.swap_source_overruns(p)
    assert len(bad) == 1
    assert bad[0] == {"index": 1, "start": 226, "need": 175, "visible": 175,
                      "total": 273, "remaining": 47, "missing": 128}
    p["end"] = 273
    assert core.swap_source_overruns(p)[0]["missing"] == 124  # 4 tail frames trimmed


def test_synced_swap_uses_only_real_source_frames():
    p = project()
    p["segments"][1]["source"]["in"] = 98
    assert core.swap_source_overruns(p) == []


def test_regular_footage_can_still_hold_final_frame():
    p = project()
    p["segments"][1]["source"]["swap"] = False
    assert core.swap_source_overruns(p) == []


def test_final_lattice_padding_is_trimmed_not_visible():
    p = core.normalize_project({
        "id": "trimmed-swap", "end": 720,
        "assets": [{"id": "v", "category": "video", "file": "v.mp4", "frames": 720}],
        "segments": [
            {"id": f"s{i}", "frames": f, "link": "cut",
             "source": {"asset": "v", "swap": True, "in": off}}
            for i, (off, f) in enumerate([(0, 226), (226, 226), (452, 226), (678, 56)])
        ],
    })
    assert core.swap_source_overruns(p) == []  # 14 padding frames are past the end marker
    p["end"] = 0
    assert core.swap_source_overruns(p)[0]["missing"] == 14
