"""No-GPU tests for SAM 3.1 Swap mask serialization, block handoff and source preservation."""
import os
import sys
import types

import numpy as np
import torch

from h3s import h3s_swap_mask as sm
from h3s import h3s_media


def test_mask_pack_roundtrip():
    rng = np.random.default_rng(3)
    source = (rng.random((4, 64, 83)) > .4).astype(np.float32)
    assert np.array_equal(sm._unpack(sm._pack(source), 83), source)
    assert sm._scaled_size(768, 1344) == (352, 640)


def test_mask_preview_uses_the_selected_shot_frame(monkeypatch):
    frames_read = []
    def source(path, frame, w, h):
        frames_read.append(frame)
        return np.zeros((h, w, 3), dtype=np.uint8)
    monkeypatch.setattr(sm, "_source_frame", source)
    monkeypatch.setattr(sm, "_outside_prompt", lambda: None)
    monkeypatch.setattr(sm, "_model", lambda: object())
    monkeypatch.setattr(sm, "_seed", lambda model, rgb, point, box=None:
                        torch.ones((1, rgb.shape[0], rgb.shape[1])))
    monkeypatch.setattr(sm, "_jpeg", lambda rgb: "data:image/jpeg;base64,fake")
    selected = sm.mask_preview("guide.mp4", [.4, .5], 320, 320,
                               [.1, .2, .5, .6], frame=115)
    original = sm.mask_preview("guide.mp4", [.4, .5], 320, 320)
    assert frames_read == [115, 0], "Shot selection must not show the mask of the first frame"
    assert selected["coverage"] == original["coverage"] == 1.0
    assert (selected["frame"], original["frame"]) == (115, 0)
    assert selected["image"].startswith("data:image/jpeg;base64,")
    try:
        sm.mask_preview("guide.mp4", [.4, .5], 320, 320, frame=-1)
        assert False, "Negative frame index must be rejected"
    except ValueError as e:
        assert "кадр" in str(e)


def test_mask_cache_blocks_and_reuse(tmp_path, monkeypatch):
    video = tmp_path / "source.mp4"
    video.write_bytes(b"test video")
    model = tmp_path / "sam3.1_multiplex_fp16.safetensors"
    model.write_bytes(b"test model")
    monkeypatch.setattr(sm, "require_model", lambda: str(model))
    monkeypatch.setattr(sm, "_model", lambda: object())
    monkeypatch.setattr(sm, "detect_shot_cuts", lambda *args: ())

    class Tracker:
        calls = []

        @classmethod
        def execute(cls, images, model, initial_mask, **kw):
            cls.calls.append((len(images), initial_mask.shape))
            assert kw["max_objects"] == 1
            return ({"masks": torch.ones(len(images), images.shape[1], images.shape[2])},)

    class ToMask:
        @classmethod
        def execute(cls, data, **kw):
            return (data["masks"],)

    fake_sam = types.ModuleType("comfy_extras.nodes_sam3")
    fake_sam.SAM3_VideoTrack = Tracker
    fake_sam.SAM3_TrackToMask = ToMask
    monkeypatch.setitem(sys.modules, "comfy_extras.nodes_sam3", fake_sam)
    monkeypatch.setattr(sm, "_seed", lambda *a: torch.ones(1, a[1].shape[0], a[1].shape[1]))

    calls = []

    def fake_frames(path, start, count, w, h, **kw):
        calls.append((start, count))
        return np.zeros((count, h, w, 3), np.float32)

    monkeypatch.setattr(h3s_media, "load_video_frames", fake_frames)

    folder, shape = sm.prepare(str(video), [.3, .6], 135, 192, 320, str(tmp_path))
    assert shape == (192, 320)
    assert Tracker.calls == [(64, (1, 320, 192)), (65, (1, 320, 192)), (8, (1, 320, 192))], "final partial block must not waste tracking on 57 padded frames"
    assert [a for a, b in calls] == [0, 63, 127]
    assert len([n for n in os.listdir(folder) if n.endswith(".npz")]) == 3
    sm.prepare(str(video), [.3, .6], 120, 192, 320, str(tmp_path))
    assert len(Tracker.calls) == 3, "mask blocks should be reused on regeneration"

    frames = torch.zeros(24, 320, 192, 3)
    frames[:, :, :, :] = 1.0
    result, info = sm.composite(str(video), 70, frames,
                                {"at": 0, "point": [.3, .6]}, str(tmp_path))
    assert info["active"] == 24 and info["preserved"] == 0
    assert float(result.mean()) > .99
    assert len(Tracker.calls) == 3

    # Paste is CPU-heavy: decode in larger spans and open each cached SAM block only once.
    opened = []
    original_load = sm._load_block
    def counted_load(filename):
        opened.append(filename)
        return original_load(filename)
    monkeypatch.setattr(sm, "_load_block", counted_load)
    calls.clear()
    sm.composite(str(video), 5, torch.ones(80, 320, 192, 3),
                 {"at": 0, "point": [.3, .6]}, str(tmp_path))
    assert len(opened) == 4 and opened[2:] == opened[:2], (
        "prepare validates the two cached blocks; paste must decompress each only once")
    assert [n for _, n in calls] == [32, 32, 16], "source video is decoded in bounded batches"


