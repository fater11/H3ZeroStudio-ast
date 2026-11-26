"""Связь ассистента из параметров запуска ComfyUI: окружение H3LAB_ASSIST_*, файл и одна строка API.

Главное правило, которое здесь проверяется: заданное в параметрах запуска перебивает проект и браузер,
а пустое — ничего не задаёт.
"""
import json

import pytest


@pytest.fixture
def D(h3s):
    from h3s import h3s_assist_defaults
    return h3s_assist_defaults


def test_nothing_set_means_no_overrides(D, tmp_path):
    got = D.defaults(environ={}, path=str(tmp_path / "none.json"))
    assert got == {"values": {}, "from": {}}


def test_env_values_are_typed(D, tmp_path):
    got = D.defaults(environ={
        "H3LAB_ASSIST_BASE": "http://127.0.0.1:20128/v1",
        "H3LAB_ASSIST_MODEL": "combo/hermes-auto",
        "H3LAB_ASSIST_KEY": "secret",
        "H3LAB_ASSIST_MAX_TOKENS": "8000",
        "H3LAB_ASSIST_TEMPERATURE": "0,7",
        "H3LAB_ASSIST_THINKING": "0",
        "H3LAB_ASSIST_ENGINE_DEFAULTS": "да",
        "H3LAB_ASSIST_ALIASES": "ignored",
    }, path=str(tmp_path / "none.json"))
    v = got["values"]
    assert v["api_base"] == "http://127.0.0.1:20128/v1" and v["api_model"] == "combo/hermes-auto"
    assert v["api_key"] == "secret"
    assert v["max_tokens"] == 8000 and v["temperature"] == 0.7      # запятая как десятичный разделитель
    assert v["thinking"] is False and v["engine_defaults"] is True
    assert "aliases" not in v
    assert set(got["from"].values()) == {"env"}


def test_api_line_is_split_into_base_model_key(D, tmp_path):
    p = tmp_path / "none.json"
    for line, want in [
        ("http://127.0.0.1:20128/v1 | combo/hermes-auto | sk-x",
         {"api_base": "http://127.0.0.1:20128/v1", "api_model": "combo/hermes-auto", "api_key": "sk-x"}),
        ("http://127.0.0.1:20128/v1 | combo/hermes-auto", {"api_base": "http://127.0.0.1:20128/v1", "api_model": "combo/hermes-auto"}),
        ("http://127.0.0.1:20128/v1", {"api_base": "http://127.0.0.1:20128/v1"}),
        ("http://127.0.0.1:20128/v1;model;key", {"api_base": "http://127.0.0.1:20128/v1", "api_model": "model", "api_key": "key"}),
        ("   ", {}),
    ]:
        assert D.defaults(environ={"H3LAB_ASSIST_API": line}, path=str(p))["values"] == want, line


def test_single_field_wins_over_the_api_line(D, tmp_path):
    got = D.defaults(environ={"H3LAB_ASSIST_API": "http://a/v1 | m1 | k1", "H3LAB_ASSIST_MODEL": "m2"},
                     path=str(tmp_path / "none.json"))
    assert got["values"]["api_model"] == "m2" and got["values"]["api_key"] == "k1"


def test_file_is_weaker_than_env(D, tmp_path):
    f = tmp_path / "h3lab.assist.json"
    f.write_text(json.dumps({"api_base": "http://from-file/v1", "api_model": "file-model",
                             "api": "http://ignored/v1", "temperature": 0.3, "junk": 1}), encoding="utf-8")
    got = D.defaults(environ={"H3LAB_ASSIST_MODEL": "env-model"}, path=str(f))
    v, src = got["values"], got["from"]
    assert v["api_base"] == "http://from-file/v1" and v["temperature"] == 0.3
    assert v["api_model"] == "env-model" and src["api_model"] == "env" and src["api_base"] == "file"
    assert "junk" not in v


def test_bad_values_are_skipped_not_crashing(D, tmp_path):
    got = D.defaults(environ={"H3LAB_ASSIST_MAX_TOKENS": "lots", "H3LAB_ASSIST_THINKING": "maybe",
                              "H3LAB_ASSIST_BASE": "   "}, path=str(tmp_path / "missing.json"))
    assert got["values"] == {}


def test_route_and_ui_use_the_launch_values(D):
    """Маршрут отдаёт значения, UI забирает их один раз и помечает поля как заданные извне."""
    import pathlib
    root = pathlib.Path(D.__file__).resolve().parent
    routes = (root / "routes.py").read_text(encoding="utf-8")
    assist = (root / "web" / "js" / "h3s_assist.js").read_text(encoding="utf-8")
    conn = (root / "web" / "js" / "h3s_assist_conn.js").read_text(encoding="utf-8")
    assert '/h3lab/assist/defaults' in routes and "h3s_assist_defaults" in routes
    assert 'astConnLoad' in assist and '/h3lab/assist/defaults' in assist
    assert "setForcedConn(" in assist and "forcedConn" in assist
    assert "FORCED[k] !== undefined" in conn            # параметры запуска главнее проекта