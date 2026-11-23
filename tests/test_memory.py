"""v6m memory policy: «Экономия памяти» (chunked feed-forward, own implementation) and releasing what a run does
not need (ControlNet patch, preprocessors) with a short log line."""
import torch
import pytest

from h3s import h3s_core as core
from h3s import h3s_gen as gen
from h3s import h3s_control as control
from h3s import h3s_memory as mem
from fakes import tiny_patcher, FakeClip, FakeVAE
from test_control import dirs, project, _video, _pinfo   # noqa: F401  (fixtures)


@pytest.fixture()
def patcher():
    return tiny_patcher()


def test_chunked_ffn_equals_the_plain_mlp(patcher):
    import comfy.ops
    mlp = patcher.model.diffusion_model.blocks[0].mlp
    torch.manual_seed(1)
    for shape in ((1, 1031, 128), (1037, 128), (2, 600, 128)):
        x = torch.randn(*shape)
        ref = comfy.ops.linear_input_act(mlp.fc2, mlp.fc1(x), "swiglu")
        for chunks in (2, 3, 7):
            got = mem.chunked_ffn(chunks, 256)(mlp, x)
            assert got.shape == ref.shape and torch.allclose(got, ref, atol=1e-6, rtol=1e-5), (shape, chunks)
    small = torch.randn(1, 100, 128)   # under the threshold: the plain path
    assert torch.equal(mem.chunked_ffn(4, 256)(mlp, small), comfy.ops.linear_input_act(mlp.fc2, mlp.fc1(small), "swiglu"))


def test_modes_and_the_patched_clone(patcher, monkeypatch):
    assert not mem.wants_ffn({"mode": "off"}, cn=True, tokens=10 ** 6)
    assert mem.wants_ffn({"mode": "auto"}, cn=True) and not mem.wants_ffn({"mode": "auto"}, cn=False, tokens=100)
    assert mem.wants_ffn({"mode": "auto", "threshold": 1000}, tokens=2001) and mem.wants_ffn({"mode": "on"})
    # On >=22 GiB GPUs, Auto preserves the faster full-width path at usual H3 video lengths.
    assert not mem.wants_ffn({"mode": "auto"}, tokens=77616, vram_gib=24)
    assert mem.wants_ffn({"mode": "auto"}, tokens=77616, vram_gib=16)
    assert mem.wants_ffn({"mode": "auto"}, tokens=140000, vram_gib=24)
    assert mem.wants_ffn({"mode": "auto"}, tokens=77616, vram_gib=24, cn=True)
    assert mem.wants_ffn({"mode": "on"}, tokens=77616, vram_gib=24)
    monkeypatch.setattr(mem, "_total_vram_gib", lambda _: 24.0)
    assert mem.apply_ffn(patcher, {"mode": "auto"}, tokens=77616) is patcher
    assert mem.apply_ffn(patcher, {"mode": "off"}) is patcher
    m2 = mem.apply_ffn(patcher, {"mode": "on", "chunks": 2, "threshold": 512})
    assert m2 is not patcher and not patcher.object_patches   # the source patcher is untouched
    keys = [k for k in m2.object_patches if k.endswith(".mlp.forward")]
    assert len(keys) == len(patcher.model.diffusion_model.blocks)
    assert mem.apply_ffn(m2, {"mode": "on"}) is m2   # never stacked
    assert core.normalize_project({"settings": {"memsave": {"mode": "x", "chunks": 99, "threshold": 5}}})["settings"]["memsave"] == {"mode": "auto", "chunks": 16, "threshold": 256}


def test_generation_with_memsave_gives_the_same_latents(patcher, dirs, monkeypatch):
    out, inp = dirs
    seen = []
    real = mem.chunked_ffn

    def spy(chunks, thr):
        f = real(chunks, thr)

        def g(self, x):
            seen.append(int(x.shape[-2]))
            return f(self, x)
        g._h3zs_ffn = f._h3zs_ffn
        return g
    monkeypatch.setattr(mem, "chunked_ffn", spy)
    base = project()
    base["settings"]["cache"] = False
    base["settings"]["memsave"] = {"mode": "off"}
    a = gen.run_project(patcher, FakeClip(), FakeVAE(), base)
    assert not seen
    on = project()
    on["settings"]["cache"] = False
    on["settings"]["memsave"] = {"mode": "on", "chunks": 3, "threshold": 256}
    monkeypatch.setattr(core, "normalize_memsave", lambda v: {"mode": "on", "chunks": 3, "threshold": 8})   # tiny clips: force chunking
    b = gen.run_project(patcher, FakeClip(), FakeVAE(), on)
    assert seen and max(seen) > 8
    va, vb = a[0], b[0]
    assert torch.allclose(va, vb, atol=1e-4, rtol=1e-4)