def test_identity_guard_rejects_only_large_mask_teleports():
    left = np.zeros((64, 128), np.float32)
    middle = np.zeros_like(left)
    right = np.zeros_like(left)
    left[10:50, 8:35] = 1
    middle[11:51, 10:37] = 1
    right[10:50, 93:120] = 1
    a = sm._mask_geometry(left)
    assert not sm._mask_identity_jump(a, sm._mask_geometry(middle))
    assert sm._mask_identity_jump(a, sm._mask_geometry(right))
    assert not sm._mask_identity_jump(None, sm._mask_geometry(right))
    assert not sm._mask_identity_jump(a, None)


def test_identity_guard_preserves_original_on_jump_and_across_segments(tmp_path, monkeypatch):
    folder = tmp_path / "tracked"
    masks = np.zeros((3, 64, 128), np.float32)
    masks[0, 10:50, 8:35] = 1
    masks[1, 10:50, 93:120] = 1  # tracker jumped to somebody else
    masks[2, 10:50, 8:35] = 1
    sm._save_block(str(folder / "mask_000000.npz"), masks)
    monkeypatch.setattr(sm, "prepare", lambda *args, **kwargs: (str(folder), (128, 64)))
    monkeypatch.setattr(sm, "detect_shot_cuts", lambda *args: ())
    monkeypatch.setattr(h3s_media, "load_video_frames",
                        lambda path, start, count, w, h, **kw: np.zeros((count, h, w, 3), np.float32))
    data = torch.ones((3, 64, 128, 3), dtype=torch.float32)
    masked, report = sm.composite("guide.mp4", 0, data.clone(),
                                  {"at": 0, "point": [.2, .5], "guard": True}, str(tmp_path))
    assert report["guarded"] == 1 and report["active"] == 2
    assert float(masked[0].max()) > .9 and float(masked[1].max()) == 0
    assert float(masked[2].max()) > .9
    unguarded, report_plain = sm.composite("guide.mp4", 0, data.clone(),
                                           {"at": 0, "point": [.2, .5]}, str(tmp_path))
    assert report_plain["guarded"] == 0 and report_plain["active"] == 3
    assert float(unguarded[1].max()) > .9, "Old mode must remain unchanged"
    tail, tail_report = sm.composite("guide.mp4", 1, data[:2].clone(),
                                     {"at": 0, "point": [.2, .5], "guard": True}, str(tmp_path))
    assert tail_report["guarded"] == 1 and float(tail[0].max()) == 0
    assert float(tail[1].max()) > .9, "The next segment should recover the original person"


