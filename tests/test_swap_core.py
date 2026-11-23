"""Regression tests for experimental character swap project semantics."""
import copy

from h3s import h3s_core as core


def _project(source):
    return core.normalize_project({
        "id": "swap_test", "settings": {"prompt": "", "res_mode": "custom",
                                      "width": 768, "height": 448, "steps": 8},
        "assets": [
            {"id": "v", "name": "guide", "file": "guide.mp4", "category": "video",
             "frames": 141, "width": 768, "height": 448},
            {"id": "p", "name": "face", "file": "face.png", "category": "character"},
        ],
        "segments": [
            {"id": "s1", "frames": 141, "refs": ["p"], "prompt": "body_swap: <Picture 1>",
             "source": source},
        ],
    })


def test_swap_is_generated_and_does_not_change_vid2vid():
    source = {"asset": "v", "in": 0, "denoise": 1, "swap": True,
              "keep_audio": True,
              "swap_lora": "minimax/minimax_h3_character_swap_v1.1_ref2va_fro.safetensors"}
    swapped = _project(source)
    seg = swapped["segments"][0]
    assert seg["source"]["swap"] is True
    assert seg["source"]["keep_audio"] is True
    assert seg["source"]["swap_lora"] == source["swap_lora"]
    assert seg["source"]["swap_lora_strength"] == 1.0
    assert not core.is_footage(seg)
    assert core.gen_mode(swapped, seg) == "swap"

    v2v = _project({"asset": "v", "in": 0, "denoise": 0.4})
    assert core.gen_mode(v2v, v2v["segments"][0]) == "v2v"
    assert not v2v["segments"][0]["source"].get("swap")
    footage = _project({"asset": "v", "in": 0, "denoise": 0})
    assert core.is_footage(footage["segments"][0])
    assert core.gen_mode(footage, footage["segments"][0]) is None


def test_swap_cache_key_tracks_lora_and_source_audio_switch():
    p = _project({"asset": "v", "in": 0, "denoise": 1, "swap": True,
                  "keep_audio": True, "swap_lora": "model_a.safetensors"})
    sigs = {"v": "video_hash", "p": "photo_hash"}
    first = core.segment_keys(p, sigs, "env", "full")[0]
    with_other_lora = copy.deepcopy(p)
    with_other_lora["segments"][0]["source"]["swap_lora"] = "model_b.safetensors"
    assert core.segment_keys(with_other_lora, sigs, "env", "full")[0] != first
    without_audio = copy.deepcopy(p)
    without_audio["segments"][0]["source"]["keep_audio"] = False
    assert core.segment_keys(without_audio, sigs, "env", "full")[0] != first
    stronger = copy.deepcopy(p)
    stronger["segments"][0]["source"]["swap_lora_strength"] = 1.25
    assert core.segment_keys(stronger, sigs, "env", "full")[0] != first
    assert _project({"asset": "v", "in": 0, "denoise": 1, "swap": True, "swap_lora_strength": 7})["segments"][0]["source"]["swap_lora_strength"] == 1.5
