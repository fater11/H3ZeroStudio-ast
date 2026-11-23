"""v6n hotfix 1: the LoRA picker search row has ONE focus ring (scheme accent, on the rounded row); the field draws none."""
from pathlib import Path

CSS = (Path(__file__).resolve().parents[1] / "web" / "js" / "v6" / "css.js").read_text(encoding="utf-8")


def test_single_focus_ring_on_lora_search_row():
    assert "html[data-v6] .h3l-lp .top:focus-within { border:0;" in CSS
    assert "box-shadow:0 0 0 3px var(--v6-acc-ring)" in CSS.split("html[data-v6] .h3l-lp .top:focus-within", 1)[1].split("}", 1)[0]
    field = CSS.split("html[data-v6] .h3l-lp input.q:focus-visible", 1)[1].split("}", 1)[0]
    assert "outline:none" in field and "box-shadow:none" in field