def test_source_mask_is_opt_in_and_saved():
    from h3s import h3s_core as core
    p = core.normalize_project({
        "id": "sam_mask", "assets": [{"id": "v", "file": "x.mp4", "category": "video"}],
        "segments": [{"id": "s", "source": {"asset": "v", "swap": True, "in": 124,
          "swap_mask": {"model": "sam3.1", "at": 0, "box": [.1, .2, .4, .5],
                        "point": [.33, .66]}}}],
    })
    src = p["segments"][0]["source"]
    assert src["swap_mask"] == {"model": "sam3.1", "at": 0, "box": [.1, .2, .4, .5],
                                "point": [.33, .66]}
    guarded = core.normalize_project({"id": "guarded", "assets": p["assets"],
        "segments": [{"id": "s", "source": {"asset": "v", "swap": True,
            "swap_mask": {"at": 0, "point": [.33, .66], "guard": True}}}]})
    assert guarded["segments"][0]["source"]["swap_mask"]["guard"] is True
    assert "guard" not in src["swap_mask"], "Existing saved projects keep the old behavior"
    off = core.normalize_project({"id": "plain", "assets": p["assets"],
                                  "segments": [{"id": "s", "source": {"asset": "v", "swap": True}}]})
    assert "swap_mask" not in off["segments"][0]["source"]
    anchored = core.normalize_project({"id": "shot-anchors", "assets": p["assets"],
        "segments": [{"id": "s", "source": {"asset": "v", "swap": True,
            "swap_mask": {"at": 0, "point": [.33, .66],
                          "shots": [{"frame": 123, "point": [.2, .5],
                                     "box": [.1, .2, .3, .6]}]}}}]})
    assert anchored["segments"][0]["source"]["swap_mask"]["shots"] == [
        {"frame": 123, "point": [.2, .5], "box": [.1, .2, .3, .6]}]


def test_standalone_sam_editor_context(monkeypatch):
    """SAM preview runs outside a Comfy prompt; progress hooks still need both IDs."""
    fake = types.ModuleType("server")
    fake.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace())
    monkeypatch.setitem(sys.modules, "server", fake)
    sm._outside_prompt()
    assert fake.PromptServer.instance.last_prompt_id is None
    assert fake.PromptServer.instance.last_node_id is None
    fake.PromptServer.instance.last_prompt_id = "queued_job"
    sm._outside_prompt()
    assert fake.PromptServer.instance.last_prompt_id == "queued_job"


def test_sam_person_bbox_overrides_jacket_click(monkeypatch):
    """BBox from a detected PERSON must be used, not the jacket point."""
    recorder = {}
    class Detect:
        @classmethod
        def execute(cls, model, image, **kwargs):
            recorder.update(kwargs)
            result = torch.zeros(1, image.shape[1], image.shape[2])
            result[:, 16:64, 6:36] = 1
            return (result,)
    fake = types.ModuleType("comfy_extras.nodes_sam3")
    fake.SAM3_Detect = Detect
    monkeypatch.setitem(sys.modules, "comfy_extras.nodes_sam3", fake)
    frame = np.zeros((80, 60, 3), dtype=np.float32)
    mask = sm._seed(object(), frame, [.4, .5], [.1, .2, .5, .6])
    assert mask.shape == (1, 80, 60)
    assert recorder["bboxes"] == {"x": 6, "y": 16, "width": 30, "height": 48}
    # the click and the box are sent together: the click anchors the object, the box bounds it
    assert "positive_coords" in recorder

    recorder.clear()
    sm._seed(object(), frame, [.4, .5])
    assert "positive_coords" in recorder and "bboxes" not in recorder


def test_seed_clips_a_spill_onto_the_background(monkeypatch):
    """A point on a big close-up spreads outside the person — the seed must stay inside the person."""
    class Detect:
        @classmethod
        def execute(cls, model, image, **kwargs):
            result = torch.zeros(1, image.shape[1], image.shape[2])
            result[:, 10:70, 5:55] = 1     # the whole frame almost: a spill
            return (result,)
    fake = types.ModuleType("comfy_extras.nodes_sam3")
    fake.SAM3_Detect = Detect
    monkeypatch.setitem(sys.modules, "comfy_extras.nodes_sam3", fake)
    person = np.zeros((80, 60), dtype=np.float32)
    person[20:60, 15:45] = 1
    monkeypatch.setattr(sm, "_person_mask", lambda first, point: person)
    mask = sm._seed(object(), np.zeros((80, 60, 3), dtype=np.float32), [.5, .5])[0].numpy() > .5
    assert not mask[:, :14].any() and not mask[:19].any(), "nothing outside the person"
    assert mask[30:50, 20:40].all(), "the person stays selected"


