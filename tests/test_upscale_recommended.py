"""«★ Рекомендуемые параметры» апскейла отрезка: числа в питоне, зеркало в JS и валидность профиля."""
import pathlib
import re

import pytest

from h3s import h3s_core as core


def _js():
    path = pathlib.Path(__file__).resolve().parents[1] / "web" / "js" / "h3s_core.js"
    return path.read_text(encoding="utf-8")


def test_recommended_profiles_survive_normalisation():
    """Рекомендуемый профиль не должен «поехать» при нормализации — иначе кнопка врёт."""
    for method, rec in core.RECOMMENDED_UPSCALE.items():
        pr = core.normalize_upscale_profile(method, dict(rec))
        assert pr["mp"] == rec["mp"]
        assert abs(pr["sigma"] - rec["sigma"]) < 1e-9
        assert pr["steps"] == rec["steps"]
        assert pr["chunk"] is rec["chunk"]
        assert pr["chunk_sec"] == rec["chunk_sec"]
        assert pr["chunk_overlap"] == rec["chunk_overlap"]
        # селектор метода получает те же поля, что и профиль
        u = core.profile_upscale({"upscale_profiles": {method: pr}}, method)
        assert u["method"] == method and u["mp"] == rec["mp"]


def test_both_methods_have_a_recommended_sigma():
    assert set(core.SEG_UPSCALE_SIGMA_RECOMMENDED) == set(core.SEG_UPSCALE_METHODS)
    for method in core.SEG_UPSCALE_METHODS:
        rec = core.RECOMMENDED_UPSCALE[method]
        assert core.SEG_UPSCALE_SIGMA_RECOMMENDED[method] == pytest.approx(rec["sigma"])


def test_the_js_mirror_carries_the_same_numbers():
    text = _js()
    block = text[text.index("RECOMMENDED_UPSCALE"):]
    block = block[:block.index("};")]
    for method, rec in core.RECOMMENDED_UPSCALE.items():
        assert method in block
        assert f'mp: {rec["mp"]}' in block
        assert f'sigma: {rec["sigma"]}' in block
        assert f'chunk: {"true" if rec["chunk"] else "false"}' in block
    sigma_marks = re.search(r"SEG_UPSCALE_SIGMA_RECOMMENDED = \{([^}]*)\}", text).group(1)
    for method, rec in core.RECOMMENDED_UPSCALE.items():
        assert f"{method}: {rec['sigma']}" in sigma_marks