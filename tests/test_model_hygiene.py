"""v6l hotfix: temporary clone chains (cached model → shift clone → ControlNet clone) must never leave a dead
LoadedModel entry - the native ControlNet patch calls load_models_gpu(loaded_models(only_currently_used=True)) and
crashed on None ('NoneType' object has no attribute 'model_patches_models')."""
import gc
import weakref

import pytest
import torch

import comfy.model_management as mm
from h3s import h3s_gen as gen
from fakes import tiny_patcher


@pytest.fixture
def loaded():
    keep = list(mm.current_loaded_models)
    mm.current_loaded_models.clear()
    yield mm.current_loaded_models
    mm.current_loaded_models[:] = keep


def _register(patcher, real):
    lm = mm.LoadedModel(patcher)
    lm.real_model = weakref.ref(real)
    mm.current_loaded_models.insert(0, lm)
    return lm


def _chain(base):
    c1 = gen.apply_shift(base, 3.0, 3.0)   # our shift clone
    c2 = c1.clone()                         # the native ControlNet node's model.clone()
    c1.cycle, c2.cycle = c1, c2             # make gc (not refcount) collect them together, as on the GPU box
    return c1, c2


def _guarded_load(calls):
    def load_models_gpu(models, *a, **k):
        calls.append(list(models))
        assert all(m is not None for m in models), "load_models_gpu got a None model"
    return load_models_gpu


def test_evict_drops_local_text_encoder_before_comfy_gc(monkeypatch):
    from h3s import h3s_models as models

    class FakeTextEncoder:
        def __init__(self):
            self.patcher = self
            self.clone_base_uuid = "fake-text-encoder"

    cache = {"encoder": FakeTextEncoder()}
    ref = weakref.ref(cache["encoder"])
    observed = []
    monkeypatch.setattr(mm, "unload_model_and_clones", lambda _: None)
    monkeypatch.setattr(mm, "soft_empty_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(mm, "cleanup_models_gc", lambda: observed.append(ref() is None))

    models._evict(cache, set(), "text encoder")
    assert cache == {}
    assert observed == [True], "the eviction loop must release its strong refs before ComfyUI checks for leaks"


def test_dead_clone_entry_is_reproduced_and_healed(loaded):
    base = tiny_patcher()
    c1, c2 = _chain(base)
    _register(c2, base.model)
    del c1, c2
    gc.collect()
    assert loaded[0].model is None                        # the GPU-box state: patcher gone, real model alive
    assert None in mm.loaded_models(only_currently_used=True)
    assert gen.heal_loaded_models() == 1
    assert None not in mm.loaded_models(only_currently_used=True)


def test_sample_pass_hands_clone_entries_back(loaded, monkeypatch):
    base = tiny_patcher()
    calls = []
    monkeypatch.setattr(mm, "load_models_gpu", _guarded_load(calls))

    def fake_sample(m, noise, *a, **k):   # what comfy.sample does + what the native ControlNet patch does at step 1
        _register(m, m.model)
        mm.load_models_gpu(mm.loaded_models(only_currently_used=True))
        return noise
    monkeypatch.setattr(gen.comfy.sample, "sample", fake_sample)
    for seg in range(3):   # several segments / runs: no dead entries, no growth
        c1, c2 = _chain(base)
        gen.sample_pass(c2, torch.zeros(1), 2, 1.0, "euler", "simple", [], [], torch.zeros(1), 1.0, None, seg)
        del c1, c2
        gc.collect()
        mods = mm.loaded_models(only_currently_used=True)
        assert None not in mods
        assert all(m is base for m in mods)
        assert len(loaded) == 1
    assert len(calls) == 3


def test_heal_marks_orphans_unused(loaded, monkeypatch):
    base = tiny_patcher()
    other = tiny_patcher()        # a patcher with no parent dies while its real model is kept elsewhere
    real = other.model
    _register(other, real)
    del other
    gc.collect()
    calls = []
    monkeypatch.setattr(mm, "load_models_gpu", _guarded_load(calls))
    gen.heal_loaded_models()
    mm.load_models_gpu(mm.loaded_models(only_currently_used=True))
    assert calls == [[]]
    assert real is not None and base is not None
