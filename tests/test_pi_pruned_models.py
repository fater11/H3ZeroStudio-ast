"""pi-H3 verifies on-disk model architecture, never guesses from the filename."""
import json
import os

from h3s import h3s_gen as gen


def make_header(path, width=8, blocks=48):
    data = {f"blocks.{i}.adaln_proj.linear.weight":
            {"shape": [96768, width], "dtype": "BF16", "data_offsets": [0, 0]}
            for i in range(blocks)}
    raw = json.dumps(data).encode("utf-8")
    with open(path, "wb") as f:
        f.write(len(raw).to_bytes(8, "little"))
        f.write(raw)


def test_pruned_is_verified_from_tensors_not_filename(tmp_path):
    compatible = tmp_path / "hybrid_no_pruned_in_name.safetensors"
    make_header(compatible)
    assert gen.piflow_has_pruned_layout(str(compatible))
    unpruned = tmp_path / "pruned_but_actually_full.safetensors"
    make_header(unpruned, width=2688)
    assert not gen.piflow_has_pruned_layout(str(unpruned))
    missing = tmp_path / "missing_block.safetensors"
    make_header(missing, blocks=47)
    assert not gen.piflow_has_pruned_layout(str(missing))
    assert not gen.piflow_has_pruned_layout(str(tmp_path / "absent.safetensors"))


def test_installed_h3_hybrid_weights_have_48_pruned_blocks():
    base = r"H:\ComfyUI-Easy-Install\ComfyUI\models\diffusion_models\video\H3"
    names = (
        "dasiwa_minimax_h3_ref2va_v5xs_pruned_graviton_int8_row-wise_convrot_runtime_mixed.safetensors",
        "minimax_h3_hybrid_fl2va_ref2va_b25-49-int8.safetensors",
        "10Eros_Max_8stepTurbo_v1.0_hybrid-int8_HQ.safetensors",
    )
    for name in names:
        path = os.path.join(base, name)
        if os.path.isfile(path):
            assert gen.piflow_has_pruned_layout(path), name


def test_dwd_adapter_is_bound_per_step_count():
    """2 steps and 4 steps have their own adapter binding; the built-in names stay the default."""
    from h3s import h3s_core as core
    s = {}
    assert gen.piflow_adapter_name(s, 2) == "pi_h3_2step_dwd_adapter_int8_convrot.safetensors"
    assert gen.piflow_adapter_name(s, 4) == "pi_h3_4step_dwd_adapter_int8_convrot.safetensors"
    s = {"piflow_lora2": "loras/two.safetensors", "piflow_lora4": "loras/four.safetensors"}
    assert gen.piflow_adapter_name(s, 2) == "loras/two.safetensors"
    assert gen.piflow_adapter_name(s, 4) == "loras/four.safetensors"
    # the settings keep both bindings apart
    p = core.normalize_project({"id": "pi", "settings": {"final_mode": "full", "piflow_steps": 4,
                                                          "piflow_lora2": "a.safetensors", "piflow_lora4": "b.safetensors"},
                                "segments": [{"id": "s1", "frames": 39}]})
    assert p["settings"]["piflow_lora2"] == "a.safetensors"
    assert p["settings"]["piflow_lora4"] == "b.safetensors"
    # the former single field becomes the binding of the step count it was picked for
    legacy = core.normalize_project({"id": "pi2", "settings": {"final_mode": "full", "piflow_steps": 4,
                                                               "piflow_lora": "old.safetensors"},
                                     "segments": [{"id": "s1", "frames": 39}]})
    assert legacy["settings"]["piflow_lora4"] == "old.safetensors"
    assert legacy["settings"]["piflow_lora2"] == ""
    assert "piflow_lora" not in legacy["settings"]
