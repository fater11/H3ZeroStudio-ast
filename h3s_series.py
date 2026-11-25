"""Серия связанных отрезков из одной идеи: делим время ролика по бюджету токенов и пишем промты.

Пользователь даёт идею и длительность — модуль решает, на сколько отрезков их резать (обучаемый диапазон H3
124–362 кадра и бюджет токенов конкретной карты), как связать соседние отрезки (жёсткий стык или продолжение
с перекрытием) и в каком виде отдать задание модели-писателю. Промты пишет LLM, а если её нет — работает
шаблонный писатель, поэтому серию можно собрать и офлайн.

Вся арифметика кадров и токенов — наша (h3s_core + h3s_budget); форматы промтов — наш H3 Ref2VA.
"""
import json, math, re

from . import h3s_core as core
from . import h3s_budget as budget_mod

MAX_BLOCKS = (core.TRAINED_MAX_FRAMES - core.TRAINED_MIN_FRAMES) // 17 + 7   # 21 блок = 357+ ... capped ниже
BEAT_MIN_BLOCKS = 3                     # ≈2.1 с нового материала на отрезок — короче уже не отрезок
ROLES = ("начало", "развитие", "поворот", "финал")


def _tokens_for(frames, w, h, ref_images=0, ref_video_frames=0, cards=()):
    return budget_mod.segment_tokens({"frames": frames}, w, h, ref_images=ref_images,
                                     ref_video_frames=ref_video_frames, cards=cards)


def beat_limit_blocks(w, h, budget, overlap_blocks=1, ref_images=0, ref_video_frames=0, cards=()):
    """Сколько блоков нового материала (по 17 кадров) влезает в один отрезок по бюджету токенов."""
    overlap = core.overlap_frames(overlap_blocks) if overlap_blocks else 0
    best = 0
    for blocks in range(BEAT_MIN_BLOCKS, 40):
        frames = 17 * blocks + (overlap if overlap else 5)
        if frames > core.TRAINED_MAX_FRAMES:
            break
        if not budget_mod.fits(_tokens_for(frames, w, h, ref_images, ref_video_frames, cards), budget):
            break
        best = blocks
    return best


def _split_even(total_blocks, parts):
    """Разложить блоки по отрезкам как можно ровнее (разница не больше одного блока)."""
    base, extra = divmod(int(total_blocks), max(1, int(parts)))
    out = [base + (1 if i < extra else 0) for i in range(max(1, int(parts)))]
    return [b for b in out if b > 0]


