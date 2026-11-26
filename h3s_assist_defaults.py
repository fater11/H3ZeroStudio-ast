"""Настройки ассистента из параметров запуска ComfyUI.

Два источника, оба — «параметры запуска» сервера:
  * переменные окружения H3LAB_ASSIST_* (писать в тот же .bat/.sh, что запускает ComfyUI:
    `set H3LAB_ASSIST_BASE=http://127.0.0.1:20128/v1`, `set H3LAB_ASSIST_MODEL=combo/hermes-auto`, …);
  * файл h3lab.assist.json рядом с этим модулем (для тех, кому удобнее файл, а не окружение).

Что задано здесь, то главнее проекта и запомненного в браузере: «если есть в параметрах запуска —
всегда берём оттуда». Порядок старшинства: переменная окружения → файл → проект → браузер.
"""
import json
import os
import re

# те же поля, что переносит браузер (web/js/h3s_assist_conn.js, CONN_KEYS)
KEYS = ("backend", "comfy_encoder", "api_base", "api_key", "api_model", "stream_timeout",
        "max_tokens", "temperature", "top_p", "thinking", "engine_defaults")
ALIASES = {"api": "api", "line": "api", "api_line": "api",
           "base": "api_base", "url": "api_base", "api_base": "api_base",
           "key": "api_key", "api_key": "api_key",
           "model": "api_model", "api_model": "api_model",
           "backend": "backend", "comfy_encoder": "comfy_encoder", "encoder": "comfy_encoder",
           "stream_timeout": "stream_timeout", "timeout": "stream_timeout",
           "max_tokens": "max_tokens", "temperature": "temperature", "top_p": "top_p",
           "thinking": "thinking", "engine_defaults": "engine_defaults"}
NUMS = {"stream_timeout": int, "max_tokens": int, "temperature": float, "top_p": float}
BOOLS = {"thinking", "engine_defaults"}
PREFIX = "H3LAB_ASSIST_"
FILE_NAME = "h3lab.assist.json"


def _flag(text):
    t = str(text).strip().lower()
    if t in ("1", "true", "yes", "on", "да"): return True
    if t in ("0", "false", "no", "off", "нет"): return False
    return None


def _value(key, raw):
    """Приведённое значение или None, если разобрать не удалось (тогда поле просто не задано)."""
    if raw is None: return None
    if key in BOOLS: return _flag(raw)
    if key in NUMS:
        try: return NUMS[key](str(raw).strip().replace(",", "."))
        except (TypeError, ValueError): return None
    text = str(raw).strip()
    return text or None


def parse_api_line(text):
    """Одна строка API: «<адрес> | <модель> | <ключ>» — части необязательны и идут в этом порядке.

    Разделитель — `|` (или `;`); без разделителя строка делится по пробелам, но только если в ней
    ровно три части: иначе адрес с пробелами внутри (URL так не пишут, а имя модели иногда пишут)
    осталось бы неразбираемым.
    """
    raw = str(text or "").strip()
    if not raw: return {}
    parts = [p.strip() for p in re.split(r"[|;]", raw) if p.strip()] if re.search(r"[|;]", raw) else raw.split()
    if not re.search(r"[|;]", raw) and len(parts) != 3: parts = parts[:1]   # одна часть = только адрес
    if not parts or len(parts) > 3: return {}
    out = {}
    for key, value in zip(("api_base", "api_model", "api_key"), parts):
        v = _value(key, value if key != "api_key" else value.strip())   # ключ берём как есть
        if v is not None: out[key] = v
    return out


def _from_env(environ=None):
    env = os.environ if environ is None else environ
    out, lines = {}, []
    for name in env:
        n = str(name).upper()
        if not n.startswith(PREFIX): continue
        key = ALIASES.get(n[len(PREFIX):].lower())
        if not key: continue
        if key == "api": lines.append(env.get(name)); continue      # строку API разбираем первой
        v = _value(key, env.get(name))
        if v is not None: out[key] = v
    return {**{k: v for line in lines for k, v in parse_api_line(line).items()}, **out}


def file_path(path=None):
    return path or os.path.join(os.path.dirname(os.path.abspath(__file__)), FILE_NAME)


def _from_file(path=None):
    try:
        with open(file_path(path), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict): return {}
    out, lines = {}, []
    for k, v in data.items():
        key = ALIASES.get(str(k).strip().lower())
        if not key: continue
        if key == "api": lines.append(v); continue                 # строка API разбирается первой,
        val = _value(key, v)                                       # а отдельные поля перебивают её
        if val is not None: out[key] = val
    return {**{k: v for line in lines for k, v in parse_api_line(line).items()}, **out}


def defaults(environ=None, path=None):
    """{"values": {...}, "from": {ключ: "env"|"file"}} — пусто, если ничего не задано."""
    values = _from_file(path)
    source = {k: "file" for k in values}
    for k, v in _from_env(environ).items():   # окружение старше файла
        values[k] = v; source[k] = "env"
    return {"values": values, "from": source}