def test_seed_replaces_a_fragment_with_the_whole_person(monkeypatch):
    """SAM grabbing a face or a hand must give way to the YOLO person mask."""
    class Detect:
        @classmethod
        def execute(cls, model, image, **kwargs):
            result = torch.zeros(1, image.shape[1], image.shape[2])
            result[:, 22:34, 20:32] = 1     # a small part of the figure
            return (result,)
    fake = types.ModuleType("comfy_extras.nodes_sam3")
    fake.SAM3_Detect = Detect
    monkeypatch.setitem(sys.modules, "comfy_extras.nodes_sam3", fake)
    person = np.zeros((80, 60), dtype=np.float32)
    person[20:60, 15:45] = 1
    monkeypatch.setattr(sm, "_person_mask", lambda first, point: person)
    mask = sm._seed(object(), np.zeros((80, 60, 3), dtype=np.float32), [.5, .5])[0].numpy() > .5
    assert mask[20:60, 15:45].all(), "the whole person instead of a fragment"


def test_sam_rejects_partial_person_mask(monkeypatch):
    class Detect:
        @classmethod
        def execute(cls, model, image, **kwargs):
            result = torch.zeros(1, image.shape[1], image.shape[2])
            result[:, 25:34, 23:33] = 1
            return (result,)
    fake = types.ModuleType("comfy_extras.nodes_sam3")
    fake.SAM3_Detect = Detect
    monkeypatch.setitem(sys.modules, "comfy_extras.nodes_sam3", fake)
    try:
        sm._seed(object(), np.zeros((80, 60, 3), np.float32), [.4, .5], [.1, .2, .5, .6])
        assert False, "A jacket-sized mask must not pass as the full person"
    except ValueError as e:
        assert "часть фигуры" in str(e)


def test_sam_point_only_is_preserved_for_videos_without_yolo_box():
    from h3s import h3s_core as core
    p = core.normalize_project({"id": "point-only", "assets": [
        {"id": "v", "file": "x.mp4", "category": "video"}],
        "segments": [{"id": "s", "source": {"asset": "v", "swap": True,
            "swap_mask": {"model": "sam3.1", "at": 0, "point": [.4, .5]}}}]})
    assert p["segments"][0]["source"]["swap_mask"]["point"] == [.4, .5]
    assert "box" not in p["segments"][0]["source"]["swap_mask"]


def test_hard_cut_detection_uses_source_frame_timeline(monkeypatch):
    """A persistent scene change is identified, not gradual camera movement."""
    bg1 = np.zeros((96, 128, 3), np.float32)
    bg1[..., 0] = .95
    bg2 = np.zeros_like(bg1)
    bg2[..., 2] = .95
    shots = np.concatenate([np.repeat(bg1[None], 24, axis=0),
                            np.repeat(bg2[None], 30, axis=0)])
    def video(path, start, count, w, h, **kw):
        assert (w, h) == (128, 96)
        return shots[start:start + count]
    monkeypatch.setattr(h3s_media, "load_video_frames", video)
    assert sm._find_shot_cuts("video.mp4", len(shots), None) == (24,)
    assert not sm._hard_cut(bg1 * .95 * 255, bg1 * 255)


