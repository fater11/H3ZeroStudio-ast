"""UI cache-signature parity: the editor's keys must see every setting the server keys see.

Regression: refine_prompt and swap_expand/feather/fill_holes/temporal_expand changed the
python cache key but not the JS signature, so the studio could show a stale take as current.
"""
import json
import os
import shutil
import subprocess

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, "web", "js")
NODE = shutil.which("node")
need_node = pytest.mark.skipif(NODE is None, reason="node.js не найден")

DRIVER = """
import * as C from %(uri)s;
const out = {};
const refine = (prompt) => C.normalizeProject({id: "r", settings: {prompt: "", res_mode: "custom",
  width: 768, height: 448, steps: 8, final_mode: "refine", refine_prompt: prompt},
  segments: [{id: "s1", frames: 39, prompt: "a"}]});
out.refine_prompt = [C.segmentSigs(refine("")).join("|"), C.segmentSigs(refine("detail brief")).join("|")];

const swap = (expand, feather, cut) => C.normalizeProject({id: "y", settings: {prompt: "", res_mode: "custom",
  width: 768, height: 448, steps: 4, final_mode: "full", swap_expand: expand, swap_feather: feather},
  assets: [{id: "v", name: "g", file: "g.mp4", category: "video", frames: 141, width: 768, height: 448},
           {id: "p", name: "f", file: "f.png", category: "character"}],
  segments: [{id: "s1", frames: 141, refs: ["p"], prompt: "body_swap: <Picture 1>",
              source: {asset: "v", in: 0, denoise: 1, swap: true, keep_audio: true,
                       swap_lora: "a.safetensors", swap_mask: {model: "sam3.1", at: 0, point: [0.5, 0.5]}}},
             {id: "s2", frames: 39, link: cut, prompt: "plain"}]});

out.swap_shape = [C.segmentSigs(swap(16, 12, "cut")).join("|"), C.segmentSigs(swap(32, 4, "cut")).join("|")];
// a non-swap segment chained after a swap one follows it; a cut one must stay independent
out.swap_chain = [C.segmentSigs(swap(16, 12, "extend")).join("|").split("|")[1],
                  C.segmentSigs(swap(32, 4, "extend")).join("|").split("|")[1]];
out.swap_cut = [C.segmentSigs(swap(16, 12, "cut")).join("|").split("|")[1],
                C.segmentSigs(swap(32, 4, "cut")).join("|").split("|")[1]];

const pi = (adapter) => C.normalizeProject({id: "z", settings: {prompt: "", res_mode: "custom",
  width: 768, height: 448, steps: 4, final_mode: "full", piflow_steps: 4, piflow_lora4: adapter},
  segments: [{id: "s1", frames: 39}]});
out.piflow = [C.segmentSigs(pi("")).join("|"), C.segmentSigs(pi("custom4.safetensors")).join("|")];
process.stdout.write(JSON.stringify(out));
"""


@need_node
def test_ui_signatures_see_refine_prompt_and_swap_shape(tmp_path):
    drv = tmp_path / "sigs.mjs"
    drv.write_text(DRIVER % {"uri": json.dumps("file:///" + os.path.join(JS, "h3s_core.js").replace("\\", "/"))},
                   encoding="utf-8")
    r = subprocess.run([NODE, str(drv)], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout)
    assert out["refine_prompt"][0] != out["refine_prompt"][1], "refine_prompt must change the refine key"
    assert out["swap_shape"][0] != out["swap_shape"][1], "swap_expand/feather must change the swap key"
    assert out["swap_chain"][0] != out["swap_chain"][1], "an extended segment follows its swap predecessor"
    assert out["swap_cut"][0] == out["swap_cut"][1], "a cut segment must not depend on swap shape settings"
    assert out["piflow"][0] != out["piflow"][1], "the selected DWD adapter must change the pi-H3 key"


def test_python_keys_see_the_same_settings(h3s):
    core = h3s.h3s_core
    refine = lambda prompt: core.normalize_project({"id": "r", "settings": {"prompt": "", "res_mode": "custom",
                                                                        "width": 768, "height": 448, "steps": 8,
                                                                        "final_mode": "refine", "refine_prompt": prompt},
                                                    "segments": [{"id": "s1", "frames": 39, "prompt": "a"}]})
    sigs = {"v": "h", "p": "h"}
    assert core.segment_keys(refine(""), sigs, "env", "refine") != core.segment_keys(refine("detail"), sigs, "env", "refine")

    def swap(expand, cut):
        return core.normalize_project({
            "id": "y", "settings": {"prompt": "", "res_mode": "custom", "width": 768, "height": 448,
                                    "steps": 4, "final_mode": "full", "swap_expand": expand},
            "assets": [{"id": "v", "name": "g", "file": "g.mp4", "category": "video", "frames": 141, "width": 768, "height": 448},
                       {"id": "p", "name": "f", "file": "f.png", "category": "character"}],
            "segments": [{"id": "s1", "frames": 141, "refs": ["p"], "prompt": "body_swap: <Picture 1>",
                          "source": {"asset": "v", "in": 0, "denoise": 1, "swap": True, "keep_audio": True,
                                     "swap_lora": "a.safetensors"}},
                         {"id": "s2", "frames": 39, "link": cut, "prompt": "plain"}]})

    assert core.segment_keys(swap(16, "cut"), sigs, "env", "full")[0] != core.segment_keys(swap(32, "cut"), sigs, "env", "full")[0]
    assert core.segment_keys(swap(16, "cut"), sigs, "env", "full")[1] == core.segment_keys(swap(32, "cut"), sigs, "env", "full")[1]