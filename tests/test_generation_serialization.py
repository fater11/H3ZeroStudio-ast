"""Source-level contract tests (do not require ComfyUI runtime)."""
import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "h3s_gen.py"

def test_public_entry_is_serialized():
    tree = ast.parse(SRC.read_text(encoding="utf-8"))
    funcs = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    wrapper = funcs["run_project"]
    withs = [n for n in wrapper.body if isinstance(n, ast.With)]
    assert len(withs) == 1
    assert isinstance(withs[0].items[0].context_expr, ast.Name)
    assert withs[0].items[0].context_expr.id == "_GENERATION_LOCK"
    assert any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "_run_project_serialized" for n in ast.walk(withs[0]))

def test_cleanup_stays_inside_guarded_execution():
    tree = ast.parse(SRC.read_text(encoding="utf-8"))
    impl = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_run_project_serialized")
    assert any(isinstance(n, ast.Try) and n.finalbody for n in ast.walk(impl))

def test_no_global_state_in_public_wrapper():
    tree = ast.parse(SRC.read_text(encoding="utf-8"))
    wrapper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "run_project")
    assert not any(isinstance(n, (ast.Assign, ast.AugAssign, ast.Global)) for n in ast.walk(wrapper))
