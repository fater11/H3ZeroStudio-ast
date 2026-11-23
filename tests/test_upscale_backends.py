"""Learned latent upscale backend chain: native → Pixaroma → LBH 3D/2D → stretch."""
import types

import pytest
import torch

from h3s import h3s_upscale as up

pytestmark = pytest.mark.real_upscale_backends


class _Out:
    """Minimal ComfyUI NodeOutput stand-in (.result tuple)."""
    def __init__(self, *args):
        self.result = args


def _patch_mappings(monkeypatch, mapping):
    """Install a fake nodes.NODE_CLASS_MAPPINGS dict used by up.node_class / backend_flags."""
    fake = types.SimpleNamespace(NODE_CLASS_MAPPINGS=dict(mapping))
    monkeypatch.setitem(__import__("sys").modules, "nodes", fake)
    # also clear any cached import side-effects by patching the helpers directly when needed
    monkeypatch.setattr(up, "_node_mappings", lambda: dict(mapping))


def test_align32():
    assert up.align32(100) == 96   # 3.125 → 3
    assert up.align32(96) == 96
    assert up.align32(97) == 96
    assert up.align32(112) == 128  # 3.5 → 4 (Py round half-even → 4)
    assert up.align32(31) == 32
    assert up.align32(0) == 32
    for n in (32, 64, 128, 768, 1344, 1920, 2560):
        assert up.align32(n) == n
    assert up.align32(50) == 64
    assert up.align32(40) == 32


def test_backend_flags_and_order(monkeypatch):
    _patch_mappings(monkeypatch, {
        "MiniMaxH3LatentUpscaleWithModel": object,
        "LatentUpscaleModelLoader": object,
        "PixaromaH3LatentUpscale": object,
        "MinimaxH3LatentUpscaler3D": object,
    })
    assert up.available_backends() == ["native", "pixaroma", "lbh"]
    _patch_mappings(monkeypatch, {"PixaromaH3LatentUpscale": object, "MinimaxH3LatentUpscaler3D": object})
    assert up.available_backends() == ["pixaroma", "lbh"]
    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscaler3D": object})
    assert up.available_backends() == ["lbh"]
    # native needs BOTH upscale node and loader
    _patch_mappings(monkeypatch, {"MiniMaxH3LatentUpscaleWithModel": object})
    assert up.available_backends() == []


def test_capabilities_learned_any_backend(monkeypatch):
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    _patch_mappings(monkeypatch, {"PixaromaH3LatentUpscale": object})
    caps = up.capabilities()
    assert caps["learned"] and caps["learned_node"] and caps["backend"] == "pixaroma"
    assert caps["backends"]["pixaroma"] and not caps["backends"]["native"]
    _patch_mappings(monkeypatch, {})
    caps = up.capabilities()
    assert not caps["learned"] and caps["input"] == "stretch"


