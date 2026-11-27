"""Settings → Ускорение: normalize + capabilities + apply (no optional packages required)."""
import pytest

from h3s import h3s_accel as accel
from h3s import h3s_core as core


def test_normalize_accel_defaults_and_clamp():
    a = accel.normalize_accel(None)
    assert a["attention"] == "kitchen" and a["veda"] is False and a["compile"] is False
    a = accel.normalize_accel({"attention": "SAGE", "teacache_thresh": 9, "compile_backend": "nope", "veda": 1})
    assert a["attention"] == "sage" and a["teacache_thresh"] == 0.5 and a["compile_backend"] == "inductor" and a["veda"] is True
    a = accel.normalize_accel({"attention": "weird"})
    assert a["attention"] == "kitchen"
    p = core.normalize_project({"settings": {"accel": {"attention": "flash", "teacache": True, "teacache_thresh": 0.08}}})
    assert p["settings"]["accel"]["attention"] == "flash" and p["settings"]["accel"]["teacache_thresh"] == 0.08
    assert "accel" in core.GLOBAL_KEYS


def test_capabilities_shape_no_crash():
    caps = accel.capabilities()
    for k in ("kitchen", "sage", "flash", "pytorch", "veda", "teacache", "compile", "attention_backends", "veda_predictors"):
        assert k in caps
    assert "pytorch" in caps["attention_backends"] or caps["pytorch"] is False or True
    assert isinstance(caps["veda_predictors"], list)


def test_apply_on_none_and_fake_model(monkeypatch):
    assert accel.apply(None, {}) is None

    class Fake:
        def __init__(self):
            self.opts = None
            self.model_options = {"transformer_options": {}}
        def clone(self, **kw):
            return Fake()
        def set_model_optimized_attention(self, fn):
            self.opts = fn

    # force pytorch path with a stub attention module
    monkeypatch.setattr(accel, "capabilities", lambda: {
        "kitchen": False, "sage": False, "flash": False, "pytorch": True,
        "veda": False, "veda_predictors": [], "teacache": False, "compile": False,
        "attention_backends": ["pytorch"],
    })
    calls = []
    monkeypatch.setattr(accel, "_pick_attention_fn", lambda name, caps: ((lambda *a, **k: None), "pytorch"))
    m = Fake()
    out = accel.apply(m, {"accel": {"attention": "pytorch"}})
    assert out is not None and out.opts is not None


def test_spark_settings_normalize_and_sig():
    a = accel.normalize_accel({"spark": 1, "spark_mode": "SPEED", "spark_topk": 0.5,
                               "spark_scope": "joint-video", "spark_dense_backend": "kitchen"})
    assert a["spark"] is True and a["spark_mode"] == "speed" and a["spark_topk"] == 0.5
    assert a["spark_scope"] == "joint-video" and a["spark_dense_backend"] == "kitchen"
    a = accel.normalize_accel({"spark_mode": "nope", "spark_topk": 9, "spark_warmup": -1,
                               "spark_scope": "other", "spark_dense_backend": "x"})
    assert a["spark_mode"] == "fidelity" and a["spark_topk"] == 1.0 and a["spark_warmup"] == 0.0
    assert a["spark_scope"] == "target-video" and a["spark_dense_backend"] == "inherit"
    caps = accel.capabilities()
    assert {"spark", "spark_node", "spark_kernels"} <= set(caps)
    s0 = accel.accel_sig({"accel": {}, "steps": 20})
    assert s0 != accel.accel_sig({"accel": {"spark": True}, "steps": 20})
    assert s0 != accel.accel_sig({"accel": {}, "steps": 4})


def test_spark_picks_the_node_for_the_gpu_and_passes_the_preset(monkeypatch):
    import sys
    import types
    seen = {}

    class Node:                       # the plugin's shape: FUNCTION = "patch", returns (MODEL,)
        def patch(self, model, **kw):
            seen.update(kw)
            return (model,)

    comfy = types.ModuleType("comfy")
    comfy.model_management = types.SimpleNamespace(get_torch_device=lambda: "cuda:0")
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "comfy.model_management", comfy.model_management)
    monkeypatch.setitem(sys.modules, "nodes", types.SimpleNamespace(
        NODE_CLASS_MAPPINGS={"MiniMaxH3SparkAttentionSM86": Node}))
    monkeypatch.setitem(sys.modules, "torch", types.SimpleNamespace(
        cuda=types.SimpleNamespace(get_device_capability=lambda dev=None: (8, 6))))

    a = accel.normalize_accel({"spark": True, "spark_mode": "speed", "spark_topk": 0.15})
    assert accel._spark_class() is Node
    assert accel._apply_spark("MODEL", a, 8) == "MODEL"
    assert seen["mode"] == "speed" and seen["steps"] == 8 and seen["topk_ratio"] == 0.15
    assert seen["warmup_ratio"] == 0.0 and seen["warmup_mode"] == "warmup_ratio"
    assert seen["sparse_scope"] == "target-video" and seen["dense_backend"] == "inherit"
    assert seen["strict"] is False and seen["reblock_layout"] == "q_reuse_k"

    # fidelity preset = 20 % dense warmup; an unsupported GPU finds no node
    a2 = accel.normalize_accel({"spark": True})
    accel._apply_spark("MODEL", a2, 20)
    assert seen["warmup_ratio"] == 0.2 and seen["warmup_steps"] == 4
    monkeypatch.setitem(sys.modules, "torch", types.SimpleNamespace(
        cuda=types.SimpleNamespace(get_device_capability=lambda dev=None: (8, 0))))
    assert accel._spark_class() is None


def test_spark_switches_the_comfy_compiler_off(monkeypatch):
    """Spark patches the block forward; the recorded malloc graph then aborts natively."""
    import sys
    import types
    mem = types.SimpleNamespace(aimdo_enabled=True)
    cargs = types.SimpleNamespace(disable_comfy_compiler=False, disable_cuda_graphs=False)
    comfy = types.ModuleType("comfy")
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "comfy.memory_management", mem)
    monkeypatch.setitem(sys.modules, "comfy.cli_args", types.SimpleNamespace(args=cargs))
    assert accel._spark_disable_compiler() == ["aimdo", "comfy-compiler"]
    assert mem.aimdo_enabled is False and cargs.disable_comfy_compiler is True
    assert cargs.disable_cuda_graphs is True
    assert accel._spark_disable_compiler() == []      # idempotent, logs nothing the second time


def test_accel_sig_changes_with_settings():
    s1 = accel.accel_sig({"accel": {"attention": "kitchen"}})
    s2 = accel.accel_sig({"accel": {"attention": "sage"}})
    s3 = accel.accel_sig({"accel": {"attention": "kitchen", "veda": True}})
    assert s1 != s2 and s1 != s3