class _FakePatcher:
    def __init__(self, name):
        self.name, self.model = name, object()


def test_release_unloads_and_logs(monkeypatch, capsys):
    import comfy.model_management as mm
    gone = []
    monkeypatch.setattr(mm, "unload_model_and_clones", lambda p, *a, **k: gone.append(p.name), raising=False)
    mem.hold("cn_patch:x.safetensors", _FakePatcher("cn"), "ControlNet patch x")
    mem.hold("pre:pose", (_FakePatcher("sdpose"), None, _FakePatcher("rtdetr")), "SDPose + RT-DETR")
    control.release()
    assert sorted(gone) == ["rtdetr", "sdpose"] and mem.get("cn_patch:x.safetensors") is not None
    control.release_patch()
    assert gone[-1] == "cn" and not mem.HOT
    assert "[H3ZS] unloaded: SDPose + RT-DETR" in capsys.readouterr().out


def test_preprocessors_are_released_right_after_the_control_video(dirs, monkeypatch):
    out, inp = dirs
    a = _video(inp)
    held = []
    monkeypatch.setattr(control, "preprocess", lambda fr, mode, params: (mem.get("pre:da3:x") or mem.hold("pre:da3:x", _FakePatcher("da3")), fr)[1])
    import comfy.model_management as mm
    monkeypatch.setattr(mm, "unload_model_and_clones", lambda p, *a_, **k: held.append(p.name), raising=False)
    path = control.build_processed(str(inp / "h3labstudio" / a["file"]), "depth", core.normalize_control_params({}))
    assert path and held == ["da3"] and mem.get("pre:da3:x") is None


def test_run_without_control_releases_the_patch(patcher, dirs, monkeypatch):
    import comfy.model_management as mm
    gone = []
    monkeypatch.setattr(mm, "unload_model_and_clones", lambda p, *a, **k: gone.append(p.name), raising=False)
    mem.hold("cn_patch:fake_2.0.safetensors", _FakePatcher("cn"), "ControlNet patch")
    gen.run_project(patcher, FakeClip(), FakeVAE(), project())
    assert gone == ["cn"] and not any(k.startswith("cn_patch:") for k in mem.HOT)


def test_run_with_control_keeps_the_patch_hot(patcher, dirs, monkeypatch):
    out, inp = dirs
    _video(inp)
    import comfy.model_management as mm
    import comfy_extras.nodes_minimax_h3 as nm
    gone, loads = [], []
    monkeypatch.setattr(mm, "unload_model_and_clones", lambda p, *a, **k: gone.append(p.name), raising=False)

    class FakeApply:
        @staticmethod
        def execute(model, patch, vae, strength, start, end, control_video=None):
            return (model,)
    monkeypatch.setattr(nm, "MiniMaxH3FunControlNetApply", FakeApply)
    monkeypatch.setattr(control, "patch_file", lambda: ("fake_2.0.safetensors", "/x"))
    monkeypatch.setattr(control, "patch_info", _pinfo("fake_2.0.safetensors"))
    import comfy_extras.nodes_model_patch as mp

    class FakeLoader:
        def load_model_patch(self, name):
            loads.append(name)
            return (_FakePatcher("cn"),)
    monkeypatch.setattr(mp, "ModelPatchLoader", FakeLoader)
    p = project({"mode": "gray", "clips": [{"asset": "v1", "start": 0.0, "in": 0.0, "length": 1.0}]})
    p["settings"]["cache"] = False
    gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    gen.run_project(patcher, FakeClip(), FakeVAE(), p)
    assert loads == ["fake_2.0.safetensors"] and gone == []   # same setup: loaded once, no churn
    control.release_patch()


def test_runtime_boundary_releases_temporaries_without_unloading_models(monkeypatch):
    import comfy
    import comfy.model_management as mm
    calls = []
    monkeypatch.setattr(comfy, "memory_management", type("Policy", (), {"aimdo_enabled": False})(), raising=False)
    monkeypatch.setattr(mm, "soft_empty_cache", lambda *args: calls.append(("cache", args)), raising=False)
    monkeypatch.setattr(mm, "unload_all_models", lambda: pytest.fail("boundary unloaded the diffusion model"), raising=False)
    monkeypatch.setattr(mem.gc, "collect", lambda: calls.append(("gc", ())))
    monkeypatch.setattr(mem, "runtime_snapshot", lambda: {
        "allocated": 1.0, "reserved": 1.5, "free": 22.5, "total": 24.0})
    snap = mem.cleanup_runtime("unit")
    assert snap["free"] == 22.5
    assert ("gc", ()) in calls
    assert ("cache", (True,)) in calls


