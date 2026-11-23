"""CPU checks for the Studio-only continuity and colour pipeline."""
import importlib.util
from pathlib import Path
import unittest

import torch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("h3s_studio_color", ROOT / "h3s_studio_color.py")
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)


class StudioColourTests(unittest.TestCase):
    def test_locked_latent_head_is_unchanged(self):
        torch.manual_seed(12)
        previous = torch.randn(1, 24, 37, 10, 12)
        current = torch.randn(1, 24, 37, 10, 12) * 0.85 + 0.2
        head = previous[:, :, -7:].clone()
        current[:, :, :7] = head
        cal = studio.calibrate({"samples": current}, {"samples": previous}, 22, 2)["samples"]
        anchored = studio.latent_anchor({"samples": cal}, {"samples": previous}, 22, 2)["samples"]
        self.assertTrue(torch.equal(anchored[:, :, :7], head))
        self.assertTrue(bool(torch.isfinite(anchored).all()))
        self.assertFalse(torch.equal(anchored[:, :, 7:], current[:, :, 7:]))

    def test_rgb_overlap_tone_is_aligned(self):
        torch.manual_seed(13)
        previous = torch.rand(42, 16, 16, 3) * 0.5 + 0.15
        current = torch.rand(56, 16, 16, 3) * 0.5 + 0.15
        current[:22] = previous[-22:] + 0.08
        result = studio.tone_shift(previous, current, 22, 2)
        self.assertLess(float((result[:22].mean((1, 2)) - previous[-22:].mean((1, 2))).abs().max()), 1e-5)
        self.assertTrue(bool(torch.isfinite(result).all()))

    def test_lab_anchor_and_bridge(self):
        torch.manual_seed(14)
        first = torch.rand(56, 16, 16, 3) * 0.5 + 0.2
        ref = studio.stats(first, window=36)
        self.assertEqual(tuple(ref.shape), (6,))
        second = (first + torch.tensor([0.09, -0.02, 0.05])).clamp(0, 1)
        out = studio.pull(second, ref, start=22, clip_no=2)
        self.assertTrue(torch.equal(out[:22], second[:22]))
        self.assertTrue(bool(torch.isfinite(out).all()))
        combined = torch.cat((first, out[22:]), dim=0)
        studio.bridge(combined, seam=56, keep=34)
        self.assertTrue(bool(torch.isfinite(combined).all()))

    def test_matches_available_original(self):
        base = ROOT.parent / "H3Studio-LD" / "vendor" / "h3render"
        if not (base / "seamfix.py").is_file() or not (base / "seamanchor.py").is_file():
            self.skipTest("Reference source not installed")
        for name in ("seamfix", "seamanchor"):
            spec = importlib.util.spec_from_file_location(name, base / (name + ".py"))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            setattr(self, name, mod)
        torch.manual_seed(15)
        prev = torch.randn(1, 24, 37, 10, 12)
        current = prev * 1.15 + 0.03
        current[:, :, :7] = prev[:, :, -7:]
        for fun in ("calibrate", "latent_anchor"):
            args = ({"samples": current}, {"samples": prev}, 22, 2)
            a = getattr(studio, fun)(*args)["samples"]
            b = getattr(self.seamfix, fun)(*args)["samples"]
            self.assertTrue(torch.equal(a, b), fun)
        rgb = torch.rand(56, 16, 16, 3)
        ref = self.seamanchor.stats(rgb, window=36)
        self.assertTrue(torch.equal(studio.stats(rgb, window=36), ref))
        self.assertTrue(torch.equal(studio.pull(rgb, ref, 22, 2),
                                    self.seamanchor.pull(rgb, ref, 22, 2)))


if __name__ == "__main__":
    unittest.main()
