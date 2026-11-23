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
