"""collect_chat: the answer text, with the reasoning as a fallback when a model writes its answer there."""
import pytest

from h3s import h3s_llm


def _fake(events):
    def gen(*_a, **_kw):
        for kind, text in events:
            yield kind, text
    return gen


def test_content_wins_when_the_model_sends_it(monkeypatch):
    monkeypatch.setattr(h3s_llm, "stream_chat", _fake([("reasoning", "думаю…"), ("token", '{"a": 1}'),
                                                      ("stats", {})]))
    assert h3s_llm.collect_chat([{"role": "user", "content": "x"}]) == '{"a": 1}'


def test_reasoning_is_used_when_content_stays_empty(monkeypatch):
    """Так отвечает дешёвая модель за прокси: content пустой, весь JSON уходит в reasoning."""
    monkeypatch.setattr(h3s_llm, "stream_chat", _fake([("reasoning", "Пишу JSON: "),
                                                      ("reasoning", '{"segments": [{"prompt": "p"}]}'),
                                                      ("stats", {})]))
    got = h3s_llm.collect_chat([{"role": "user", "content": "x"}])
    assert got.endswith('{"segments": [{"prompt": "p"}]}') and got.startswith("Пишу JSON")
    assert h3s_llm.collect_chat([{"role": "user", "content": "x"}], reasoning_fallback=False) == ""


def test_an_error_event_still_raises(monkeypatch):
    monkeypatch.setattr(h3s_llm, "stream_chat", _fake([("reasoning", "…"), ("error", "Fetch timeout")]))
    with pytest.raises(ValueError, match="Fetch timeout"):
        h3s_llm.collect_chat([{"role": "user", "content": "x"}])
