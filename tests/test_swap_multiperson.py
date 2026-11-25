"""Multi-person swap mask: several clicks become one tracked union with its own cache key."""
import numpy as np
import pytest
import torch

from h3s import h3s_swap_mask as sm


def test_seeds_of_accepts_one_click_or_several():
    assert sm.seeds_of({"point": [0.2, 0.3]}) == [((0.2, 0.3), None)]
    assert sm.seeds_of({"point": [0.2, 0.3], "box": [0.1, 0.1, 0.2, 0.5]}) == [((0.2, 0.3), [0.1, 0.1, 0.2, 0.5])]
    both = sm.seeds_of({"seeds": [{"point": [0.2, 0.3]}, {"point": [0.7, 0.4], "box": [0.6, 0.1, 0.2, 0.5]}]})
    assert both == [((0.2, 0.3), None), ((0.7, 0.4), [0.6, 0.1, 0.2, 0.5])]
    assert sm.seeds_of({"seeds": [[0.2, 0.3], [0.7, 0.4]]}) == [((0.2, 0.3), None), ((0.7, 0.4), None)]
    assert sm.seeds_of({}) == []


def _mask(x1, y1, x2, y2, tw=16, th=10):
    m = np.zeros((1, th, tw), dtype=np.float32)
    m[:, y1:y2, x1:x2] = 1.0
    return torch.from_numpy(m)


def test_dedupe_drops_a_seed_that_covers_the_same_person():
    a, b, c = _mask(0, 0, 6, 10), _mask(1, 0, 6, 10), _mask(10, 0, 16, 10)
    kept = sm._dedupe_seeds([a, b, c])
    assert len(kept) == 2, [tuple(k.shape) for k in kept]      # b sits on a, c is a second person
    assert sm._dedupe_seeds([_mask(0, 0, 0, 0), a]) == [a] or len(sm._dedupe_seeds([_mask(0, 0, 0, 0), a])) == 1


def test_union_covers_every_person():
    u = sm._union([_mask(0, 0, 4, 4), _mask(8, 4, 12, 10)])
    assert u is not None and float(u[0, 0, 0]) == 1.0 and float(u[0, 8, 8]) == 1.0
    assert float(u[0, 0, 10]) == 0.0
    assert sm._union([]) is None


def test_cache_key_follows_every_seed(tmp_path):
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"x" * 32)
    one = sm._cache_dir(str(tmp_path), str(video), [((0.2, 0.3), None)], 768, 1344)
    same = sm._cache_dir(str(tmp_path), str(video), [((0.2, 0.3), None)], 768, 1344)
    two = sm._cache_dir(str(tmp_path), str(video), [((0.2, 0.3), None), ((0.7, 0.4), None)], 768, 1344)
    moved = sm._cache_dir(str(tmp_path), str(video), [((0.2, 0.31), None)], 768, 1344)
    assert one == same and one != two and one != moved
    assert "swap_sam3" in one


def test_prepare_rejects_an_empty_or_bad_click(tmp_path):
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"x" * 8)
    with pytest.raises(ValueError):
        sm.prepare(str(video), [], 8, 64, 64, str(tmp_path))
    with pytest.raises(ValueError):
        sm.prepare(str(video), [(1.4, 0.2)], 8, 64, 64, str(tmp_path))


def test_seeds_of_takes_back_its_own_pairs():
    """prepare/composite передают уже готовые пары ((x, y), box) — повторный разбор не должен падать."""
    ready = [((0.3, 0.6), None), ((0.7, 0.4), [0.6, 0.2, 0.9, 0.8])]
    assert sm.seeds_of({"seeds": ready}) == [((0.3, 0.6), None), ((0.7, 0.4), [0.6, 0.2, 0.9, 0.8])]
    # и обычные формы по-прежнему работают
    assert sm.seeds_of({"seeds": [[0.3, 0.6], [0.7, 0.4]]}) == [((0.3, 0.6), None), ((0.7, 0.4), None)]
    assert sm.seeds_of({"seeds": [{"point": [0.3, 0.6], "box": None}]}) == [((0.3, 0.6), None)]
    assert sm.seeds_of({"point": [0.3, 0.6]}) == [((0.3, 0.6), None)]
    assert sm.seeds_of({}) == []
