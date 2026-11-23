import importlib.util
from pathlib import Path
import tempfile
import unittest
import torch

PATH = Path(__file__).resolve().parents[1] / "h3s_cache_validation.py"
spec = importlib.util.spec_from_file_location("cache_validation", PATH)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class CacheValidationTests(unittest.TestCase):
    def setUp(self):
        self.good = {"v": torch.zeros(1, 24, 4, 8, 8), "a": torch.zeros(1, 32, 2, 12)}

    def test_good(self):
        self.assertIs(m.validate_av_cache(self.good, "ok"), self.good)

    def test_bad_video_rank(self):
        with self.assertRaises(m.InvalidLatentCache):
            m.validate_av_cache({**self.good, "v": torch.zeros(1, 24, 4, 8)}, "bad")

    def test_nan_video(self):
        d = dict(self.good); d["v"] = d["v"].clone(); d["v"][0,0,0,0,0] = float("nan")
        with self.assertRaises(m.InvalidLatentCache): m.validate_av_cache(d, "nan")

    def test_inf_audio(self):
        d = dict(self.good); d["a"] = d["a"].clone(); d["a"][0,0,0,0] = float("inf")
        with self.assertRaises(m.InvalidLatentCache): m.validate_av_cache(d, "inf")

    def test_wrong_audio_layout(self):
        with self.assertRaises(m.InvalidLatentCache):
            m.validate_av_cache({**self.good, "a": torch.zeros(1,32,3,12)}, "bad")

    def test_optional_audio(self):
        self.assertIsNotNone(m.validate_av_cache({"v": self.good["v"]}, "ok"))
        with self.assertRaises(m.InvalidLatentCache):
            m.validate_av_cache({"v": self.good["v"]}, "bad", require_audio=True)

    def test_disk_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            p = str(Path(d) / "valid.pt")
            torch.save(self.good, p)
            self.assertEqual(tuple(m.load_av_cache(p)["v"].shape), (1,24,4,8,8))

if __name__ == "__main__": unittest.main()
