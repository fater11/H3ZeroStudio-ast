"""Regression: JS editor and Python generator normalize the same project settings."""
import json
import shutil
import subprocess
from pathlib import Path
import pytest
from h3s import h3s_core as core

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")


@pytest.mark.skipif(NODE is None, reason="Node.js not installed")
@pytest.mark.parametrize("settings", [
    {},
    {
        "quality": "final", "final_mode": "refine", "refine_schedule_mode": "basic",
        "refine_denoise": 0.35, "refine_seed": 22, "draft_steps": 4,
        "upscale_gen": {"mode": "custom", "model": "detail.safetensors",
                        "loras": [{"file": "x.safetensors", "sm": 0.8, "sc": 1}]},
        "swap_expand": 24, "swap_feather": 6, "swap_fill_holes": True,
        "accel": {"attention": "kitchen", "veda": True, "veda_predictor": "veda_bf16"},
        "memsave": {"mode": "auto", "chunks": 3, "threshold": 2048},
    },
    {"piflow_steps": 4, "piflow_lora4": "pi_h3_4step_dwd_adapter_int8_convrot.safetensors",
     "high_sigma_schedule": "karras7", "res_mode": "custom", "width": 768, "height": 1344},
    {"upscale_gen": {"mode": "custom", "model": "detail.safetensors",
                     "lora": "legacy.safetensors", "lora_strength": 0.75}},
])
def test_normalized_settings_mirror_each_other(settings, tmp_path):
    project = {"id": "parity", "settings": settings, "segments": [{"id": "s", "frames": 124}]}
    py_settings = core.normalize_project(project)["settings"]
    js = ROOT / "web" / "js" / "h3s_core.js"
    script = tmp_path / "check.mjs"
    script.write_text(
        "import {normalizeProject} from " + json.dumps(js.as_uri()) + ";\n"
        "const project=" + json.dumps(project, ensure_ascii=False) + ";\n"
        "console.log(JSON.stringify(normalizeProject(project).settings));\n",
        encoding="utf-8")
    result = subprocess.run([NODE, str(script)], capture_output=True,
                            text=True, encoding="utf-8", timeout=20)
    assert result.returncode == 0, result.stderr
    assert py_settings == json.loads(result.stdout), (
        "The Lab UI and backend must agree on normalized generation settings")
