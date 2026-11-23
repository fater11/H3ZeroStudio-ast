"""No ComfyUI needed: execute the actual cache preflight functions from AST."""
import ast
import os
from pathlib import Path
import tempfile
import unittest
import zipfile
import torch
from h3s.h3s_cache_validation import InvalidLatentCache, load_av_cache

SRC = Path(__file__).resolve().parents[1] / 'h3s_gen.py'
TREE = ast.parse(SRC.read_text(encoding='utf8'))
NAMES = {'cache_file_structurally_valid', 'usable_cache_file'}
MODULE = ast.Module(body=[n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in NAMES], type_ignores=[])
LOGS = []
ns = {'os': os, 'zipfile': zipfile, 'log': LOGS.append,
      'load_av_cache': load_av_cache, 'InvalidLatentCache': InvalidLatentCache}
exec(compile(ast.fix_missing_locations(MODULE), str(SRC), 'exec'), ns)

class CacheIntegrity(unittest.TestCase):
    def test_valid_torch_style_zip(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'seg.pt'
            torch.save({'v': torch.zeros(1, 24, 2, 4, 4), 'a': torch.zeros(1, 32, 2, 8)}, p)
            self.assertTrue(ns['usable_cache_file'](str(p)))
    def test_truncated_archive(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'seg.pt'
            p.write_bytes(b'PK\x03\x04' + b'\x00'*300)
            self.assertFalse(ns['usable_cache_file'](str(p)))
            with self.assertRaises(ValueError):
                ns['usable_cache_file'](str(p), frozen=True)
    def test_missing_metadata(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'seg.pt'
            with zipfile.ZipFile(p, 'w') as z:
                z.writestr('archive/version', b'3')
            self.assertFalse(ns['usable_cache_file'](str(p)))
    def test_missing_file(self):
        self.assertFalse(ns['usable_cache_file']('/nonexistent/seg.pt'))

if __name__ == '__main__':
    unittest.main()
