"""Standalone guard regression: python tests/standalone_pass2_validation.py (no ComfyUI required)."""
import ast
from pathlib import Path
import torch

src = Path(__file__).resolve().parents[1] / "h3s_gen.py"
tree = ast.parse(src.read_text(encoding="utf-8"))
fn = next(x for x in tree.body if isinstance(x, ast.FunctionDef) and x.name == "check_sigmas")
ns = {"torch": torch}
exec(compile(ast.Module(body=[fn], type_ignores=[]), str(src), "exec"), ns)
check = ns["check_sigmas"]

def rejects(values, **kwargs):
    try:
        check(values, **kwargs)
    except ValueError:
        return True
    return False

for v in ([1, .69], [1, .69, 0], [.69, .4, 0], [.4, .4, 0]):
    assert check(v).numel() == len(v), v
for v in ([0, 0], [1, -.1, 0], [.2, .5, 0], [float("nan"), 0], [1]):
    assert rejects(v), v
assert check([.69, .3, 0], require_zero=True).numel() == 3
assert rejects([.69, .3], require_zero=True)
assert check(None) is None
source = src.read_text(encoding="utf-8")
node = (src.parent / "nodes.py").read_text(encoding="utf-8")
assert all(x in node for x in ("model_pass2", "sampler_pass2", "sigmas_pass2"))
assert 'return ov_.float().cpu(), original_audio' in source
assert 'proj["settings"]["_pass2_external"] = pass2_sig' in source
assert 'separate refine pass, not trajectory continuation' in source
print("PASS: 14 standalone assertions (SIGMAS, stage 2, inputs, audio return, cache signature)")