def test_shot_cut_reseeds_inside_block_and_across_chunks(tmp_path, monkeypatch):
    """Same selected person is tracked per shot, never reused through a camera edit."""
    video = tmp_path / "guide.mp4"
    video.write_bytes(b"not decoded in this mocked test")
    checkpoint = tmp_path / "sam.safetensors"
    checkpoint.write_bytes(b"mock")
    monkeypatch.setattr(sm, "require_model", lambda: str(checkpoint))
    monkeypatch.setattr(sm, "_model", lambda: object())
    monkeypatch.setattr(sm, "detect_shot_cuts", lambda *args: (40, 100))
    monkeypatch.setattr(h3s_media, "load_video_frames",
        lambda path, start, count, w, h, **kw: np.zeros((count, h, w, 3), np.float32))
    monkeypatch.setattr(sm, "_seed", lambda model, first, point, box=None:
        torch.ones((1, first.shape[0], first.shape[1])))
    anchors = [{"frame": 40, "point": [.3, .3]}, {"frame": 50, "point": [.2, .2]},
               {"frame": 100, "point": [.4, .4]}]
    reseeded = []
    def fresh(model, frame, selections, at):
        reseeded.append((at, selections))
        return torch.ones((1, frame.shape[0], frame.shape[1]))
    monkeypatch.setattr(sm, "_auto_shot_seed", fresh)

    class Track:
        runs = []
        @classmethod
        def execute(cls, frames, model, initial_mask, **kwargs):
            cls.runs.append(len(frames))
            return ({"masks": torch.ones((len(frames), frames.shape[1], frames.shape[2]))},)
    class ToMask:
        @staticmethod
        def execute(tracked, **kwargs):
            return (tracked["masks"],)
    fake = types.ModuleType("comfy_extras.nodes_sam3")
    fake.SAM3_VideoTrack, fake.SAM3_TrackToMask = Track, ToMask
    monkeypatch.setitem(sys.modules, "comfy_extras.nodes_sam3", fake)

    folder, size = sm.prepare(str(video), [.5, .5], 130, 128, 128, str(tmp_path),
                              anchors=anchors)
    assert size == (128, 128)
    assert [at for at, _ in reseeded] == [40, 50, 100]  # 50 is a manual cut missed by detection
    assert sum(Track.runs) == 132  # Two handoff frames, never across the cuts.
    assert all(sm._load_block(sm._block_path(folder, i)).mean() > .9 for i in range(3))
    sm.prepare(str(video), [.5, .5], 130, 128, 128, str(tmp_path), anchors=anchors)
    assert len(reseeded) == 3, "cached block masks are reused after segment changes"


def test_manual_shot_anchor_and_identity_guard_reset(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(sm, "_seed", lambda model, first, point, box=None:
        (calls.append((point, box)), torch.ones((1, 64, 128)))[1])
    anchor = [{"frame": 20, "point": [.2, .7], "box": [.1, .2, .5, .6]}]
    assert sm._auto_shot_seed(object(), np.zeros((64, 128, 3)), anchor, 20) is not None
    assert calls == [([.2, .7], [.1, .2, .5, .6])]
    folder = tmp_path / "blocks"
    masks = np.zeros((2, 64, 128), np.float32)
    masks[0, 10:50, 8:35] = 1
    masks[1, 10:50, 93:120] = 1
    sm._save_block(str(folder / "mask_000000.npz"), masks)
    monkeypatch.setattr(sm, "prepare", lambda *a, **kw: (str(folder), (128, 64)))
    monkeypatch.setattr(sm, "detect_shot_cuts", lambda *a: (1,))
    monkeypatch.setattr(h3s_media, "load_video_frames",
        lambda path, start, count, w, h, **kw: np.zeros((count, h, w, 3), np.float32))
    result, report = sm.composite("unused.mp4", 0, torch.ones((2, 64, 128, 3)),
                                  {"point": [.5, .5], "guard": True}, str(tmp_path))
    assert report["active"] == 2 and report["guarded"] == 0


def test_real_mp4_cut_detector_matches_frame_indices(tmp_path):
    """End-to-end CPU smoke: encode a guide with a hard edit and analyze the actual MP4."""
    import av
    path = tmp_path / "two_shots.mp4"
    with av.open(str(path), "w") as container:
        stream = container.add_stream("libx264", rate=24)
        stream.width, stream.height, stream.pix_fmt = 128, 96, "yuv420p"
        for i in range(54):
            frame = np.zeros((96, 128, 3), dtype=np.uint8)
            frame[..., 0 if i < 24 else 2] = 240
            packet = av.VideoFrame.from_ndarray(frame, format="rgb24")
            for encoded in stream.encode(packet):
                container.mux(encoded)
        for encoded in stream.encode():
            container.mux(encoded)
    assert h3s_media.video_info(str(path))["frames"] == 54
    cuts = sm.detect_shot_cuts(str(path), 54)
    assert cuts == (24,), f"scene cut must be precisely aligned, got {cuts}"
    assert sm.detect_shot_cuts(str(path), 12) == (), "prefix must reuse full-video scan"
