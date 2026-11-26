import ast
from pathlib import Path
import pytest
import torch

SOURCE = Path(__file__).resolve().parents[1] / "h3s_gen.py"
TREE = ast.parse(SOURCE.read_text(encoding="utf-8"))
FN = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == "check_sigmas")
MODULE = ast.Module(body=[FN], type_ignores=[])
ns = {"torch": torch}
exec(compile(MODULE, str(SOURCE), "exec"), ns)
check_sigmas = ns["check_sigmas"]

@pytest.mark.parametrize("values", [[1, .5, 0], [1, .69], [.4, .2, 0], [0.4, 0.4, 0]])
def test_valid_sigmas(values):
    assert check_sigmas(values).numel() == len(values)

@pytest.mark.parametrize("values", [[0, 0], [1, -0.1, 0], [.4, .8, 0], [float("nan"), 0], [1]])
def test_reject_invalid_sigmas(values):
    with pytest.raises(ValueError): check_sigmas(values)

def test_no_sigmas():
    assert check_sigmas(None) is None

def test_audio_return_uses_draft_not_sampled_audio():
    src = SOURCE.read_text(encoding="utf-8")
    assert 'original_audio = refine[1].float().cpu()' in src
    assert 'return ov_.float().cpu(), original_audio' in src

def test_pass2_inputs_exclude_removed_sigmas():
    node = (SOURCE.parent / "nodes.py").read_text(encoding="utf-8")
    # External SIGMAS inputs were intentionally removed; stage schedules are
    # selected inside the project while model and sampler cables remain.
    for name in ("model_pass2", "sampler_pass2"):
        assert name in node
    assert "sigmas_pass2" not in node


def test_stage2_must_end_at_zero():
    assert check_sigmas([.69, .2, 0], require_zero=True).numel() == 3
    with pytest.raises(ValueError):
        check_sigmas([.69, .2], require_zero=True)

def test_stage1_can_end_at_nonzero():
    assert float(check_sigmas([1.0, .69])[-1]) > 0

def test_external_pass2_signature_changes_only_second_pass_cache():
    from h3s import h3s_core as core
    p = core.normalize_project({
        "id": "stage2-key", "settings": {"final_mode": "refine", "quality": "final"},
        "segments": [{"id": "s1", "frames": 39, "prompt": "Character moving"}]})
    draft = core.segment_keys(p, env_sig="same-checkpoint", kind="draft")
    refine = core.segment_keys(p, env_sig="same-checkpoint", kind="refine")
    p["settings"]["_pass2_external"] = {"sampler": "separate-euler"}
    assert core.segment_keys(p, env_sig="same-checkpoint", kind="draft") == draft
    assert core.segment_keys(p, env_sig="same-checkpoint", kind="refine") != refine


def test_generator_persists_external_pass2_signature_before_cache_lookup():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_run_project")
    assignments = [n for n in ast.walk(fn) if isinstance(n, ast.Assign)]
    assert any(isinstance(target, ast.Subscript)
               and isinstance(target.value, ast.Subscript)
               and isinstance(target.value.value, ast.Name)
               and target.value.value.id == "proj"
               and isinstance(target.slice, ast.Constant)
               and target.slice.value == "_pass2_external"
               for n in assignments for target in n.targets)
