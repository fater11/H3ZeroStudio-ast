"""Standalone: python tests/test_atomic_cache_standalone.py"""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import types
from unittest.mock import patch

import torch

root = Path(__file__).resolve().parents[1]
pkg = types.ModuleType('atomic_test_pkg')
pkg.__path__ = [str(root)]
sys.modules[pkg.__name__] = pkg
spec = importlib.util.spec_from_file_location('atomic_test_pkg.h3s_atomic', root / 'h3s_atomic.py')
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

with tempfile.TemporaryDirectory() as d:
    target = os.path.join(d, 'cache.pt')
    mod.save_torch({'v': torch.tensor([1.0])}, target)
    assert torch.load(target, weights_only=True)['v'].item() == 1
    mod.save_torch({'v': torch.tensor([2.0])}, target)
    assert torch.load(target, weights_only=True)['v'].item() == 2
    with patch.object(torch, 'save', side_effect=RuntimeError('disk interrupted')):
        try:
            mod.save_torch({'v': torch.tensor([3.0])}, target)
        except RuntimeError:
            pass
        else:
            raise AssertionError('expected failure')
    assert torch.load(target, weights_only=True)['v'].item() == 2
    assert sorted(os.listdir(d)) == ['cache.pt'], os.listdir(d)
print('PASS: atomic replace, overwrite, failed write keeps original and cleans temporary file')