def test_selection_order_prefers_native(monkeypatch):
    """First available backend that returns a shaped tensor wins; later ones are not called."""
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    called = []

    def make(tag, boom=False):
        def fn(x, ww, hh, name):
            called.append(tag)
            if boom:
                raise RuntimeError(f"{tag} boom")
            # return target latent size
            return torch.zeros(1, x.shape[1], x.shape[2], hh // 16, ww // 16)
        return fn

    _patch_mappings(monkeypatch, {
        "MiniMaxH3LatentUpscaleWithModel": object,
        "LatentUpscaleModelLoader": object,
        "PixaromaH3LatentUpscale": object,
        "MinimaxH3LatentUpscaler3D": object,
    })
    monkeypatch.setattr(up, "_BACKEND_CALL", {
        "native": make("native"),
        "pixaroma": make("pixaroma"),
        "lbh": make("lbh"),
    })
    monkeypatch.setattr(up, "handoff", lambda *a, **k: None)
    v = torch.randn(1, 24, 7, 4, 6)
    z = up.learned_upscale(v, 192, 128)
    assert z.shape == (1, 24, 7, 8, 12)
    assert called == ["native"]


def test_fallthrough_on_exception(monkeypatch):
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    called = []

    def make(tag, boom=False):
        def fn(x, ww, hh, name):
            called.append(tag)
            if boom:
                raise RuntimeError(f"{tag} boom")
            return torch.zeros(1, x.shape[1], x.shape[2], hh // 16, ww // 16)
        return fn

    _patch_mappings(monkeypatch, {
        "MiniMaxH3LatentUpscaleWithModel": object,
        "LatentUpscaleModelLoader": object,
        "PixaromaH3LatentUpscale": object,
        "MinimaxH3LatentUpscaler3D": object,
    })
    monkeypatch.setattr(up, "_BACKEND_CALL", {
        "native": make("native", boom=True),
        "pixaroma": make("pixaroma", boom=True),
        "lbh": make("lbh", boom=False),
    })
    v = torch.randn(1, 24, 5, 4, 6)
    z = up.learned_upscale(v, 192, 128)
    assert z.shape[-2:] == (8, 12)
    assert called == ["native", "pixaroma", "lbh"]


def test_all_backends_fail_returns_none(monkeypatch):
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscaler3D": object})
    monkeypatch.setattr(up, "_BACKEND_CALL", {
        "native": lambda *a, **k: (_ for _ in ()).throw(RuntimeError("n")),
        "pixaroma": lambda *a, **k: (_ for _ in ()).throw(RuntimeError("p")),
        "lbh": lambda *a, **k: (_ for _ in ()).throw(RuntimeError("l")),
    })
    v = torch.randn(1, 24, 5, 4, 6)
    assert up.learned_upscale(v, 192, 128) is None


def test_upscale_input_uses_chain_then_stretch(monkeypatch):
    monkeypatch.setattr(up, "available_backends", lambda: ["lbh"])
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    monkeypatch.setattr(up, "learned_upscale", lambda *a, **k: None)
    monkeypatch.setattr(up, "handoff", lambda *a, **k: None)
    v = torch.randn(1, 24, 5, 4, 6)
    z, used = up.upscale_input(None, v, 192, 128, "learned")
    assert used == "stretch" and z.shape == (1, 24, 5, 8, 12)


def test_native_wrapper_passes_model_samples_wh(monkeypatch):
    """_native_once loads via LatentUpscaleModelLoader then calls MiniMaxH3LatentUpscaleWithModel.execute."""
    import comfy.model_management as mm
    seen, unloaded = {}, []
    monkeypatch.setattr(mm, "unload_model_and_clones", lambda model: unloaded.append(model), raising=False)

    class Loader:
        @classmethod
        def execute(cls, model_name):
            seen["model_name"] = model_name
            return _Out({"fake_model": True})

    class Upscale:
        @classmethod
        def execute(cls, model, samples, width, height):
            seen["model"] = model
            seen["samples_shape"] = tuple(samples["samples"].shape)
            seen["wh"] = (width, height)
            B, C, T, H, W = samples["samples"].shape
            out = torch.zeros(B, C, T, height // 16, width // 16)
            return _Out({"samples": out})

    _patch_mappings(monkeypatch, {
        "LatentUpscaleModelLoader": Loader,
        "MiniMaxH3LatentUpscaleWithModel": Upscale,
    })
    v = torch.randn(1, 24, 7, 6, 8)  # 96x128 px
    z = up._native_once(v, 192, 160, "h3.safetensors")  # 160→160, 192→192
    assert seen["model_name"] == "h3.safetensors"
    assert seen["model"] == {"fake_model": True}
    assert seen["samples_shape"] == (1, 24, 7, 6, 8)
    assert seen["wh"] == (192, 160)
    assert z.shape == (1, 24, 7, 10, 12)
    assert unloaded == [seen["model"]]  # only the temporary upscaler, after output copied to CPU


def test_pixaroma_wrapper_passes_latent_name_wh(monkeypatch):
    seen = {}

    class Pix:
        FUNCTION = "upscale"
        def upscale(self, latent, upscale_model, width, height):
            seen["name"] = upscale_model
            seen["wh"] = (width, height)
            seen["shape"] = tuple(latent["samples"].shape)
            B, C, T, H, W = latent["samples"].shape
            return ({"samples": torch.zeros(B, C, T, height // 16, width // 16)},)

    _patch_mappings(monkeypatch, {"PixaromaH3LatentUpscale": Pix})
    v = torch.randn(1, 24, 5, 4, 6)
    z = up._pixaroma_once(v, 192, 128, "m.safetensors")
    assert seen == {"name": "m.safetensors", "wh": (192, 128), "shape": (1, 24, 5, 4, 6)}
    assert z.shape == (1, 24, 5, 8, 12)


def test_stretch_warn_mentions_all_backends():
    w = up.STRETCH_WARN
    assert "trilinear" in w.lower() or "растянут" in w
    assert "MiniMaxH3LatentUpscaleWithModel" in w
    assert "PixaromaH3LatentUpscale" in w
    assert "MinimaxH3LatentUpscaler3D" in w


def test_learned_upscale_aligns_odd_sizes(monkeypatch):
    monkeypatch.setattr(up, "learned_models", lambda: ["m.safetensors"])
    got = {}

    def fn(x, ww, hh, name):
        got["wh"] = (ww, hh)
        return torch.zeros(1, x.shape[1], x.shape[2], hh // 16, ww // 16)

    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscaler3D": object})
    monkeypatch.setattr(up, "_BACKEND_CALL", {"native": fn, "pixaroma": fn, "lbh": fn})
    v = torch.randn(1, 24, 5, 4, 6)
    z = up.learned_upscale(v, 100, 50)  # → align32
    assert got["wh"][0] % 32 == 0 and got["wh"][1] % 32 == 0
    assert z.shape[-1] == got["wh"][0] // 16 and z.shape[-2] == got["wh"][1] // 16


def test_lbh_2d_checkpoint_uses_only_matching_backend(monkeypatch):
    name2d = "minimax_h3_latent_upscaler_2d_conv_v1_bf16.safetensors"
    name3d = "minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors"
    _patch_mappings(monkeypatch, {
        "MiniMaxH3LatentUpscaleWithModel": object,
        "LatentUpscaleModelLoader": object,
        "MinimaxH3LatentUpscaler3D": object,
        "MinimaxH3LatentUpscalerNode2D": object,
    })
    assert up.available_backends() == ["native", "lbh", "lbh2d"]
    assert up.compatible_backends(name2d) == ["lbh2d"]
    assert up.compatible_backends(name3d) == ["lbh"]
    assert up.compatible_backends("h3_upscaler_lms_v0.1.safetensors") == ["native", "lbh"]
    monkeypatch.setattr(up, "learned_models", lambda: [name2d, name3d])
    assert up.capabilities()["learned"]
    assert up.picked_learned_model(name2d) == name2d
    assert up.env_tag("learned", name2d) == "learned:" + name2d + ":lbh2d_v1"
    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscaler3D": object})
    assert up.picked_learned_model() == name3d
    assert not up.compatible_backends(name2d)


def test_lbh_2d_legacy_scale_api(monkeypatch):
    seen = {}
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)

    class Legacy2D:
        FUNCTION = "run"
        def run(self, latent, model_name, scale, device, precision):
            seen.update(model=model_name, scale=scale, device=device, precision=precision)
            x = latent["samples"]
            return ({"samples": torch.zeros(x.shape[:3] + (round(x.shape[-2] * scale), round(x.shape[-1] * scale)))},)

    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscalerNode2D": Legacy2D})
    x = torch.ones(1, 24, 7, 4, 6)
    z = up._lbh2d_once(x, 192, 128, "minimax_h3_latent_upscaler_2d_conv_v1_bf16.safetensors")
    assert seen["scale"] == 2.0 and seen["device"] == "cpu" and seen["precision"] == "fp32"
    assert z.shape == (1, 24, 7, 8, 12)
    # Legacy isotropic scale needs a tiny (<3 latent cells) adjustment after
    # separately snapped target width/height; preserve the exact final grid.
    z2 = up._lbh2d_once(torch.ones(1, 24, 7, 15, 20), 576, 448,
                        "minimax_h3_latent_upscaler_2d_conv_v1_bf16.safetensors")
    assert z2.shape == (1, 24, 7, 28, 36)


def test_lbh_2d_new_target_dimensions_api(monkeypatch):
    seen = {}
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)

    class Modern2D:
        FUNCTION = "execute"
        @classmethod
        def execute(cls, latent, model_name, mode, sharpness, align, temporal_chunking,
                    chunk_frames, force_unload, device, precision):
            seen.update(mode=mode, sharpness=sharpness, chunks=chunk_frames, unload=force_unload)
            x = latent["samples"]
            return _Out({"samples": torch.zeros(x.shape[:3] + (mode["height"] // 16, mode["width"] // 16))})

    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscalerNode2D": Modern2D})
    z = up._lbh2d_once(torch.zeros(1, 24, 7, 4, 6), 192, 128, "2d_conv.safetensors")
    assert seen == {"mode": {"mode": "target dimensions", "width": 192, "height": 128},
                    "sharpness": 1, "chunks": 32, "unload": True}
    assert z.shape == (1, 24, 7, 8, 12)


def test_lbh_2d_installed_execute_api_without_function(monkeypatch):
    """Current LBH ComfyNode has no FUNCTION and inherits a misleading run()."""
    seen = {}
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)

    class ComfyNodeBase:
        def run(self, *args, **kwargs):
            raise AssertionError("The inherited ComfyNode.run must not be called")

    class Installed2D(ComfyNodeBase):
        @classmethod
        def execute(cls, latent, model_name, mode, align, force_unload,
                    device, precision, sharpness=1, temporal_chunking=None):
            seen.update(model=model_name, mode=mode, align=align, unload=force_unload,
                        device=device, precision=precision, sharpness=sharpness,
                        temporal_chunking=temporal_chunking)
            x = latent["samples"]
            return _Out({"samples": torch.zeros(x.shape[:3] + (mode["height"] // 16, mode["width"] // 16))})

    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscalerNode2D": Installed2D})
    model = "minimax_h3_latent_upscaler_2d_conv_v1_bf16.safetensors"
    z = up._lbh2d_once(torch.zeros(1, 24, 7, 4, 6), 192, 128, model)
    assert seen == {"model": model, "mode": {"mode": "target dimensions", "width": 192, "height": 128},
                    "align": 32, "unload": True, "device": "cpu", "precision": "fp32",
                    "sharpness": 1, "temporal_chunking": {"temporal_chunking": "chunked", "chunk_frames": 32}}
    assert z.shape == (1, 24, 7, 8, 12)


def test_lbh_2d_legacy_gpu_cache_is_evicted(monkeypatch):
    import sys
    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    monkeypatch.setattr(torch.cuda, "empty_cache", lambda: None)
    module = sys.modules[__name__]
    cache = {}
    monkeypatch.setattr(module, "MODEL_CACHE", cache, raising=False)
    moved = []

    class DummyModel:
        def to(self, device):
            moved.append(device)

    class Legacy2D:
        FUNCTION = "run"
        def run(self, latent, model_name, scale, device, precision):
            cache[f"{model_name}::cuda::{precision}"] = DummyModel()
            x = latent["samples"]
            return ({"samples": torch.zeros(x.shape[:3] + (8, 12))},)

    _patch_mappings(monkeypatch, {"MinimaxH3LatentUpscalerNode2D": Legacy2D})
    up._lbh2d_once(torch.ones(1, 24, 7, 4, 6), 192, 128, "2d_conv.safetensors")
    assert cache == {} and moved == ["cpu"]