def plan_beats(idea, seconds, w=1344, h=768, budget=None, overlap_blocks=1, beats=None,
               min_blocks=BEAT_MIN_BLOCKS, ref_images=0, ref_video_frames=0, cards=(), fps=core.FPS):
    """План серии: отрезки, их кадры, связь между ними и оценка токенов.

    `seconds` — сколько всего нового материала (перекрытия в него не считаются), `beats` — желаемое число
    отрезков (None: столько, сколько нужно по бюджету). Сумма нового материала точно равна запрошенному времени.
    """
    content = int(round(float(seconds) * fps))
    if content <= 0:
        raise ValueError("Серия: длительность ролика должна быть больше нуля")
    budget = int(budget if budget is not None else budget_mod.budget_tokens())
    overlap_blocks = max(0, min(core.MAX_OVERLAP_BLOCKS, int(overlap_blocks)))
    total_blocks = max(1, int(round(content / 17.0)))
    limit = beat_limit_blocks(w, h, budget, overlap_blocks, ref_images, ref_video_frames, cards)
    if limit < max(1, int(min_blocks)):
        raise ValueError(f"Серия: даже {17 * max(1, int(min_blocks))} кадров не влезают в бюджет "
                         f"{budget} токенов — уменьшите разрешение или референсы")
    count = int(beats) if beats else max(1, math.ceil(total_blocks / limit))
    count = max(1, min(count, math.ceil(total_blocks / max(1, int(min_blocks)))))
    blocks = _split_even(total_blocks, count)
    if len(blocks) > 1 and blocks[-1] < max(1, int(min_blocks)) and blocks[-2] > max(1, int(min_blocks)):
        take = max(1, int(min_blocks)) - blocks[-1]      # не оставляем огрызок в конце
        blocks[-2] -= take
        blocks[-1] += take
    beats_out, cursor = [], 0
    for i, b in enumerate(blocks):
        ov = core.overlap_frames(overlap_blocks) if (i and overlap_blocks) else 0
        frames = 17 * b + (ov if ov else 5)
        new_frames = 17 * b
        beats_out.append({"index": i, "blocks": b, "frames": frames, "overlap": ov,
                          "overlap_blocks": overlap_blocks if i else 0,
                          "new_frames": new_frames, "start_frame": cursor,
                          "seconds": round(new_frames / fps, 3),
                          "link": "extend" if i else "cut",
                          "role": ROLES[min(len(ROLES) - 1, int(round(i * (len(ROLES) - 1) / max(1, len(blocks) - 1))))]
                          if len(blocks) > 1 else "начало+финал",
                          "tokens": _tokens_for(frames, w, h, ref_images, ref_video_frames, cards)})
        cursor += new_frames
    return {"idea": str(idea or "").strip(), "seconds": round(cursor / fps, 3), "requested_seconds": float(seconds),
            "frames": cursor, "width": int(w), "height": int(h), "budget": budget,
            "limit_blocks": limit, "overlap_blocks": overlap_blocks, "beats": beats_out,
            "over_budget": [b["index"] for b in beats_out if b["tokens"] > budget]}


CONTRACT = """Ты пишешь промты для модели MiniMax H3: серия связанных отрезков одного ролика.
Верни СТРОГО JSON без пояснений:
{"title": "...", "logline": "...", "segments": [{"prompt": "...", "note": "..."}, ...]}
Ровно {count} элементов в segments, в том же порядке, что отрезки ниже.

Правила промта каждого отрезка:
1. Формат H3 Ref2VA, английские ключевые строки: subject_definitions / summary / retention_analysis /
   detailed_description / overall_soundscape / non_diegetic_music. Все действия в detailed_description
   начинаются со строки "[Shot 1]".
2. Промт описывает ТОЛЬКО свой отрезок ({seconds} с, {new_frames} кадров). Не пересказывай предыдущие.
3. Не повторяй одно и то же действие в двух отрезках: у каждого своя новая порция развития идеи.
4. Связь: отрезок {link_hint}. Если это продолжение — начни с того, чем кончился предыдущий
   (та же поза, тот же свет, тот же план), и заканчивай позой, из которой следующий отрезок продолжит.
5. Один непрерывный план по умолчанию; склейка/смена плана — только если это нужно по идее, тогда укажи это явно.
6. Речь: если идея про речь, дай её коротко и в кавычках, с языком в <d>[Русский] …</d>, и одного говорящего (S1).
   Если речи нет — не упоминай речь вовсе.
7. Звук: overall_soundscape — только звук сцены. Музыка — non_diegetic_music: N/A, кроме случая, когда
   музыка прямо нужна по идее.
8. Ничего не оставляй «на потом»: каждый отрезок самодостаточен и понятен без соседей.
9. Стиль, персонажи, локация и свет описываются одинаково во всех отрезках (одна и та же внешность,
   одна и та же одежда, та же локация), меняется только действие.
"""


