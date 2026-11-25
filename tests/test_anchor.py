"""Low-res anchor: the reference of a chain, its strength, and the compounding it stops."""
import importlib.util
from pathlib import Path

import pytest
import torch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("h3s_studio_color", ROOT / "h3s_studio_color.py")
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)


def _gen():
    import ast
    src = (ROOT / "h3s_gen.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    out = {}
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "anchor_base_index":
            mod = ast.Module(body=[node], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "h3s_gen.py", "exec"), out)
    return out["anchor_base_index"]


anchor_base_index = _gen()


def test_chain_base_is_the_first_segment_of_this_shot():
    items = [{"link": "cut"}, {"link": "extend"}, {"link": "extend"}, {"link": "cut"}, {"link": "extend"}]
    assert anchor_base_index(items, 1) == 0
    assert anchor_base_index(items, 2) == 0
    assert anchor_base_index(items, 4) == 3          # a new scene starts its own chain
    assert anchor_base_index([{"link": "cut"}], 0) == 0
    assert anchor_base_index([{"link": "extend"}, {"link": "extend"}], 1) == 0


def _chain(segments=24, drift=0.02, anchor=None, seed=3, overlap=22):
    """A stand-in for sampling: every segment continues the previous one and drifts a little."""
    torch.manual_seed(seed)
    ref = torch.randn(1, 24, 37, 10, 12)
    chain = [ref]
    for step in range(1, segments):
        prev = chain[-1]
        nxt = prev * 1.0 + drift + torch.randn_like(prev) * 0.01
        nxt[:, :, :7] = prev[:, :, -7:]              # the locked carry of the overlap
        if anchor:
            nxt = studio.latent_anchor({"samples": nxt}, {"samples": ref}, overlap, step + 1,
                                       strength=anchor)["samples"]
        chain.append(nxt)
    return ref, chain


def test_the_anchor_keeps_a_long_chain_where_it_started():
    ref, raw = _chain(anchor=None)
    _ref2, fixed = _chain(anchor=0.6)
    raw_drift = float((raw[-1].mean() - ref.mean()).abs())
    fixed_drift = float((fixed[-1].mean() - ref.mean()).abs())
    assert raw_drift > 0.3, raw_drift                    # without it the chain walks away
    assert fixed_drift < raw_drift / 4, (fixed_drift, raw_drift)
    assert fixed_drift < 0.1


def test_strength_scales_the_pull_toward_the_reference():
    """Strength drives the mean/std pull (the spatial high-band match runs at any strength, as in Studio)."""
    torch.manual_seed(9)
    ref = torch.randn(1, 24, 37, 10, 12)
    cur = ref + 0.25
    cur[:, :, :7] = ref[:, :, -7:]
    off = studio.latent_anchor({"samples": cur.clone()}, {"samples": ref}, 22, 2, strength=0.0)["samples"]
    soft = studio.latent_anchor({"samples": cur.clone()}, {"samples": ref}, 22, 2, strength=0.3)["samples"]
    hard = studio.latent_anchor({"samples": cur.clone()}, {"samples": ref}, 22, 2, strength=1.0)["samples"]
    assert (off.mean() - cur.mean()).abs() < 1e-3                      # no mean pull at 0 (the hi-band match still runs)
    assert (hard.mean() - ref.mean()).abs() < (soft.mean() - ref.mean()).abs() < (cur.mean() - ref.mean()).abs()


def test_the_carried_head_is_never_touched():
    torch.manual_seed(11)
    ref = torch.randn(1, 24, 37, 10, 12)
    cur = ref * 1.2 + 0.1
    head = ref[:, :, -7:].clone()
    cur[:, :, :7] = head
    out = studio.latent_anchor({"samples": cur}, {"samples": ref}, 22, 3, strength=0.8)["samples"]
    assert torch.equal(out[:, :, :7], head)
    assert bool(torch.isfinite(out).all())
    assert not torch.equal(out[:, :, 7:], cur[:, :, 7:])


def test_a_clip_shorter_than_the_overlap_is_left_alone():
    ref = torch.randn(1, 24, 37, 10, 12)
    cur = torch.randn(1, 24, 8, 10, 12)                  # not even the overlap fits in these steps
    out = studio.latent_anchor({"samples": cur.clone()}, {"samples": ref}, 22, 2, strength=1.0)["samples"]
    assert torch.equal(out, cur)
