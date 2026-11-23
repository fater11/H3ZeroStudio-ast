"""CPU-only tests for the optional ComfyUI text-encoder assistant bridge."""

import pytest

from h3s import h3s_comfy_encoder as enc


def test_detects_installed_text_generators(monkeypatch):
    def api(path, body=None, timeout=15):
        if path.endswith("CLIPLoader"):
            return {"CLIPLoader": {"input": {"required": {"clip_name": [[
                "gemma4_12b_h3_pe_int8.safetensors", "qwen_3_4b.safetensors",
                "minimax_h3_hybrid.safetensors", "unrelated_vae.safetensors"]]}}}}
        return {"TextGenerateV2": {}}
    monkeypatch.setattr(enc, "_api", api)
    assert enc.available_encoders()["models"] == [
        "gemma4_12b_h3_pe_int8.safetensors", "qwen_3_4b.safetensors"]


def test_graph_uses_dynamic_sampling_and_separate_encoder():
    graph = enc._graph("gemma4_12b_h3_pe_int8.safetensors", "System", "Scene", [], 16000,
                       {"temperature": 0.4, "top_p": 0.9, "presence_penalty": -2}, False)
    inputs = graph["2"]["inputs"]
    assert graph["1"]["class_type"] == "CLIPLoader"
    assert graph["1"]["inputs"]["type"] == "stable_diffusion"
    assert inputs["max_length"] == 8192
    assert inputs["sampling_mode.temperature"] == 0.4
    assert inputs["sampling_mode.top_p"] == 0.9
    assert inputs["sampling_mode.presence_penalty"] == 0
    assert graph["3"]["inputs"]["source"] == ["2", 0]


def test_multimodal_images_are_ordered_and_bounded():
    images = [("folder/ref1.jpg", "Picture 1", "first"), ("folder/ref2.jpg", "Picture 2", "last")]
    graph = enc._graph("gemma4_12b_h3_pe_int8.safetensors", "System", "Scene", images,
                       128, {}, False)
    assert graph["2"]["inputs"]["images.image1"] == ["11", 0]
    assert graph["2"]["inputs"]["images.image2"] == ["12", 0]
    assert graph["2"]["inputs"]["prompt"].startswith("<|image><|image|><image|>" * 2)


def test_stream_returns_text_and_stats_without_external_llm(monkeypatch):
    calls = []

    def api(path, body=None, timeout=15):
        if path == "/queue":
            return {"queue_running": [], "queue_pending": []}
        if path == "/prompt":
            calls.append(body)
            return {"prompt_id": "unit-test-1"}
        if path == "/history/unit-test-1":
            return {"unit-test-1": {"status": {"status_str": "success"},
                                    "outputs": {"3": {"text": ["Better prompt"]},
                                                "4": {"text": ["Reasoning"]}}}}
        raise AssertionError(path)

    monkeypatch.setattr(enc, "available_encoders", lambda: {"models": ["gemma4"]})
    monkeypatch.setattr(enc, "_api", api)
    monkeypatch.setattr(enc, "_prepare_images", lambda attachments: (None, [], 0))
    output = list(enc.stream_chat([{"role": "system", "content": "rules"},
                                   {"role": "user", "content": "hello"}], "gemma4"))
    assert ("token", "Better prompt") in output
    assert ("reasoning", "Reasoning") in output
    assert any(kind == "stats" for kind, value in output)
    assert calls[0]["prompt"]["2"]["inputs"]["system_prompt"] == "rules"


def test_busy_queue_is_not_interrupted(monkeypatch):
    monkeypatch.setattr(enc, "available_encoders", lambda: {"models": ["gemma4"]})
    monkeypatch.setattr(enc, "_api", lambda path, body=None, timeout=15: {
        "queue_running": [[0, "user-video"]], "queue_pending": []})
    with pytest.raises(enc.EncoderError, match="ComfyUI"):
        list(enc.stream_chat([{"role": "user", "content": "test"}], "gemma4"))


def test_reference_images_are_downscaled_in_private_input_folder(monkeypatch, tmp_path):
    import shutil
    from PIL import Image
    import folder_paths
    from h3s import h3s_llm
    image_path = tmp_path / "original.jpg"
    Image.new("RGB", (1600, 1100), "green").save(image_path)
    monkeypatch.setattr(h3s_llm, "_attachment_path", lambda item: str(image_path))
    monkeypatch.setattr(folder_paths, "get_input_directory", lambda: str(tmp_path))
    folder, rows, skipped = enc._prepare_images([{"kind": "asset", "token": "<Picture 1>"}])
    try:
        assert skipped == 0 and len(rows) == 1
        assert rows[0][0].startswith("h3zs_encoder_")
        with Image.open(tmp_path / rows[0][0]) as saved:
            assert max(saved.size) <= 768
    finally:
        if folder:
            shutil.rmtree(folder)