def writer_messages(idea, plan, style="", refs=(), language="ru", extra="", only=None):
    """Задание писателю: идея + посчитанные отрезки + наш контракт формата.

    `only` — писать промт одного отрезка (индекс): так длинная серия не зависит от одного длинного ответа,
    а сбой модели стоит одного отрезка, а не всей серии.
    """
    beats = plan["beats"]
    lines = [f"Идея: {plan['idea'] or idea}",
             f"Всего времени: {plan['seconds']:.1f} с на {len(beats)} отрезков (склейка встык или продолжение)."]
    if style:
        lines.append(f"Стиль/мир (одинаковый для всех отрезков): {style}")
    for r in refs or ():
        lines.append(f"Есть референс: {r}")
    if language and language != "ru":
        lines.append(f"Язык речи в кадре: {language}")
    lines.append("Отрезки:")
    for b in beats:
        link = "продолжение предыдущего (перекрытие {0} кадр.)".format(b["overlap"]) if b["overlap"] else "начало ролика, жёсткий старт"
        lines.append(f"  {b['index'] + 1}. {b['seconds']:.1f} с ({b['new_frames']} новых кадров, {b['frames']} всего), "
                     f"роль: {b['role']}, связь: {link}")
    if extra:
        lines.append(f"Дополнительно: {extra}")
    # no str.format here: the contract itself shows a JSON object, so its braces are not placeholders
    head = (CONTRACT.replace("{count}", "1" if only is not None else str(len(beats)))
            .replace("{seconds}", f"{beats[only]['seconds']:.1f}" if only is not None
                     else " / ".join(f"{b['seconds']:.1f}" for b in beats))
            .replace("{new_frames}", str(beats[only]["new_frames"]) if only is not None
                     else " / ".join(str(b["new_frames"]) for b in beats))
            .replace("{link_hint}", "продолжение" if len(beats) > 1 else "начало"))
    if only is not None:
        head += (f"\n\nПиши ТОЛЬКО отрезок {only + 1} из {len(beats)}: верни ровно 1 элемент в segments. "
                 f"Остальные отрезки серии уже написаны или будут написаны отдельно.")
        lines = [f"Это отрезок {only + 1} из {len(beats)}."] + lines
    return [{"role": "system", "content": head},
            {"role": "user", "content": "\n".join(lines)}]


def _objects(text):
    """Все сбалансированные {...} из текста (строки в кавычках не мешают)."""
    out, depth, start, in_str, esc = [], 0, None, False, False
    for i, ch in enumerate(str(text)):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth:
                depth -= 1
            if depth == 0 and start is not None:
                out.append(str(text)[start:i + 1])
                start = None
    return out