def test_low_high_uses_ffn_saving_on_both_arms_and_releases_low_state():
    import inspect
    from h3s.h3s_luna import luna_two_pass
    src = inspect.getsource(gen.sample_segment)
    assert "low_mem = _memsave(m, samples, tokens=low_tokens)" in src
    assert "high_mem = _memsave(m2, samples, tokens=high_tokens)" in src
    assert "low_h = max(2, round(h_lat * lowhigh_scale / 2) * 2)" in src
    assert "on_boundary=lambda stage: memory.cleanup_runtime(stage), return_low_res=False" in src
    stage = inspect.getsource(luna_two_pass.two_pass_sample)
    assert "if not return_low_res:" in stage and "del z0_low" in stage
    assert "last_x0.clear()" in stage
    assert 'on_boundary("Low→High")' in stage


def test_omitting_unused_low_preview_leaves_final_av_identical(patcher, monkeypatch):
    import comfy.nested_tensor
    import comfy.sample
    from h3s.h3s_luna import luna_two_pass as lh

    samples = comfy.nested_tensor.NestedTensor((
        torch.randn(1, 24, 7, 6, 8), torch.randn(1, 32, 2, 40)))
    monkeypatch.setattr(comfy.sample, "fix_empty_latent_channels", lambda model, samples, *a: samples)
    monkeypatch.setattr(comfy.sample, "prepare_noise", lambda samples, *a: samples)

    def fake_sample(model, noise, image, mask, nested, pos, neg, cfg, sampler, sigmas, seed,
                    on_x0=None, on_step=None):
        if on_x0 is not None:
            on_x0(image)
        return image

    monkeypatch.setattr(lh, "_sample", fake_sample)

    def fake_lift(video, vae, hw, *args, **kwargs):
        return torch.nn.functional.interpolate(
            video, size=(video.shape[2], *hw), mode="trilinear", align_corners=False)

    params = dict(
        low_res_model=patcher, positive=[], negative=[], vae=None,
        latent_image={"samples": samples}, sampler_low=None, sampler_high=None,
        scheduler="simple", total_steps=2, transition=1, noise_seed=123,
        cfg_low=1.0, cfg_high=1.0, lowres_scale=0.60,
        rho=0, w_min=0, w_max=0, lift=fake_lift,
        sigmas_low=torch.tensor([1.0, 0.70]), sigmas_high=torch.tensor([0.70, 0.0]))
    original, preview = lh.two_pass_sample(**params)
    timings = []
    optimized, discarded = lh.two_pass_sample(
        **params, return_low_res=False,
        on_profile=lambda stage, elapsed, steps: timings.append((stage, elapsed, steps)))
    assert preview is not None and discarded is None
    assert [(stage, steps) for stage, _, steps in timings] == [
        ("low", 1), ("lift", 0), ("high", 1)]
    assert all(isinstance(elapsed, float) and elapsed >= 0.0 for _, elapsed, _ in timings)
    for first, second in zip(original["samples"].unbind(), optimized["samples"].unbind()):
        assert torch.equal(first, second)


def test_low_high_user_controls_and_selective_cache_invalidation():
    from test_gen import project
    base = project(id="lowhigh-controls")
    base["settings"].update({"final_mode": "luna", "steps": 8})
    p = core.normalize_project(base)
    assert core.lowhigh_params(p["settings"], 8) == (5, 0.60, 0.65)
    baseline = core.segment_keys(p)

    # Explicitly selecting the automatic split must reuse previous saved takes.
    p["settings"]["lowhigh_low_steps"] = 5
    assert core.segment_keys(core.normalize_project(p)) == baseline

    p["settings"]["lowhigh_low_steps"] = 6
    assert core.lowhigh_params(p["settings"], 8)[0] == 6
    assert core.segment_keys(core.normalize_project(p)) != baseline

    p["settings"]["lowhigh_low_steps"] = 0
    p["settings"]["lowhigh_scale"] = 0.61
    assert core.segment_keys(core.normalize_project(p)) != baseline
    p["settings"]["lowhigh_scale"] = 0.60
    p["settings"]["lowhigh_denoise"] = 0.55
    assert core.segment_keys(core.normalize_project(p)) != baseline

    # One-stage mode must ignore the Low/High controls and keep its cache.
    p["settings"]["final_mode"] = "full"
    baseline_single = core.segment_keys(core.normalize_project(p))
    p["settings"]["lowhigh_denoise"] = 0.90
    assert core.segment_keys(core.normalize_project(p)) == baseline_single

    s = core.normalize_project({"settings": {"lowhigh_low_steps": 999, "lowhigh_scale": 0,
                                              "lowhigh_denoise": 9}})["settings"]
    assert core.lowhigh_params(s, 8) == (7, 0.25, 1.0)

