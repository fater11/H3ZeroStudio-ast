"""v6m hotfix 1: the LoRA picker opened from Settings > «Модели и LoRA» must sit above the modal scrim,
be placed after its list is filled (fit / flip / internal scroll), and Esc must close the picker, not the modal."""
import re
from pathlib import Path

JS = Path(__file__).resolve().parents[1] / "web" / "js"


def _z(src, sel):
    m = re.search(re.escape(sel) + r"\s*\{[^}]*?z-index:\s*(\d+)", src)
    assert m, sel
    return int(m.group(1))


def test_picker_above_modal_scrim():
    v6 = (JS / "v6" / "css.js").read_text(encoding="utf-8")
    mt = (JS / "h3s_modeltab.js").read_text(encoding="utf-8")
    scrim, pop = _z(v6, ".v6 .v6-scrim"), _z(mt, ".h3l-lp")
    assert pop > scrim and pop > _z(v6, ".v6 .v6-pop")
    assert _z(mt, ".h3l-lp-prev") > pop
    assert pop < _z(v6, ".v6 .v6-toast")


def test_picker_placed_after_paint_and_scrolls_inside():
    mt = (JS / "h3s_modeltab.js").read_text(encoding="utf-8")
    body = mt[mt.index("mpLoraPicker(anchor"):]
    assert "uiPlaceBelow(" not in body                      # the old pre-paint placement is gone
    assert "if (pop.isConnected) place();" in body           # re-placed after every repaint (search)
    assert 'addEventListener("resize", onMove)' in body and 'addEventListener("scroll", onScroll, true)' in body
    assert re.search(r"\.h3l-lp \.ls\{[^}]*min-height:0[^}]*overflow:auto", mt)


def test_escape_closes_picker_not_modal():
    kit = (JS / "v6" / "kit.js").read_text(encoding="utf-8")
    assert '.closest?.(".v6-pop, .h3l-lp")' in kit and '".v6-pop.on, .h3l-menu, .h3l-lp"' in kit
    mt = (JS / "h3s_modeltab.js").read_text(encoding="utf-8")
    assert 'inp.addEventListener("keydown"' in mt