def _json_block(text):
    """Достать JSON из ответа модели: чистый, в ```-блоке или в окружении текста.

    Если объектов несколько (модель рассуждала и писала черновики), берём ПОСЛЕДНИЙ разобравшийся:
    готовый ответ стоит в конце, а не в начале размышлений.
    """
    raw = str(text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", raw, re.S)
    if fence:
        raw = fence.group(1).strip()
    try:
        return json.loads(raw)
    except ValueError:
        pass
    for candidate in reversed(_objects(raw)):
        try:
            return json.loads(candidate)
        except ValueError:
            continue
    raise ValueError("Писатель вернул не JSON — нужен объект с segments")


def parse_answer(text, plan, expect=None, index=None):
    """Ответ писателя → проверенные промты (число отрезков должно совпасть с ожидаемым).

    `expect` — сколько элементов ждём (по умолчанию все отрезки), `index` — чей это промт, когда пишут по одному.
    """
    data = _json_block(text)
    segs = data.get("segments") if isinstance(data, dict) else data
    if not isinstance(segs, list):
        raise ValueError("Писатель вернул не JSON — нужен объект с segments")
    want = int(expect if expect is not None else len(plan["beats"]))
    if len(segs) != want:
        raise ValueError(f"Писатель вернул {len(segs)} отрезков вместо {want}")
    out = []
    for i, item in enumerate(segs):
        prompt = item.get("prompt") if isinstance(item, dict) else str(item)
        if not prompt or not str(prompt).strip():
            raise ValueError(f"Отрезок {i + 1} пришёл без промта")
        out.append({"index": int(index) if index is not None else i, "prompt": str(prompt).strip(),
                    "note": str((item.get("note") if isinstance(item, dict) else "") or "").strip()})
    return {"title": str(data.get("title") or "") if isinstance(data, dict) else "",
            "logline": str(data.get("logline") or "") if isinstance(data, dict) else "",
            "segments": out}


_BULLET_RE = re.compile(r"^\s*(?:[-*•–]|\d+[.)])\s*")
_CJK_RE = re.compile(r"[\u3000-\u9fff\uac00-\ud7af]")          # иероглифы = размышления модели, не промт
_META_HINTS = ("концепц", "промпт:", "промт:", "prompt:", "let me", "thinking", "вариант", "идея:",
               "задание", "инструкц", "сегмент", "отрезок", "итог", "итак", "сначала", "нужно",
               "此处", "因此", "首先", "总结", "构思", "根据", "用俄语")

_STRICT_NOTE = ("Важно: ответь ТОЛЬКО JSON-объектом по контракту выше — без пояснений, списков, "
                "размышлений и посторонних языков. Промт каждого отрезка — одна строка на русском.")


def clean_prompt_line(text):
    """Вытащить строку промта из болтливого ответа модели (пусто, если промта там нет).

    Дешёвые модели иногда отвечают рассуждением на другом языке или пустотой: такой ответ нельзя
    молча превращать в промт, но и терять годную строку не нужно — берём последнюю похожую на промт.
    """
    body = re.sub(r"```[a-zA-Z]*", "", str(text or ""))
    lines = []
    for raw in body.splitlines():
        line = _BULLET_RE.sub("", raw).strip().strip('"«»\'* ')
        if len(line) < 12 or _CJK_RE.search(line) or line[:1] in "{[<" or "\":" in line and '"' in line:
            continue
        low = line.lower()
        if low.endswith(":") or any(h in low[:24] for h in _META_HINTS):
            continue
        lines.append(line)
    return lines[-1] if lines else ""


def _idea_sentences(idea):
    """Идея → аккуратные предложения: шаблон не должен склеивать чужие строки в одну фразу."""
    text = " ".join(str(idea or "").split())
    if not text:
        return ["One continuous scene."]
    parts = [s.strip() for s in re.split(r"(?<=[.!?…])\s+", text) if s.strip()]
    out = []
    for s in parts:
        s = s[0].upper() + s[1:] if s else s
        out.append(s if s.endswith((".", "!", "?", "…")) else s + ".")
    return out


def _tidy_clause(text):
    """Кусок фразы → отдельное предложение: разделители не должны склеивать слова («кистью ставит»)."""
    line = " ".join(str(text or "").split()).strip(" ,;—–-")
    if not line:
        return ""
    line = line[0].upper() + line[1:]
    return line if line.endswith((".", "!", "?", "…")) else line + "."


def _idea_beats(idea, count):
    """Идея → ровно `count` частей, по одной на отрезок (одна и та же фраза дважды — плохой промт).

    Предложений обычно меньше, чем отрезков, поэтому самую длинную фразу дробим по `;`, `,` и ` — `
    (это черновик: аккуратный текст всё равно пишет человек или модель).
    """
    parts = _idea_sentences(idea)
    while len(parts) < count:
        cut, pieces = -1, []
        for i, part in enumerate(parts):
            split = [_tidy_clause(p) for p in re.split(r";\s*|\s+—\s+|,\s+(?=[а-яёa-z])", part) if p.strip()]
            if len(split) > 1 and len(split) > len(pieces):
                cut, pieces = i, split
        if cut < 0:
            break
        parts[cut:cut + 1] = pieces
    if not parts:
        parts = [""]
    while len(parts) < count:
        parts.append(parts[-1])                       # вырожденный случай: одна мысль на несколько отрезков
    if len(parts) > count:
        parts = parts[:count - 1] + [" ".join(parts[count - 1:])]
    return parts


SLICE_HINT = ("Each segment describes only its own beat of the idea, in its own words: the same action must "
              "never be repeated in two segments.")


def fallback_prompts(plan, style="", sound="", voice="", refs=()):
    """Шаблонный писатель: серия собирается без LLM (промты в формате H3, по отрезку на шаг).

    Промт собран как пресеты пака: `subject_definitions` → `summary` с `[reference generation]` →
    `retention_analysis` (только когда у отрезка есть референсы, иначе строка врёт о несуществующей
    картинке) → `detailed_description` со строкой `[Shot 1]` → `overall_soundscape` → `non_diegetic_music`.
    Каждый отрезок берёт свою часть идеи: повторять одно действие дважды — значит получить один и тот же
    кадр дважды. Это рыба, а не готовый промт; в `note` стоит пометка «шаблон».
    """
    beats = plan["beats"]
    sentences = _idea_sentences(plan["idea"])
    parts = _idea_beats(plan["idea"], len(beats))
    out = []
    for b in beats:
        i = b["index"]
        beat_text = parts[i]                          # своя часть идеи у каждого отрезка
        if beat_text and not beat_text.endswith((".", "!", "?", "…")):
            beat_text += "."
        opening = ("[Shot 1] The shot continues the previous part without a cut: it opens on the exact same "
                   "framing, light and pose the part before it ended with." if b["overlap"]
                   else "[Shot 1] The shot opens the film: the camera is already settled on the scene.")
        closing = ("It ends on a pose, framing and light the next part can continue from."
                   if i < len(beats) - 1 else "It ends the film on a held final pose while the motion settles.")
        lines = [
            "subject_definitions:",
            "<Subject 1> is the person of the scene: the same face, hair, build and wardrobe as in every other "
            "part of this film.",
            "summary:",
            f"[reference generation] A {b['seconds']:.2f}-second shot of one continuous film: {beat_text}",
        ]
        if refs:
            lines += ["retention_analysis:",
                      "<Subject 1> (appears in [Shot 1]): fully_preserved - face, hair and wardrobe follow the "
                      "reference exactly, with no change of hairstyle, clothing or accessories."]
        lines += [
            "detailed_description:",
            style or "Live-action, cinematic, real-time speed. Natural light, fine film grain, stable framing, "
                     "a hand-held texture that stays calm.",
            f"{opening} {beat_text} {closing}",
            "The person's hands, gaze and breathing carry the action: unhurried, deliberate, physically "
            "believable, with no extra people entering the frame.",
            "overall_soundscape:",
            sound or "The quiet ambience of the room and the small sounds the action itself makes.",
            "non_diegetic_music:",
            "N/A",
        ]
        if voice:
            lines.append(f"spoken: {voice}")
        out.append({"index": i, "prompt": "\n".join(lines),
                    "note": "шаблон — напишите свой текст или подключите модель в «Ассистенте»"})
    return {"title": " ".join(sentences)[:60], "logline": " ".join(sentences), "segments": out}


def write_series(plan, fetch=None, style="", refs=(), language="ru", extra="", sound="", allow_fallback=True,
                 only=None):
    """Промты для серии: писателем (если он есть) или шаблоном; при сбое писателя — шаблон и причина.

    `fetch(messages) -> текст ответа` — любая функция вызова модели, поэтому логика проверяется без LLM.
    `only` — писать промт одного отрезка: длинная серия не зависит от одного длинного ответа.
    """
    messages = writer_messages(plan["idea"], plan, style=style, refs=refs, language=language, extra=extra,
                               only=only)

    def template(index=None):
        full = fallback_prompts(plan, style=style, sound=sound, refs=refs)
        if index is None:
            return full
        one = next((s for s in full["segments"] if s["index"] == int(index)), None)
        return {"title": full["title"], "logline": full["logline"], "segments": [one] if one else []}

    if fetch is None:
        return {"written": template(only), "used": "template", "messages": messages}
    expect = 1 if only is not None else None
    strict = messages + [{"role": "user", "content": _STRICT_NOTE}]
    answer, error, attempts, last_exc = "", "", 0, None
    try:
        for attempt in (0, 1):
            attempts = attempt + 1
            answer = fetch(messages if attempt == 0 else strict)
            try:
                written = parse_answer(answer, plan, expect=expect, index=only)
                out = {"written": written, "used": "llm", "messages": messages, "attempts": attempts}
                return {**out, **({"only": only} if only is not None else {})}
            except Exception as exc:
                error, last_exc = str(exc), exc
                # модель ответила строкой вместо JSON — для одного отрезка это готовый промт
                line = clean_prompt_line(answer)
                if only is not None and line:
                    written = {"title": "", "logline": "",
                               "segments": [{"index": int(only), "prompt": line, "note": "писатель ответил строкой"}]}
                    return {"written": written, "used": "llm-line", "messages": messages, "attempts": attempts,
                            "only": only}
        raise last_exc if last_exc is not None else RuntimeError("Писатель не дал промтов")
    except Exception as exc:
        if not allow_fallback:
            raise
        fallback = template(only)
        fallback["error"] = str(exc)
        return {"written": fallback, "used": "template", "messages": messages, "error": str(exc), "attempts": attempts,
                **({"only": only} if only is not None else {})}


def _is_draft(segment):
    """Промт-рыба из шаблона (её можно заменить, а написанный моделью текст — нет)."""
    return str((segment or {}).get("note") or "").startswith("шаблон")


def build_project(plan, written, settings=None, name=None, existing=None):
    """Серия → обычный проект пака: отрезки со связью, перекрытием и промтами.

    `existing` — уже сохранённый проект этой же серии: если раскладка отрезков та же, а новый промт
    пришёл из шаблона, оставляем написанный ранее (моделью) промт — перепланирование не должно молча
    затирать чужой текст рыбой.
    """
    from . import h3s_library as lib
    prompt_items = {s["index"]: s for s in (written or {}).get("segments", [])}
    old = {i: seg for i, seg in enumerate((existing or {}).get("segments") or [])}
    same_layout = bool(old) and len(old) == len(plan["beats"]) and all(
        int(old[i].get("frames") or 0) == int(plan["beats"][i]["frames"]) for i in old)
    prompts = {}
    for i, item in prompt_items.items():
        kept = old.get(i) if same_layout else None
        # рыба из шаблона не имеет права затирать уже написанный текст при перепланировании
        if kept and _is_draft(item) and str(kept.get("prompt") or "").strip():
            prompts[i] = kept["prompt"]
        else:
            prompts[i] = item["prompt"]
    segments = []
    for b in plan["beats"]:
        segments.append({"id": f"s{b['index'] + 1}", "name": f"{b['index'] + 1}. {b['role']}",
                         "frames": int(b["frames"]), "prompt": prompts.get(b["index"], ""),
                         "link": "cut" if b["index"] == 0 else "extend",
                         "overlap_blocks": int(b["overlap_blocks"]), "refs": []})
    wide = plan["width"] >= plan["height"]
    project = {"id": lib.clean_id(name or plan["idea"][:24] or "series"),
               "name": name or (written or {}).get("title") or plan["idea"][:60] or "Серия",
               "settings": dict(settings or {}), "segments": segments,
               "stats": {"series": {"idea": plan["idea"], "logline": (written or {}).get("logline") or "",
                                    "beats": len(plan["beats"]), "seconds": plan["seconds"],
                                    "budget": plan["budget"]}},
               "run": {"operation": "full"}}
    project = core.normalize_project(project)
    project["settings"]["width"] = int(plan["width"])
    project["settings"]["height"] = int(plan["height"])
    project["settings"]["res_mode"] = "custom"
    project["settings"]["continuation_method"] = "overlap" if plan["overlap_blocks"] else "last_frame"
    project["settings"]["overlap_blocks"] = int(plan["overlap_blocks"])
    project["settings"]["continuity_ref"] = bool(plan["overlap_blocks"])
    project["settings"]["fps"] = core.FPS
    return project


def total_new_frames(project):
    """Сколько всего кадров ролик играет (без перекрытий и без служебного первого кадра)."""
    out = 0
    for i, s in enumerate(project.get("segments") or []):
        o = int(s.get("overlap_blocks") or 0)
        out += int(s["frames"]) - (core.overlap_frames(o) if o else 5)
    return out
